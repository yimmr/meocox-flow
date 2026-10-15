import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { AgentSystem } from '../../src/runtime/agentLoader.js';
import { MCPHub } from '../../src/runtime/mcpHub.js';
import { registerLocalVideoTools } from '../../src/runtime/registerLocalTools.js';

describe('Super Brain Multi-Agent Dispatcher & Orchestration', () => {
  const hub = new MCPHub();
  const agentSystem = new AgentSystem();

  const testWorkerId = 'test-worker-agent';

  before(async () => {
    registerLocalVideoTools(hub, agentSystem);
    await agentSystem.loadFromDisk();
    await agentSystem.createCustomAgent({
      id: testWorkerId,
      name: 'Dynamic Worker',
      title: '执行专员',
      persona: '你是专职执行任务的动态工作智能体。'
    });
  });

  after(async () => {
    await agentSystem.deleteAgent(testWorkerId).catch(() => {});
  });

  it('should discover super-brain as the top-level orchestrator agent', () => {
    const superBrain = agentSystem.getAgent('super-brain');
    assert.ok(superBrain, 'super-brain agent must be loaded');
    assert.equal(superBrain.name, 'Super Brain');
    assert.equal(superBrain.title, '参谋总长');
    assert.ok(superBrain.tools.includes('assign_task_to_agent'));
    assert.ok(superBrain.tools.includes('inspect_system_capabilities'));
  });

  it('should have assign_task_to_agent tool registered in MCPHub', () => {
    assert.equal(hub.hasTool('assign_task_to_agent'), true);
  });

  it('should allow Super Brain to assign a task to a subordinate worker agent', async () => {
    const res = await hub.executeTool('assign_task_to_agent', {
      targetAgentId: testWorkerId,
      task: '根据素材库中的片段拟定剪辑方案与分镜节奏规划'
    }, { projectId: 'test_proj' });

    assert.equal(res.success, true);
    assert.equal(res.delegatedTo, testWorkerId);
    assert.equal(res.targetAgentName, 'Dynamic Worker');
    assert.equal(res.status, 'dispatched');
    assert.ok(res.agentPrompt.includes('动态工作智能体'));
  });

  it('should reject delegation to unknown or non-existent agent', async () => {
    await assert.rejects(
      async () => {
        await hub.executeTool('assign_task_to_agent', {
          targetAgentId: 'unknown-ghost-agent',
          task: '测试不存在的智能体'
        });
      },
      /Target agent "unknown-ghost-agent" not found/
    );
  });
});
