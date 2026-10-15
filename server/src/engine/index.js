import path from 'node:path';
import fsSync from 'node:fs';
import { ToolRegistry } from './tool/registry.js';
import { SkillLoader } from './skill/loader.js';
import { AgentLoader } from './agent/loader.js';
import { ModelRunner } from './model/runner.js';
import { createEnvelope } from './tool/envelope.js';
import { resolveModelConfig } from './model/resolver.js';
import { MockInterceptor } from './mock/interceptor.js';
import { createSystemTools } from './tool/systemTools.js';
import { config } from '../config.js';
import { installedRunner } from '../services/ai/installedRunner.js';
import {
  LeadOrchestrator,
  buildLeadOrchestratorPrompt,
  createLeanPackage,
  dehydrateSubagentResult,
  pruneToolOutputs,
  condenseConversationHistory
} from './orchestrator/index.js';

// ── 底座内部自动维护的单例与自启动状态 (外部完全不可见、免手动 new) ──
let defaultRegistry = null;
let defaultSkillLoader = null;
let defaultAgentLoader = null;
let defaultModelRunner = null;
let defaultMockInterceptor = null;
let pendingMockOverride = null;
let defaultOrchestrator = null;
let isInitialized = false;

function resolveAppRoot() {
  if (process.env.MEOCOX_APP_ROOT && fsSync.existsSync(process.env.MEOCOX_APP_ROOT)) {
    return process.env.MEOCOX_APP_ROOT;
  }
  if (config.paths?.appRoot && fsSync.existsSync(path.join(config.paths.appRoot, 'agents'))) {
    return config.paths.appRoot;
  }
  const cwd = process.cwd();
  const parent = path.resolve(cwd, '..');
  if (fsSync.existsSync(path.join(parent, 'agents', 'super-brain'))) {
    return parent;
  }
  if (fsSync.existsSync(path.join(cwd, 'agents', 'super-brain'))) {
    return cwd;
  }
  if (fsSync.existsSync(path.join(parent, 'agents'))) {
    return parent;
  }
  return cwd;
}

const ROOT_DIR = resolveAppRoot();

async function ensureInit() {
  if (isInitialized) return;

  const toolsDir = path.join(ROOT_DIR, 'tools');
  const skillsDir = path.join(ROOT_DIR, 'skills');
  const agentsDir = path.join(ROOT_DIR, 'agents');
  const userAgentsDir = config.paths?.userAgentsDir || path.join(config.paths.dataDir, 'agents');
  const userSkillsDir = config.paths?.userSkillsDir || path.join(config.paths.dataDir, 'skills');
  const userToolsDir = config.paths?.userToolsDir || path.join(config.paths.dataDir, 'tools');
  const mockDir = path.join(ROOT_DIR, 'mock');

  defaultRegistry = new ToolRegistry({ toolsDir, userToolsDir });
  defaultSkillLoader = new SkillLoader({ skillsDir, userSkillsDir });
  defaultAgentLoader = new AgentLoader({
    agentsDir,
    userAgentsDir,
    skillLoader: defaultSkillLoader,
    toolRegistry: defaultRegistry
  });

  defaultModelRunner = new ModelRunner({
    baseUrl: config.ai?.baseUrl,
    apiKey: config.ai?.apiKey,
    model: config.ai?.model
  });

  defaultMockInterceptor = new MockInterceptor({ mockDir });
  if (pendingMockOverride) {
    defaultMockInterceptor.setOverride(pendingMockOverride);
  }

  await Promise.all([
    defaultRegistry.loadFromDirectory(),
    defaultSkillLoader.loadAll()
  ]);
  await defaultAgentLoader.loadAll();

  // 初始化 Lead Orchestrator
  defaultOrchestrator = new LeadOrchestrator({
    agentLoader: defaultAgentLoader,
    toolRegistry: defaultRegistry,
    skillLoader: defaultSkillLoader,
    callModelFn: callModel,
    callModelStreamFn: callModelStream,
    runAgentFn: runAgent
  });

  // 挂载核心系统工具 (invoke_skill, agent dispatch, request_hitl_decision)
  const systemTools = createSystemTools({
    skillLoader: defaultSkillLoader,
    agentLoader: defaultAgentLoader,
    toolRegistry: defaultRegistry,
    callSkillFn: callSkill
  });
  for (const st of systemTools) {
    defaultRegistry.register(st);
  }

  isInitialized = true;
}

