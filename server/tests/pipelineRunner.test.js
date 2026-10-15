import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { executePipelineStep, getDefaultDistributedPipeline } from '../src/services/pipelineRunner.js';
import { storage } from '../src/storage/index.js';

describe('Pipeline Runner & Step-by-Step Task Orchestration', () => {
  const testProjectId = 'test_proj_pipeline_runner';

  beforeEach(async () => {
    // 不指定 projectDir，交由 storage 落到标准项目工作区，避免测试数据写进代码仓库
    await storage.saveProject({
      id: testProjectId,
      title: '测试流水线项目',
      game: '黑神话：悟空',
      category: '攻略教学',
      status: 'planning'
    });
    await storage.savePipeline(testProjectId, getDefaultDistributedPipeline());
    await storage.saveStoryboard(testProjectId, []);
  });

  test('should return 5-stage default distributed pipeline structure', () => {
    const pipeline = getDefaultDistributedPipeline();
    assert.equal(pipeline.stages.length, 5);
    assert.equal(pipeline.stages[0].id, 'step_1');
    assert.equal(pipeline.stages[0].status, 'waiting');
    assert.equal(pipeline.stages[1].id, 'step_2');
    assert.equal(pipeline.stages[2].id, 'step_3');
    assert.equal(pipeline.stages[3].id, 'step_4');
    assert.equal(pipeline.stages[4].id, 'step_5');
  });

  test('should execute step_1 (perception & slicing) with real outputs and logs', async () => {
    const result = await executePipelineStep(testProjectId, 'step_1');
    assert.equal(result.success, true);
    assert.equal(result.stage.status, 'completed');
    assert.equal(result.stage.progress, 100);
    assert.ok(result.logs.length > 0);
    assert.ok(result.outputOverview);
    assert.ok(result.outputOverview.probedClips >= 0);
    assert.ok(result.durationSec !== undefined);
  });

  test('should execute step_3 (script & storyboard planning) and generate storyboard', async () => {
    const result = await executePipelineStep(testProjectId, 'step_3');
    assert.equal(result.success, true);
    assert.equal(result.stage.status, 'completed');
    assert.ok(result.outputOverview.storyboardCount > 0);
    assert.ok(result.outputOverview.totalDurationSec > 0);
    
    // Verify storyboard was persisted in storage
    const storyboard = await storage.getStoryboard(testProjectId);
    assert.ok(storyboard.length >= 4);
    assert.ok(storyboard[0].scriptText);
  });

  test('should execute step_4 (semantic clip matching) and match storyboard items', async () => {
    // Run step 3 first to ensure storyboard exists
    await executePipelineStep(testProjectId, 'step_3');
    const result = await executePipelineStep(testProjectId, 'step_4');
    assert.equal(result.success, true);
    assert.equal(result.stage.status, 'completed');
    assert.equal(result.outputOverview.matchRate, '100%');
    assert.ok(result.outputOverview.matchedShots > 0);
  });

  test('should execute step_5 (draft export) and inject Jianying draft with overview', async () => {
    await executePipelineStep(testProjectId, 'step_3');
    await executePipelineStep(testProjectId, 'step_4');
    const result = await executePipelineStep(testProjectId, 'step_5', { draftName: '测试流水线草稿' });
    assert.equal(result.success, true);
    assert.equal(result.stage.status, 'completed');
    assert.ok(result.outputOverview.draftPath);
    assert.ok(result.outputOverview.videoSegments > 0);
  });

  after(async () => {
    await storage.deleteProject(testProjectId).catch(() => {});
  });
});
