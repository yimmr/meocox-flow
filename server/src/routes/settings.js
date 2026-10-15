import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { storage } from '../storage/index.js';
import { config } from '../config.js';
import {
  openFolderInExplorer,
  openFolderBrowserDialog,
  openFileInDefaultApp
} from '../utils/nativeExplorer.js';
import { testConnection, fetchRemoteModels } from '../services/ai.js';

// 保留向后兼容导出（供单元测试用）
export { openFolderBrowserDialog };

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const settings = await storage.getSystemSettings();
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/providers', async (req, res) => {
  try {
    const configData = await storage.getProvidersConfig();
    res.json(configData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export async function getAvailableModelsData() {
  const configData = await storage.getProvidersConfig();
  const providers = configData.providers || [];
  const models = [];
  for (const p of providers) {
    for (const m of (p.models || [])) {
      models.push({
        id: m.id,
        name: m.name || m.id,
        providerId: p.id,
        providerName: p.name,
        providerType: p.type,
        isMultimodal: Boolean(m.isMultimodal)
      });
    }
  }
  return {
    success: true,
    activeProviderId: configData.activeProviderId,
    activeModelId: configData.activeModelId,
    models,
    providers
  };
}

router.get('/models', async (req, res) => {
  try {
    const payload = await getAvailableModelsData();
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/providers', async (req, res) => {
  try {
    await storage.saveProvidersConfig(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/providers/test', async (req, res) => {
  const { baseUrl, apiKey, model, apiMode, type } = req.body || {};
  try {
    const result = await testConnection({ baseUrl, apiKey, model, apiMode, type });
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/providers/detect-models', async (req, res) => {
  const { baseUrl, apiKey } = req.body || {};
  try {
    const models = await fetchRemoteModels({ baseUrl, apiKey });
    res.json({ success: true, models });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { defaultProjectsRoot, customOutputDir, enableMemory } = req.body;
  try {
    const updated = await storage.saveSystemSettings({
      ...(enableMemory !== undefined ? { enableMemory: Boolean(enableMemory) } : {}),
      ...(defaultProjectsRoot !== undefined ? { defaultProjectsRoot: defaultProjectsRoot ? path.resolve(defaultProjectsRoot) : '' } : {}),
      ...(customOutputDir !== undefined ? { customOutputDir: customOutputDir ? path.resolve(customOutputDir) : '' } : {})
    });
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/open-memory', async (req, res) => {
  try {
    const memoryFilePath = config.paths.memoryFile;
    if (!memoryFilePath) {
      return res.status(400).json({ error: '全局记忆文件路径未配置' });
    }
    await fs.mkdir(path.dirname(memoryFilePath), { recursive: true });
    if (!fsSync.existsSync(memoryFilePath)) {
      const template = `# 创作者全局偏好与经验记忆 (User Memory)\n\n## 创作者全局偏好与习惯规约\n- [${new Date().toISOString().split('T')[0]}] 系统初始化全局记忆\n`;
      await fs.writeFile(memoryFilePath, template, 'utf-8');
    }
    const result = await openFileInDefaultApp(memoryFilePath);
    res.json({ success: true, filePath: memoryFilePath, ...result });
  } catch (err) {
    res.status(500).json({ error: `打开记忆文件失败: ${err.message}` });
  }
});

router.post('/pick-folder', async (req, res) => {
  const { title, initialPath } = req.body || {};
  try {
    const result = await openFolderBrowserDialog({ title, initialPath });
    // 真实故障（选择器进程/脚本异常）不能伪装成 cancelled
    if (result?.error) {
      return res.status(500).json({ error: `选择目录失败: ${result.error}` });
    }
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/open-folder', async (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'folderPath is required' });
  try {
    const result = await openFolderInExplorer(folderPath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