// ─────────────────────────────────────────────────────────────
// 🌟 外部业务直接调用的 4 大核心纯函数入口 (零样板代码、开箱即用)
// ─────────────────────────────────────────────────────────────

/**
 * 1. 通用模型调用入口
 * 
 * 外部只需指定：调用哪个模型、传什么 messages、挂哪些工具名
 * 内部全自动：
 *   - [前置 Mock 拦截]：若在 mock/config.json 开启，直接返回虚拟输出，0 消耗
 *   - [用户配置模型寻址]：自动对接用户 providers.json，提取 baseUrl 和 key
 *   - [模型合法性校验]：若调用的模型根本未配置，前置报错拦截，绝不发生静默异常
 *   - [协议与工具闭环]：自动抹平本地/API差异，自动组装 Function Schema 并循环执行
 */
export async function callModel({
  model = null,
  messages = [],
  systemPrompt = '',
  tools = [], // 可直接传工具名称列表，如 ['system_info']
  autoRunTools = true,
  options = {},
  context = {}
} = {}) {
  await ensureInit();

  if (!model || typeof model !== 'string' || !model.trim()) {
    return createEnvelope({
      success: false,
      summary: '调用失败: 必须显式指定目标模型 (model 参数不可为空)',
      error: {
        code: 'MODEL_REQUIRED',
        message: '为了系统的确定性与工业级可靠性，callModel 必须显式传入 model 参数，禁止隐式缺省。'
      }
    });
  }

  const candidateModelId = model.trim();

  // ── [拦截点 A]: 可插拔 Mock 拦截器 ─────────────────────────
  if (defaultMockInterceptor.shouldMockModel(candidateModelId)) {
    const mockResp = await defaultMockInterceptor.getMockModelResponse(candidateModelId, messages);
    return createEnvelope({
      success: true,
      summary: `[MOCK 拦截] 命中模型虚拟响应 (${candidateModelId})`,
      data: {
        text: mockResp.text,
        reasoning: mockResp.reasoning || '',
        reasoningDuration: 0,
        toolExecutions: [],
        steps: 1,
        isMock: true
      }
    });
  }

  // ── [拦截点 B]: 自动对接用户模型配置与强校验 ────────────────
  let resolvedModel = null;
  try {
    resolvedModel = await resolveModelConfig(model);
  } catch (err) {
    return createEnvelope({
      success: false,
      summary: `模型配置校验失败: ${err.message || String(err)}`,
      error: {
        code: err.code || 'MODEL_RESOLUTION_ERROR',
        message: err.message || String(err),
        availableModels: err.availableModels || []
      }
    });
  }

  // 如果 tools 传入的是工具名列表 ['system_info']，自动转换为模型 Function Schema
  let resolvedSchemas = [];
  if (Array.isArray(tools) && tools.length > 0) {
    if (typeof tools[0] === 'string') {
      resolvedSchemas = defaultRegistry.getSchemas(tools);
    } else {
      resolvedSchemas = tools;
    }
  }

  const conversation = [...messages];
  const toolExecutions = [];

  // ── [自适应执行分支 1]: 应用内置本地模型 (In-App Installed) ──
  if (resolvedModel.type === 'installed') {
    try {
      const chatPayload = {
        modelId: resolvedModel.model,
        messages: conversation,
        temperature: options.temperature || 0.2
      };
      if (options.max_tokens) {
        chatPayload.max_tokens = options.max_tokens;
      }
      const rawRes = await installedRunner.chat(chatPayload);
      const choice = rawRes?.choices?.[0]?.message || {};
      return createEnvelope({
        success: true,
        summary: `应用内置模型推理完成 (${resolvedModel.model})`,
        data: {
          modelUsed: resolvedModel.model,
          type: 'installed',
          provider: resolvedModel.providerName,
          text: choice.content || '',
          toolExecutions: [],
          steps: 1
        }
      });
    } catch (instErr) {
      return createEnvelope({
        success: false,
        summary: `应用内置模型执行异常: ${instErr.message}`,
        error: {
          code: 'INSTALLED_MODEL_ERROR',
          message: instErr.message
        }
      });
    }
  }

  // ── [自适应执行分支 2]: HTTP API 端点 (云端平台 或 本地 Ollama 守护进程) ──
  const effectiveOptions = {
    ...options,
    baseUrl: resolvedModel.baseUrl,
    apiKey: resolvedModel.apiKey,
    model: resolvedModel.model
  };

  const MAX_TOOL_STEPS = 12;
  let steps = 0;
  while (steps < MAX_TOOL_STEPS) {
    steps++;
    let resp;
    try {
      resp = await defaultModelRunner.call({
        messages: conversation,
        systemPrompt,
        tools: resolvedSchemas,
        options: effectiveOptions
      });
    } catch (netErr) {
      return createEnvelope({
        success: false,
        summary: `模型接口调用异常: ${netErr.message}`,
        error: {
          code: 'MODEL_NETWORK_ERROR',
          message: netErr.message
        }
      });
    }

    // 检查模型是否触发了工具调用
    if (autoRunTools && resp.toolCalls && resp.toolCalls.length > 0) {
      const normalizedToolCalls = resp.toolCalls.map((call, idx) => {
        const fnName = call.function?.name || call.name;
        const fnArgs = call.function?.arguments !== undefined
          ? (typeof call.function.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function.arguments || {}))
          : JSON.stringify(call.args || {});
        return {
          id: call.id || `call_${Date.now()}_${idx}`,
          type: 'function',
          function: {
            name: fnName,
            arguments: fnArgs
          }
        };
      });

      conversation.push({
        role: 'assistant',
        content: resp.text || '',
        tool_calls: normalizedToolCalls
      });

      let shouldBreakStepLoop = false;
      for (const call of resp.toolCalls) {
        const toolName = call.function?.name || call.name;
        let args = {};
        if (call.args && typeof call.args === 'object') {
          args = call.args;
        } else if (call.function?.arguments) {
          try {
            args = typeof call.function.arguments === 'string'
              ? JSON.parse(call.function.arguments || '{}')
              : call.function.arguments;
          } catch {}
        }

        // 执行工具获取标准 Envelope (callTool 内部也会走工具 Mock 拦截)
        let envelope = await callTool(toolName, args, context);

        // 客观物理产物验收 (Empirical Verification): 严格校验物理文件或结构真实存在
        if (defaultOrchestrator && envelope?.success !== false) {
          const verification = await defaultOrchestrator.verifyResult(toolName, envelope);
          if (!verification.verified) {
            envelope = {
              ...envelope,
              verified: false,
              verificationReason: verification.reason,
              summary: `【客观物理验证未通过】${verification.reason}。请在 <think> 中分析客观原因并修正假设。`,
              success: false
            };
          } else {
            envelope.verified = true;
          }
        }
        toolExecutions.push({ tool: toolName, args, envelope });

        conversation.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(envelope)
        });

        if (envelope?.data?.isDecisionRequest || envelope?.data?.isHandoff) {
          shouldBreakStepLoop = true;
          break;
        }
      }
      if (shouldBreakStepLoop) {
        break;
      }
      continue;
    }

    return createEnvelope({
      success: true,
      summary: resp.text ? '模型推理完成' : '模型空应答',
      data: {
        modelUsed: resolvedModel.model,
        provider: resolvedModel.providerName || resolvedModel.source,
        text: resp.text || '',
        reasoning: resp.reasoning || '',
        toolExecutions,
        steps
      }
    });
  }

  // 达到弹性步数上限时，优雅归纳已有成果，绝不裸露机械错误
  const lastExec = toolExecutions[toolExecutions.length - 1];
  const gracefulSummary = lastExec?.envelope?.summary || '已完成核心阶段性任务调度。';
  return createEnvelope({
    success: true,
    summary: gracefulSummary,
    data: {
      conversation,
      toolExecutions,
      text: gracefulSummary,
      steps
    }
  });
}

