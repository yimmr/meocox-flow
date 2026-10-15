import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

/**
 * 通用可插拔 Mock 拦截器
 * 
 * 职责：
 * 1. 监听根目录 mock/config.json 开关，开发测试阶段无感拦截
 * 2. 拦截模型调用，从 mock/models/ 提取虚拟回复，0 Token 消耗
 * 3. 拦截工具与 MCP 调用，从 mock/tools/ 提取虚拟出参，避免对宿主产生副作用
 */
export class MockInterceptor {
  constructor({ mockDir }) {
    this.mockDir = mockDir;
    this.configFile = path.join(mockDir, 'config.json');
    this.modelsDir = path.join(mockDir, 'models');
    this.toolsDir = path.join(mockDir, 'tools');
    this.memoryOverride = null;
  }

  setOverride(config) {
    this.memoryOverride = config;
  }

  clearOverride() {
    this.memoryOverride = null;
  }

  loadConfig() {
    if (this.memoryOverride) {
      return this.memoryOverride;
    }
    if (!fsSync.existsSync(this.configFile)) {
      return { enabled: false };
    }
    try {
      const raw = fsSync.readFileSync(this.configFile, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return { enabled: false };
    }
  }

  /**
   * 判断是否应该拦截指定模型
   */
  shouldMockModel(modelId) {
    const cfg = this.loadConfig();
    if (!cfg.enabled) return false;
    if (cfg.mockModels === true || (this.memoryOverride && cfg.mockModels === undefined)) return true;
    if (Array.isArray(cfg.mockModels) && cfg.mockModels.includes(modelId)) return true;
    return false;
  }

  /**
   * 获取指定模型的 Mock 虚拟响应
   */
  async getMockModelResponse(modelId, messages = []) {
    const cfg = this.loadConfig();
    if (cfg.defaultText) {
      return {
        text: cfg.defaultText,
        reasoning: cfg.defaultReasoning || '',
        toolCalls: Array.isArray(cfg.defaultToolCalls) ? cfg.defaultToolCalls : [],
        isMock: true
      };
    }

    let targetFile = path.join(this.modelsDir, `${modelId.replace(/[/\\:]/g, '_')}.json`);
    if (!fsSync.existsSync(targetFile)) {
      targetFile = path.join(this.modelsDir, 'default.json');
    }

    if (cfg.logInterception) {
      console.log(`\x1b[33m[MOCK 拦截] ⚡ 命中模型 Mock 数据: ${path.basename(targetFile)} (0 Token 消耗)\x1b[0m`);
    }

    if (fsSync.existsSync(targetFile)) {
      const raw = await fs.readFile(targetFile, 'utf-8');
      const data = JSON.parse(raw);
      return {
        text: data.text || '【Mock 响应】这是一条由本地 Mock 拦截器返回的虚拟应答。',
        toolCalls: Array.isArray(data.toolCalls) ? data.toolCalls : [],
        isMock: true
      };
    }

    return {
      text: `【Mock 默认应答】收到对模型 "${modelId}" 的调用，Mock 已生效。`,
      toolCalls: [],
      isMock: true
    };
  }

  /**
   * 判断是否应该拦截指定工具
   */
  shouldMockTool(toolName) {
    const cfg = this.loadConfig();
    if (!cfg.enabled) return false;
    if (cfg.mockTools === true) return true;
    if (Array.isArray(cfg.mockTools) && cfg.mockTools.includes(toolName)) return true;
    return false;
  }

  /**
   * 获取指定工具的 Mock 虚拟返回数据
   */
  async getMockToolResponse(toolName, params = {}) {
    const cfg = this.loadConfig();
    const targetFile = path.join(this.toolsDir, `${toolName}.json`);

    if (cfg.logInterception) {
      console.log(`\x1b[36m[MOCK 拦截] ⚡ 命中工具 Mock 数据: ${path.basename(targetFile)} (未触发真实脚本)\x1b[0m`);
    }

    if (fsSync.existsSync(targetFile)) {
      const raw = await fs.readFile(targetFile, 'utf-8');
      return JSON.parse(raw);
    }

    return {
      isMock: true,
      mockTool: toolName,
      receivedParams: params,
      message: `【Mock 工具】工具 ${toolName} 模拟执行成功`
    };
  }

  /**
   * 获取 Mock 专属能力清单 (包含 Mock 智能体与演练起手指令)
   */
  async getMockCapabilities() {
    const capsFile = path.join(this.mockDir, 'capabilities.json');
    if (fsSync.existsSync(capsFile)) {
      try {
        const raw = await fs.readFile(capsFile, 'utf-8');
        const data = JSON.parse(raw);
        return {
          ...data,
          isMock: true
        };
      } catch (err) {
        console.error('[MockInterceptor] 解析 capabilities.json 失败:', err);
      }
    }

    return {
      agents: [],
      suggestedPrompts: [],
      tools: [],
      isMock: true
    };
  }
}

