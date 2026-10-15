import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import { exec, spawn } from 'node:child_process';
import { storage } from '../storage/index.js';
import { probeVideo, generateThumbnail, scanDirectoryForVideos, sliceVideoSegment } from '../services/media.js';
import { generateJianyingDraft } from '../services/jianying.js';
import { computeFastMediaFingerprint, getAssetCache, saveAssetCache } from '../services/cache.js';
import { perceptionEngine, computeMediaFingerprint as computePerceptionFingerprint } from '../services/perception/index.js';
import { config } from '../config.js';
import { requireProjectIdMiddleware } from '../runtime/requireProjectId.js';
import { openFolderInExplorer } from '../utils/nativeExplorer.js';
import { isAuthorizedAssetPath } from '../utils/assetAccess.js';

const router = express.Router();

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function getFileType(ext) {
  const e = ext.toLowerCase();
  if (['.mp4', '.mov', '.mkv', '.avi', '.flv', '.webm', '.ts', '.m4v'].includes(e)) return 'video';
  if (['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma'].includes(e)) return 'audio';
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg', '.tiff'].includes(e)) return 'image';
  if (['.txt', '.md', '.json', '.csv', '.docx', '.pdf', '.srt', '.vtt'].includes(e)) return 'document';
  return 'other';
}

/**
 * GET /api/assets?projectId=...
 */