/**
 * 1.2 统一大模型流式推理入口 (支持思维链实时推送 + 多轮工具调用事件)
 */
export async function callModelStream({
  model = null,
  messages = [],
  systemPrompt = '',
  tools = [],
  autoRunTools = true,
  options = {},
  context = {}
} = {}, { onEvent } = {}) {
  await ensureInit();

  if (!model || typeof model !== 'string' || !model.trim()) {
    onEvent?.('error', { code: 'MODEL_REQUIRED', message: '必须显式指定目标模型 (model 不可为空)' });
    return createEnvelope({
      success: false,
      summary: '调用失败: 必须显式指定目标模型',
      error: { code: 'MODEL_REQUIRED', message: '必须显式指定目标模型' }
    });
  }

  const candidateModelId = model.trim();

  // ── [拦截点 A]: 可插拔 Mock 拦截器 ─────────────────────────
  if (defaultMockInterceptor.shouldMockModel(candidateModelId)) {
    const mockResp = await defaultMockInterceptor.getMockModelResponse(candidateModelId, messages);
    onEvent?.('think', { delta: `[MOCK 拦截] 正在加载模型虚拟应答 (${candidateModelId})...\n` });
    await new Promise(r => setTimeout(r, 20));
    onEvent?.('think_end', { duration: 0.1 });

    const text = mockResp.text || '';
    const chunkSize = 15;
    for (let i = 0; i < text.length; i += chunkSize) {
      onEvent?.('text', { delta: text.slice(i, i + chunkSize) });
      await new Promise(r => setTimeout(r, 15));
    }

    return createEnvelope({
      success: true,
      summary: `[MOCK 拦截] 命中模型虚拟响应 (${candidateModelId})`,
      data: {
        modelUsed: candidateModelId,
        provider: 'mock',
        text: mockResp.text,
        reasoning: `[MOCK 拦截] 虚拟思考过程 (${candidateModelId})`,
        reasoningDuration: 0.1,
        toolExecutions: [],
        steps: 1,
        isMock: true
      }
    });
  }

  // ── [拦截点 B]: 自动对接用户模型配置与强校验 ────────────────
  let resolvedModel = null;
  try {
    resolvedModel = await resolveModelConfig(model);
  } catch (err) {
    onEvent?.('error', { code: err.code || 'MODEL_RESOLUTION_ERROR', message: err.message });
    return createEnvelope({
      success: false,
      summary: `模型配置校验失败: ${err.message || String(err)}`,
      error: {
        code: err.code || 'MODEL_RESOLUTION_ERROR',
        message: err.message || String(err),
        availableModels: err.availableModels || []
      }
    });
  }

  // 转换 Function Schema
  let resolvedSchemas = [];
  if (Array.isArray(tools) && tools.length > 0) {
    if (typeof tools[0] === 'string') {
      resolvedSchemas = defaultRegistry.getSchemas(tools);
    } else {
      resolvedSchemas = tools;
    }
  }

  let effectiveBaseUrl = resolvedModel.baseUrl;
  let effectiveApiKey = resolvedModel.apiKey;
  let effectiveModelName = resolvedModel.model;

  if (resolvedModel.type === 'installed') {
    try {
      await installedRunner.ensureReady(resolvedModel.model);
      effectiveBaseUrl = `http://127.0.0.1:${installedRunner.engine.port}/v1`;
      effectiveApiKey = '';
      effectiveModelName = installedRunner.normalizeModelId(resolvedModel.model);
    } catch (instErr) {
      onEvent?.('error', { code: 'INSTALLED_MODEL_ERROR', message: instErr.message });
      return createEnvelope({
        success: false,
        summary: `应用内置模型就绪失败: ${instErr.message}`,
        error: { code: 'INSTALLED_MODEL_ERROR', message: instErr.message }
      });
    }
  }

  const effectiveOptions = {
    ...options,
    baseUrl: effectiveBaseUrl,
    apiKey: effectiveApiKey,
    model: effectiveModelName
  };

  const conversation = [...messages];
  const toolExecutions = [];
  let fullReasoning = '';
  let fullText = '';
  let totalThinkingDuration = 0;
  let isCurrentlyThinking = false;
  let thinkStartTime = null;

  const MAX_TOOL_STEPS = 12;
  let steps = 0;
  while (steps < MAX_TOOL_STEPS) {
    steps++;
    let resp;
    try {
      resp = await defaultModelRunner.callStream({
        messages: conversation,
        systemPrompt,
        tools: resolvedSchemas,
        options: effectiveOptions,
        onChunk: (chunk) => {
          if (chunk.type === 'think') {
            if (!isCurrentlyThinking) {
              isCurrentlyThinking = true;
              thinkStartTime = Date.now();
            }
            fullReasoning += chunk.text;
            onEvent?.('think', { delta: chunk.text });
          } else if (chunk.type === 'text') {
            if (isCurrentlyThinking) {
              isCurrentlyThinking = false;
              const dur = Number(((Date.now() - thinkStartTime) / 1000).toFixed(1));
              totalThinkingDuration += dur;
              onEvent?.('think_end', { duration: totalThinkingDuration });
            }
            fullText += chunk.text;
            onEvent?.('text', { delta: chunk.text });
          }
        }
      });
    } catch (netErr) {
      onEvent?.('error', { code: 'MODEL_NETWORK_ERROR', message: netErr.message });
      return createEnvelope({
        success: false,
        summary: `模型接口流式调用异常: ${netErr.message}`,
        error: { code: 'MODEL_NETWORK_ERROR', message: netErr.message }
      });
    }

    if (isCurrentlyThinking) {
      isCurrentlyThinking = false;
      const dur = Number(((Date.now() - thinkStartTime) / 1000).toFixed(1));
      totalThinkingDuration += dur;
      onEvent?.('think_end', { duration: totalThinkingDuration });
    }

    if (resp.reasoning && !fullReasoning) {
      fullReasoning = resp.reasoning;
    }

    // 检查模型是否触发了工具调用
    if (autoRunTools && resp.toolCalls && resp.toolCalls.length > 0) {
      conversation.push({
        role: 'assistant',
        content: resp.text || '',
        tool_calls: resp.toolCalls
      });

      let shouldBreakStepLoop = false;
      for (const call of resp.toolCalls) {
        const toolName = call.function?.name || call.name;
        let args = {};
        if (call.args && typeof call.args === 'object') {
          args = call.args;
        } else {
          try { args = JSON.parse(call.function?.arguments || '{}'); } catch {}
        }

        const toolDef = defaultRegistry.get(toolName);
        onEvent?.('tool_start', { tool: toolName, args, description: toolDef?.description || '' });

        let envelope = await callTool(toolName, args, context);

        // 客观物理产物验收 (Empirical Verification): 严格校验物理文件或结构真实存在
        if (defaultOrchestrator && envelope?.success !== false) {
          const verification = await defaultOrchestrator.verifyResult(toolName, envelope);
          if (!verification.verified) {
            envelope = {
              ...envelope,
              verified: false,
              verificationReason: verification.reason,
              summary: `【客观物理验证未通过】${verification.reason}。请在 <think> 中分析客观原因并修正假设。`,
              success: false
            };
          } else {
            envelope.verified = true;
          }
        }
        toolExecutions.push({ tool: toolName, args, envelope });
        onEvent?.('tool_end', { tool: toolName, args, envelope });

        conversation.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(envelope)
        });

        if (envelope?.data?.isDecisionRequest || envelope?.data?.isHandoff) {
          shouldBreakStepLoop = true;
          break;
        }
      }
      if (shouldBreakStepLoop) {
        break;
      }
      continue;
    }

    let finalSummary = '模型流式推理完成';
    if (!fullText) {
      if (toolExecutions && toolExecutions.length > 0) {
        const lastExec = toolExecutions[toolExecutions.length - 1];
        finalSummary = lastExec.envelope?.summary || `已完成工具执行调度（共 ${toolExecutions.length} 项）`;
      } else if (fullReasoning) {
        finalSummary = '已完成逻辑推演，请指示下一步操作。';
      } else {
        finalSummary = '未收到有效内容返回，请重试。';
      }
    }

    return createEnvelope({
      success: true,
      summary: finalSummary,
      data: {
        modelUsed: resolvedModel.model,
        provider: resolvedModel.providerName || resolvedModel.source,
        text: fullText || (toolExecutions?.length > 0 ? finalSummary : ''),
        reasoning: fullReasoning,
        reasoningDuration: totalThinkingDuration,
        toolExecutions,
        steps
      }
    });
  }

  // 达到弹性步数上限时，优雅归纳已有成果
  const lastExec = toolExecutions[toolExecutions.length - 1];
  const gracefulSummary = lastExec?.envelope?.summary || '已完成核心阶段性任务调度。';
  return createEnvelope({
    success: true,
    summary: gracefulSummary,
    data: {
      conversation,
      toolExecutions,
      reasoning: fullReasoning,
      text: fullText || gracefulSummary,
      steps
    }
  });
}

