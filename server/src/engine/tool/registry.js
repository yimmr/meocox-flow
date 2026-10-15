import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createEnvelope, wrapExecution } from './envelope.js';
import { defaultMCPHub } from '../../runtime/mcpHub.js';
import { validateToolPathParams } from '../../utils/safePath.js';

/**
 * 通用工具注册中心 (Tool Registry)
 * 
 * 职责：
 * 1. 扫描并自动装载根目录 tools/ 下的外部工具资产
 * 2. 无缝桥接并代理 MCPHub (包括 Google Flow 等外部 MCP 服务及本地总控工具)
 * 3. 导出符合 Function Calling 标准的 Schemas 供模型调用
 * 4. 拦截并规范执行过程，所有调用传递 context ({ projectId 等 }) 并统一封套为规范 Envelope 返回
 */
export class ToolRegistry {
  constructor({ toolsDir = null, mcpHub = defaultMCPHub } = {}) {
    this.toolsDir = toolsDir;
    this.mcpHub = mcpHub;
    this.tools = new Map();
  }

  setMCPHub(mcpHub) {
    this.mcpHub = mcpHub;
  }

  /**
   * 手动注册一个原子工具
   */
  register({ name, description, inputSchema = null, handler, source = 'manual', isSystem = false }) {
    if (!name || typeof name !== 'string') {
      throw new Error('Tool name is required and must be a string');
    }
    if (typeof handler !== 'function') {
      throw new Error(`Tool handler for "${name}" must be a function`);
    }

    const toolDef = {
      name,
      description: description || `Tool ${name}`,
      inputSchema: inputSchema || {
        type: 'object',
        properties: {},
        additionalProperties: true
      },
      handler,
      source,
      isSystem
    };

    this.tools.set(name, toolDef);
    return toolDef;
  }

  /**
   * 自动扫描指定目录并载入工具
   */
  async loadFromDirectory(dirPath = null) {
    const targetDir = dirPath || this.toolsDir;
    if (!targetDir || !fsSync.existsSync(targetDir)) {
      return [];
    }

    const loaded = [];
    const entries = await fs.readdir(targetDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const toolFolder = path.join(targetDir, entry.name);
      const manifestPath = path.join(toolFolder, 'tool.json');
      const scriptEntry = ['index.js', 'index.mjs']
        .map(f => path.join(toolFolder, f))
        .find(p => fsSync.existsSync(p));

      if (!fsSync.existsSync(manifestPath) || !scriptEntry) {
        continue;
      }

      try {
        const manifestRaw = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestRaw);

        const fileUrl = pathToFileURL(scriptEntry).href;
        const module = await import(`${fileUrl}?t=${Date.now()}`);
        const handler = module.default || module.run || module.execute;

        if (typeof handler !== 'function') {
          console.warn(`[ToolRegistry] 工具 ${entry.name} 未导出默认函数 (run/execute)，跳过`);
          continue;
        }

        const toolName = manifest.name || entry.name;
        this.register({
          name: toolName,
          description: manifest.description || '',
          inputSchema: manifest.inputSchema || null,
          handler,
          source: `fs:${entry.name}`
        });

        loaded.push(toolName);
      } catch (err) {
        console.error(`[ToolRegistry] 加载工具 ${entry.name} 失败:`, err.message);
      }
    }

    return loaded;
  }

  /**
   * 获取工具定义 (优先本地注册，兜底从 MCPHub 动态代理)
   */
  get(name) {
    if (this.tools.has(name)) {
      return this.tools.get(name);
    }

    if (this.mcpHub && typeof this.mcpHub.hasTool === 'function' && this.mcpHub.hasTool(name)) {
      const detailed = typeof this.mcpHub.getDetailedTools === 'function' ? this.mcpHub.getDetailedTools() : [];
      const found = detailed.find(t => t.name === name);
      return {
        name,
        description: found?.description || `MCP Tool: ${name}`,
        inputSchema: found?.parameters || { type: 'object', properties: {} },
        handler: async (params, context = {}) => {
          return await this.mcpHub.executeTool(name, params, context);
        },
        source: found?.source || 'mcp',
        isSystem: false
      };
    }

    return null;
  }

  /**
   * 获取所有已注册工具简要清单 (合并本地工具与 MCPHub 工具)
   */
  list() {
    const localList = Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      source: t.source,
      isSystem: Boolean(t.isSystem)
    }));

    const registeredNames = new Set(localList.map(t => t.name));
    const mcpList = this.mcpHub && typeof this.mcpHub.getAllTools === 'function'
      ? this.mcpHub.getAllTools()
          .filter(t => !registeredNames.has(t.name))
          .map(t => ({
            name: t.name,
            description: t.description,
            source: t.source || 'mcp',
            isSystem: false
          }))
      : [];

    return [...localList, ...mcpList];
  }

  /**
   * 导出供大模型调用的标准工具清单 (Function Calling Spec)
   */
  getSchemas(allowedNames = null, { includeSystem = true } = {}) {
    const schemas = [];
    const emittedNames = new Set();

    // 1. 本地登记工具
    const localList = Array.from(this.tools.values());
    const filteredLocal = allowedNames && !allowedNames.includes('*')
      ? localList.filter(t => allowedNames.includes(t.name) || (includeSystem && t.isSystem))
      : localList;

    for (const t of filteredLocal) {
      emittedNames.add(t.name);
      schemas.push({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema
        }
      });
    }

    // 2. 桥接 MCPHub 工具 (包括 Google Flow 等外部 MCP 服务)
    if (this.mcpHub && typeof this.mcpHub.getToolsSchema === 'function') {
      const mcpSchemas = this.mcpHub.getToolsSchema(allowedNames);
      for (const ms of mcpSchemas) {
        const name = ms.function?.name;
        if (name && !emittedNames.has(name)) {
          emittedNames.add(name);
          schemas.push(ms);
        }
      }
    }

    return schemas;
  }

  /**
   * 执行指定工具，并强制封套为标准 Envelope 返回 (支持传递 context 上下文与 Gate 1 路径围栏校验)
   */
  async execute(name, params = {}, context = {}) {
    const tool = this.get(name);
    if (!tool) {
      return createEnvelope({
        success: false,
        summary: `工具未找到: "${name}"`,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `Tool "${name}" is not registered in ToolRegistry or MCPHub`
        }
      });
    }

    // Gate 1: 静态路径围栏校验 (拦截路径遍历 ".."、空字节注入与越界访问)
    const pathValidation = validateToolPathParams(params, {
      allowedRoots: Array.isArray(context?.allowedRoots) ? context.allowedRoots : []
    });
    if (!pathValidation.valid) {
      return createEnvelope({
        success: false,
        summary: `安全网关拦截: 工具 "${name}" 参数 "${pathValidation.key}" 违反路径围栏规则`,
        error: {
          code: 'PATH_SECURITY_VIOLATION',
          message: pathValidation.reason,
          details: { tool: name, param: pathValidation.key }
        }
      });
    }

    return await wrapExecution(
      async () => await tool.handler(params, context),
      `工具 ${name} 执行完成`
    );
  }
}
