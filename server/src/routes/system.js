import express from 'express';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { defaultAgentSystem } from '../runtime/agentLoader.js';
import { defaultMCPHub } from '../runtime/mcpHub.js';
import {
  openFolderInExplorer,
  openProjectFolderInExplorer,
  openFileInDefaultApp,
  openFolderBrowserDialog
} from '../utils/nativeExplorer.js';

const router = express.Router();

/**
 * POST /api/system/open-folder
 * 统一在系统文件资源管理器中打开指定目录（支持直接路径、项目ID或系统目录分类）
 */
router.post('/open-folder', async (req, res) => {
  try {
    const { folderPath, path: p, projectId, type, id } = req.body || {};
    let target = folderPath || p;

    if (projectId && !type && !target) {
      const result = await openProjectFolderInExplorer(projectId);
      return res.json(result);
    }

    if (type) {
      const map = {
        agents: config.paths.agentsDir,
        skills: config.paths.skillsDir,
        tools: config.paths.userToolsDir || path.join(config.paths.dataDir, 'tools'),
        mcp: config.paths.configDir,
        config: config.paths.configDir,
        projects: config.paths.projectsRoot,
        models: config.paths.modelsDir,
        storage: config.paths.storageDir,
        cache: config.paths.cacheDir,
        output: config.paths.outputDir,
        logs: config.paths.logsDir
      };
      target = map[type] || config.paths.agentsDir;

      if (id && type === 'agents') {
        const agent = defaultAgentSystem?.getAgent?.(id);
        if (agent?.filePath) {
          target = path.dirname(agent.filePath);
        } else {
          target = path.join(target, id);
        }
      } else if (id && type === 'skills') {
        const skill = defaultAgentSystem?.getSkill?.(id);
        if (skill?.filePath) {
          target = path.dirname(skill.filePath);
        } else {
          target = path.join(target, id);
        }
      } else if (type === 'tools') {
        const isBuiltin = req.body?.builtin || req.body?.isBuiltin;
        const tool = id ? defaultMCPHub?.localTools?.get(id) : null;
        if (tool?.filePath) {
          target = path.dirname(tool.filePath);
        } else if (isBuiltin || (tool && !tool.custom)) {
          target = config.paths.toolsDir || path.join(config.paths.appRoot, 'tools');
          if (id && fsSync.existsSync(path.join(target, id))) {
            target = path.join(target, id);
          }
        }
      }
    }

    if (!target) {
      return res.status(400).json({ error: 'folderPath, projectId, or type is required' });
    }

    await fs.mkdir(target, { recursive: true });
    const result = await openFolderInExplorer(target);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `打开文件夹失败: ${err.message}` });
  }
});

/**
 * POST /api/system/open-file
 * 统一使用操作系统默认应用打开本地文件
 */
router.post('/open-file', async (req, res) => {
  try {
    const { filePath, relativePath } = req.body || {};
    const result = await openFileInDefaultApp(filePath, relativePath);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `打开文件失败: ${err.message}` });
  }
});

/**
 * POST /api/system/pick-folder
 * 统一唤起系统原生目录选择器
 */
router.post('/pick-folder', async (req, res) => {
  const { title, initialPath } = req.body || {};
  try {
    const result = await openFolderBrowserDialog({ title, initialPath });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: `选择目录失败: ${err.message}` });
  }
});

/**
 * GET /api/system/mock-config
 * 获取开发期 Mock 配置文件开关
 */
router.get('/mock-config', async (req, res) => {
  const mockConfigFile = path.join(config.paths?.appRoot || process.cwd(), 'mock', 'config.json');
  if (fsSync.existsSync(mockConfigFile)) {
    try {
      const data = JSON.parse(await fs.readFile(mockConfigFile, 'utf-8'));
      return res.json({ success: true, config: data });
    } catch (e) {}
  }
  res.json({ success: true, config: { enabled: false } });
});

/**
 * POST /api/system/mock-config
 * 切换与持久化开发期 Mock 配置文件状态
 */
router.post('/mock-config', async (req, res) => {
  const mockConfigFile = path.join(config.paths?.appRoot || process.cwd(), 'mock', 'config.json');
  try {
    let current = {};
    if (fsSync.existsSync(mockConfigFile)) {
      try {
        current = JSON.parse(await fs.readFile(mockConfigFile, 'utf-8'));
      } catch (e) {}
    }
    const updated = {
      ...current,
      ...req.body
    };
    await fs.mkdir(path.dirname(mockConfigFile), { recursive: true });
    await fs.writeFile(mockConfigFile, JSON.stringify(updated, null, 2), 'utf-8');
    res.json({ success: true, config: updated });
  } catch (err) {
    res.status(500).json({ error: `保存 Mock 配置文件失败: ${err.message}` });
  }
});

export default router;