/**
 * 2. 通用工具调用入口
 * 
 * 内部全自动：
 *   - [前置 Mock 拦截]：若在 mock/config.json 开启，直接返回虚拟工具结果，避免副作用
 *   - [安全注册执行]：自动调度本地/CMD/MCP执行，强制统一返回标准 Envelope
 */
export async function callTool(toolName, params = {}, context = {}) {
  await ensureInit();

  const tool = defaultRegistry.get(toolName);

  // ── [拦截点]: 工具级可插拔 Mock 拦截 (排除核心系统级总线工具) ──
  if (!tool?.isSystem && defaultMockInterceptor.shouldMockTool(toolName)) {
    const mockData = await defaultMockInterceptor.getMockToolResponse(toolName, params);
    return createEnvelope({
      success: true,
      summary: `[MOCK 拦截] 工具 ${toolName} 模拟执行成功`,
      data: mockData
    });
  }

  return await defaultRegistry.execute(toolName, params, context);
}

/**
 * 3. 通用技能调用入口
 */
export async function callSkill(skillId, context = {}) {
  await ensureInit();
  const skill = defaultSkillLoader.getSkill(skillId);
  if (!skill) {
    return createEnvelope({
      success: false,
      summary: `未找到技能: "${skillId}"`,
      error: { code: 'SKILL_NOT_FOUND', message: `Skill ${skillId} does not exist` }
    });
  }

  if (skill.hasHandler && (skill.handlerFn || skill.handlerPath)) {
    try {
      let handlerFn = skill.handlerFn;
      if (!handlerFn && skill.handlerPath) {
        const module = await import(skill.handlerPath);
        handlerFn = module.default || module.execute || module.run;
      }
      const res = await handlerFn(context);
      return createEnvelope({
        success: true,
        summary: `技能【${skill.name}】算法执行完成`,
        data: res
      });
    } catch (err) {
      return createEnvelope({
        success: false,
        summary: `技能【${skill.name}】执行失败: ${err.message}`,
        error: { code: 'SKILL_EXEC_ERROR', message: err.message }
      });
    }
  }

  // 纯 SOP 技能沙箱化执行：若传入了参数或任务，通过独立子会话调用模型，不污染主会话
  const hasInputs = context && Object.keys(context).some(k => !k.startsWith('_'));
  if (hasInputs || context?.task) {
    const cleanInputs = { ...context };
    delete cleanInputs._callingContext;

    const subSystemPrompt = `你是由系统沙箱隔离调用的专用技能执行器【${skill.name}】。\n你的职责是根据如下 SOP 规约处理输入参数，严格返回规范、结构化的 JSON 结果，禁止任何多余的客套寒暄。\n\n## 技能规约指南 (SOP Rules):\n${skill.content}`;

    const subMessages = [
      {
        role: 'user',
        content: `【输入参数】:\n${JSON.stringify(cleanInputs, null, 2)}\n\n【任务目标】:\n${cleanInputs.task || '请严格依据 SOP 规范产出结构化计算与决策结果（必须以规范 JSON 结构输出）'}`
      }
    ];

    try {
      const targetModel = context._model || config.ai?.model || 'gemini-3.8-flash-high';
      const modelResp = await callModel({
        model: targetModel,
        systemPrompt: subSystemPrompt,
        messages: subMessages,
        tools: Array.isArray(skill.tools) && skill.tools.length > 0 ? skill.tools : []
      });

      if (modelResp.success && modelResp.data?.text) {
        let parsedJson = null;
        try {
          const text = modelResp.data.text.trim();
          const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, text];
          parsedJson = JSON.parse(jsonMatch[1]);
        } catch {}

        return createEnvelope({
          success: true,
          summary: `技能【${skill.name}】沙箱规约推理完成`,
          data: parsedJson || { text: modelResp.data.text, raw: modelResp.data }
        });
      }
    } catch {
      // 降级回退静态 SOP 指南
    }
  }

  // 默认返回纯洁的自然语言指导正文
  return createEnvelope({
    success: true,
    summary: `技能【${skill.name}】SOP 规约已就绪`,
    data: {
      id: skill.id,
      name: skill.name,
      promptGuide: skill.content
    }
  });
}

