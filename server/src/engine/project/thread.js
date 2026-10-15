import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createEnvelope } from '../tool/envelope.js';
import { assertSafePathSegment } from '../../utils/safePath.js';
import { withProjectFileLock } from './manager.js';

/**
 * 安全读取 JSON
 */
async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * 原子写入 JSON
 */
async function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fsSync.existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
  const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  try {
    await fs.rename(tempPath, filePath);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      await new Promise(r => setTimeout(r, 25));
      try {
        await fs.rename(tempPath, filePath);
      } catch {
        await fs.copyFile(tempPath, filePath);
        await fs.unlink(tempPath).catch(() => {});
      }
    } else {
      throw err;
    }
  }
}

/**
 * 生成规范对话 ID: thread_<timestamp36>_<random4>
 */
export function generateThreadId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `thread_${ts}_${rand}`;
}

/**
 * 项目多对话（Thread）管理器
 * 
 * 职责：
 * 1. 负责在项目沙箱内部维护多条独立的对话流（threads/<threadId>.json）
 * 2. 避免单对话导致的上下文污染与 Token 爆炸
 * 3. 支持随时建立分支对话，或指定不同专业 Agent 进行专项探讨
 */
export class ThreadManager {
  constructor({ projectManager }) {
    this.projectManager = projectManager;
  }

  getThreadsDir(projectId) {
    const projectDir = this.projectManager.getProjectPath(projectId);
    return path.join(projectDir, 'threads');
  }

  getThreadFile(projectId, threadId) {
    const threadsDir = this.getThreadsDir(projectId);
    return path.join(threadsDir, `${assertSafePathSegment(threadId?.trim(), 'threadId')}.json`);
  }

  /**
   * 创建新对话分支
   */
  async createThread(projectId, {
    id = null,
    title = '新对话',
    agentId = null,
    transientFiles = []
  } = {}) {
    const project = await this.projectManager.getProject(projectId);
    if (!project) {
      return createEnvelope({
        success: false,
        summary: `创建对话失败: 未找到项目 "${projectId}"`,
        error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projectId} not found` }
      });
    }

    const threadId = id?.trim() || generateThreadId();
    const threadFile = this.getThreadFile(projectId, threadId);

    if (fsSync.existsSync(threadFile)) {
      return createEnvelope({
        success: false,
        summary: `创建对话失败: 对话 ID "${threadId}" 已存在`,
        error: { code: 'THREAD_ALREADY_EXISTS', message: `Thread ${threadId} already exists` }
      });
    }

    const now = Date.now();
    const threadMeta = {
      id: threadId,
      title: String(title).trim(),
      agentId: agentId || null,
      transientFiles: Array.isArray(transientFiles) ? transientFiles : [],
      createdAt: now,
      updatedAt: now
    };

    // 1. 初始化任务数据文件
    await withProjectFileLock(threadFile, async () => {
      await writeJson(threadFile, {
        messages: [],
        feedItems: [],
        artifacts: []
      });
    });

    // 2. 更新 project.json 中的对话索引与活跃指针
    await this.projectManager.updateProject(projectId, (currentProject) => ({
      threads: [...(currentProject.threads || []), threadMeta],
      activeThreadId: threadId
    }));

    return createEnvelope({
      success: true,
      summary: `新任务【${threadMeta.title}】创建成功`,
      data: threadMeta
    });
  }

  /**
   * 获取项目内所有对话列表
   */
  async listThreads(projectId) {
    const project = await this.projectManager.getProject(projectId);
    if (!project) return [];
    return project.threads || [];
  }

  /**
   * 读取指定对话的消息历史
   */
  async getMessages(projectId, threadId = 'main') {
    const threadFile = this.getThreadFile(projectId, threadId);
    if (!fsSync.existsSync(threadFile)) {
      return [];
    }
    const raw = (await readJson(threadFile, []));
    if (Array.isArray(raw)) return raw;
    return raw?.messages || [];
  }

  /**
   * 向指定对话追加一条或多条消息
   */
  async appendMessages(projectId, threadId, newMessages) {
    const threadFile = this.getThreadFile(projectId, threadId);
    if (!fsSync.existsSync(threadFile)) {
      return createEnvelope({
        success: false,
        summary: `消息追加失败: 未找到任务 "${threadId}"`,
        error: { code: 'THREAD_NOT_FOUND', message: `Thread ${threadId} not found` }
      });
    }

    const now = Date.now();
    const messageCount = await withProjectFileLock(threadFile, async () => {
      const data = (await readJson(threadFile, []));
      let messages = [];
      let isObject = false;
      if (Array.isArray(data)) {
        messages = data;
      } else if (data && typeof data === 'object') {
        messages = data.messages || [];
        isObject = true;
      }
      const list = Array.isArray(newMessages) ? newMessages : [newMessages];

      for (const msg of list) {
        if (!msg) continue;
        messages.push({
          id: msg.id || `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          role: msg.role || 'user',
          content: msg.content || '',
          reasoning: msg.reasoning || '',
          reasoningDuration: typeof msg.reasoningDuration === 'number' ? msg.reasoningDuration : null,
          agentId: msg.agentId || null,
          agentName: msg.agentName || null,
          isMock: Boolean(msg.isMock),
          tool_calls: msg.tool_calls || msg.toolCalls || null,
          tool_call_id: msg.tool_call_id || null,
          toolExecutions: Array.isArray(msg.toolExecutions) ? msg.toolExecutions : [],
          attachments: msg.attachments || msg.attachedFiles || [],
          attachedFiles: msg.attachedFiles || msg.attachments || [],
          visibility: msg.visibility || 'user',
          turnId: msg.turnId || null,
          isDecisionResolve: Boolean(msg.isDecisionResolve),
          decisionId: msg.decisionId || null,
          selectedOptionId: msg.selectedOptionId || null,
          selectedLabel: msg.selectedLabel || null,
          decisionPrompt: msg.decisionPrompt || null,
          decisionOptions: Array.isArray(msg.decisionOptions) ? msg.decisionOptions : [],
          timestamp: msg.timestamp || now
        });
      }

