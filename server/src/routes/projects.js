import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { openProjectFolderInExplorer, openFileInDefaultApp } from '../utils/nativeExplorer.js';

import {
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
  scanLibrary,
  runAgent,
  callModel,
  callTool
} from '../engine/index.js';
import { storage } from '../storage/index.js';
import { appendThreadTurnEvent, readThreadTurnEvents } from '../services/threadTurnEvents.js';
import { runMockScenario } from '../engine/mock/scenarioRunner.js';
import { generateJianyingDraft } from '../services/jianying.js';
import { executePipelineStep } from '../services/pipelineRunner.js';
import { executeThreadTurn, extractAndCleanThinking } from '../services/threadTurnRunner.js';

export { extractAndCleanThinking };

export function generateDefaultProjectTitle() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${mm}${dd}_${hh}${min} 剪辑`;
}

const router = express.Router();
// A thread may have at most one active chat turn in this server process.
// Different threads remain independent and can execute concurrently.
const activeChatTurns = new Map();

// ─────────────────────────────────────────────────────────────
// 1. 项目基础 CRUD
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/projects
 * 列出所有项目（无任何强制分类，纯通用项目空间）
 */
router.get('/', async (req, res) => {
  try {
    const projects = await listProjects();
    res.json({ projects, count: projects.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects
 * 创建新项目沙箱（支持配置标题、描述、绑定的初始资料库目录等）
 */
router.post('/', async (req, res) => {
  const { title, description, libraries, settings, initialAgentId } = req.body;
  try {
    const envelope = await createProject({
      title: (title && title.trim()) ? title.trim() : '未命名作品',
      description,
      libraries: Array.isArray(libraries) ? libraries : [],
      settings: settings || {},
      initialAgentId
    });

    if (!envelope.success) {
      return res.status(400).json(envelope);
    }
    res.json({ success: true, project: envelope.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/projects/:id
 * 获取指定项目详情
 */
router.get('/:id', async (req, res) => {
  try {
    const project = await getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ project });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/projects/:id
 * 更新项目元数据
 */
router.patch('/:id', async (req, res) => {
  try {
    const envelope = await updateProject(req.params.id, req.body);
    if (!envelope.success) {
      return res.status(400).json(envelope);
    }
    res.json({ success: true, project: envelope.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/projects/:id
 * 删除项目私有目录（外部资料库毫发无损）
 */
router.delete('/:id', async (req, res) => {
  try {
    const envelope = await deleteProject(req.params.id);
    res.json(envelope);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects/:id/open-folder
 * 在本地文件资源管理器中打开项目私有工作区
 */
router.post('/:id/open-folder', async (req, res) => {
  try {
    const result = await openProjectFolderInExplorer(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects/:id/open-memory
 * 在本地默认编辑器中打开项目专属 MEMORY.md
 */
router.post('/:id/open-memory', async (req, res) => {
  try {
    const pId = req.params.id;
    const workDir = await storage.getProjectWorkDir(pId);
    const memPath = path.join(workDir, 'MEMORY.md');
    await fs.mkdir(workDir, { recursive: true });
    if (!fsSync.existsSync(memPath)) {
      const template = `# 项目工程级记忆 (Project Memory)\n\n## 项目核心事实与资产状态\n- [${new Date().toISOString().split('T')[0]}] 项目记忆初始化\n`;
      await fs.writeFile(memPath, template, 'utf-8');
    }
    const result = await openFileInDefaultApp(memPath);
    res.json({ success: true, filePath: memPath, ...result });
  } catch (err) {
    res.status(500).json({ error: `打开项目记忆失败: ${err.message}` });
  }
});


// ─────────────────────────────────────────────────────────────
// 2. 多对话 (Threads) 路由
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/projects/:id/threads
 * 列出项目内所有对话
 */
