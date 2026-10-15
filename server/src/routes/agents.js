import express from 'express';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { defaultAgentSystem } from '../runtime/agentLoader.js';
import { reloadDefinitions } from '../engine/index.js';
import { defaultMCPHub } from '../runtime/mcpHub.js';
import { loadCustomToolsFromDisk } from '../runtime/toolLoader.js';
import { openFolderInExplorer, openFileInDefaultApp } from '../utils/nativeExplorer.js';

const router = express.Router();

/** 读取「用户自建 MCP 配置」(%LOCALAPPDATA%)，不存在则返回空骨架 */
async function readUserMcpConfig() {
  const conf = { mcpServers: {} };
  try {
    const raw = await fs.readFile(config.paths.mcpUserConfig, 'utf-8');
    const parsed = JSON.parse(raw);
    conf.mcpServers = parsed.mcpServers || {};
  } catch {}
  return conf;
}

/** 读取「app 默认 MCP 清单」（只读），用于在设置页展示内置项 */
async function readDefaultMcpConfig() {
  try {
    const raw = await fs.readFile(config.paths.defaultMcpConfig, 'utf-8');
    return JSON.parse(raw).mcpServers || {};
  } catch {
    return {};
  }
}

async function writeUserMcpConfig(conf) {
  await fs.mkdir(path.dirname(config.paths.mcpUserConfig), { recursive: true });
  await fs.writeFile(config.paths.mcpUserConfig, JSON.stringify(conf, null, 2), 'utf-8');
}

/**
 * GET /api/agents
 * List all loaded text-defined agents and their bound skills/tools
 */
router.get('/', async (req, res) => {
  try {
    // 每次查询热重载磁盘上的全部智能体与技能，保证任何新创建的 agent 无需重启后端即可立即感知
    await defaultAgentSystem.loadFromDisk();

    const agents = defaultAgentSystem.getAllAgents();
    const skills = defaultAgentSystem.getAllSkills();
    const tools = defaultMCPHub.getAllTools();

    res.json({
      success: true,
      agents,
      skills,
      toolsCount: tools.length
    });
  } catch (err) {
    res.status(500).json({ error: `获取智能体列表失败: ${err.message}` });
  }
});

/**
 * GET /api/agents/tools
 * List all loaded tools grouped by MCP server
 */
router.get('/tools', async (req, res) => {
  try {
    // 动态重载磁盘上的自定义工具
    await loadCustomToolsFromDisk(defaultMCPHub);

    const tools = defaultMCPHub.getDetailedTools();
    const loadedServers = defaultMCPHub.getLoadedServers();

    // 合并「app 默认清单」与「用户自建清单」，用户项优先
    const configServers = { ...(await readDefaultMcpConfig()), ...(await readUserMcpConfig()).mcpServers };

    const localTools = tools.filter(t => t.source === 'local');
    const mcpGroups = [];

    // 1. Local Built-in and Custom tools
    mcpGroups.push({
      id: 'builtin',
      name: '剪辑原生内置工具 (Built-in)',
      type: 'builtin',
      status: 'active',
      enabled: true,
      canToggle: false,
      command: 'internal',
      toolsCount: localTools.length,
      tools: localTools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        custom: Boolean(t.custom),
        filePath: t.filePath || null
      }))
    });

    // 2. Configured MCP servers
    for (const [serverId, srv] of Object.entries(configServers)) {
      if (srv.deleted) continue;
      const serverTools = tools.filter(t => t.source === `mcp:${serverId}`);
      const isLoaded = loadedServers.includes(serverId);
      mcpGroups.push({
        id: serverId,
        name: serverId,
        type: 'external',
        enabled: !srv.disabled,
        canToggle: true,
        status: srv.disabled ? 'disabled' : (isLoaded ? 'connected' : 'error'),
        command: srv.command,
        args: srv.args || [],
        toolsCount: serverTools.length,
        tools: serverTools.map(t => ({
          name: t.originalName || t.name.replace(`${serverId}__`, ''),
          fullName: t.name,
          description: t.description,
          parameters: t.parameters
        }))
      });
    }

    res.json({
      success: true,
      mcpGroups,
      servers: loadedServers,
      tools,
      toolsCount: tools.length
    });
  } catch (err) {
    res.status(500).json({ error: `获取MCP工具列表失败: ${err.message}` });
  }
});