/**
 * 4. 智能体一键调度入口
 */
export async function runAgent(agentId, { task, messages = [], model = null, context = {} } = {}) {
  await ensureInit();
  const agent = defaultAgentLoader.getAgent(agentId);
  if (!agent) {
    return createEnvelope({
      success: false,
      summary: `未找到智能体: "${agentId}"`,
      error: { code: 'AGENT_NOT_FOUND', message: `Agent ${agentId} does not exist` }
    });
  }

  const mergedContext = { ...context, agentId };
  const systemPrompt = defaultAgentLoader.buildSystemPrompt(agentId, mergedContext);
  const authorizedTools = agent.tools;

  const conversation = messages.length > 0
    ? messages
    : [{ role: 'user', content: task || '请开始执行任务' }];

  const preparedConversation = (agentId === 'super-brain' && defaultOrchestrator)
    ? defaultOrchestrator.prepareMessages(conversation)
    : conversation;

  const effectiveModel = model || agent.model || 'auto';
  if (!effectiveModel || typeof effectiveModel !== 'string' || !effectiveModel.trim()) {
    return createEnvelope({
      success: false,
      summary: `智能体 "${agentId}" 未能明确绑定执行模型`,
      error: {
        code: 'AGENT_MODEL_UNDEFINED',
        message: `智能体 "${agentId}" 在配置文件 (agent.yml) 中未显式声明 model，调用时也未指定 model 参数。为了确保工业级确定性与稳定输出，禁止任何隐式缺省模型回退。`
      }
    });
  }

  return await callModel({
    model: effectiveModel.trim(),
    systemPrompt,
    messages: preparedConversation,
    tools: authorizedTools,
    autoRunTools: true,
    context: mergedContext
  });
}

