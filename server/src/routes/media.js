import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { exec } from 'node:child_process';
import { openFolderInExplorer } from '../utils/nativeExplorer.js';
import multer from 'multer';
import { perceptionEngine, perceptionStorage, semanticSearchEngine } from '../services/perception/index.js';
import { localEngine, modelDownloader } from '../services/perception/localEngine/index.js';
import {
  getModelLibrary,
  getLibraryModelById,
  toggleModelEnabled,
  addCustomModelToLibrary,
  importLocalModel,
  deleteModelFromLibrary,
  scanModelsDirectoryIntoLibrary
} from '../services/perception/localEngine/modelLibrary.js';
import { getModelsBaseDir } from '../services/perception/localEngine/paths.js';
import { config } from '../config.js';
import { inspectCosyVoiceStatus, cosyVoiceDownloader } from '../services/cosyvoiceService.js';

const router = express.Router();

/**
 * GET /api/media/search
 * Natural language semantic search across CAS perceived media
 */
router.get('/search', async (req, res) => {
  const { q = '', mediaType = 'all', minScore, limit = 50, candidatePaths, candidateMediaIds } = req.query;
  if (!q.trim()) {
    return res.json({ success: true, count: 0, results: [] });
  }

  try {
    let candidates = null;
    if (candidatePaths) {
      candidates = String(candidatePaths).split(',').map(s => s.trim()).filter(Boolean);
    }
    let mediaIds = null;
    if (candidateMediaIds) {
      mediaIds = String(candidateMediaIds).split(',').map(s => s.trim()).filter(Boolean);
    }
    const results = await semanticSearchEngine.search(q, {
      mediaType,
      candidatePaths: candidates,
      candidateMediaIds: mediaIds,
      minScore: minScore !== undefined ? Number(minScore) : 0.02,
      limit: Number(limit)
    });
    res.json({
      success: true,
      query: q,
      count: results.length,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/search/reindex
 * Rebuild inverted index across CAS storage
 */
router.post('/search/reindex', async (req, res) => {
  try {
    await semanticSearchEngine.rebuildIndex();
    res.json({ success: true, message: '全量语义检索索引重建完成', total: semanticSearchEngine.totalDocs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/media/status?mediaIds=id1,id2
 */
router.get('/status', async (req, res) => {
  const mediaIdsQuery = req.query.mediaIds || '';
  const mediaIds = String(mediaIdsQuery)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (mediaIds.length === 0) {
    return res.json({ statuses: {} });
  }

  try {
    const statuses = await perceptionEngine.getBatchStatus(mediaIds);
    res.json({ success: true, statuses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/media/perception/:mediaId
 */
router.get('/perception/:mediaId', async (req, res) => {
  const { mediaId } = req.params;
  try {
    const perception = await perceptionEngine.getPerception(mediaId);
    if (!perception) {
      return res.status(404).json({ error: 'Perception not found for this mediaId' });
    }
    res.json({ success: true, perception });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/media/storage/stats
 * Get comprehensive CAS storage stats
 */
router.get('/storage/stats', async (req, res) => {
  try {
    const stats = await perceptionStorage.getStorageStats();
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/storage/clean
 * Trigger storage cleanup (artifacts or orphaned)
 */
router.post('/storage/clean', async (req, res) => {
  const { action = 'artifacts', olderThanDays = 0, mediaIds = null } = req.body;
  try {
    let result = {};
    if (action === 'artifacts') {
      result = await perceptionStorage.cleanArtifacts({ olderThanDays, mediaIds });
    } else if (action === 'orphaned') {
      result = await perceptionStorage.cleanOrphaned();
    } else if (action === 'all') {
      const artRes = await perceptionStorage.cleanArtifacts({ olderThanDays, mediaIds });
      const orphRes = await perceptionStorage.cleanOrphaned();
      const totalFreed = (artRes.freedBytes || 0) + (orphRes.freedBytes || 0);
      result = {
        success: true,
        freedBytes: totalFreed,
        freedFormatted: perceptionStorage.formatBytes ? perceptionStorage.formatBytes(totalFreed) : `${(totalFreed / 1024 / 1024).toFixed(1)} MB`,
        deletedFilesCount: artRes.deletedFilesCount || 0,
        deletedDirsCount: orphRes.deletedDirsCount || 0
      };
    } else {
      return res.status(400).json({ error: 'Invalid clean action. Must be artifacts, orphaned, or all' });
    }
    const updatedStats = await perceptionStorage.getStorageStats();
    res.json({ success: true, result, stats: updatedStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/storage/lru
 * Enforce LRU cache limits
 */
router.post('/storage/lru', async (req, res) => {
  const { maxSizeBytes = 5 * 1024 * 1024 * 1024 } = req.body;
  try {
    const result = await perceptionStorage.enforceLru(Number(maxSizeBytes));
    const updatedStats = await perceptionStorage.getStorageStats();
    res.json({ success: true, result, stats: updatedStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/storage/open-folder
 * Open CAS storage folder in native OS file explorer (L1 artifacts, L2 orphaned, or L3 root)
 */
router.post('/storage/open-folder', async (req, res) => {
  const { level = 'root' } = req.body;
  try {
    const root = perceptionStorage.storageRoot;
    await fs.mkdir(root, { recursive: true });

    let targetPath = root;

    if (level === 'l1' || level === 'artifacts') {
      // Find the first mediaId that has an artifacts directory
      try {
        const entries = await fs.readdir(root, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const artDir = path.join(root, entry.name, 'artifacts');
            if (fsSync.existsSync(artDir)) {
              targetPath = artDir;
              break;
            }
          }
        }
      } catch {}
    } else if (level === 'l2' || level === 'orphaned') {
      // Check if there are orphaned folders
      try {
        const stats = await perceptionStorage.getStorageStats();
        if (stats.orphanedMediaIds && stats.orphanedMediaIds.length > 0) {
          const orphDir = path.join(root, stats.orphanedMediaIds[0]);
          if (fsSync.existsSync(orphDir)) {
            targetPath = orphDir;
          }
        }
      } catch {}
    }

    const result = await openFolderInExplorer(targetPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/media/local-engine/status
 * Query local inference engine runner, GPU, models, and running state
 */
router.get('/local-engine/status', async (req, res) => {
  try {
    const status = localEngine.getStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/local-engine/start
 * Start local llama-server engine with selected model preset
 */
router.post('/local-engine/start', async (req, res) => {
  const { modelId = 'qwen3-vl-4b', port } = req.body;
  try {
    const result = await localEngine.start({ modelId, port });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/local-engine/stop
 * Stop local engine and completely release GPU VRAM
 */
router.post('/local-engine/stop', async (req, res) => {
  try {
    const result = await localEngine.stop();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/local-engine/download
 * Start downloading a model preset in background
 */
router.post('/local-engine/download', async (req, res) => {
  const { modelId = 'qwen3-vl-4b', useMirror = true } = req.body;
  try {
    modelDownloader.downloadPreset(modelId, { useMirror }).catch(() => {});
    res.json({
      success: true,
      message: `已启动模型 ${modelId} 下载`,
      status: modelDownloader.getStatus()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/local-engine/cancel-download
 * Cancel ongoing model download
 */
router.post('/local-engine/cancel-download', (req, res) => {
  try {
    const cancelled = modelDownloader.cancel();
    res.json({ success: true, cancelled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/media/local-engine/download-progress
 * Query live download progress
 */
router.get('/local-engine/download-progress', (req, res) => {
  res.json({ success: true, progress: modelDownloader.getStatus() });
});

/**
 * GET /api/media/local-engine/cosyvoice/status
 * 查询 CosyVoice 2 本地模型就绪与下载状态
 */
router.get('/local-engine/cosyvoice/status', (req, res) => {
  try {
    const inspected = inspectCosyVoiceStatus();
    const downloadProgress = cosyVoiceDownloader.getStatus();
    res.json({
      success: true,
      cosyvoice: inspected,
      downloadProgress
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/local-engine/cosyvoice/download
 * 启动 CosyVoice 2 从 ModelScope 的后台极速下载
 */
router.post('/local-engine/cosyvoice/download', async (req, res) => {
  try {
    const task = await cosyVoiceDownloader.startDownload();
    res.json({ success: true, message: '已启动 CosyVoice 2 下载', task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/local-engine/cosyvoice/cancel-download
 * 取消 CosyVoice 2 下载
 */
router.post('/local-engine/cosyvoice/cancel-download', (req, res) => {
  try {
    const cancelled = cosyVoiceDownloader.cancel();
    res.json({ success: true, cancelled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Configure multer storage for custom model uploads
 */
const modelUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!req.uploadCustomId) {
      req.uploadCustomId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    }
    const destDir = path.join(config.paths.modelsDir, 'custom', req.uploadCustomId);
    if (!fsSync.existsSync(destDir)) {
      fsSync.mkdirSync(destDir, { recursive: true });
    }
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safeName);
  }
});

const modelUpload = multer({
  storage: modelUploadStorage,
  limits: {
    fileSize: 50 * 1024 * 1024 * 1024 // up to 50 GB
  }
});

/**
 * GET /api/media/local-engine/library
 * Query full model library (all presets + custom models, install status, enabled status)
 */
router.get('/local-engine/library', (req, res) => {
  try {
    const library = getModelLibrary();
    res.json({
      success: true,
      library,
      modelsDir: getModelsBaseDir()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/local-engine/library/toggle
 * Toggle a model's enabled/disabled state
 */
router.post('/local-engine/library/toggle', (req, res) => {
  const { modelId, enabled } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: 'modelId is required' });
  }

  try {
    const result = toggleModelEnabled(modelId, enabled);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/local-engine/library/import
 * Import a model from a local file path
 */
router.post('/local-engine/library/import', (req, res) => {
  const { name, filePath, mmprojPath, description, copyFile = false } = req.body;
  if (!filePath || !filePath.trim()) {
    return res.status(400).json({ error: '请提供有效的本地模型权重文件路径 (.gguf)' });
  }

  try {
    const result = importLocalModel({
      name: name?.trim(),
      filePath: filePath.trim(),
      mmprojPath: mmprojPath ? mmprojPath.trim() : null,
      description: description?.trim(),
      copyFile: Boolean(copyFile)
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/local-engine/library/upload
 * Upload model file (.gguf) and optional mmproj file
 */
router.post('/local-engine/library/upload',
  modelUpload.fields([
    { name: 'modelFile', maxCount: 1 },
    { name: 'mmprojFile', maxCount: 1 }
  ]),
  (req, res) => {
    try {
      const modelFile = req.files?.modelFile?.[0];
      if (!modelFile) {
        return res.status(400).json({ error: '未接收到模型主权重文件 (.gguf)' });
      }

      const mmprojFile = req.files?.mmprojFile?.[0];
      const modelName = req.body.name?.trim() || path.basename(modelFile.originalname, path.extname(modelFile.originalname));

      const result = addCustomModelToLibrary({
        id: req.uploadCustomId,
        name: modelName,
        modelPath: modelFile.path,
        mmprojPath: mmprojFile?.path || null,
        description: req.body.description?.trim() || '用户网页上传的本地模型',
        vramRequired: '自适应'
      });

      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * DELETE /api/media/local-engine/library/:modelId
 * Delete a model from library or uninstall its weights
 */
router.delete('/local-engine/library/:modelId', async (req, res) => {
  const { modelId } = req.params;
  try {
    // If running, stop engine first
    if (localEngine.activeModelId === modelId && localEngine.isReady()) {
      await localEngine.stop();
    }
    const result = deleteModelFromLibrary(modelId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/local-engine/library/scan
 * Scan data/models/ for newly dropped .gguf files
 */
router.post('/local-engine/library/scan', (req, res) => {
  try {
    const result = scanModelsDirectoryIntoLibrary();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/local-engine/library/open-folder
 * Open local models folder in file explorer
 */
router.post('/local-engine/library/open-folder', async (req, res) => {
  try {
    const targetDir = getModelsBaseDir();
    const result = await openFolderInExplorer(targetDir);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/perceive
 * 确定性感知入口：单文件即时感知与缓存核验
 * 内部逻辑：媒体指纹极速比对，命中则 0ms 瞬间返回，未命中立即高优先级执行并落盘到 CAS 缓存
 */
router.post('/perceive', async (req, res) => {
  const { filePath, priority = 'high', mediaType } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'filePath is required' });
  }

  try {
    const result = await perceptionEngine.ensureAnalyzed(filePath, { priority, mediaType });
    const mediaId = await perceptionEngine.getMediaId(filePath, mediaType);
    res.json({ success: true, mediaId, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/media/analyze
 * Enqueue one or multiple files for background perception
 */
router.post('/analyze', async (req, res) => {
  const { filePaths, priority = 'normal', mediaType } = req.body;
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return res.status(400).json({ error: 'filePaths must be a non-empty array' });
  }

  try {
    const result = await perceptionEngine.enqueueBatch(filePaths, { priority, mediaType });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/media/events
 * Server-Sent Events (SSE) stream for real-time perception state updates
 */
router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Keep-alive heartbeat every 15s
  const heartbeatTimer = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 15000);

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Subscribe to perception queue events
  const onQueued = (data) => sendEvent('media:queued', data);
  const onStarted = (data) => sendEvent('media:started', data);
  const onProgress = (data) => sendEvent('media:progress', data);
  const onCompleted = (data) => sendEvent('media:completed', data);
  const onFailed = (data) => sendEvent('media:failed', data);

  perceptionEngine.events.on('job:queued', onQueued);
  perceptionEngine.events.on('job:started', onStarted);
  perceptionEngine.events.on('job:progress', onProgress);
  perceptionEngine.events.on('job:completed', onCompleted);
  perceptionEngine.events.on('job:failed', onFailed);

  // Subscribe to local engine & download events
  const onEngineStatus = (data) => sendEvent('local-engine:status', data);
  const onDownloadProgress = (data) => sendEvent('local-engine:download-progress', data);
  const onDownloadCompleted = (data) => sendEvent('local-engine:download-completed', data);
  const onDownloadError = (data) => sendEvent('local-engine:download-error', data);

  localEngine.on('status-change', onEngineStatus);
  modelDownloader.on('progress', onDownloadProgress);
  modelDownloader.on('completed', onDownloadCompleted);
  modelDownloader.on('error', onDownloadError);

  req.on('close', () => {
    clearInterval(heartbeatTimer);
    perceptionEngine.events.removeListener('job:queued', onQueued);
    perceptionEngine.events.removeListener('job:started', onStarted);
    perceptionEngine.events.removeListener('job:progress', onProgress);
    perceptionEngine.events.removeListener('job:completed', onCompleted);
    perceptionEngine.events.removeListener('job:failed', onFailed);

    localEngine.removeListener('status-change', onEngineStatus);
    modelDownloader.removeListener('progress', onDownloadProgress);
    modelDownloader.removeListener('completed', onDownloadCompleted);
    modelDownloader.removeListener('error', onDownloadError);
  });
});

export default router;
