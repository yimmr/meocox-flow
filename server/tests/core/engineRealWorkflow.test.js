import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  callTool,
  callSkill,
  registerSkill,
  unregisterSkill,
  getCapabilities,
  createProject,
  createThread,
  getThread,
  updateThread,
  appendThreadMessages,
  getThreadMessages
} from '../../src/engine/index.js';

describe('Real Mode Infrastructure & Multi-Agent Execution Bus', () => {
  before(async () => {
    await registerSkill({
      id: 'aigc-storyboard',
      name: 'AIGC 智能分镜生成',
      description: '台词切片与分镜规划',
      hasHandler: true,
      handlerFn: async (context = {}) => {
        const text = (context.scriptText || '').trim();
        const rawSentences = text.split(/(?<=[。！？；\n!?])/).map(s => s.trim()).filter(Boolean);
        const shots = rawSentences.map((sentence, idx) => ({
          order: idx + 1,
          scriptText: sentence,
          shotRole: idx === 0 ? '黄金3秒Hook' : (idx === rawSentences.length - 1 ? '终局升华与行动号召' : '机制剖析')
        }));
        return { success: true, shots };
      }
    });

    await registerSkill({
      id: 'beat-sync',
      name: '音乐节奏卡点规范',
      description: '对齐 BPM 与高能节奏',
      hasHandler: false,
      content: '# 音乐节奏卡点 SOP\n根据音频波形峰值对齐镜头转场。'
    });
  });

  after(async () => {
    await unregisterSkill('aigc-storyboard');
    await unregisterSkill('beat-sync');
  });

  it('should discover core system tools in getCapabilities()', async () => {
    const caps = await getCapabilities();
    const toolNames = caps.tools.map(t => t.name);

    assert.ok(toolNames.includes('invoke_skill'), 'invoke_skill must be registered as a system tool');
    assert.ok(toolNames.includes('assign_task_to_agent'), 'assign_task_to_agent must be registered as a system tool');
    assert.ok(toolNames.includes('request_hitl_decision'), 'request_hitl_decision must be registered as a system tool');
  });

  it('should execute a handler-backed skill (aigc-storyboard) deterministically via callSkill', async () => {
    const script = '第一句台词介绍背景。第二句台词展示核心冲突！第三句台词给出最终号召。';
    const result = await callSkill('aigc-storyboard', { scriptText: script });

    assert.equal(result.success, true);
    assert.ok(result.data, 'result.data should exist');
    assert.ok(Array.isArray(result.data.shots), 'shots array should be returned');
    assert.equal(result.data.shots.length, 3, 'should split into 3 shots');
    assert.equal(result.data.shots[0].shotRole, '黄金3秒Hook');
  });

  it('should allow invoking skills via invoke_skill system tool', async () => {
    const script = '欢迎来到全自动化视频生成系统。智能体集群正在协同为您工作。';
    const toolResult = await callTool('invoke_skill', {
      skillId: 'aigc-storyboard',
      params: { scriptText: script }
    });
    assert.equal(toolResult.success, true);
    assert.ok(toolResult.data?.shots?.length > 0, 'invoke_skill should return storyboard shots');
  });

  it('should return SOP guidelines for prompt-based skill if no handler exists', async () => {
    const result = await callSkill('beat-sync', {});
    assert.equal(result.success, true);
    assert.ok(result.data?.promptGuide || result.data?.text, 'should provide SOP guide or reasoning');
  });

  it('should execute assign_task_to_agent and return structured handoff payload', async () => {
    const handoffResult = await callTool('assign_task_to_agent', {
      targetAgentId: 'director',
      task: '根据提供的口播文案规划 128 BPM 燃剪分镜结构',
      reason: '需要总编导把控整体视听节奏'
    });

    assert.equal(handoffResult.success, true);
    assert.equal(handoffResult.data?.isHandoff, true);
    assert.equal(handoffResult.data?.targetAgentId, 'director');
    assert.equal(handoffResult.data?.reason, '需要总编导把控整体视听节奏');
  });

  it('should execute request_hitl_decision and return structured decision request', async () => {
    const decisionResult = await callTool('request_hitl_decision', {
      prompt: '请选择本条视频的核心剪辑节奏风格：',
      options: [
        { id: 'opt_fast', label: '128 BPM 极速卡点', description: '适合高燃游戏击杀' },
        { id: 'opt_slow', label: '轻柔抒情叙事', description: '适合剧情探索' }
      ]
    });

    assert.equal(decisionResult.success, true);
    assert.equal(decisionResult.data?.isDecisionRequest, true);
    assert.ok(decisionResult.data?.decisionId?.startsWith('dec_'));
    assert.equal(decisionResult.data?.options?.length, 2);
  });

  it('should support pendingDecision persistence and resolution in thread metadata', async () => {
    const projectEnv = await createProject({ title: 'Test HITL Project' });
    assert.equal(projectEnv.success, true);
    const projectId = projectEnv.data.id;

    const threadEnv = await createThread(projectId, { title: 'HITL Test Thread' });
    assert.equal(threadEnv.success, true);
    const threadId = threadEnv.data.id;

    // 1. 设置待裁决状态
    await updateThread(projectId, threadId, {
      pendingDecision: {
        decisionId: 'dec_test_123',
        prompt: '请选择输出画质',
        options: [
          { id: '1080p', label: '1080P 超清' },
          { id: '4k', label: '4K 原画' }
        ]
      }
    });

    const metaBefore = await getThread(projectId, threadId);
    assert.equal(metaBefore.pendingDecision?.decisionId, 'dec_test_123');

    // 2. 模拟裁决确认并清空挂起状态
    await appendThreadMessages(projectId, threadId, {
      role: 'user',
      content: '【人机协同决策已确认】：已选定 4K 原画'
    });
    await updateThread(projectId, threadId, { pendingDecision: null });

    const metaAfter = await getThread(projectId, threadId);
    assert.equal(metaAfter.pendingDecision, null);

    const msgs = await getThreadMessages(projectId, threadId);
    assert.ok(msgs.some(m => m.content.includes('4K 原画')));
  });
});
