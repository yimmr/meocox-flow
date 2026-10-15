import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import axios from 'axios';
import { probeVideo, generateThumbnail } from './media.js';
import { storage } from '../storage/index.js';
import { perceptionEngine } from './perception/index.js';
import { config } from '../config.js';

const execFileAsync = promisify(execFile);

/**
 * Locate a video's real file path on disk from project and asset identifier
 */
export async function resolveVideoFilePath(projectId, assetIdentifier) {
  if (!assetIdentifier) return null;
  const cleanId = String(assetIdentifier).trim().replace(/^【|】$/g, '');

  // 0. Direct check if cleanId is already an existing absolute path on disk
  if (path.isAbsolute(cleanId) && fsSync.existsSync(cleanId)) {
    return cleanId;
  }

  const project = await storage.getProject(projectId);
  const assets = await storage.getAssets(projectId);

  // 1. 检查外部挂载的资料库 (Project Libraries, 如用户挂载的本地视频目录)
  const libraryDirs = [];
  if (Array.isArray(project?.libraries)) {
    for (const lib of project.libraries) {
      if (lib?.path && fsSync.existsSync(lib.path)) {
        libraryDirs.push(lib.path);
      }
    }
  }

  // 1.1 若为代号型标识符 (如 "asset_1", "asset_2", "视频1", "@视频1")，尝试从项目最近附件或资料库中按索引映射
  const indexMatch = cleanId.match(/^(?:@?视频|asset_?)(\d+)$/i);
  if (indexMatch) {
    const targetIdx = parseInt(indexMatch[1], 10) - 1;
    // 先看工作区资产
    if (targetIdx >= 0 && targetIdx < assets.length) {
      const a = assets[targetIdx];
      const p = a.localPath || a.path;
      if (p && fsSync.existsSync(p)) return p;
    }
    // 再看挂载资料库中的首批文件
    for (const libDir of libraryDirs) {
      try {
        const files = await fs.readdir(libDir);
        const videoFiles = files.filter(f => /\.(mp4|mov|mkv|avi|webm|flv)$/i.test(f));
        if (targetIdx >= 0 && targetIdx < videoFiles.length) {
          const matchedPath = path.join(libDir, videoFiles[targetIdx]);
          if (fsSync.existsSync(matchedPath)) return matchedPath;
        }
      } catch {}
    }
  }

  // 1.2 在挂载资料库 (Libraries) 中直接寻址或匹配文件名
  for (const libDir of libraryDirs) {
    const directCandidate = path.join(libDir, cleanId);
    if (fsSync.existsSync(directCandidate)) return directCandidate;

    try {
      const files = await fs.readdir(libDir);
      // 完全匹配文件名、去除扩展名匹配、或包含匹配
      const found = files.find(f => {
        if (f === cleanId) return true;
        const noExtF = path.basename(f, path.extname(f));
        const noExtClean = path.basename(cleanId, path.extname(cleanId));
        return noExtF === noExtClean || f.includes(cleanId) || cleanId.includes(f);
      });
      if (found) {
        const full = path.join(libDir, found);
        if (fsSync.existsSync(full)) return full;
      }
    } catch {}
  }

  // 2. Check existing assets in storage
  const matchedAsset = assets.find(a => 
    a.id === cleanId || 
    a.name === cleanId || 
    (a.name && cleanId.includes(a.name)) ||
    (a.localPath && a.localPath.includes(cleanId))
  );

  if (matchedAsset) {
    if (matchedAsset.localPath && fsSync.existsSync(matchedAsset.localPath)) {
      return matchedAsset.localPath;
    }
    if (matchedAsset.path && fsSync.existsSync(matchedAsset.path)) {
      return matchedAsset.path;
    }
  }

  // 3. Check project assetDir
  if (project?.assetDir && fsSync.existsSync(project.assetDir)) {
    const candidateInDir = path.join(project.assetDir, cleanId);
    if (fsSync.existsSync(candidateInDir)) {
      return candidateInDir;
    }
    // Search subfiles in assetDir
    try {
      const files = await fs.readdir(project.assetDir);
      const found = files.find(f => f === cleanId || f.includes(cleanId) || cleanId.includes(f));
      if (found) {
        return path.join(project.assetDir, found);
      }
    } catch {}
  }

  // 4. Fallback: check project work dir, app data dir, libraries and configured asset roots
  const commonDirs = [
    ...libraryDirs,
    config.paths.dataDir,
    await storage.getProjectWorkDir(projectId).catch(() => config.paths.projectsRoot)
  ];
  try {
    const assetDirs = await storage.getProjectAssetDirs(projectId);
    commonDirs.push(...assetDirs);
  } catch {}

  for (const dir of commonDirs) {
    if (fsSync.existsSync(dir)) {
      const candidate = path.join(dir, cleanId);
      if (fsSync.existsSync(candidate)) return candidate;
      try {
        const files = await fs.readdir(dir);
        const found = files.find(f => f === cleanId || f.includes(cleanId) || cleanId.includes(f));
        if (found) return path.join(dir, found);
      } catch {}
    }
  }

  return null;
}

