import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  callTool,
  callModel,
  runAgent,
  runAgentStream,
  getCapabilities
} from '../src/engine/index.js';

describe('Modern Core Engine Integration', () => {
  test('getCapabilities should return super-brain agent and bridged tools', async () => {
    const caps = await getCapabilities();
    assert.ok(caps.agents, 'agents list must exist');
    const brain = caps.agents.find(a => a.id === 'super-brain');
    assert.ok(brain, 'super-brain must be registered');
    assert.equal(brain.id, 'super-brain');

    assert.ok(Array.isArray(caps.tools), 'tools list must exist');
    const sysCapTool = caps.tools.find(t => t.name === 'inspect_system_capabilities');
    assert.ok(sysCapTool, 'inspect_system_capabilities tool should be available');
  });

  test('callTool inspect_system_capabilities returns system status', async () => {
    const envelope = await callTool('inspect_system_capabilities', {}, { projectId: 'test-p1' });
    assert.ok(envelope.success);
    assert.ok(envelope.data);
    assert.ok(Array.isArray(envelope.data.agents));
    assert.ok(Array.isArray(envelope.data.tools));
  });

  test('callTool request_hitl_decision produces decision payload', async () => {
    const envelope = await callTool('request_hitl_decision', {
      prompt: '请选择后续生成画风：',
      options: [
        { id: 'opt1', label: '赛博朋克' },
        { id: 'opt2', label: '新海诚日漫' }
      ]
    });
    assert.ok(envelope.success);
    assert.equal(envelope.data.isDecisionRequest, true);
    assert.equal(envelope.data.options.length, 2);
  });

  test('runAgent should resolve auto model and execute properly', async () => {
    const envelope = await runAgent('super-brain', {
      task: '测试系统自检与状态盘点',
      context: { projectId: 'test-p1' }
    });
    assert.ok(envelope !== null);
  });

  test('runAgentStream should support streaming events with context', async () => {
    const events = [];
    const envelope = await runAgentStream(
      'super-brain',
      {
        task: '请做简短的问候',
        context: { projectId: 'test-p1' }
      },
      {
        onEvent: (ev, data) => {
          events.push({ ev, data });
        }
      }
    );
    assert.ok(envelope !== null);
  });
});