/**
 * 4.2 智能体一键流式调度入口
 */
export async function runAgentStream(agentId, { task, messages = [], model = null, tools = null, context = {} } = {}, { onEvent } = {}) {
  await ensureInit();
  const agent = defaultAgentLoader.getAgent(agentId);
  if (!agent) {
    onEvent?.('error', { code: 'AGENT_NOT_FOUND', message: `Agent ${agentId} does not exist` });
    return createEnvelope({
      success: false,
      summary: `未找到智能体: "${agentId}"`,
      error: { code: 'AGENT_NOT_FOUND', message: `Agent ${agentId} does not exist` }
    });
  }

  const mergedContext = { ...context, agentId };
  const systemPrompt = defaultAgentLoader.buildSystemPrompt(agentId, mergedContext);
  const authorizedTools = tools !== null ? tools : agent.tools;

  const conversation = messages.length > 0
    ? messages
    : [{ role: 'user', content: task || '请开始执行任务' }];

  const preparedConversation = (agentId === 'super-brain' && defaultOrchestrator)
    ? defaultOrchestrator.prepareMessages(conversation)
    : conversation;

  const effectiveModel = model || agent.model || 'auto';
  if (!effectiveModel || typeof effectiveModel !== 'string' || !effectiveModel.trim()) {
    onEvent?.('error', { code: 'AGENT_MODEL_UNDEFINED', message: `智能体 "${agentId}" 未绑定执行模型` });
    return createEnvelope({
      success: false,
      summary: `智能体 "${agentId}" 未能明确绑定执行模型`,
      error: {
        code: 'AGENT_MODEL_UNDEFINED',
        message: `智能体 "${agentId}" 在配置文件 (agent.yml) 中未显式声明 model，调用时也未指定 model 参数。`
      }
    });
  }

  return await callModelStream({
    model: effectiveModel.trim(),
    systemPrompt,
    messages: preparedConversation,
    tools: authorizedTools,
    autoRunTools: true,
    context: mergedContext
  }, { onEvent });
}