/**
 * GET /api/agents/skills/:id
 * Get specific skill details including SKILL.md content and handler.ts code
 */
router.get('/skills/:id', async (req, res) => {
  try {
    const skill = defaultAgentSystem.getSkill(req.params.id);
    if (!skill) {
      return res.status(404).json({ error: `未找到技能「${req.params.id}」` });
    }

    let markdown = '';
    if (skill.filePath && fsSync.existsSync(skill.filePath)) {
      markdown = await fs.readFile(skill.filePath, 'utf-8');
    }

    let handlerCode = '';
    if (skill.handlerPath && fsSync.existsSync(skill.handlerPath)) {
      handlerCode = await fs.readFile(skill.handlerPath, 'utf-8');
    }

    res.json({
      success: true,
      skill: {
        ...skill,
        markdown,
        handlerCode
      }
    });
  } catch (err) {
    res.status(500).json({ error: `读取技能失败: ${err.message}` });
  }
});

/**
 * PUT /api/agents/skills/:id
 * Update specific custom skill
 */
router.put('/skills/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { name, category, description, markdown, rules, handlerCode } = req.body;
    const updated = await defaultAgentSystem.createCustomSkill({
      id,
      name,
      category,
      description,
      markdown,
      rules,
      handlerCode
    });
    await reloadDefinitions();
    res.json({ success: true, skill: updated });
  } catch (err) {
    res.status(500).json({ error: `更新技能失败: ${err.message}` });
  }
});

/**
 * GET /api/agents/:id
 * Get specific agent detail and compiled system prompt
 */
router.get('/:id', async (req, res) => {
  try {
    const agent = defaultAgentSystem.getAgent(req.params.id);
    if (!agent) {
      return res.status(404).json({ error: `未找到智能体「${req.params.id}」` });
    }
    const tools = defaultMCPHub.getToolsSchema(agent.tools);
    res.json({
      success: true,
      agent,
      tools
    });
  } catch (err) {
    res.status(500).json({ error: `读取智能体失败: ${err.message}` });
  }
});

/**
 * POST /api/agents/custom
 * Create or update agent on disk
 */
router.post('/custom', async (req, res) => {
  try {
    const { id, name, title, model, skills, tools, persona } = req.body;
    const created = await defaultAgentSystem.createCustomAgent({
      id,
      name,
      title,
      model,
      skills,
      tools,
      persona
    });
    await reloadDefinitions();
    res.json({ success: true, agent: created });
  } catch (err) {
    res.status(500).json({ error: `保存智能体失败: ${err.message}` });
  }
});

/**
 * PUT /api/agents/:id
 * Update specific agent configuration
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, title, model, skills, tools, persona } = req.body;
    const id = req.params.id;
    const updated = await defaultAgentSystem.createCustomAgent({
      id,
      name,
      title,
      model,
      skills,
      tools,
      persona
    });
    await reloadDefinitions();
    res.json({ success: true, agent: updated });
  } catch (err) {
    res.status(500).json({ error: `更新智能体失败: ${err.message}` });
  }
});

/**
 * DELETE /api/agents/skills/:id
 * Delete a custom skill
 */
router.delete('/skills/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await defaultAgentSystem.deleteSkill(id);
    await reloadDefinitions();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `删除技能失败: ${err.message}` });
  }
});

/**
 * POST /api/agents/tools/custom
 * Create or initialize a custom tool in %LOCALAPPDATA%/MeocoxFlow/tools
 */
