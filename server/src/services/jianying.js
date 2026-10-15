import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { probeVideo, generateThumbnail } from './media.js';

function genUuid() {
  return crypto.randomUUID().toUpperCase();
}

/**
 * Convert seconds to microseconds (1s = 1,000,000 us)
 */
function toUs(seconds) {
  return Math.round((Number(seconds) || 0) * 1000000);
}

/**
 * Build valid subtitle text content JSON string expected by Jianying
 */
function formatJianyingText(text) {
  const inner = {
    styles: [
      {
        fill: {
          alpha: 1.0,
          content: {
            render_type: 'solid',
            solid: {
              alpha: 1.0,
              color: [1.0, 1.0, 1.0] // White
            }
          }
        },
        font: {
          id: '',
          path: ''
        },
        range: [0, text.length],
        size: 9.0
      }
    ],
    text: text
  };
  return JSON.stringify(inner);
}

/**
 * Parse time range string like "01:12 - 01:15" or "01:12" into microseconds
 */
function parseStartTimeUs(timeRangeStr) {
  if (!timeRangeStr || typeof timeRangeStr !== 'string') return 0;
  const m = timeRangeStr.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  const min = parseInt(m[1], 10);
  const sec = parseInt(m[2], 10);
  return toUs(min * 60 + sec);
}

/**
 * Register draft into Jianying's central index `root_meta_info.json`
 * Modern Jianying Pro requires drafts to be registered here to appear in the project list.
 */
async function registerDraftInRootMeta({
  draftId,
  draftName,
  jianyingDraftDir,
  durationUs,
  totalSize
}, jianyingDraftsDir) {
  if (!jianyingDraftsDir) return false;
  const rootMetaPath = path.join(jianyingDraftsDir, 'root_meta_info.json');
  if (!fsSync.existsSync(rootMetaPath)) return false;

  try {
    const raw = await fs.readFile(rootMetaPath, 'utf-8');
    // Strip UTF-8 BOM if present
    const cleanRaw = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
    const meta = JSON.parse(cleanRaw);

    if (!Array.isArray(meta.all_draft_store)) {
      meta.all_draft_store = [];
    }

    const nowUs = Date.now() * 1000;
    const normDraftFoldPath = jianyingDraftDir.replace(/\\/g, '/');
    const normJsonFile = path.join(jianyingDraftDir, 'draft_content.json').replace(/\\/g, '/');
    const normCover = path.join(jianyingDraftDir, 'draft_cover.jpg').replace(/\\/g, '/');
    const normRootPath = jianyingDraftsDir.replace(/\\/g, '/');

    // Clone template from existing entry if available, or build standard template
    const template = meta.all_draft_store[0] || {};
    const entry = {
      ...template,
      cloud_draft_cover: false,
      cloud_draft_sync: false,
      draft_cloud_last_action_download: false,
      draft_cloud_purchase_info: '',
      draft_cloud_template_id: '',
      draft_cloud_tutorial_info: '',
      draft_cloud_videocut_purchase_info: '',
      draft_cover: normCover,
      draft_fold_path: normDraftFoldPath,
      draft_id: draftId,
      draft_is_ai_shorts: false,
      draft_is_cloud_temp_draft: false,
      draft_is_infinite_canvas_draft: false,
      draft_is_invisible: false,
      draft_is_pippit_draft: false,
      draft_is_web_article_video: false,
      draft_json_file: normJsonFile,
      draft_name: draftName,
      draft_new_version: template.draft_new_version || '',
      draft_root_path: normRootPath,
      draft_timeline_materials_size: totalSize || 1600000,
      draft_type: '',
      draft_web_article_video_enter_from: '',
      pippit_avatar_url: '',
      pippit_extra_info: '',
      pippit_id: '',
      pippit_user_name: '',
      streaming_edit_draft_ready: true,
      tm_draft_cloud_completed: '',
      tm_draft_cloud_entry_id: -1,
      tm_draft_cloud_modified: 0,
      tm_draft_cloud_parent_entry_id: -1,
      tm_draft_cloud_space_id: -1,
      tm_draft_cloud_user_id: -1,
      tm_draft_create: nowUs,
      tm_draft_modified: nowUs,
      tm_draft_removed: 0,
      tm_duration: durationUs
    };

    // Remove old matching entry if exists
    meta.all_draft_store = meta.all_draft_store.filter(d => 
      d.draft_id !== draftId && 
      d.draft_fold_path?.replace(/\\/g, '/').toLowerCase() !== normDraftFoldPath.toLowerCase() &&
      d.draft_name !== draftName
    );

    // Insert at front so it is the most recent project on Jianying's home screen
    meta.all_draft_store.unshift(entry);

    // Save backup first
    await fs.writeFile(rootMetaPath + '.bak', raw, 'utf-8');
    // Write back updated root_meta_info.json
    await fs.writeFile(rootMetaPath, JSON.stringify(meta, null, 2), 'utf-8');
    console.log(`✅ 已成功将草稿「${draftName}」注册至剪映全局索引 root_meta_info.json`);
    return true;
  } catch (err) {
    console.warn(`[registerDraftInRootMeta] 注册到 root_meta_info.json 失败:`, err.message);
    return false;
  }
}

