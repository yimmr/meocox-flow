import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { config } from './config.js';
import { storage } from './storage/index.js';
import tasksRouter from './routes/tasks.js';
import assetsRouter from './routes/assets.js';
import projectsRouter from './routes/projects.js';
import settingsRouter, { getAvailableModelsData } from './routes/settings.js';
import skillsRouter from './routes/skills.js';
import proxyRouter from './routes/proxy.js';
import agentsRouter from './routes/agents.js';
import mediaRouter from './routes/media.js';
import runsRouter from './routes/runs.js';
import primitivesRouter from './routes/primitives.js';
import projectionsRouter from './routes/projections.js';
import blackboardRouter from './routes/blackboard.js';
import systemRouter from './routes/system.js';
import librariesRouter from './routes/libraries.js';
import { runManager } from './core/run/runManager.js';
import { defaultAgentSystem } from './runtime/agentLoader.js';
import { defaultMCPHub } from './runtime/mcpHub.js';
import { registerLocalVideoTools } from './runtime/registerLocalTools.js';
import { loadCustomToolsFromDisk } from './runtime/toolLoader.js';

import { getCapabilities, getMockCapabilities } from './engine/index.js';
import { assertSafePathSegment } from './utils/safePath.js';

const app = express();

const trustedOrigins = new Set([
  'tauri://localhost',
  'http://tauri.localhost',
  'https://tauri.localhost',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  `http://localhost:${config.port}`,
  `http://127.0.0.1:${config.port}`,
  process.env.MEOCOX_FRONTEND_ORIGIN
].filter(Boolean));

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && !trustedOrigins.has(origin)) {
    return res.status(403).json({ error: 'Untrusted request origin' });
  }
  next();
});
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || trustedOrigins.has(origin));
  },
  credentials: false,
  maxAge: 600
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Publish thumbnails only; project metadata and run journals stay out of static HTTP paths.
app.use('/data/projects/:projectId/thumbnails', (req, res, next) => {
  let projectId;
  try {
    projectId = assertSafePathSegment(req.params.projectId, 'projectId');
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  express.static(path.join(config.paths.projectsRoot, projectId, 'thumbnails'))(req, res, next);
});
app.use('/outputs', express.static(config.paths.outputDir));
app.use('/output', express.static(config.paths.outputDir)); // 向后兼容旧 URL 路由
app.use('/assets', express.static(config.paths.assetsDir));

// Routes
app.use('/api/system', systemRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/proxy', proxyRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/media', mediaRouter);
app.use('/api/runs', runsRouter);
app.use('/api/runs', primitivesRouter);
app.use('/api/runs', projectionsRouter);
app.use('/api/blackboard', blackboardRouter);
app.use('/api/libraries', librariesRouter);

// Engine capabilities endpoint (Real)
app.get('/api/capabilities', async (req, res) => {
  try {
    const caps = await getCapabilities();
    res.json(caps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mock capabilities endpoint (Data-UI Decoupled Mock Provider)
app.get('/api/mock/capabilities', async (req, res) => {
  try {
    const caps = await getMockCapabilities();
    res.json(caps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint for all available models (ready installed + configured API models): /api/models and /models
app.get(['/api/models', '/models'], async (req, res) => {
  try {
    const payload = await getAvailableModelsData();
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    configuredModel: config.ai.model,
    storage: 'local-file-system',
    dataDir: config.paths.dataDir,
    projectsRoot: config.paths.projectsRoot,
    assetsDir: config.paths.assetsDir,
    outputDir: config.paths.outputDir,
    jianyingInstalled: Boolean(config.paths.jianyingDraftsDir)
  });
});

// Initialize storage and launch server
async function startServer() {
  try {
    await storage.init();
    const recoveredRuns = await runManager.recoverInterruptedRuns();
    if (recoveredRuns.length) {
      console.warn(`[Recovery] 已标记 ${recoveredRuns.length} 个上次未完成的 Run 为中断失败`);
    }

    // Register local video tools into official MCPHub
    registerLocalVideoTools(defaultMCPHub);
    await loadCustomToolsFromDisk(defaultMCPHub);

    // Load agents and skills from disk
    const agentsDir = config.paths.agentsDir;
    const skillsDir = config.paths.skillsDir;
    defaultAgentSystem.agentsDir = agentsDir;
    defaultAgentSystem.skillsDir = skillsDir;
    await defaultAgentSystem.loadFromDisk();

    // MCP 配置合并加载：app 默认清单（只读，随安装包分发）
    //                      + 用户自建清单（%LOCALAPPDATA%，用户优先）
    await defaultMCPHub.loadConfigFile(config.paths.defaultMcpConfig);
    await defaultMCPHub.loadConfigFile(config.paths.mcpUserConfig);

    app.listen(config.port, config.host, () => {
      console.log(`🎬 Meocox Flow Server running on http://${config.host}:${config.port}`);
      console.log(`📂 应用数据目录: ${config.paths.dataDir}`);
      console.log(`🎞️  项目工作区: ${config.paths.projectsRoot}`);
      console.log(`🤖 默认模型: ${config.ai.model}`);
      console.log(`👥 已加载文本智能体: ${defaultAgentSystem.getAllAgents().map(a => a.name).join(', ')}`);
      console.log(`🔧 已注册工具数量: ${defaultMCPHub.getAllTools().length}`);
      if (config.paths.jianyingDraftsDir) {
        console.log(`✂️ 检测到剪映草稿目录: ${config.paths.jianyingDraftsDir}`);
      }
    });
  } catch (err) {
    console.error('❌ 启动服务失败:', err);
    process.exit(1);
  }
}

startServer();