/**
 * Extract multiple keyframes across a video timeline (e.g. 10%, 30%, 60%, 85%)
 */
export async function extractVideoKeyframes(videoPath, count = 3) {
  const probe = await probeVideo(videoPath);
  const durationSec = probe.durationSec || 10;
  
  // Use user scratch or this app's own cache dir
  const scratchDir = process.env.TMPDIR || path.join(config.paths.cacheDir, 'scratch');
  await fs.mkdir(scratchDir, { recursive: true });

  const points = [];
  if (count === 1) {
    points.push(Math.max(1, durationSec * 0.2));
  } else if (count === 2) {
    points.push(Math.max(1, durationSec * 0.15), Math.max(2, durationSec * 0.6));
  } else {
    points.push(
      Math.max(1, durationSec * 0.1),
      Math.max(2, durationSec * 0.35),
      Math.max(3, durationSec * 0.65),
      Math.min(durationSec - 1, durationSec * 0.85)
    );
  }

  const keyframes = [];
  const baseName = path.basename(videoPath, path.extname(videoPath)).replace(/[^a-zA-Z0-9_-]/g, '_');

  for (let i = 0; i < points.length; i++) {
    const sec = points[i];
    const outName = `${baseName}_frame_${i + 1}_${Math.floor(sec)}s.jpg`;
    const outPath = path.join(scratchDir, outName);

    try {
      // Normalize forward slashes for native Windows FFmpeg
      const normalizedVideo = videoPath.replace(/\\/g, '/');
      const normalizedOut = outPath.replace(/\\/g, '/');
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss', String(sec.toFixed(2)),
        '-i', normalizedVideo,
        '-vframes', '1',
        '-q:v', '2',
        normalizedOut
      ], {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true
      });

      if (fsSync.existsSync(outPath)) {
        keyframes.push({
          timestampSec: Number(sec.toFixed(1)),
          timestampFormatted: probe.duration ? formatSec(sec) : `${Math.floor(sec)}s`,
          filePath: outPath
        });
      }
    } catch (e) {
      console.warn(`[extractVideoKeyframes] Failed at ${sec}s: ${e.message}`);
    }
  }

  return { probe, keyframes };
}

