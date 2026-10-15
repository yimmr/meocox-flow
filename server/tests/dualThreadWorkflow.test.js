import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { storage } from '../src/storage/index.js';
import { buildGroundedSystemPrompt } from '../src/services/ai.js';
import { executeAgentAction } from '../src/services/agentTools.js';
import { defaultAgentSystem } from '../src/runtime/agentLoader.js';
import path from 'node:path';
import { defaultMCPHub } from '../src/runtime/mcpHub.js';
import { registerLocalVideoTools } from '../src/runtime/registerLocalTools.js';

describe('Dual-Thread Architecture & Strategic Delegation', () => {
  const testProjId = `test_dual_thread_${Date.now()}`;
  const testSubAgentId = 'test-workflow-worker';

  before(async () => {
    registerLocalVideoTools(defaultMCPHub, defaultAgentSystem);
    defaultAgentSystem.agentsDir = path.resolve(import.meta.dirname, '../../agents');
    defaultAgentSystem.skillsDir = path.resolve(import.meta.dirname, '../../skills');
    await defaultAgentSystem.loadFromDisk();
    await defaultAgentSystem.createCustomAgent({
      id: testSubAgentId,
      name: 'Workflow Worker',
      title: '工作流执行员',
      tools: ['update_storyboard', 'export_jianying_draft'],
      persona: '你是负责工作流执行的智能体。'
    });
    await storage.saveProject({
      id: testProjId,
      title: '双轨多智能体测试项目',
      game: '黑神话：悟空',
      category: '攻略教学'
    });
  });

  after(async () => {
    try {
      await defaultAgentSystem.deleteAgent(testSubAgentId);
    } catch {}
    try {
      await storage.deleteProject(testProjId);
    } catch {}
  });

  it('should isolate main thread and workflow thread messages in storage', async () => {
    // 1. Save messages in main thread
    const mainMsg = { id: 'm1', role: 'user', content: '你好，聊聊黑神话的美术风格' };
    await storage.saveMessages(testProjId, [mainMsg], 'main');

    // 2. Save messages in workflow thread
    const wfMsg = { id: 'w1', role: 'assistant', content: '已完成第1镜卡点设计' };
    await storage.saveMessages(testProjId, [wfMsg], 'workflow');

    // 3. Query main thread
    const readMain = await storage.getMessages(testProjId, 'main');
    assert.equal(readMain.length, 1);
    assert.equal(readMain[0].content, '你好，聊聊黑神话的美术风格');

    // 4. Query workflow thread
    const readWf = await storage.getMessages(testProjId, 'workflow');
    assert.equal(readWf.length, 1);
    assert.equal(readWf[0].content, '已完成第1镜卡点设计');
  });

  it('should generate conversational Co-Pilot prompt for main thread (no storyboard tools and no update_project_meta by default)', async () => {
    const prompt = buildGroundedSystemPrompt({
      thread: 'main',
      agentId: 'super-brain',
      messages: [{ role: 'user', content: '遗忘之海2026年9月版本' }]
    });

    assert.ok(prompt.includes('Super Brain') || prompt.includes('超级大脑'));
    assert.ok(prompt.includes('assign_task_to_agent'), 'Super Brain must have delegation tool');
    assert.ok(!prompt.includes('<tool_call name="update_storyboard">'), 'Super Brain must NOT have update_storyboard tool');
    assert.ok(!prompt.includes('<tool_call name="update_project_meta">'), 'Super Brain must NOT have update_project_meta when user is just chatting or brainstorming');

    // Only inject update_project_meta if user explicitly asked to rename
    const renamePrompt = buildGroundedSystemPrompt({
      thread: 'main',
      agentId: 'super-brain',
      messages: [{ role: 'user', content: '请帮我把项目改名为《遗忘之海前瞻》' }]
    });
    assert.ok(renamePrompt.includes('<tool_call name="update_project_meta">'), 'Super Brain should have update_project_meta when user explicitly requests renaming');
  });

  it('should generate dedicated production prompt for workflow thread (with storyboard tools)', async () => {
    const prompt = buildGroundedSystemPrompt({
      thread: 'workflow',
      agentId: testSubAgentId
    });

    assert.ok(prompt.includes('Workflow Worker') || prompt.includes('工作流执行员'));
    assert.ok(prompt.includes('<tool_call name="update_storyboard">'), 'Worker must have update_storyboard tool');
    assert.ok(prompt.includes('<tool_call name="export_jianying_draft">'), 'Worker must have export_jianying_draft tool');
  });

  it('should automatically inject delegated task into workflow thread when assign_task_to_agent is executed', async () => {
    const actionResult = await executeAgentAction(testProjId, 'assign_task_to_agent', {
      targetAgentId: testSubAgentId,
      task: '制作一段30秒劈棍高光击杀混剪，前3秒打出痛点卡点'
    });

    assert.ok(actionResult.success);
    assert.equal(actionResult.result.delegatedTo, testSubAgentId);

    // The workflow thread must have received the task briefing automatically
    const wfMsgs = await storage.getMessages(testProjId, 'workflow');
    assert.ok(wfMsgs.length >= 1);
    const hasBrief = wfMsgs.some(m => m.content.includes('超级主脑委派任务书') && m.content.includes('劈棍高光击杀'));
    assert.ok(hasBrief, 'Task briefing must be present in workflow thread');
  });
});