/**
 * Generate Jianying Draft Project
 */
export async function generateJianyingDraft({
  project,
  storyboard = [],
  assets = [],
  customDraftName,
  outputDir = null
}) {
  const projName = customDraftName || project?.title || 'MeocoxFlow_Draft';
  // Safe folder name (clean invalid characters)
  const safeName = projName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
  const draftId = genUuid();
  const now = Date.now();
  const nowUs = now * 1000;

  // Resolve assets map from explicit assets
  const assetMap = new Map();
  for (const a of assets) {
    if (a.id) assetMap.set(a.id, a);
    if (a.name) assetMap.set(a.name, a);
  }

  // Scan project.assetDir files if available
  const assetDir = project?.assetDir;
  let assetDirFiles = [];
  if (assetDir && fsSync.existsSync(assetDir)) {
    try {
      assetDirFiles = await fs.readdir(assetDir);
    } catch (e) {}
  }

  // Calculate timeline items
  let currentCursorUs = 0;
  const videoMaterials = [];
  const speedMaterials = [];
  const canvasMaterials = [];
  const textMaterials = [];

  const videoSegments = [];
  const textSegments = [];
  const metaDraftMaterials = [];

  let firstValidVideoPath = null;
  let firstValidWidth = 1920;
  let firstValidHeight = 1080;
  let totalMaterialsBytes = 0;

  for (let i = 0; i < storyboard.length; i++) {
    const item = storyboard[i];
    
    // Resolve real video file path with multi-level fallback
    let videoFilePath = null;
    let videoName = null;
    const matchedAsset = assetMap.get(item.matchedClipId) || assetMap.get(item.matchedClipName);

    if (matchedAsset?.localPath && fsSync.existsSync(matchedAsset.localPath)) {
      videoFilePath = matchedAsset.localPath;
      videoName = matchedAsset.name || path.basename(videoFilePath);
    } else if (item.matchedClipPath && fsSync.existsSync(item.matchedClipPath)) {
      videoFilePath = item.matchedClipPath;
      videoName = path.basename(videoFilePath);
    } else if (assetDir && fsSync.existsSync(assetDir)) {
      // 1. Direct match with matchedClipId
      if (item.matchedClipId && fsSync.existsSync(path.join(assetDir, item.matchedClipId))) {
        videoFilePath = path.join(assetDir, item.matchedClipId);
        videoName = item.matchedClipId;
      } else if (item.matchedClipName && fsSync.existsSync(path.join(assetDir, item.matchedClipName))) {
        videoFilePath = path.join(assetDir, item.matchedClipName);
        videoName = item.matchedClipName;
      } else {
        // 2. Fuzzy search in assetDir for matching name
        const query = (item.matchedClipId || item.matchedClipName || '').toLowerCase();
        const match = assetDirFiles.find(f => {
          const lf = f.toLowerCase();
          return query && (lf.includes(query) || query.includes(lf));
        });
        if (match) {
          videoFilePath = path.join(assetDir, match);
          videoName = match;
        } else {
          // 3. Fallback to any video file in assetDir
          const anyVideo = assetDirFiles.find(f => /\.(mp4|mov|mkv|avi|flv|webm|ts)$/i.test(f));
          if (anyVideo) {
            videoFilePath = path.join(assetDir, anyVideo);
            videoName = anyVideo;
          }
        }
      }
    }

    // Fallback to placeholder if still no file found
    if (!videoFilePath || !fsSync.existsSync(videoFilePath)) {
      videoFilePath = path.join(config.paths.assetsDir, matchedAsset?.name || `clip_${i + 1}.mp4`);
      videoName = matchedAsset?.name || `clip_${i + 1}.mp4`;
    }

    // Probe media specifications if real file exists
    let probeInfo = null;
    if (fsSync.existsSync(videoFilePath)) {
      try {
        probeInfo = await probeVideo(videoFilePath);
        const stat = fsSync.statSync(videoFilePath);
        totalMaterialsBytes += stat.size;
      } catch (e) {}
    }

    const width = probeInfo?.width || matchedAsset?.width || 1920;
    const height = probeInfo?.height || matchedAsset?.height || 1080;

    if (!firstValidVideoPath && fsSync.existsSync(videoFilePath)) {
      firstValidVideoPath = videoFilePath;
      firstValidWidth = width;
      firstValidHeight = height;
    }

    // Determine segment duration in seconds
    let segSec = Number(item.durationSec);
    if (!segSec || segSec <= 0) {
      if (probeInfo?.durationSec) {
        segSec = Math.min(5.0, probeInfo.durationSec);
      } else if (matchedAsset?.durationSec) {
        segSec = matchedAsset.durationSec;
      } else {
        segSec = 4.0;
      }
    }

    const durationUs = toUs(segSec);
    const startUs = currentCursorUs;

    const fileDurationSec = probeInfo?.durationSec || matchedAsset?.durationSec || (segSec * 2);
    const fileDurationUs = toUs(fileDurationSec);

    // Source start time (extract from timeRange if provided)
    let sourceStartUs = parseStartTimeUs(item.timeRange);
    if (fileDurationUs > 0 && sourceStartUs + durationUs > fileDurationUs) {
      sourceStartUs = Math.max(0, fileDurationUs - durationUs);
    }

    // 1. Video Material
    const videoMatId = genUuid();
    const speedId = genUuid();
    const canvasId = genUuid();

    videoMaterials.push({
      audio_fade: null,
      category_id: '',
      category_name: 'local',
      check_flag: 63487,
      crop: {
        lower_left_x: 0.0,
        lower_left_y: 1.0,
        lower_right_x: 1.0,
        lower_right_y: 1.0,
        upper_left_x: 0.0,
        upper_left_y: 0.0,
        upper_right_x: 1.0,
        upper_right_y: 0.0
      },
      crop_ratio: 'free',
      crop_scale: 1.0,
      duration: fileDurationUs > 0 ? fileDurationUs : durationUs,
      extra_type_option: 0,
      formula_id: '',
      freeze: null,
      has_audio: true,
      height: height,
      id: videoMatId,
      intensifies_audio_path: '',
      intensifies_path: '',
      is_ai_generate_content: false,
      is_unified_beauty_mode: false,
      local_id: '',
      local_material_id: '',
      material_id: '',
      material_name: videoName,
      material_url: '',
      matting: {
        flag: 0,
        has_handled: false,
        interactive_path: '',
        path: '',
        sky_path: ''
      },
      media_path: '',
      object_locked: null,
      origin_material_id: '',
      path: videoFilePath,
      reverse_intensifies_path: '',
      reverse_path: '',
      roughcut_time_range: { duration: 0, start: 0 },
      sub_time_range: { duration: -1, start: -1 },
      type: 'video',
      video_algorithm: {
        algorithms: [],
        deflicker: null,
        motion_blur_config: null,
        noise_reduction: null,
        path: '',
        quality_enhance: null,
        time_range: null
      },
      width: width
    });

    speedMaterials.push({
      curve_speed: null,
      id: speedId,
      mode: 0,
      speed: 1.0,
      type: 'speed'
    });

    canvasMaterials.push({
      album_image: '',
      color: '',
      id: canvasId,
      image: '',
      image_id: '',
      image_name: '',
      source_platform: 0,
      team_id: '',
      type: 'canvas_color'
    });

    videoSegments.push({
      caption_info: null,
      cartoon: false,
      clip: null,
      common_keyframes: [],
      enable_adjust: true,
      enable_color_curves: true,
      enable_color_match: true,
      enable_color_wheels: true,
      enable_lut: true,
      enable_smart_color: true,
      extra_material_refs: [speedId, canvasId],
      group_id: '',
      hdr_settings: null,
      id: genUuid(),
      intensifies_audio: false,
      is_placeholder: false,
      is_tone_modify: false,
      keyframe_refs: [],
      last_nonzero_volume: 1.0,
      material_id: videoMatId,
      render_index: 0,
      reverse: false,
      source_timerange: {
        duration: durationUs,
        start: sourceStartUs
      },
      speed: 1.0,
      target_timerange: {
        duration: durationUs,
        start: startUs
      },
      template_id: '',
      track_attribute: 0,
      track_render_index: 0,
      visible: true,
      volume: 1.0
    });

    metaDraftMaterials.push({
      create_time: Math.floor(now / 1000),
      duration: fileDurationUs > 0 ? fileDurationUs : durationUs,
      extra_info: '',
      file_Path: videoFilePath,
      height: height,
      id: videoMatId,
      import_time: Math.floor(now / 1000),
      import_time_us: nowUs,
      item_source: 1,
      md5: '',
      metetype: 'video',
      roughcut_time_range: { duration: 0, start: 0 },
      sub_time_range: { duration: -1, start: -1 },
      type: 0,
      width: width
    });

    // 2. Subtitle / Script Text (if provided)
    if (item.scriptText) {
      const textMatId = genUuid();
      textMaterials.push({
        add_type: 0,
        alignment: 1,
        background_alpha: 1.0,
        background_color: '',
        background_height: 0.14,
        background_horizontal_offset: 0.0,
        background_round_radius: 0.0,
        background_style: 0,
        background_vertical_offset: 0.0,
        background_width: 0.14,
        base_content: '',
        bold_width: 0.0,
        border_alpha: 1.0,
        border_color: '#000000',
        border_width: 0.08,
        caption_template_info: { category_id: '', category_name: '', effect_id: '', is_new: false, path: '', request_id: '', resource_id: '', types: 0 },
        check_flag: 7,
        combo_info: { text_templates: [] },
        content: formatJianyingText(item.scriptText),
        fixed_height: -1.0,
        fixed_width: -1.0,
        font_category_id: '',
        font_category_name: '',
        font_id: '',
        font_name: '',
        font_path: '',
        font_resource_id: '',
        font_size: 9.0,
        font_source_platform: 0,
        font_team_id: '',
        font_title: 'none',
        font_url: '',
        fonts: [],
        force_apply_line_max_width: false,
        global_alpha: 1.0,
        group_id: '',
        has_shadow: true,
        id: textMatId,
        initial_scale: 1.0,
        inner_padding: 0.0,
        is_rich_text: false,
        italic_degree: 0,
        ktv_color: '',
        language: '',
        layer_weight: 1,
        letter_spacing: 0.0,
        line_feed: 1,
        line_max_width: 0.82,
        line_spacing: 0.02,
        name: '',
        original_size: [],
        preset_category: '',
        preset_category_id: '',
        preset_has_set_marker: false,
        preset_id: '',
        preset_index: 0,
        preset_name: '',
        preset_title: '',
        preset_url: '',
        recognize_task_id: '',
        recognize_type: 0,
        shadow_alpha: 0.8,
        shadow_angle: -45.0,
        shadow_color: '#000000',
        shadow_distance: 5.0,
        shadow_point: { x: 1.0, y: -1.0 },
        shadow_smoothing: 0.45,
        shape_clip_x: false,
        shape_clip_y: false,
        style_name: '',
        sub_type: 0,
        text_alpha: 1.0,
        text_color: '#FFFFFF',
        text_preset_resource_id: '',
        text_size: 30,
        text_to_audio_ids: [],
        types: 0,
        underline: false,
        underline_offset: 0.22,
        underline_width: 0.05,
        use_effect_default_color: true,
        words: { end_time: [], start_time: [], text: [] }
      });

      textSegments.push({
        caption_info: null,
        cartoon: false,
        clip: {
          alpha: 1.0,
          flip: { horizontal: false, vertical: false },
          rotation: 0.0,
          scale: { x: 1.0, y: 1.0 },
          transform: { x: 0.0, y: -0.75 } // Position subtitles at lower screen
        },
        common_keyframes: [],
        enable_adjust: false,
        enable_color_curves: true,
        enable_color_match: true,
        enable_color_wheels: true,
        enable_lut: true,
        enable_smart_color: true,
        extra_material_refs: [],
        group_id: '',
        hdr_settings: null,
        id: genUuid(),
        intensifies_audio: false,
        is_placeholder: false,
        is_tone_modify: false,
        keyframe_refs: [],
        last_nonzero_volume: 1.0,
        material_id: textMatId,
        render_index: 14000,
        reverse: false,
        source_timerange: null,
        speed: 1.0,
        target_timerange: {
          duration: durationUs,
          start: startUs
        },
        template_id: '',
        track_attribute: 0,
        track_render_index: 0,
        visible: true,
        volume: 1.0
      });
    }

    currentCursorUs += durationUs;
  }

  // Construct tracks
  const tracks = [
    {
      attribute: 0,
      flag: 0,
      id: genUuid(),
      is_default_name: true,
      name: '',
      segments: videoSegments,
      type: 'video'
    }
  ];

  if (textSegments.length > 0) {
    tracks.push({
      attribute: 0,
      flag: 0,
      id: genUuid(),
      is_default_name: true,
      name: 'Subtitles',
      segments: textSegments,
      type: 'text'
    });
  }

  // Dynamic canvas configuration based on first media resolution
  const canvasWidth = firstValidWidth || 1920;
  const canvasHeight = firstValidHeight || 1080;
  const canvasRatio = canvasWidth >= canvasHeight ? '16:9' : '9:16';

  // Complete draft_content.json object
  const draftContent = {
    canvas_config: { height: canvasHeight, ratio: canvasRatio, width: canvasWidth },
    color_space: 0,
    config: {
      adjust_max_index: 1,
      attachment_info: [],
      combination_max_index: 1,
      export_range: null,
      extract_audio_last_index: 1,
      lyrics_recognition_id: '',
      lyrics_sync: true,
      lyrics_taskinfo: [],
      maintrack_adsorb: true,
      material_save_mode: 0,
      original_sound_last_index: 1,
      record_audio_last_index: 1,
      sticker_max_index: 1,
      subtitle_keywords_config: null,
      subtitle_recognition_id: '',
      subtitle_sync: true,
      subtitle_taskinfo: [],
      system_font_list: [],
      video_mute: false,
      zoom_info_params: null
    },
    cover: null,
    create_time: Math.floor(now / 1000),
    duration: currentCursorUs,
    extra_info: null,
    fps: 30,
    free_render_index_mode: 'on',
    group_container: null,
    id: draftId,
    keyframe_graph_list: [],
    keyframes: {
      adjusts: [], audios: [], effects: [], filters: [],
      handwrites: [], stickers: [], texts: [], videos: []
    },
    last_modified_platform: { app_id: 3704, app_source: 'lv', app_version: '5.9.0', os: 'windows' },
    materials: {
      audio_balances: [], audio_effects: [], audio_fades: [], audios: [], beats: [],
      canvases: canvasMaterials, chromas: [], color_curves: [], drafts: [], effects: [],
      flowers: [], green_screens: [], handwrites: [], hsl: [], images: [], log_color_wheels: [],
      manual_deformations: [], masks: [], material_animations: [], material_colors: [],
      placeholders: [], plugin_effects: [], primary_color_wheels: [], realtime_denoises: [],
      shapes: [], smart_crops: [], smart_relights: [], sound_channel_mappings: [],
      speeds: speedMaterials, stickers: [], tail_leaders: [], text_templates: [],
      texts: textMaterials, transitions: [], video_effects: [], video_trackings: [],
      videos: videoMaterials, vocal_beautifys: [], vocal_separations: []
    },
    mutable_config: null,
    name: projName,
    new_version: '100.0.0',
    platform: { app_id: 3704, app_source: 'lv', app_version: '5.9.0', os: 'windows' },
    relationships: [],
    render_index_mode: 'on',
    retouch_cover: null,
    source: 'default',
    static_cover_image_path: '',
    tracks: tracks,
    update_time: Math.floor(now / 1000),
    version: 360000
  };

  // Complete draft_meta_info.json object
  const draftMetaInfo = {
    draft_fold_path: '',
    draft_id: draftId,
    draft_is_invisible: false,
    draft_materials: [
      {
        type: 0,
        value: metaDraftMaterials
      }
    ],
    draft_name: projName,
    draft_root_path: '',
    tm_draft_create: nowUs,
    tm_draft_modified: nowUs,
    tm_duration: currentCursorUs
  };

  // 1. Output to local studio output directory (遵循自定义/默认产物路由)
  const baseOutputDir = outputDir || config.paths.outputDir;
  const outputDraftDir = path.join(baseOutputDir, `${safeName}_${Date.now()}`);
  await fs.mkdir(outputDraftDir, { recursive: true });

  draftMetaInfo.draft_fold_path = outputDraftDir;
  draftMetaInfo.draft_root_path = baseOutputDir;

  await fs.writeFile(
    path.join(outputDraftDir, 'draft_content.json'),
    JSON.stringify(draftContent, null, 2),
    'utf-8'
  );
  await fs.writeFile(
    path.join(outputDraftDir, 'draft_meta_info.json'),
    JSON.stringify(draftMetaInfo, null, 2),
    'utf-8'
  );

  // 2. If JianyingPro local drafts directory exists, sync directly into Jianying drafts!
  let jianyingDraftDir = null;
  let syncedToJianying = false;

  if (config.paths.jianyingDraftsDir && fsSync.existsSync(config.paths.jianyingDraftsDir)) {
    try {
      jianyingDraftDir = path.join(config.paths.jianyingDraftsDir, safeName);
      await fs.mkdir(jianyingDraftDir, { recursive: true });

      const jyMeta = {
        ...draftMetaInfo,
        draft_fold_path: jianyingDraftDir,
        draft_root_path: config.paths.jianyingDraftsDir
      };

      await fs.writeFile(
        path.join(jianyingDraftDir, 'draft_content.json'),
        JSON.stringify(draftContent, null, 2),
        'utf-8'
      );
      await fs.writeFile(
        path.join(jianyingDraftDir, 'draft_meta_info.json'),
        JSON.stringify(jyMeta, null, 2),
        'utf-8'
      );

      // Generate draft_cover.jpg for Jianying
      if (firstValidVideoPath) {
        try {
          const jyCover = path.join(jianyingDraftDir, 'draft_cover.jpg');
          const ok = await generateThumbnail(firstValidVideoPath, jyCover, 0.5);
          if (ok && fsSync.existsSync(jyCover)) {
            await fs.copyFile(jyCover, path.join(outputDraftDir, 'draft_cover.jpg'));
          }
        } catch (coverErr) {
          console.warn(`[JianyingCover] 封面提取失败: ${coverErr.message}`);
        }
      }

      // Register draft into central root_meta_info.json index
      await registerDraftInRootMeta({
        draftId,
        draftName: safeName,
        jianyingDraftDir,
        durationUs: currentCursorUs,
        totalSize: totalMaterialsBytes
      }, config.paths.jianyingDraftsDir);

      syncedToJianying = true;
      console.log(`🎬 剪映草稿已成功直接注入剪映客户端目录并注册全局索引: ${jianyingDraftDir}`);
    } catch (jyErr) {
      console.warn(`[JianyingSync] 写入剪映草稿目录失败: ${jyErr.message}`);
    }
  }

  return {
    success: true,
    draftName: projName,
    draftId,
    durationSec: (currentCursorUs / 1000000).toFixed(1),
    segmentsCount: videoSegments.length,
    subtitlesCount: textSegments.length,
    outputDirectory: outputDraftDir,
    draftPath: syncedToJianying ? jianyingDraftDir : outputDraftDir,
    jianyingDraftDir: syncedToJianying ? jianyingDraftDir : null,
    syncedToJianying
  };
}