router.get('/:id/threads', async (req, res) => {
  try {
    const threads = await listThreads(req.params.id);
    res.json({ threads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects/:id/threads
 * 创建新对话分支
 */
router.post('/:id/threads', async (req, res) => {
  const { title, agentId, transientFiles } = req.body;
  try {
    const envelope = await createThread(req.params.id, {
      title: title || '新对话',
      agentId,
      transientFiles
    });
    res.json(envelope);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects/:id/threads/:threadId/active
 * 切换活跃对话
 */
router.post('/:id/threads/:threadId/active', async (req, res) => {
  try {
    const envelope = await switchActiveThread(req.params.id, req.params.threadId);
    res.json(envelope);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/projects/:id/threads/:threadId
 * 删除指定对话分支 (main 不可删)
 */
router.delete('/:id/threads/:threadId', async (req, res) => {
  const executionKey = JSON.stringify([req.params.id, req.params.threadId]);
  if (activeChatTurns.has(executionKey)) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'THREAD_TURN_ALREADY_RUNNING',
        message: '任务运行期间不能删除，请等待执行结束。'
      }
    });
  }
  activeChatTurns.set(executionKey, 'deleting');
  try {
    const envelope = await deleteThread(req.params.id, req.params.threadId);
    res.json(envelope);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (activeChatTurns.get(executionKey) === 'deleting') {
      activeChatTurns.delete(executionKey);
    }
  }
});

/**
 * GET /api/projects/:id/threads/:threadId
 * 读取指定任务详情 (包含完整的 feedItems, artifacts, messages)
 */
router.get('/:id/threads/:threadId', async (req, res) => {
  try {
    let details = await getThreadDetails(req.params.id, req.params.threadId);
    const executionKey = JSON.stringify([req.params.id, req.params.threadId]);
    if (details.status === 'running' && !activeChatTurns.has(executionKey)) {
      await updateThread(req.params.id, req.params.threadId, {
        status: 'failed',
        activeTurnId: null,
        activeTurnStartedAt: null,
        lastError: '服务重启或执行进程退出，任务未能继续运行。'
      });
      details = await getThreadDetails(req.params.id, req.params.threadId);
    }
    res.json({ success: true, thread: details });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/projects/:id/threads/:threadId/events?turnId=...&sinceSeq=...
 * Read the durable semantic event log for one chat turn.
 */
router.get('/:id/threads/:threadId/events', async (req, res) => {
  try {
    const details = await getThread(req.params.id, req.params.threadId);
    const turnId = req.query.turnId || details.activeTurnId || details.lastTurnId;
    if (!turnId) return res.json({ success: true, turnId: null, events: [] });
    const rawCursor = Number.parseInt(req.query.sinceSeq, 10);
    const sinceSeq = Number.isInteger(rawCursor) ? rawCursor : -1;
    const events = await readThreadTurnEvents(
      req.params.id,
      req.params.threadId,
      turnId,
      { sinceSeq }
    );
    res.json({ success: true, turnId, events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/projects/:id/threads/:threadId
 * 更新并保存指定任务的元数据、工作信息流与产物
 */
router.put('/:id/threads/:threadId', async (req, res) => {
  const { feedItems, artifacts, messages, title, status } = req.body;
  try {
    const updated = await saveThreadDetails(req.params.id, req.params.threadId, {
      feedItems,
      artifacts,
      messages,
      title,
      status
    });
    res.json({ success: true, thread: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects/:id/threads/:threadId/clear
 * 清空指定任务的工作信息流 (保留产物)
 */
router.post('/:id/threads/:threadId/clear', async (req, res) => {
  try {
    const result = await clearThreadStream(req.params.id, req.params.threadId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/projects/:id/threads/:threadId/messages
 * 读取指定对话的消息流
 */
router.get('/:id/threads/:threadId/messages', async (req, res) => {
  try {
    const messages = await getThreadMessages(req.params.id, req.params.threadId);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects/:id/threads/:threadId/messages
 * 纯消息追加（不触发智能体推理）
 */
router.post('/:id/threads/:threadId/messages', async (req, res) => {
  const { messages } = req.body;
  try {
    const envelope = await appendThreadMessages(req.params.id, req.params.threadId, messages);
    res.json(envelope);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects/:id/threads/:threadId/chat
 * 智能体对话核心闭环：记录用户消息 -> 驱动智能体/模型 -> 记录助手响应 -> 返回信封
 */
router.post('/:id/threads/:threadId/chat', async (req, res) => {
  const { prompt, agentId = null, model = null } = req.body;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt 为必填项' });
  }

  const projectId = req.params.id;
  const threadId = req.params.threadId;
  const turnId = `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const executionKey = JSON.stringify([projectId, threadId]);
  if (activeChatTurns.has(executionKey)) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'THREAD_TURN_ALREADY_RUNNING',
        message: '该任务已有执行正在运行，请等待完成后再继续。'
      }
    });
  }
  activeChatTurns.set(executionKey, turnId);

  try {
    // 1. 追加用户消息
    const userMsg = {
      role: 'user',
      content: prompt.trim(),
      timestamp: Date.now()
    };
    await appendThreadMessages(projectId, threadId, userMsg);

    // 2. 获取该对话的历史上下文
    const history = await getThreadMessages(projectId, threadId);

    // 格式化为模型标准的 messages 序列
    const modelMessages = history.map(m => ({
      role: m.role || 'user',
      content: m.content || ''
    }));

    // 3. 驱动智能体或通用模型调用
    let resultEnvelope;
    if (agentId) {
      resultEnvelope = await runAgent(agentId, {
        messages: modelMessages,
        model: model || undefined,
        context: { projectId }
      });
    } else {
      // 外部明确传入模型，若未传则自动寻址用户活跃模型
      const targetModel = model || 'auto';
      resultEnvelope = await callModel({
        model: targetModel,
        messages: modelMessages,
        context: { projectId }
      });
    }

    // 4. 提取回答文本并持久化助手消息
    const replyText = resultEnvelope?.data?.text || resultEnvelope?.summary || '执行完成，但未返回文本应答。';
    const assistantMsg = {
      role: 'assistant',
      content: replyText,
      reasoning: resultEnvelope?.data?.reasoning || '',
      reasoningDuration: resultEnvelope?.data?.reasoningDuration || null,
      agentId: agentId || null,
      isMock: Boolean(resultEnvelope?.data?.isMock),
      toolExecutions: resultEnvelope?.data?.toolExecutions || [],
      envelope: resultEnvelope,
      timestamp: Date.now()
    };

    await appendThreadMessages(projectId, threadId, assistantMsg);

    res.json({
      success: resultEnvelope.success,
      reply: assistantMsg,
      envelope: resultEnvelope
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'CHAT_EXECUTION_ERROR', message: err.message }
    });
  } finally {
    if (activeChatTurns.get(executionKey) === turnId) {
      activeChatTurns.delete(executionKey);
    }
  }
});

/**
 * POST /api/projects/:id/threads/:threadId/chat/stream
 * 智能体对话核心流式闭环 (SSE 端点)
 * 支持通用思维链流 (reasoning_content & <think> 标签)、多轮工具调用与正文打字机
 */
router.post('/:id/threads/:threadId/chat/stream', async (req, res) => {
  const { prompt, agentId = null, model = null, enableThinking = true, attachedFiles = [], internalPrompt = false } = req.body;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt 为必填项' });
  }

  const projectId = req.params.id;
  const threadId = req.params.threadId;
  const turnId = `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const executionKey = JSON.stringify([projectId, threadId]);
  if (activeChatTurns.has(executionKey)) {
    return res.status(409).json({
      success: false,
      error: {
        code: 'THREAD_TURN_ALREADY_RUNNING',
        message: '该任务已有执行正在运行，请等待完成后再继续。'
      }
    });
  }
  activeChatTurns.set(executionKey, turnId);

  // 1. 建立标准 SSE 传输通道
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  if (res.flushHeaders) res.flushHeaders();

  let isClosed = false;
  res.on('close', () => {
    isClosed = true;
  });

  let eventSeq = 0;
  let eventJournalChain = Promise.resolve();
  const sendSse = (event, data) => {
    const eventRecord = {
      turnId,
      seq: eventSeq++,
      type: event,
      ts: Date.now(),
      payload: data === undefined ? null : data
    };
    eventJournalChain = eventJournalChain
      .then(() => appendThreadTurnEvent(projectId, threadId, turnId, eventRecord))
      .catch((error) => console.warn('[chat-events] 事件落盘失败:', error.message));

    if (isClosed || res.writableEnded) return;
    try {
      const payload = data && typeof data === 'object'
        ? { ...data, turnId: data.turnId || turnId, eventSeq: eventRecord.seq }
        : { value: data, turnId, eventSeq: eventRecord.seq };
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
      if (res.flush) res.flush();
    } catch {}
  };

  try {
    await executeThreadTurn(
      {
        projectId,
        threadId,
        prompt,
        agentId,
        model,
        enableThinking,
        attachedFiles,
        internalPrompt,
        turnId
      },
      {
        emitEvent: sendSse,
        isAborted: () => isClosed
      }
    );
    res.end();
  } catch (err) {
    await updateThread(projectId, threadId, {
      status: 'failed',
      activeTurnId: null,
      activeTurnStartedAt: null,
      lastError: err.message || '执行失败'
    }).catch(() => {});
    sendSse('error', {
      code: 'CHAT_STREAM_ERROR',
      message: err.message
    });
    sendSse('stream_error', {
      code: 'CHAT_STREAM_ERROR',
      message: err.message
    });
    res.end();
  } finally {
    await eventJournalChain;
    if (activeChatTurns.get(executionKey) === turnId) {
      activeChatTurns.delete(executionKey);
    }
  }
});

/**
 * POST /api/projects/:id/tools/:toolName/execute
 * 通用底层工具与产物动作执行总线 (Domain-Agnostic Action Bus)
 * 允许前端产物动态触发任意注册工具 (如 export_jianying_draft, git_commit, analyze_data)
 */
router.post('/:id/tools/:toolName/execute', async (req, res) => {
  const { toolName } = req.params;
  const projectId = req.params.id;
  const body = req.body || {};
  const rawArgs = body.args !== undefined ? body.args : body;
  const toolParams = typeof rawArgs === 'object' && rawArgs !== null ? { ...rawArgs } : {};
  if (projectId && !toolParams.projectId) toolParams.projectId = projectId;
  if (body.artifactId && !toolParams.artifactId) toolParams.artifactId = body.artifactId;

  try {
    const envelope = await callTool(toolName, toolParams, { projectId });
    res.json(envelope);
  } catch (err) {
    res.status(500).json({ error: `执行工具「${toolName}」异常: ${err.message}` });
  }
});

/**
 * POST /api/projects/:id/export/jianying
 * 兼容旧版剪映导出调用
 */
router.post('/:id/export/jianying', async (req, res) => {
  const { draftName } = req.body || {};
  const projectId = req.params.id;
  try {
    const result = await generateJianyingDraft(projectId, draftName || '未命名剪映草稿');
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: `导出剪映草稿失败: ${err.message}` });
  }
});

/**
 * POST /api/projects/:id/threads/:threadId/decision/resolve
 * 人机协同 (HITL) 决策裁决恢复接口 (通用领域无关)
 */
router.post('/:id/threads/:threadId/decision/resolve', async (req, res) => {
  const { decisionId, selectedOptionId, steeringNotes } = req.body || {};
  const { id: projectId, threadId } = req.params;

  if (!decisionId || !selectedOptionId) {
    return res.status(400).json({ error: 'decisionId 与 selectedOptionId 均为必填项' });
  }

  try {
    const threadMeta = await getThread(projectId, threadId);
    const pending = threadMeta?.pendingDecision;
    let selectedLabel = selectedOptionId;

    if (pending?.options && Array.isArray(pending.options)) {
      const match = pending.options.find(o => o.id === selectedOptionId);
      if (match?.label) selectedLabel = match.label;
    }

    // 1. 追加用户决策确认记录至消息流（完整保留创作者补充微调要求）
    const noteText = steeringNotes && typeof steeringNotes === 'string' && steeringNotes.trim()
      ? `；创作者补充微调要求：「${steeringNotes.trim()}」`
      : '';
    const decisionConfirmMsg = {
      role: 'user',
      content: `【人机协同决策已确认】：已选定执行方向「${selectedLabel}」${noteText}。请基于此裁决继续推进任务。`,
      visibility: 'internal',
      isDecisionResolve: true,
      decisionId,
      selectedOptionId,
      selectedLabel,
      steeringNotes: steeringNotes && typeof steeringNotes === 'string' ? steeringNotes.trim() : null,
      decisionPrompt: pending?.prompt || null,
      decisionOptions: pending?.options || [],
      timestamp: Date.now()
    };
    await appendThreadMessages(projectId, threadId, decisionConfirmMsg);

    // 2. 清空挂起状态并保留暂停前执掌的智能体标识
    await updateThread(projectId, threadId, {
      pendingDecision: null,
      status: 'idle',
      ...(pending?.agentId ? { agentId: pending.agentId } : {})
    });

    res.json({
      success: true,
      decisionId,
      selectedOptionId,
      selectedLabel,
      steeringNotes: steeringNotes && typeof steeringNotes === 'string' ? steeringNotes.trim() : null,
      agentId: pending?.agentId || threadMeta?.agentId || null,
      summary: `已确认决策「${selectedLabel}」，对话上下文已恢复就绪`
    });
  } catch (err) {
    res.status(500).json({ error: `处理人机决策异常: ${err.message}` });
  }
});

/**
 * GET /api/projects/:id/memory
 * 查询项目与创作者持久记忆 (MEMORY.md)
 */
router.get('/:id/memory', async (req, res) => {
  const projectId = req.params.id;
  try {
    const mem = await storage.getMemory(projectId);
    res.json({ success: true, ...mem });
  } catch (err) {
    res.status(500).json({ error: `读取记忆失败: ${err.message}` });
  }
});

/**
 * POST /api/projects/:id/memory
 * 保存或追加项目/全局持久记忆 (MEMORY.md)
 */
router.post('/:id/memory', async (req, res) => {
  const projectId = req.params.id;
  const { content, scope = 'user', append = true } = req.body || {};
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content 为必填参数' });
  }
  try {
    const result = await storage.saveMemory(content, { projectId, scope, append });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: `保存记忆失败: ${err.message}` });
  }
});

/**
 * POST /api/projects/:id/threads/:threadId/mock-scenario/stream
 * 全真动态 Mock 场景剧本流式发射器 (开发期核心驱动器)
 * 支持全流程多智能体协作、终端滚动日志、产物发布与人机协同决策恢复
 */
router.post('/:id/threads/:threadId/mock-scenario/stream', async (req, res) => {
  const { decisionOptionId = null, resumeFromDecision = false, steeringNotes = '', attachedFiles = [] } = req.body || {};

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  if (res.flushHeaders) res.flushHeaders();

  let isClosed = false;
  res.on('close', () => {
    isClosed = true;
  });

  const sendSse = (event, data) => {
    if (isClosed || res.writableEnded) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      if (res.flush) res.flush();
    } catch {}
  };

  try {
    await runMockScenario({
      sendEvent: sendSse,
      isAborted: () => isClosed,
      decisionOptionId,
      resumeFromDecision,
      steeringNotes,
      attachedFiles
    });
    res.end();
  } catch (err) {
    sendSse('stream_error', { message: err.message });
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────
// 3. 外挂资料库 (Libraries) 路由
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/projects/:id/libraries
 * 查看项目挂载的资料库
 */
router.get('/:id/libraries', async (req, res) => {
  try {
    const libraries = await listLibraries(req.params.id);
    res.json({ libraries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects/:id/libraries
 * 挂载外部资料库目录
 */
router.post('/:id/libraries', async (req, res) => {
  const { name, path: dirPath, type } = req.body;
  try {
    const envelope = await mountLibrary(req.params.id, { name, path: dirPath, type });
    res.json(envelope);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/projects/:id/libraries/:libId
 * 卸载资料库
 */
router.delete('/:id/libraries/:libId', async (req, res) => {
  try {
    const envelope = await unmountLibrary(req.params.id, req.params.libId);
    res.json(envelope);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/projects/:id/libraries/:libId/scan
 * 安全只读扫描资料库
 */
router.post('/:id/libraries/:libId/scan', async (req, res) => {
  try {
    const envelope = await scanLibrary(req.params.id, req.params.libId, req.body || {});
    res.json(envelope);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// 4. 代码驱动动效 (Code-as-Video Motion Manifest) 路由
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/projects/:id/motion
 * 获取当前项目的确定性代码动效工程清单 (Remotion Motion Manifest)
 */
router.get('/:id/motion', async (req, res) => {
  const projectId = req.params.id;
  try {
    const manifest = await storage.getMotionManifest(projectId);
    if (!manifest) {
      return res.status(404).json({ error: '当前项目尚未生成代码动效工程清单' });
    }
    res.json({ success: true, manifest });
  } catch (err) {
    res.status(500).json({ error: `读取动效清单失败: ${err.message}` });
  }
});

/**
 * POST /api/projects/:id/motion/synthesize
 * 触发 Code Motion Engineer 动效场景装配
 */
router.post('/:id/motion/synthesize', async (req, res) => {
  const projectId = req.params.id;
  const options = req.body || {};
  try {
    const result = await executePipelineStep(projectId, 'motion_scene_synthesis', options);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: `动效装配失败: ${err.message}` });
  }
});

export default router;