router.get('/', requireProjectIdMiddleware('query', '/api/assets'), async (req, res) => {
  try {
    const assets = await storage.getAssets(req.projectId);
    res.json({ assets, count: assets.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/assets?projectId=...
 * Add or update asset
 */
router.post('/', requireProjectIdMiddleware('either', '/api/assets'), async (req, res) => {
  const projectId = req.projectId;
  const { asset } = req.body;
  if (!asset || !asset.name) {
    return res.status(400).json({ error: 'asset is required' });
  }

  const newAsset = {
    id: asset.id || `clip_${Date.now()}`,
    name: asset.name,
    duration: asset.duration || '00:05',
    durationSec: asset.durationSec || 5,
    fps: asset.fps || 60,
    resolution: asset.resolution || '1920x1080',
    tags: asset.tags || ['新增素材'],
    speech: asset.speech || '',
    status: asset.status || 'ready',
    score: asset.score || 0.9,
    localPath: asset.localPath || '',
    thumbnail: asset.thumbnail || null
  };

  try {
    const assets = await storage.addAsset(projectId, newAsset);
    res.json({ success: true, asset: newAsset, assets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/assets/storyboard?projectId=...
 */
router.get('/storyboard', requireProjectIdMiddleware('query', '/api/assets/storyboard'), async (req, res) => {
  const projectId = req.projectId;
  try {
    const storyboard = await storage.getStoryboard(projectId);
    res.json({ storyboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/assets/storyboard?projectId=...
 */
router.post('/storyboard', requireProjectIdMiddleware('either', '/api/assets/storyboard'), async (req, res) => {
  const projectId = req.projectId;
  const { storyboard } = req.body;
  if (!Array.isArray(storyboard)) {
    return res.status(400).json({ error: 'storyboard must be an array' });
  }

  try {
    await storage.saveStoryboard(projectId, storyboard);
    res.json({ success: true, storyboard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/assets/scan
 * Scan a local directory for video files, probe them, and add to project assets
 */
router.post('/scan', requireProjectIdMiddleware('body', '/api/assets/scan'), async (req, res) => {
  const projectId = req.projectId;
  const { directoryPath } = req.body;
  const targetDir = (directoryPath || config.paths.assetsDir).trim();

  if (!await isAuthorizedAssetPath(targetDir)) {
    return res.status(403).json({ error: '扫描目录尚未挂载到应用资料库' });
  }

  try {
    const videoFiles = await scanDirectoryForVideos(targetDir);
    if (videoFiles.length === 0) {
      return res.json({ 
        success: true, 
        message: `在路径 "${targetDir}" 未发现视频文件（.mp4/.mov/.mkv等）`, 
        added: 0 
      });
    }

    const addedAssets = [];
    const thumbDir = path.join(await storage.getProjectWorkDir(projectId), 'thumbnails');

    for (let i = 0; i < videoFiles.length; i++) {
      const vPath = videoFiles[i];
      const fileName = path.basename(vPath);

      // 1. Fast media fingerprint check
      let meta = null;
      let thumbnailPath = null;
      let fingerprint = null;

      try {
        fingerprint = await computeFastMediaFingerprint(vPath);
        const cached = await getAssetCache(fingerprint);
        if (cached && cached.meta) {
          meta = cached.meta;
          thumbnailPath = cached.thumbnail || null;
        }
      } catch (fpErr) {
        console.warn(`[scan] fingerprint failed for ${vPath}:`, fpErr.message);
      }

      // 2. Cache miss: probe & generate thumbnail
      if (!meta) {
        meta = await probeVideo(vPath);
        const thumbFileName = `thumb_${Date.now()}_${i}.jpg`;
        const thumbFilePath = path.join(thumbDir, thumbFileName);
        const thumbSuccess = await generateThumbnail(vPath, thumbFilePath, Math.min(1.0, meta.durationSec / 2));
        thumbnailPath = thumbSuccess ? `/data/projects/${projectId}/thumbnails/${thumbFileName}` : null;

        if (fingerprint) {
          await saveAssetCache(fingerprint, { meta, thumbnail: thumbnailPath });
        }
      }

      const newAsset = {
        id: `clip_scanned_${Date.now()}_${i}`,
        name: fileName,
        duration: meta.duration,
        durationSec: meta.durationSec,
        fps: meta.fps,
        resolution: meta.resolution,
        tags: ['本地导入', meta.formatName?.toUpperCase() || 'MP4'],
        speech: '扫描导入素材',
        status: 'ready',
        score: 0.90,
        localPath: vPath,
        thumbnail: thumbnailPath,
        fingerprint
      };

      await storage.addAsset(projectId, newAsset);
      addedAssets.push(newAsset);
    }

    // Also update pipeline step 2 details
    await storage.updatePipelineStage(projectId, {
      stageId: 'step_2',
      status: 'completed',
      progress: 100,
      details: `已完成本地扫描，新增 ${addedAssets.length} 个视频切片素材`
    });

    const allAssets = await storage.getAssets(projectId);
    res.json({
      success: true,
      message: `成功扫描并导入 ${addedAssets.length} 个本地视频文件`,
      addedCount: addedAssets.length,
      assets: allAssets
    });
  } catch (err) {
    res.status(500).json({ error: `扫描失败: ${err.message}` });
  }
});

/**
 * POST /api/assets/export/jianying
 * Export real Jianying Draft project
 */
router.post('/export/jianying', requireProjectIdMiddleware('body', '/api/assets/export/jianying'), async (req, res) => {
  const projectId = req.projectId;
  const { customDraftName } = req.body;
  try {
    const project = await storage.getProject(projectId);
    const storyboard = await storage.getStoryboard(projectId);
    const assets = await storage.getAssets(projectId);

    if (storyboard.length === 0) {
      return res.status(400).json({ error: '当前分镜时间轴为空，请先规划分镜！' });
    }

    const exportResult = await generateJianyingDraft({
      project,
      storyboard,
      assets,
      customDraftName: customDraftName || project?.title
    });

    const overview = {
      draftName: exportResult.draftName,
      draftPath: exportResult.jianyingDraftDir || exportResult.outputDirectory,
      videoSegments: exportResult.segmentsCount,
      textSegments: exportResult.subtitlesCount,
      injectionStatus: exportResult.syncedToJianying ? '已直接注入剪映客户端并注册全局索引' : '已保存至 Studio 导出目录'
    };

    // Update pipeline step 5 (and fallback step 4) status
    await storage.updatePipelineStage(projectId, {
      stageId: 'step_5',
      status: 'completed',
      progress: 100,
      details: `剪映工程「${exportResult.draftName}」已成功导出！可直接在剪映打开编辑。`,
      outputOverview: overview
    });

    // Fallback: update legacy step_4 only if step_5 is not present in pipeline
    try {
      const currentPipeline = await storage.getPipeline(projectId);
      const hasStep5 = currentPipeline?.stages?.some(s => s.id === 'step_5');
      if (!hasStep5) {
        await storage.updatePipelineStage(projectId, {
          stageId: 'step_4',
          status: 'completed',
          progress: 100,
          details: `剪映工程已成功导出！草稿名称: ${exportResult.draftName}`,
          outputOverview: overview
        });
      }
    } catch (e) {}

    res.json({
      success: true,
      ...exportResult
    });
  } catch (err) {
    console.error('Export Jianying error:', err);
    res.status(500).json({ error: `导出剪映草稿失败: ${err.message}` });
  }
});

/**
 * POST /api/assets/launch-jianying
 * Launch local Jianying Pro executable
 */
router.post('/launch-jianying', async (req, res) => {
  try {
    const jianyingExe = config.paths.jianyingAppExe;
    if (jianyingExe && fsSync.existsSync(jianyingExe)) {
      exec(`start "" "${jianyingExe}"`);
      return res.json({ success: true, message: '正在启动剪映专业版...' });
    }
    // Fallback: check default installation paths
    const localAppData = process.env.LOCALAPPDATA;
    const defaultExe = localAppData ? path.join(localAppData, 'JianyingPro', 'Apps', 'JianyingPro.exe') : null;
    if (defaultExe && fsSync.existsSync(defaultExe)) {
      exec(`start "" "${defaultExe}"`);
      return res.json({ success: true, message: '正在启动剪映专业版...' });
    }
    return res.status(404).json({ error: '未在系统中检测到剪映专业版客户端安装路径' });
  } catch (err) {
    res.status(500).json({ error: `启动剪映失败: ${err.message}` });
  }
});

/**
 * GET /api/assets/browse?projectId=...&dir=...
 * Browse all files in asset directory, grouped by types and subdirectories
 */
router.get('/browse', async (req, res) => {
  const { projectId, dir, libraryId, global: isGlobal } = req.query;
  try {
    let targetDirs = [];
    if (dir) {
      targetDirs = [path.resolve(dir)];
      if (!await isAuthorizedAssetPath(targetDirs[0])) {
        return res.status(403).json({ error: '浏览目录尚未挂载到应用资料库' });
      }
    } else if (libraryId) {
      const glibs = await storage.getGlobalLibraries();
      const target = glibs.find(g => g.id === libraryId);
      if (target && target.path && fsSync.existsSync(target.path)) {
        targetDirs = [path.resolve(target.path)];
      }
    } else if (projectId) {
      targetDirs = await storage.getProjectAssetDirs(projectId);
      // 同时自动合并项目挂载的所有参考资料库目录 (Libraries)
      try {
        const p = await storage.getProject(projectId);
        if (Array.isArray(p?.libraries)) {
          for (const l of p.libraries) {
            if (l.path && fsSync.existsSync(l.path)) {
              const resPath = path.resolve(l.path);
              if (!targetDirs.includes(resPath)) {
                targetDirs.push(resPath);
              }
            }
          }
        }
      } catch (_) {}
    } else {
      // 默认全局资料库模式：提取全局绑定的所有有效目录
      const glibs = await storage.getGlobalLibraries();
      targetDirs = glibs
        .filter(g => g.path && fsSync.existsSync(g.path))
        .map(g => path.resolve(g.path));
    }

    // 项目必须手动设置资产目录，未设置时返回未配置状态
    if (!targetDirs || targetDirs.length === 0) {
      return res.json({
        success: true,
        notConfigured: true,
        currentDir: null,
        currentDirs: [],
        subDirs: [],
        files: []
      });
    }

    const subDirs = new Set();
    const files = [];

    // Scan up to 2 levels deep
    async function scanLevel(currentPath, relPrefix = '', depth = 0, rootDir = '') {
      if (depth > 2) return;
      const entries = await fs.readdir(currentPath, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name.startsWith('node_modules') || entry.name === 'thumbnails') continue;
        const fullPath = path.join(currentPath, entry.name);
        const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          const subDirName = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
          subDirs.add(subDirName);
          await scanLevel(fullPath, subDirName, depth + 1, rootDir);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          const type = getFileType(ext);
          const stat = await fs.stat(fullPath).catch(() => null);
          const thumbnail = type === 'video'
            ? `/api/assets/thumbnail?path=${encodeURIComponent(fullPath)}`
            : type === 'image'
            ? `/api/assets/stream?path=${encodeURIComponent(fullPath)}`
            : null;

          let mediaId = null;
          let perceptionStatus = 'unprocessed';
          let perception = null;

          if (['video', 'image', 'audio'].includes(type) && stat) {
            try {
              mediaId = await computePerceptionFingerprint(fullPath, type);
              const statusObj = await perceptionEngine.getStatus(mediaId);
              perceptionStatus = statusObj.status;
              if (statusObj.perception) {
                perception = statusObj.perception;
              }
            } catch (err) {}
          }

          files.push({
            name: entry.name,
            path: fullPath,
            relPath,
            subDir: relPrefix || '.',
            rootDir,
            rootLabel: path.basename(rootDir),
            type,
            ext,
            size: stat ? stat.size : 0,
            sizeFormatted: stat ? formatFileSize(stat.size) : '0 B',
            mtime: stat ? stat.mtimeMs : 0,
            thumbnail,
            mediaId,
            perceptionStatus,
            perception
          });
        }
      }
    }

    for (const rDir of targetDirs) {
      if (fsSync.existsSync(rDir)) {
        await scanLevel(rDir, '', 0, rDir);
      }
    }

    // Sort files: newest first
    files.sort((a, b) => b.mtime - a.mtime);

    res.json({
      success: true,
      currentDir: targetDirs[0],
      currentDirs: targetDirs.map(d => ({
        path: d,
        label: path.basename(d)
      })),
      subDirs: Array.from(subDirs).sort(),
      files,
      count: files.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/assets/thumbnail?path=...
 * Serve or dynamically generate a JPEG thumbnail poster for videos
 */
router.get('/thumbnail', async (req, res) => {
  const filePath = req.query.path;
  if (!await isAuthorizedAssetPath(filePath)) {
    return res.status(403).send('Path is outside mounted asset directories');
  }
  if (!filePath || !fsSync.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    return res.status(404).send('Not a file');
  }

  const ext = path.extname(filePath).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext)) {
    return res.sendFile(path.resolve(filePath));
  }

  if (['.mp4', '.mov', '.mkv', '.webm', '.avi', '.flv', '.m4v'].includes(ext)) {
    try {
      const thumbCacheDir = path.join(config.paths.cacheDir, 'thumbnails');
      if (!fsSync.existsSync(thumbCacheDir)) {
        await fs.mkdir(thumbCacheDir, { recursive: true });
      }

      const hash = crypto.createHash('md5').update(`${filePath}:${stat.size}:${stat.mtimeMs}`).digest('hex');
      const thumbPath = path.join(thumbCacheDir, `${hash}.jpg`);

      if (!fsSync.existsSync(thumbPath)) {
        const ok = await generateThumbnail(filePath, thumbPath, 0.5);
        if (!ok) {
          await generateThumbnail(filePath, thumbPath, 0.1);
        }
      }

      if (fsSync.existsSync(thumbPath)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.type('image/jpeg');
        return res.sendFile(path.resolve(thumbPath));
      }
    } catch (err) {
      console.warn('[thumbnail] error generating thumbnail:', err.message);
    }
  }

  res.status(404).send('Thumbnail not available');
});

/**
 * GET /api/assets/stream?path=...
 * Stream file for video, audio, image and document previews
 */
router.get('/stream', async (req, res) => {
  const filePath = req.query.path;
  if (!await isAuthorizedAssetPath(filePath)) {
    return res.status(403).send('Path is outside mounted asset directories');
  }
  if (!filePath || !fsSync.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    return res.status(404).send('Not a file');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.json': 'application/json'
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const range = req.headers.range;

  // Handle Range requests for video/audio seeking
  if (range && (contentType.startsWith('video/') || contentType.startsWith('audio/'))) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunksize = (end - start) + 1;
    const stream = fsSync.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType,
    });
    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes'
    });
    fsSync.createReadStream(filePath).pipe(res);
  }
});

/**
 * POST /api/assets/open-folder
 * Open asset folder in native file explorer
 */
router.post('/open-folder', async (req, res) => {
  const { folderPath, projectId } = req.body;
  try {
    let target = folderPath ? path.resolve(folderPath) : null;
    if (!target && projectId) {
      target = await storage.getProjectAssetDir(projectId);
    }
    if (!target) {
      target = path.resolve(config.paths.assetsDir);
    }

    if (!await isAuthorizedAssetPath(target)) {
      return res.status(403).json({ error: '目录尚未挂载到应用资料库' });
    }

    const result = await openFolderInExplorer(target);
    res.json({ success: true, folderPath: result.openedPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/assets/file
 * Delete a media asset file from local disk with path verification
 */
router.delete('/file', async (req, res) => {
  const filePath = req.query.path || req.body?.path;
  if (!filePath) {
    return res.status(400).json({ error: 'path is required' });
  }

  try {
    const resolvedPath = path.resolve(filePath);
    if (!await isAuthorizedAssetPath(resolvedPath)) {
      return res.status(403).json({ error: '文件不在已挂载的资料库中' });
    }
    try {
      await fs.access(resolvedPath);
    } catch {
      return res.status(404).json({ error: '文件不存在或已被删除' });
    }

    await fs.unlink(resolvedPath);
    res.json({ success: true, message: '文件已成功从磁盘删除', deletedPath: resolvedPath });
  } catch (err) {
    console.error('[Assets] Failed to delete file:', err);
    res.status(500).json({ error: err.message || '删除文件失败' });
  }
});

export default router;
