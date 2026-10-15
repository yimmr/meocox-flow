import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  executeThreadTurn,
  extractAndCleanThinking
} from '../../src/services/threadTurnRunner.js';
import {
  createProject,
  createThread,
  getThread,
  getThreadMessages,
  deleteProject,
  setMockOverride
} from '../../src/engine/index.js';

describe('UI-Agnostic Thread Turn Execution Service (threadTurnRunner)', () => {
  it('1. extractAndCleanThinking should cleanly extract thinking tags and leave pure text', () => {
    const raw = '<think>正在排查分镜依赖与素材时长...\n确定采用识破高光方案。</think>已为你梳理出3个关键分镜镜头。';
    const { text, reasoning } = extractAndCleanThinking(raw, '初始思路');

    assert.equal(text, '已为你梳理出3个关键分镜镜头。');
    assert.ok(reasoning.includes('初始思路'));
    assert.ok(reasoning.includes('正在排查分镜依赖与素材时长'));
    assert.ok(!text.includes('<think>'));
    assert.ok(!text.includes('</think>'));
  });

  it('2. extractAndCleanThinking should handle unclosed thinking tags gracefully', () => {
    const raw = '<thought>未闭合的推导片段';
    const { text, reasoning } = extractAndCleanThinking(raw);

    assert.equal(text, '');
    assert.ok(reasoning.includes('未闭合的推导片段'));
  });

  it('3. executeThreadTurn should run end-to-end with mock events sink without HTTP dependencies', async () => {
    // 启用 Mock 模型应答拦截，0 真实 API 消耗
    setMockOverride({
      enabled: true,
      mockModels: true,
      defaultText: '【Super Brain】已分析完毕你的需求并收敛方案。',
      defaultReasoning: '主脑正在全局规划...'
    });

    // 创建隔离的项目与对话线程
    const testProjectTitle = `TurnRunnerTest_${Date.now()}`;
    const projRes = await createProject({ title: testProjectTitle });
    assert.equal(projRes.success, true);
    const projectId = projRes.data.id;

    const threadRes = await createThread(projectId, { title: '测试任务线' });
    assert.equal(threadRes.success, true);
    const threadId = threadRes.data.id;

    const emittedEvents = [];
    const eventSink = (event, data) => {
      emittedEvents.push({ event, data });
    };

    try {
      const turnResult = await executeThreadTurn(
        {
          projectId,
          threadId,
          prompt: '请分析素材高光并生成分镜建议',
          agentId: 'super-brain',
          enableThinking: true,
          attachedFiles: [
            { id: 'f1', name: 'demo.mp4', path: 'D:/test/demo.mp4', type: 'video', tag: '视频1' }
          ]
        },
        {
          emitEvent: eventSink,
          isAborted: () => false
        }
      );

      // 验证返回值
      assert.equal(turnResult.status, 'completed');
      assert.ok(turnResult.turnId);
      assert.ok(turnResult.reply);
      assert.ok(turnResult.reply.content.includes('已分析完毕你的需求'));

      // 验证事件流记录
      const eventTypes = emittedEvents.map(e => e.event);
      assert.ok(eventTypes.includes('stream_started'), 'Must emit stream_started');
      assert.ok(eventTypes.includes('agent_start'), 'Must emit agent_start');
      assert.ok(eventTypes.includes('step_start'), 'Must emit step_start');
      assert.ok(eventTypes.includes('done'), 'Must emit done');
      assert.ok(eventTypes.includes('stream_done'), 'Must emit stream_done');

      // 验证数据持久化状态
      const thread = await getThread(projectId, threadId);
      assert.equal(thread.status, 'completed');

      const messages = await getThreadMessages(projectId, threadId);
      assert.ok(messages.length >= 2, 'Should persist user message and assistant reply');
      assert.equal(messages[0].role, 'user');
      assert.equal(messages[messages.length - 1].role, 'assistant');
      assert.ok(messages[0].attachedFiles.length > 0, 'User message should carry attached files');
    } finally {
      // 重置 Mock 拦截并清理工程
      setMockOverride(null);
      await deleteProject(projectId).catch(() => {});
    }
  });
});