      if (isObject) {
        await writeJson(threadFile, { ...data, messages });
      } else {
        await writeJson(threadFile, messages);
      }
      return messages.length;
    });

    // 更新 project.json 的 updatedAt 以及对应 thread 的 updatedAt
    const project = await this.projectManager.getProject(projectId);
    if (project) {
      await this.projectManager.updateProject(projectId, (currentProject) => ({
        threads: (currentProject.threads || []).map((thread) => thread.id === threadId
          ? { ...thread, updatedAt: now }
          : thread)
      }));
    }

    return createEnvelope({
      success: true,
      summary: `消息已追加至对话【${threadId}】`,
      data: { threadId, messageCount }
    });
  }

  /**
   * 切换活跃对话
   */
  async switchActiveThread(projectId, threadId) {
    const project = await this.projectManager.getProject(projectId);
    if (!project) {
      return createEnvelope({
        success: false,
        summary: `切换对话失败: 未找到项目 "${projectId}"`,
        error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projectId} not found` }
      });
    }

    const thread = (project.threads || []).find(t => t.id === threadId);
    if (!thread) {
      return createEnvelope({
        success: false,
        summary: `切换对话失败: 未找到对话 "${threadId}"`,
        error: { code: 'THREAD_NOT_FOUND', message: `Thread ${threadId} not found in project` }
      });
    }

    await this.projectManager.updateProject(projectId, { activeThreadId: threadId });
    return createEnvelope({
      success: true,
      summary: `已切换至活跃对话【${thread.title}】`,
      data: { activeThreadId: threadId }
    });
  }

  /**
   * 删除某个任务（所有任务均可删除，最后一个删除后回到 0 任务默认状态）
   */
  async deleteThread(projectId, threadId) {
    const project = await this.projectManager.getProject(projectId);
    if (!project) {
      return createEnvelope({
        success: false,
        summary: `删除任务失败: 未找到项目 "${projectId}"`,
        error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projectId} not found` }
      });
    }

    const threadFile = this.getThreadFile(projectId, threadId);
    try {
      if (fsSync.existsSync(threadFile)) {
        await fs.unlink(threadFile);
      }
    } catch {}
    try {
      await fs.rm(path.join(this.getThreadsDir(projectId), '.events', path.basename(threadFile, '.json')), {
        recursive: true,
        force: true
      });
    } catch {}

    let remainingThreads = [];
    let newActive = null;
    await this.projectManager.updateProject(projectId, (currentProject) => {
      remainingThreads = (currentProject.threads || []).filter(t => t.id !== threadId);
      newActive = currentProject.activeThreadId === threadId
        ? (remainingThreads.length > 0 ? remainingThreads[remainingThreads.length - 1].id : null)
        : currentProject.activeThreadId;
      return { threads: remainingThreads, activeThreadId: newActive };
    });

    return createEnvelope({
      success: true,
      summary: `任务 "${threadId}" 已删除`,
      data: { activeThreadId: newActive, remainingThreads }
    });
  }

  /**
   * 更新指定对话分支元数据 (如 pendingDecision, agentId 等)
   */
  async updateThread(projectId, threadId, updates = {}) {
    const project = await this.projectManager.getProject(projectId);
    if (!project) {
      return createEnvelope({
        success: false,
        summary: `更新对话失败: 未找到项目 "${projectId}"`,
        error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projectId} not found` }
      });
    }

    let updatedThread = null;
    const updateResult = await this.projectManager.updateProject(projectId, (currentProject) => {
      const threads = [...(currentProject.threads || [])];
      const targetIdx = threads.findIndex(t => t.id === threadId);
      if (targetIdx === -1) return null;
      threads[targetIdx] = {
        ...threads[targetIdx],
        ...updates,
        updatedAt: Date.now()
      };
      updatedThread = threads[targetIdx];
      return { threads };
    });
    if (!updateResult.success || !updatedThread) {
      return createEnvelope({
        success: false,
        summary: `更新对话失败: 未找到对话 "${threadId}"`,
        error: { code: 'THREAD_NOT_FOUND', message: `Thread ${threadId} not found` }
      });
    }
    return createEnvelope({
      success: true,
      summary: `对话【${updatedThread.title}】元数据已更新`,
      data: updatedThread
    });
  }

  /**
   * 获取指定任务的完整工作流与产物详情
   */
  async getThreadDetails(projectId, threadId) {
    const project = await this.projectManager.getProject(projectId);
    const meta = (project?.threads || []).find(t => t.id === threadId) || { id: threadId, title: '任务详情' };
    const threadFile = this.getThreadFile(projectId, threadId);

    if (!fsSync.existsSync(threadFile)) {
      return { ...meta, messages: [], feedItems: [], artifacts: [] };
    }
    const data = await readJson(threadFile, []);
    if (Array.isArray(data)) {
      return { ...meta, messages: data, feedItems: [], artifacts: [] };
    }
    return {
      ...meta,
      messages: data?.messages || [],
      feedItems: data?.feedItems || [],
      artifacts: data?.artifacts || []
    };
  }

  /**
   * 保存任务的工作流与产物数据
   */
  async saveThreadDetails(projectId, threadId, { feedItems, artifacts, messages, title, status } = {}) {
    const threadFile = this.getThreadFile(projectId, threadId);
    const updated = await withProjectFileLock(threadFile, async () => {
      let existing = {};
      if (fsSync.existsSync(threadFile)) {
        const data = await readJson(threadFile, {});
        if (Array.isArray(data)) {
          existing = { messages: data, feedItems: [], artifacts: [] };
        } else if (data && typeof data === 'object') {
          existing = data;
        }
      }

      const nextData = {
        ...existing,
        messages: messages !== undefined ? messages : (existing.messages || []),
        feedItems: feedItems !== undefined ? feedItems : (existing.feedItems || []),
        artifacts: artifacts !== undefined ? artifacts : (existing.artifacts || []),
        updatedAt: Date.now()
      };
      await writeJson(threadFile, nextData);
      return nextData;
    });

    if (title || status) {
      await this.updateThread(projectId, threadId, {
        ...(title ? { title } : {}),
        ...(status ? { status } : {})
      });
    }

    return updated;
  }

  /**
   * 清空指定任务的工作信息流 (保留产物)
   */
  async clearThreadStream(projectId, threadId) {
    const threadFile = this.getThreadFile(projectId, threadId);
    if (fsSync.existsSync(threadFile)) {
      await withProjectFileLock(threadFile, async () => {
        const data = await readJson(threadFile, {});
        const artifacts = Array.isArray(data) ? [] : (data?.artifacts || []);
        await writeJson(threadFile, {
          messages: [],
          feedItems: [],
          artifacts,
          updatedAt: Date.now()
        });
      });
    }
    return { success: true };
  }

  /**
   * 获取指定任务元数据
   */
  async getThread(projectId, threadId) {
    return await this.getThreadDetails(projectId, threadId);
  }
}