router.post('/tools/custom', async (req, res) => {
  try {
    const { name, description = '', parameters } = req.body || {};
    const toolName = (name && name.trim()) ? name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') : 'custom_asset_cleaner';
    const targetDir = config.paths.userToolsDir || path.join(config.paths.dataDir, 'tools');
    await fs.mkdir(targetDir, { recursive: true });

    // 专属目录结构：tools/[toolName]/tool.json + index.js
    const toolFolder = path.join(targetDir, toolName);
    await fs.mkdir(toolFolder, { recursive: true });

    const targetJsonPath = path.join(toolFolder, 'tool.json');
    const targetJsPath = path.join(toolFolder, 'index.js');

    const toolData = {
      name: toolName,
      description: description.trim() || '自定义素材清洗工具（示例）：用于去除素材画面指定区域的噪点或水印',
      parameters: parameters && Object.keys(parameters).length > 0 ? parameters : {
        type: 'object',
        properties: {
          assetId: {
            type: 'string',
            description: '待处理的素材ID或本地绝对路径'
          },
          cleanMode: {
            type: 'string',
            description: '清洗模式，可选 fast (极速) 或 deep (高精画质)'
          },
          region: {
            type: 'string',
            description: '处理区域坐标，例如 top-right 或 x,y,w,h'
          }
        },
        required: ['assetId']
      }
    };

    const jsCode = `/**
 * 自定义工具执行入口 (index.js)
 * @param {Object} params - 大模型根据 tool.json 生成并校验后的入参
 * @param {Object} context - 运行时上下文 (包含日志、项目环境等)
 * @returns {Promise<Object>} 执行结果，将作为 observation 反馈给大模型
 */
export default async function run(params = {}, context = {}) {
  const { assetId, cleanMode = 'fast', region = 'top-right' } = params;

  // 1. 在此编写真实的业务代码（如调用 FFmpeg、读写文件或网络请求）
  console.log('[${toolName}] 执行处理:', { assetId, cleanMode, region });

  // 2. 返回执行结果
  return {
    success: true,
    message: \`素材 \${assetId || '未指定'} 已按 \${cleanMode} 模式在 \${region} 区域完成清洗处理\`,
    processedAt: new Date().toISOString()
  };
}
`;

    await fs.writeFile(targetJsonPath, JSON.stringify(toolData, null, 2), 'utf-8');
    if (!fsSync.existsSync(targetJsPath)) {
      await fs.writeFile(targetJsPath, jsCode, 'utf-8');
    }

    await loadCustomToolsFromDisk(defaultMCPHub);

    res.json({ success: true, tool: toolData, filePath: targetJsonPath, folderPath: toolFolder });
  } catch (err) {
    res.status(500).json({ error: `创建自定义工具失败: ${err.message}` });
  }
});

/**
 * DELETE /api/agents/tools/:name
 * Delete a custom tool
 */
router.delete('/tools/:name', async (req, res) => {
  try {
    const name = req.params.name;
    const tool = defaultMCPHub.localTools.get(name);
    if (!tool) {
      return res.status(404).json({ error: `未找到工具「${name}」` });
    }
    if (!tool.custom) {
      return res.status(400).json({ error: '系统内置工具不允许删除' });
    }
    if (tool.filePath && fsSync.existsSync(tool.filePath)) {
      const parentDir = path.dirname(tool.filePath);
      if (path.basename(parentDir) === name) {
        await fs.rm(parentDir, { recursive: true, force: true });
      } else {
        await fs.rm(tool.filePath, { force: true });
      }
    }
    defaultMCPHub.removeLocalTool(name);
    res.json({ success: true, message: `自定义工具「${name}」已删除` });
  } catch (err) {
    res.status(500).json({ error: `删除工具失败: ${err.message}` });
  }
});

/**
 * DELETE /api/agents/:id
 * Delete a custom agent
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await defaultAgentSystem.deleteAgent(id);
    await reloadDefinitions();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `删除智能体失败: ${err.message}` });
  }
});

/**
 * POST /api/agents/skills/custom
 * Create a new custom skill on disk (flat or category-based)
 */
router.post('/skills/custom', async (req, res) => {
  try {
    const { id, name, category, description, markdown, rules, handlerCode } = req.body;
    const created = await defaultAgentSystem.createCustomSkill({
      id,
      name,
      category,
      description,
      markdown,
      rules,
      handlerCode
    });
    await reloadDefinitions();
    res.json({ success: true, skill: created });
  } catch (err) {
    res.status(500).json({ error: `创建自定义技能失败: ${err.message}` });
  }
});

/**
 * POST /api/agents/mcp/custom
 * Add or update an external MCP server in the user config (%LOCALAPPDATA%)
 */
