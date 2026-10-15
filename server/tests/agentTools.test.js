import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { executeAgentAction, AGENT_TOOLS_DEFINITIONS } from '../src/services/agentTools.js';
import { storage } from '../src/storage/index.js';

describe('AgentTools Dispatcher', () => {
  const testProjectId = 'test_proj_agent_tools';

  before(async () => {
    await storage.init();
    await storage.saveProject({
      id: testProjectId,
      title: '单元测试项目',
      game: '黑神话：悟空',
      category: '攻略教学',
      status: 'planning'
    });
  });

  after(async () => {
    await storage.deleteProject(testProjectId);
  });

  it('should export valid tool definitions with names and descriptions', () => {
    assert.ok(Array.isArray(AGENT_TOOLS_DEFINITIONS));
    const toolNames = AGENT_TOOLS_DEFINITIONS.map(t => t.name);
    assert.ok(toolNames.includes('update_storyboard'));
    assert.ok(toolNames.includes('update_pipeline_stage'));
    assert.ok(toolNames.includes('export_jianying_draft'));
  });

  it('should execute update_storyboard and calculate time ranges correctly', async () => {
    const items = [
      {
        order: 1,
        title: '【黄金钩子】Boss预警',
        scriptText: '注意Boss举起左手动作',
        matchedClipId: 'clip_01',
        durationSec: 5,
        transition: '快速拉近'
      },
      {
        order: 2,
        title: '【机制处决】大硬直破招',
        scriptText: '破招成功直接处决！',
        matchedClipId: 'clip_02',
        durationSec: 4,
        transition: '慢动作定格'
      }
    ];

    const result = await executeAgentAction(testProjectId, 'update_storyboard', { items });
    assert.equal(result.success, true);
    assert.equal(result.storyboard.length, 2);
    assert.equal(result.storyboard[0].timeRange, '00:00 - 00:05');
    assert.equal(result.storyboard[1].timeRange, '00:05 - 00:09');

    // Verify persisted into storage
    const saved = await storage.getStoryboard(testProjectId);
    assert.equal(saved.length, 2);
    assert.equal(saved[1].matchedClipId, 'clip_02');
  });

  it('should execute update_pipeline_stage and advance progress', async () => {
    const result = await executeAgentAction(testProjectId, 'update_pipeline_stage', {
      stageId: 'step_1',
      status: 'completed',
      progress: 100,
      details: 'Agent 自动完成了分镜脚本规划'
    });

    assert.equal(result.success, true);
    assert.equal(result.pipeline.stages[0].status, 'completed');
    assert.equal(result.pipeline.stages[0].progress, 100);
  });
});
