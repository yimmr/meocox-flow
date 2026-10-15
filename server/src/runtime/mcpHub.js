import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { config } from '../config.js';

/**
 * 展开 MCP 配置里的占位符，使清单与代码仓库位置解耦。
 * 支持：${APP_ROOT} ${DATA_DIR} ${PROJECTS_ROOT} ${ASSETS_DIR} ${OUTPUT_DIR}
 */
function expandPlaceholders(value) {
  if (typeof value !== 'string') return value;
  const map = {
    APP_ROOT: config.paths.appRoot,
    DATA_DIR: config.paths.dataDir,
    PROJECTS_ROOT: config.paths.projectsRoot,
    ASSETS_DIR: config.paths.assetsDir,
    OUTPUT_DIR: config.paths.outputDir
  };
  return value.replace(/\$\{(\w+)\}/g, (m, key) => (map[key] !== undefined ? map[key] : m));
}

export class MCPHub {
  constructor({ configPath = null } = {}) {
    this.configPath = configPath;
    this.clients = new Map();
    this.localTools = new Map();
    this.mcpTools = new Map(); // toolName -> { serverId, originalName, schema }
  }

  registerLocalTool({ name, description, parameters = { type: 'object', properties: {} }, handler, custom = false, filePath = null }) {
    if (!name) throw new Error('name is required');
    const defaultHandler = handler || (async (args) => ({ success: true, message: `自定义工具「${name}」已执行`, args }));
    this.localTools.set(name, {
      name,
      description: description || '',
      parameters,
      handler: defaultHandler,
      custom: Boolean(custom),
      filePath
    });
  }

  removeLocalTool(name) {
    return this.localTools.delete(name);
  }

  hasTool(name) {
    return this.localTools.has(name) || this.mcpTools.has(name);
  }

  getLoadedServers() {
    return Array.from(this.clients.keys());
  }

  getAllTools() {
    const local = Array.from(this.localTools.values()).map(t => ({
      name: t.name,
      description: t.description,
      source: 'local',
      custom: Boolean(t.custom),
      filePath: t.filePath || null
    }));
    const mcp = Array.from(this.mcpTools.entries()).map(([k, v]) => ({
      name: k,
      description: v.schema.description,
      source: `mcp:${v.serverId}`
    }));
    return [...local, ...mcp];
  }

  getDetailedTools() {
    const local = Array.from(this.localTools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters || { type: 'object', properties: {} },
      source: 'local',
      custom: Boolean(t.custom),
      filePath: t.filePath || null
    }));
    const mcp = Array.from(this.mcpTools.entries()).map(([k, v]) => ({
      name: k,
      description: v.schema.description || `MCP Tool from ${v.serverId}`,
      parameters: v.schema.inputSchema || { type: 'object', properties: {} },
      source: `mcp:${v.serverId}`,
      serverId: v.serverId,
      originalName: v.originalName
    }));
    return [...local, ...mcp];
  }


  getToolsSchema(allowedNames = null) {
    const schemas = [];

    // Local tools
    for (const [name, tool] of this.localTools.entries()) {
      if (allowedNames && !allowedNames.includes('*') && !allowedNames.includes(name)) continue;
      schemas.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      });
    }

    // MCP tools
    for (const [name, meta] of this.mcpTools.entries()) {
      if (allowedNames && !allowedNames.includes('*') && !allowedNames.includes(name)) continue;
      schemas.push({
        type: 'function',
        function: {
          name: name,
          description: meta.schema.description || `MCP Tool from ${meta.serverId}`,
          parameters: meta.schema.inputSchema || { type: 'object', properties: {} }
        }
      });
    }

    return schemas;
  }

  async callTool(name, args = {}, context = {}) {
    // 1. Local Tool
    if (this.localTools.has(name)) {
      const tool = this.localTools.get(name);
      return await tool.handler(args, context);
    }

    // 2. MCP Tool
    if (this.mcpTools.has(name)) {
      const meta = this.mcpTools.get(name);
      const client = this.clients.get(meta.serverId);
      if (!client) throw new Error(`MCP Server ${meta.serverId} is disconnected`);
      const res = await client.callTool({
        name: meta.originalName,
        arguments: args
      });
      return res;
    }

    throw new Error(`Tool "${name}" not found`);
  }

  async executeTool(name, args = {}, context = {}) {
    return await this.callTool(name, args, context);
  }

  async connectMCPServer(serverId, { command, args = [], env = {} } = {}) {
    try {
      if (this.clients.has(serverId)) {
        await this.disconnectMCPServer(serverId);
      }
      const resolvedCommand = expandPlaceholders(command);
      const resolvedEnv = Object.fromEntries(
        Object.entries(env || {}).map(([k, v]) => [k, expandPlaceholders(v)])
      );
      const resolvedArgs = args.map(rawArg => {
        const arg = expandPlaceholders(rawArg);
        if (typeof arg === 'string' && (arg.endsWith('.js') || arg.endsWith('.mjs'))) {
          if (!path.isAbsolute(arg)) {
            // 优先相对 app 根解析，不再依赖 process.cwd()
            const fromRoot = path.resolve(config.paths.appRoot, arg);
            if (fsSync.existsSync(fromRoot)) return fromRoot;
          }
        }
        return arg;
      });

      const transport = new StdioClientTransport({
        command: resolvedCommand,
        args: resolvedArgs,
        env: { ...process.env, ...resolvedEnv }
      });

      const client = new Client({
        name: 'MeocoxFlow-Hub',
        version: '1.0.0'
      }, {
        capabilities: { tools: {} }
      });

      await client.connect(transport);
      this.clients.set(serverId, client);

      const { tools } = await client.listTools();
      for (const t of tools) {
        const unifiedName = `${serverId}__${t.name}`;
        this.mcpTools.set(unifiedName, {
          serverId,
          originalName: t.name,
          schema: t
        });
      }

      console.log(`🔌 [MCP] Server "${serverId}" connected with ${tools.length} tools.`);
    } catch (e) {
      console.warn(`⚠️ [MCP] Failed to connect "${serverId}":`, e.message);
    }
  }

  async loadConfigFile(configPath = this.configPath) {
    if (!configPath) return;
    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      const conf = JSON.parse(raw);
      for (const [serverId, serverDef] of Object.entries(conf.mcpServers || {})) {
        if (serverDef.disabled) continue;
        await this.connectMCPServer(serverId, serverDef);
      }
    } catch (e) {
      // Configuration file is optional
    }
  }

  async disconnectMCPServer(serverId) {
    const client = this.clients.get(serverId);
    if (client) {
      try {
        await client.close();
      } catch (e) {
        console.warn(`Failed to close client for ${serverId}:`, e.message);
      }
      this.clients.delete(serverId);
    }
    // Remove all tools belonging to this serverId
    for (const [toolName, meta] of this.mcpTools.entries()) {
      if (meta.serverId === serverId) {
        this.mcpTools.delete(toolName);
      }
    }
    console.log(`🔌 [MCP] Server "${serverId}" disconnected and tools removed.`);
  }

  async disconnectAll() {
    for (const client of this.clients.values()) {
      try { await client.close(); } catch (e) {}
    }
    this.clients.clear();
    this.mcpTools.clear();
  }
}

export const defaultMCPHub = new MCPHub();