router.post('/mcp/custom', async (req, res) => {
  try {
    const { serverId, command, args = [], env = {}, disabled = false } = req.body;
    if (!serverId || !command) {
      return res.status(400).json({ error: 'serverId and command are required' });
    }
    const conf = await readUserMcpConfig();
    conf.mcpServers[serverId] = { command, args, env, disabled };
    await writeUserMcpConfig(conf);

    if (!disabled) {
      await defaultMCPHub.connectMCPServer(serverId, { command, args, env });
    }
    res.json({ success: true, serverId, server: conf.mcpServers[serverId] });
  } catch (err) {
    res.status(500).json({ error: `保存自定义MCP失败: ${err.message}` });
  }
});

/**
 * POST /api/agents/mcp/toggle
 * Dynamically enable or disable an MCP server
 */
router.post('/mcp/toggle', async (req, res) => {
  try {
    const { serverId, enabled } = req.body;
    if (!serverId) {
      return res.status(400).json({ error: 'serverId is required' });
    }

    const conf = await readUserMcpConfig();
    const defaults = await readDefaultMcpConfig();

    // 内置服务定义在只读清单里，此处补全以便 toggle；disabled 状态写入用户配置形成 override
    const serverDef = conf.mcpServers[serverId] || defaults[serverId];
    if (!serverDef) {
      return res.status(404).json({ error: `未找到 MCP 服务「${serverId}」` });
    }

    const currentDisabled = conf.mcpServers[serverId] ? conf.mcpServers[serverId].disabled : Boolean(defaults[serverId].disabled);
    const targetEnabled = enabled !== undefined ? Boolean(enabled) : currentDisabled;

    conf.mcpServers[serverId] = { ...serverDef, disabled: !targetEnabled };
    await writeUserMcpConfig(conf);

    if (targetEnabled) {
      await defaultMCPHub.connectMCPServer(serverId, conf.mcpServers[serverId]);
    } else {
      await defaultMCPHub.disconnectMCPServer(serverId);
    }

    res.json({
      success: true,
      serverId,
      enabled: targetEnabled,
      server: conf.mcpServers[serverId],
      toolsCount: defaultMCPHub.getAllTools().length
    });
  } catch (err) {
    res.status(500).json({ error: `切换 MCP 状态失败: ${err.message}` });
  }
});

/**
 * DELETE /api/agents/mcp/:serverId
 * Remove an external MCP server from user configuration and disconnect it
 */
router.delete('/mcp/:serverId', async (req, res) => {
  try {
    const { serverId } = req.params;
    if (!serverId) {
      return res.status(400).json({ error: 'serverId is required' });
    }

    const conf = await readUserMcpConfig();
    const defaults = await readDefaultMcpConfig();

    try {
      await defaultMCPHub.disconnectMCPServer(serverId);
    } catch (e) {
      console.warn(`[mcpHub] 断开 ${serverId} 失败:`, e.message);
    }

    if (defaults[serverId]) {
      conf.mcpServers[serverId] = { ...defaults[serverId], disabled: true, deleted: true };
    } else {
      delete conf.mcpServers[serverId];
    }
    await writeUserMcpConfig(conf);

    res.json({ success: true, serverId });
  } catch (err) {
    res.status(500).json({ error: `删除 MCP 服务失败: ${err.message}` });
  }
});

/**
 * POST /api/agents/open-file
 * Open specific file on local machine with system default app
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
 * POST /api/agents/open-folder
 * Open local agents/skills/mcp folder in native OS file explorer
 */
router.post('/open-folder', async (req, res) => {
  try {
    const { type = 'agents', id = '' } = req.body || {};
    const map = {
      agents: config.paths.agentsDir,
      skills: config.paths.skillsDir,
      tools: config.paths.userToolsDir || path.join(config.paths.dataDir, 'tools'),
      mcp: config.paths.dataDir,
      config: config.paths.configDir,
      projects: config.paths.projectsRoot,
      models: config.paths.modelsDir,
      storage: config.paths.storageDir,
      cache: config.paths.cacheDir,
      output: config.paths.outputDir,
      logs: config.paths.logsDir
    };
    let target = map[type] || config.paths.agentsDir;

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

    await fs.mkdir(target, { recursive: true });
    const result = await openFolderInExplorer(target);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `打开目录失败: ${err.message}` });
  }
});

export default router;