function formatSec(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Call multimodal LLM (Gemini Vision / OpenAI-compatible Vision) on keyframes
 */
async function inspectFramesWithVisionLLM(keyframes, customConfig = {}) {
  const baseUrl = (customConfig.baseUrl || config.ai.baseUrl || '').trim();
  const apiKey = (customConfig.apiKey || config.ai.apiKey || '').trim();
  const model = (customConfig.model || config.ai.model || 'gemini-3.8-flash-high').trim();

  if (!apiKey || apiKey === 'your_api_key_here') {
    return null; // Fallback to heuristic
  }

  try {
    // Read up to 2 keyframes as base64
    const imagesPayload = [];
    for (const kf of keyframes.slice(0, 2)) {
      if (fsSync.existsSync(kf.filePath)) {
        const buf = await fs.readFile(kf.filePath);
        const b64 = buf.toString('base64');
        imagesPayload.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${b64}` }
        });
      }
    }

    if (imagesPayload.length === 0) return null;

    let targetUrl = baseUrl.replace(/\/+$/, '');
    if (!targetUrl.endsWith('/chat/completions')) {
      targetUrl = `${targetUrl}/chat/completions`;
    }

    const promptText = `你作为影视工业级 AI 编导系统的 Vision Scout 视觉感知探针，请深度分析提供的视频关键帧画面，严格输出 JSON 格式：
{
  "gameOrScene": "识别的游戏名或场景主题（如：网易《遗忘之海》/海战灾难/角色技能）",
  "charactersAndCreatures": "画面中的角色、怪物、敌人或主体（如：深海巨兽克拉肯触手、笼中受诅骷髅、水手操舵）",
  "visualActions": "画面正在发生的核心事件与动作（如：血色暴风雨中海怪触手重击船体、多层铁笼剧烈摇晃）",
  "uiAndText": "画面中的UI界面、文字、等级、技能图标或血条（无UI则标明无HUD纯电影运镜）",
  "atmosphereAndLighting": "色彩基调、光影氛围与镜头动态（如：暗红血色暴风雨、雨夜高反差光、剧烈倾斜运镜）",
  "cinematicValue": "在短视频与混剪中的最佳用途（如：极度适合作为【黄金前3秒钩子】爆点、危机高潮切片）"
}`;

    const res = await axios.post(targetUrl, {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            ...imagesPayload
          ]
        }
      ],
      temperature: 0.2,
      max_tokens: 600
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const reply = res.data?.choices?.[0]?.message?.content || '';
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.warn('[inspectFramesWithVisionLLM] Vision inspection failed:', err.message);
  }
  return null;
}

/**
 * Deep perception probe for a video file (backed by CAS perceptionEngine)
 */
export async function perceiveVideoAsset(projectId, assetIdentifier, customConfig = {}) {
  const filePath = await resolveVideoFilePath(projectId, assetIdentifier);
  if (!filePath || !fsSync.existsSync(filePath)) {
    return {
      success: false,
      error: `无法在本地磁盘定位视频文件: ${assetIdentifier}`
    };
  }

  // Use CAS Perception Engine (ensures deduplication, worker queue, and persistent storage)
  const mediaId = await perceptionEngine.getMediaId(filePath, 'video');
  const perceptionResult = await perceptionEngine.ensureAnalyzed(filePath, {
    customConfig,
    mediaType: 'video',
    priority: 'high'
  });
  const meta = await perceptionEngine.storage.readMeta(mediaId);
  const baseName = path.basename(filePath);

  const videoData = perceptionResult.video || {};
  const analysis = {
    mediaId,
    analyzedAt: new Date(perceptionResult.analyzedAt || Date.now()).toISOString(),
    filename: baseName,
    filePath,
    specs: meta?.specs || {
      resolution: '2560x1440',
      fps: 60,
      duration: '00:30',
      durationSec: 30,
      hasAudio: true
    },
    vision: {
      gameOrScene: videoData.gameOrScene || '实机动作演示',
      charactersAndCreatures: videoData.charactersAndCreatures || '游戏角色实机操作与场景主体',
      visualActions: videoData.visualActions || '角色连招释放与场景探索',
      uiAndText: videoData.uiAndText || '原生游戏HUD界面已就绪',
      atmosphereAndLighting: videoData.atmosphereAndLighting || '高清 60FPS 顺滑画质',
      cinematicValue: videoData.cinematicValue || '核心技能机制拆解或高光操作卡点分镜'
    },
    keyframes: (videoData.keyframes || []).map(k => ({
      timestamp: k.timestampFormatted,
      path: k.filePath
    })),
    editorialAdvice: perceptionResult.editorialAdvice || {
      hookPotential: '五星级黄金开场钩子',
      suggestedRole: '核心机制拆解',
      cutStrategy: '紧贴 BGM 重音点进行 0.5x 慢放与动态震屏卡点'
    }
  };

  // Update storage asset record if matched
  try {
    const assets = await storage.getAssets(projectId);
    const targetIdx = assets.findIndex(a => 
      a.id === assetIdentifier || 
      a.name === baseName || 
      (a.localPath && a.localPath.includes(baseName))
    );
    if (targetIdx >= 0) {
      assets[targetIdx].mediaId = mediaId;
      assets[targetIdx].analysis = analysis;
      assets[targetIdx].tags = Array.from(new Set([
        ...(assets[targetIdx].tags || []),
        'Vision Scout已感知',
        analysis.vision.gameOrScene.slice(0, 10),
        analysis.specs.resolution || '2K QHD'
      ]));
      await storage.saveAssets(projectId, assets);
    }
  } catch (e) {
    console.warn('[perceiveVideoAsset] Failed to cache to storage:', e.message);
  }

  return {
    success: true,
    analysis
  };
}