/**
 * 5. 一键能力感知 (真实引擎能力)
 */
export async function getCapabilities() {
  await ensureInit();
  return {
    agents: defaultAgentLoader.getAllAgents(),
    skills: defaultSkillLoader.getManifests(),
    tools: defaultRegistry.list(),
    suggestedPrompts: [],
    isMock: false
  };
}

/** Reload on-disk agent and skill definitions after settings mutations. */
export async function reloadDefinitions() {
  await ensureInit();
  defaultAgentLoader.agents.clear();
  defaultSkillLoader.skills.clear();
  await defaultSkillLoader.loadAll();
  await defaultAgentLoader.loadAll();
  return getCapabilities();
}

/**
 * 5.1 Mock 独立能力感知 (纯 Mock 领域与实验性角色)
 */
export async function getMockCapabilities() {
  await ensureInit();
  return await defaultMockInterceptor.getMockCapabilities();
}

export function setMockOverride(overrideConfig) {
  pendingMockOverride = overrideConfig;
  if (defaultMockInterceptor) {
    defaultMockInterceptor.setOverride(overrideConfig);
  }
}

export function clearMockOverride() {
  pendingMockOverride = null;
  if (defaultMockInterceptor) {
    defaultMockInterceptor.clearOverride();
  }
}

export async function getAgent(agentId) {
  await ensureInit();
  return defaultAgentLoader.getAgent(agentId);
}

