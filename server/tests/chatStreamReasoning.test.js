import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import express from 'express';
import projectsRouter from '../src/routes/projects.js';
import { callModelStream, setMockOverride, clearMockOverride } from '../src/engine/index.js';
import { createProject, deleteProject, createThread, getThreadMessages } from '../src/engine/index.js';

describe('End-to-End SSE Streaming Thinking Process (思维链流式与持久化)', () => {
  let app;
  let server;
  let baseUrl;
  let testProjectId;
  let testThreadId;
  const PORT = 3198;

  before(async () => {
    // 内存安全拦截，避免多测试并发污染本地磁盘 mock/config.json
    setMockOverride({
      enabled: true,
      mockModels: true,
      mockTools: true
    });

    app = express();
    app.use(express.json());
    app.use('/api/projects', projectsRouter);

    await new Promise((resolve) => {
      server = app.listen(PORT, resolve);
    });
    baseUrl = `http://localhost:${PORT}/api/projects`;

    // 创建测试项目与分支
    const projectEnvelope = await createProject({
      title: 'SSE 思维链自动化验证项目',
      description: '自动化验证 Reasoning 流式输出与历史卡片回显'
    });
    testProjectId = projectEnvelope.data.id;

    const threadEnvelope = await createThread(testProjectId, {
      title: '推演思考测试分支'
    });
    testThreadId = threadEnvelope.data.id;
  });

  after(async () => {
    clearMockOverride();
    if (testProjectId) {
      await deleteProject(testProjectId).catch(() => {});
    }
    if (server) {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('1. callModelStream 底座接口应支持事件监听回调 (onEvent: think/think_end/text)', async () => {
    const receivedEvents = [];

    const result = await callModelStream({
      model: 'qwen3-vl-4b',
      messages: [{ role: 'user', content: '测试调用' }]
    }, {
      onEvent: (type, data) => {
        receivedEvents.push({ type, data });
      }
    });

    assert.ok(result.success, '应返回成功信封');
    assert.ok(Array.isArray(receivedEvents), '应收集到事件');
    assert.ok(receivedEvents.some(e => e.type === 'think'), '应触发 think 事件');
    assert.ok(receivedEvents.some(e => e.type === 'think_end'), '应触发 think_end 事件');
    assert.ok(receivedEvents.some(e => e.type === 'text'), '应触发 text 文本流事件');
  });

  it('2. POST /api/projects/:id/threads/:threadId/chat/stream 应输出标准 SSE 事件流', async () => {
    const res = await fetch(`${baseUrl}/${testProjectId}/threads/${testThreadId}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: '请构思一段高燃宣传片脚本',
        agentId: 'super-brain'
      })
    });

    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/event-stream'));

    const rawStream = await res.text();
    assert.ok(rawStream.includes('event: think'), 'SSE 流中必须包含 think 事件');
    assert.ok(rawStream.includes('event: text'), 'SSE 流中必须包含 text 事件');
    assert.ok(rawStream.includes('event: done'), 'SSE 流中必须包含 done 完成事件');
  });

  it('3. 对话持久化存储中必须保留 reasoning, reasoningDuration 与 toolExecutions', async () => {
    const messages = await getThreadMessages(testProjectId, testThreadId);
    assert.ok(messages.length >= 2, '历史消息列表中应包含 user 和 assistant 消息');

    const assistantMsg = messages.find(m => m.role === 'assistant');
    assert.ok(assistantMsg, '应存在 assistant 消息');
    assert.ok('reasoning' in assistantMsg, '助手消息中必须持久化 reasoning 字段');
    assert.ok('toolExecutions' in assistantMsg, '助手消息中必须持久化 toolExecutions 字段');
    assert.ok(assistantMsg.reasoning.length > 0, '助手消息中的 reasoning 应成功保存');
  });
});
