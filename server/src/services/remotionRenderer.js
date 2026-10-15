import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { config } from '../config.js';
import { storage, requireProjectId } from '../storage/index.js';
import { generateTechAmbientBgm } from './proceduralAudioService.js';
import { synthesizeCosyVoiceAudio } from './cosyvoiceService.js';
import { resolveArtifactOutputDir, sanitizePathSegment } from './outputManager.js';

let cachedBundleLocation = null;
let bundlingPromise = null;

function normalizeScript(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function alignManifestToDuration(manifest, durationSec) {
  const fps = Number(manifest.fps) || 30;
  const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  if (scenes.length === 0 || !(durationSec > 0)) return manifest;

  const sourceFrames = scenes.map((scene) => Math.max(1, Number(scene.durationInFrames) || Math.round((Number(scene.durationSec) || 4) * fps)));
  const sourceTotal = sourceFrames.reduce((sum, frames) => sum + frames, 0);
  const targetTotal = Math.max(scenes.length, Math.round(durationSec * fps));
  let frameCursor = 0;
  const alignedScenes = scenes.map((scene, index) => {
    const remaining = scenes.length - index - 1;
    const durationInFrames = remaining === 0
      ? Math.max(1, targetTotal - frameCursor)
      : Math.min(Math.max(1, Math.round(sourceFrames[index] * targetTotal / sourceTotal)), targetTotal - frameCursor - remaining);
    const aligned = {
      ...scene,
      startFrame: frameCursor,
      durationInFrames,
      durationSec: durationInFrames / fps
    };
    frameCursor += durationInFrames;
    return aligned;
  });

  return {
    ...manifest,
    totalFrames: frameCursor,
    totalDurationSec: frameCursor / fps,
    scenes: alignedScenes
  };
}

/**
 * 获取或编译 Remotion 代码动效 Webpack Bundle 缓存
 */
async function getOrBuildBundle() {
  if (cachedBundleLocation && fs.existsSync(cachedBundleLocation)) {
    return cachedBundleLocation;
  }

  if (bundlingPromise) {
    return await bundlingPromise;
  }

  bundlingPromise = (async () => {
    const entryPoint = path.resolve(config.paths.appRoot, 'server', 'src', 'services', 'motion', 'RemotionEntryRoot.jsx');
    if (!fs.existsSync(entryPoint)) {
      throw new Error(`Remotion 渲染根入口文件不存在: ${entryPoint}`);
    }

    const bundleLocation = await bundle({
      entryPoint,
      onProgress: () => {}
    });

    cachedBundleLocation = bundleLocation;
    return bundleLocation;
  })();

  try {
    return await bundlingPromise;
  } finally {
    bundlingPromise = null;
  }
}

/**
 * 读取客户端预编译的 Tailwind CSS 全量样式表
 */
function getClientCompiledCss() {
  try {
    const distAssetsDir = path.join(config.paths.appRoot, 'client', 'dist', 'assets');
    if (fs.existsSync(distAssetsDir)) {
      const files = fs.readdirSync(distAssetsDir);
      const cssFile = files.find(f => f.endsWith('.css'));
      if (cssFile) {
        return fs.readFileSync(path.join(distAssetsDir, cssFile), 'utf8');
      }
    }
  } catch {}
  return '';
}

/**
 * 确定性直出渲染引擎 (Remotion & Direct Headless Video Renderer)
 * 彻底摆脱对外部剪映软件的依赖，在后台直接生成高质量 1080P/4K 60fps MP4 最终成片。
 */
export async function renderMotionVideoDirect({
  projectId,
  threadId = 'main',
  manifest = null,
  outputFileName = null,
  options = {},
  onProgress = null
}) {
  const pId = requireProjectId(projectId, 'renderMotionVideoDirect');
  const project = (await storage.getProject(pId)) || {};
  const currentManifest = manifest || (await storage.getMotionManifest(pId));

  if (!currentManifest || !Array.isArray(currentManifest.scenes) || currentManifest.scenes.length === 0) {
    throw new Error('未找到有效的动效工程清单 (motion_manifest)，请先执行分镜与动效场景装配');
  }

  const fps = Number(currentManifest.fps) || 30;
  const width = Number(currentManifest.width) || 1920;
  const height = Number(currentManifest.height) || 1080;
  let totalDurationSec = Number(currentManifest.totalDurationSec) || 15;
  let totalFrames = Number(currentManifest.totalFrames) || Math.round(totalDurationSec * fps);

  // 严格核验并对齐各分镜的起止帧
  let currentFrameCursor = 0;
  const scenes = currentManifest.scenes.map((s, idx) => {
    const durSec = Number(s.durationSec) || (totalDurationSec / currentManifest.scenes.length);
    const durFrames = Number(s.durationInFrames) || Math.round(durSec * fps);
    const start = typeof s.startFrame === 'number' ? s.startFrame : currentFrameCursor;
    currentFrameCursor = start + durFrames;
    return {
      ...s,
      startFrame: start,
      durationInFrames: durFrames
    };
  });

  let safeManifest = {
    ...currentManifest,
    fps,
    width,
    height,
    totalFrames,
    totalDurationSec,
    scenes
  };

  // Keep narration, scene timing, and rendered output bound to the same script.
  const projectWorkDir = await storage.getProjectWorkDir(pId);
  const voiceAudioPath = path.join(projectWorkDir, 'voiceover.wav');
  const voiceoverMetadataPath = path.join(projectWorkDir, 'voiceover.json');
  const narrationText = safeManifest.scenes.map((scene) => scene.scriptText || '').filter(Boolean).join(' ');
  if (narrationText) {
    let voiceover;
    if (fs.existsSync(voiceAudioPath)) {
      try {
        voiceover = JSON.parse(fs.readFileSync(voiceoverMetadataPath, 'utf8'));
      } catch {
        throw new Error('发现项目配音文件，但缺少配音文本元数据。请重新合成本轮分镜的旁白后再渲染。');
      }
      if (normalizeScript(voiceover.text) !== normalizeScript(narrationText)) {
        throw new Error('配音与当前分镜的台词不一致。请先重新合成当前分镜的旁白，避免输出错配视频。');
      }
    } else {
      voiceover = await synthesizeCosyVoiceAudio({
        text: narrationText,
        outputFilePath: voiceAudioPath,
        voice: options.voice || 'geek_male'
      });
      fs.writeFileSync(voiceoverMetadataPath, JSON.stringify(voiceover, null, 2), 'utf8');
    }

    if (Number(voiceover.totalDurationSec) > 0) {
      safeManifest = alignManifestToDuration(safeManifest, Number(voiceover.totalDurationSec));
      totalDurationSec = safeManifest.totalDurationSec;
      totalFrames = safeManifest.totalFrames;
      await storage.saveMotionManifest(pId, safeManifest);
    }
  }

  // 1. 获取 Remotion Webpack 打包资产与全量 CSS
  const bundleLocation = await getOrBuildBundle();
  const cssContent = getClientCompiledCss();

  // 2. 项目物理工作目录与最终导出路径（遵循产物路由器）
  const outputDir = await resolveArtifactOutputDir({ projectId: pId, threadId });
  const outName = outputFileName || `${project?.title || 'motion_video'}_${Date.now()}.mp4`;
  const sanitizedOutName = sanitizePathSegment(outName, 'motion_video.mp4');
  const finalVideoPath = path.join(outputDir, sanitizedOutName);

  // 临时渲染无声视频文件
  const tempVideoDir = config.paths.cacheDir || path.join(config.paths.dataDir, 'cache');
  if (!fs.existsSync(tempVideoDir)) fs.mkdirSync(tempVideoDir, { recursive: true });
  const tempVideoPath = path.join(tempVideoDir, `remotion_render_${Date.now()}.mp4`);

  // 3. 调用 selectComposition 初始化 React 上下文并动态注入 manifest 与 props
  const comp = await selectComposition({
    serveUrl: bundleLocation,
    id: 'MotionExplainer',
    inputProps: {
      manifest: safeManifest,
      cssContent
    }
  });

  // 4. 调用 Remotion Headless 内核渲染每一帧画面
  await renderMedia({
    composition: {
      ...comp,
      width,
      height,
      fps,
      durationInFrames: totalFrames
    },
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: tempVideoPath,
    inputProps: {
      manifest: safeManifest,
      cssContent
    },
    onProgress: ({ renderedFrames, encodedFrames }) => {
      if (onProgress) {
        onProgress({
          renderedFrames,
          totalFrames,
          percent: Math.min(100, Math.round((renderedFrames / totalFrames) * 100))
        });
      }
    }
  });

  if (!fs.existsSync(tempVideoPath)) {
    throw new Error('Remotion 帧渲染未生成视频文件');
  }

  // 5. 组装多轨商业免版权音频体系（人声旁白 + 科技极客 BGM + 避让混流）
  let effectiveVoiceAudio = fs.existsSync(voiceAudioPath) ? voiceAudioPath : null;

  // 生成一条自适应时长的纯代码免版权科技环境背景音乐 (Lo-Fi Drone Ambient)
  const bgmAudioPath = path.join(tempVideoDir, `remotion_bgm_${Date.now()}.wav`);
  try {
    try {
      generateTechAmbientBgm(bgmAudioPath, Math.ceil(totalDurationSec) + 2);
    } catch {}

    // 调用 FFmpeg 多轨智能避让混流（人声优先，背景音乐微弱衬底）
    await mergeVideoAndAudioMultiTrack({
      videoPath: tempVideoPath,
      voiceAudioPath: effectiveVoiceAudio,
      bgmAudioPath: fs.existsSync(bgmAudioPath) ? bgmAudioPath : null,
      outputPath: finalVideoPath
    });
  } finally {
    // 清理临时中间音频与视频文件
    try {
      if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
    } catch {}
    try {
      if (fs.existsSync(bgmAudioPath)) fs.unlinkSync(bgmAudioPath);
    } catch {}
  }

  const stat = fs.statSync(finalVideoPath);

  // 6. 登记到产物注册表 (kind: 'video_render')
  const artifactId = `render_${Date.now()}`;
  await storage.saveArtifactIndex(pId, {
      id: artifactId,
      projectId: pId,
      kind: 'video_render',
      currentVersion: 1,
      status: 'approved',
      versions: [{
        version: 1,
        hash: `render_hash_${Date.now()}`,
        schemaId: 'schema://meocox/video_render/v1',
        lineage: [`motion_${pId}`],
        producedBy: { taskId: 'task_motion_render', operatorId: 'remotion_render_direct' },
        createdAt: Date.now(),
        payloadRef: sanitizedOutName
      }]
    });

  return {
    success: true,
    artifactId,
    videoPath: finalVideoPath,
    fileName: sanitizedOutName,
    width,
    height,
    fps,
    totalFrames,
    durationSec: totalDurationSec,
    durationFormatted: `${totalDurationSec.toFixed(1)}s (${totalFrames} 帧 @ ${fps}fps)`,
    sizeBytes: stat.size,
    sizeFormatted: (stat.size / (1024 * 1024)).toFixed(2) + ' MB',
    engine: 'Remotion Headless (Chrome Frame Renderer) + Native H.264 Encoder',
    summary: `确定性动效成片已直接渲染输出至本地磁盘: ${finalVideoPath}`
  };
}

/**
 * 利用 FFmpeg 多轨智能避让混音（视频 + 人声配音 + 极客免版权 BGM）
 */
function mergeVideoAndAudioMultiTrack({
  videoPath,
  voiceAudioPath,
  bgmAudioPath,
  outputPath
}) {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-i', videoPath];

    const hasVoice = voiceAudioPath && fs.existsSync(voiceAudioPath);
    const hasBgm = bgmAudioPath && fs.existsSync(bgmAudioPath);

    if (hasVoice && hasBgm) {
      args.push('-i', voiceAudioPath, '-i', bgmAudioPath);
      args.push(
        '-filter_complex',
        '[1:a]volume=1.0[v];[2:a]volume=0.15,aloop=loop=-1:size=2e+09[b];[v][b]amix=inputs=2:duration=first:dropout_transition=2[a]',
        '-map', '0:v',
        '-map', '[a]'
      );
    } else if (hasVoice) {
      args.push('-i', voiceAudioPath);
      args.push(
        '-map', '0:v',
        '-map', '1:a'
      );
    } else if (hasBgm) {
      args.push('-i', bgmAudioPath);
      args.push(
        '-filter_complex',
        '[1:a]volume=0.35,aloop=loop=-1:size=2e+09[b]',
        '-map', '0:v',
        '-map', '[b]'
      );
    } else {
      // 没有任何音频时直接输出
      if (fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch {}
      }
      fs.copyFileSync(videoPath, outputPath);
      return resolve(outputPath);
    }

    args.push(
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      outputPath
    );

    const proc = spawn('ffmpeg', args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg 音视频合流失败 (code ${code}): ${stderr.slice(-400)}`));
      }
    });
    proc.on('error', reject);
  });
}