export function getTool(toolName) {
  return defaultRegistry?.get(toolName) || null;
}

export function getSkill(skillId) {
  return defaultSkillLoader?.getSkill(skillId) || null;
}

export async function registerSkill(skillRecord) {
  await ensureInit();
  return defaultSkillLoader.registerSkill(skillRecord);
}

export async function unregisterSkill(skillId) {
  await ensureInit();
  return defaultSkillLoader.unregisterSkill(skillId);
}

// ─────────────────────────────────────────────────────────────
// 🌟 作品项目、多对话与外挂资料库管理器导出
// ─────────────────────────────────────────────────────────────
export {
  createProject,
  getProject,
  listProjects,
  updateProject,
  deleteProject,
  createThread,
  listThreads,
  getThreadMessages,
  appendThreadMessages,
  deleteThread,
  switchActiveThread,
  updateThread,
  getThread,
  getThreadDetails,
  saveThreadDetails,
  clearThreadStream,
  mountLibrary,
  unmountLibrary,
  listLibraries,
  scanLibrary
} from './project/index.js';

// ─────────────────────────────────────────────────────────────
// 🌟 Lead Orchestrator (总控编排主脑) 导出
// ─────────────────────────────────────────────────────────────
export async function getOrchestrator() {
  await ensureInit();
  return defaultOrchestrator;
}

export {
  LeadOrchestrator,
  buildLeadOrchestratorPrompt,
  createLeanPackage,
  buildSubagentExecutionMessages,
  dehydrateSubagentResult,
  formatDehydratedFactCard,
  pruneToolOutputs,
  condenseConversationHistory
} from './orchestrator/index.js';


