import express from 'express';
import path from 'node:path';
import fsSync from 'node:fs';
import { storage } from '../storage/index.js';
import { openFolderInExplorer } from '../utils/nativeExplorer.js';

const router = express.Router();

/**
 * GET /api/libraries
 * 列出所有全局绑定的资料库根目录
 */
router.get('/', async (req, res) => {
  try {
    const libraries = await storage.getGlobalLibraries();
    res.json({ success: true, libraries, count: libraries.length });
  } catch (err) {
    res.status(500).json({ error: `获取全局资料库失败: ${err.message}` });
  }
});

/**
 * POST /api/libraries
 * 绑定新的全局资料库根目录
 */
router.post('/', async (req, res) => {
  try {
    const { name, path: dirPath } = req.body || {};
    if (!dirPath || typeof dirPath !== 'string' || !dirPath.trim()) {
      return res.status(400).json({ error: '资料库路径不能为空' });
    }
    const result = await storage.addGlobalLibrary({ name, path: dirPath.trim() });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/libraries/:id
 * 解除绑定全局资料库（仅解除系统索引，绝不删除本地磁盘文件）
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await storage.removeGlobalLibrary(id);
    if (!result.success) {
      return res.status(404).json({ error: `未找到资料库「${id}」` });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/libraries/:id
 * 修改资料库别名
 */
router.patch('/:id', async (req, res) => {
  try {
    const updated = await storage.updateGlobalLibrary(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: '未找到对应资料库' });
    res.json({ success: true, library: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/libraries/sync
 * 将项目挂载的资料库同步至全局资料库
 */
router.post('/sync', async (req, res) => {
  try {
    const { libraries, name, path: singlePath } = req.body || {};
    const toSync = Array.isArray(libraries)
      ? libraries
      : (singlePath ? [{ name, path: singlePath }] : []);

    const results = [];
    for (const item of toSync) {
      if (item && item.path) {
        try {
          const resAdd = await storage.addGlobalLibrary({ name: item.name, path: item.path });
          results.push(resAdd.library);
        } catch (_) {}
      }
    }
    const all = await storage.getGlobalLibraries();
    res.json({ success: true, syncedCount: results.length, libraries: all });
  } catch (err) {
    res.status(500).json({ error: `同步至全局资料库失败: ${err.message}` });
  }
});

/**
 * POST /api/libraries/open-folder
 * 在系统文件资源管理器中打开指定资料库目录
 */
router.post('/open-folder', async (req, res) => {
  try {
    const { path: dirPath, id } = req.body || {};
    let target = dirPath;
    if (!target && id) {
      const libs = await storage.getGlobalLibraries();
      const found = libs.find(l => l.id === id);
      target = found?.path;
    }
    if (!target) return res.status(400).json({ error: '目录路径不能为空' });
    const result = await openFolderInExplorer(target);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
