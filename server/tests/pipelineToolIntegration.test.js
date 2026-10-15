import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { storage } from '../src/storage/index.js';
import { executeAgentAction, getToolsPromptDescription } from '../src/services/agentTools.js';
import { defaultAgentSystem } from '../src/runtime/agentLoader.js';
import { defaultMCPHub } from '../src/runtime/mcpHub.js';
import { registerLocalVideoTools } from '../src/runtime/registerLocalTools.js';
import { buildGroundedSystemPrompt } from '../src/services/ai.js';
import path from 'node:path';

describe('Flexible Pipeline Invocation & Dynamic Agent Tools Integration', () => {
  const testProjId = `test_pipe_invoc_${Date.now()}`;

  before(async () => {
    registerLocalVideoTools(defaultMCPHub, defaultAgentSystem);
    defaultAgentSystem.agentsDir = path.resolve(import.meta.dirname, '../../agents');
    defaultAgentSystem.skillsDir = path.resolve(import.meta.dirname, '../../skills');
    await defaultAgentSystem.loadFromDisk();

    await storage.saveProject({
      id: testProjId,
      title: '流水线调用测试工程',
      game: '黑神话：悟空',
      category: '攻略教学'
    });
  });

  after(async () => {
    try {
      await storage.deleteProject(testProjId);
    } catch {}
  });

  it('should allow agents to query pipeline status via get_pipeline_status tool', async () => {
    const res = await executeAgentAction(testProjId, 'get_pipeline_status');
    assert.equal(res.success, true);
    assert.equal(res.tool, 'get_pipeline_status');
    assert.ok(typeof res.overallProgress === 'number');
    assert.ok(Array.isArray(res.stages));
    assert.ok(res.stages.length >= 4);
  });

  it('should allow agents to invoke a real pipeline step via run_pipeline_step tool', async () => {
    // Step 1: execute step_3 (Script & Storyboard Planning) directly via tool
    const res = await executeAgentAction(testProjId, 'run_pipeline_step', { stageId: 'step_3' });
    assert.equal(res.success, true);
    assert.equal(res.tool, 'run_pipeline_step');
    assert.equal(res.stageId, 'step_3');
    assert.ok(res.message.includes('真实执行完成'));
    assert.ok(Array.isArray(res.logs));

    // Verify storage has the generated storyboard
    const storyboard = await storage.getStoryboard(testProjId);
    assert.ok(storyboard.length > 0, 'Storyboard should be generated after step 3 execution');

    // Verify pipeline stage is marked completed
    const pipe = await storage.getPipeline(testProjId);
    const step3 = pipe.stages.find(s => s.id === 'step_3');
    assert.equal(step3?.status, 'completed');
  });

  it('should dynamically inject tools for custom agents according to their definition', async () => {
    await defaultAgentSystem.createCustomAgent({
      id: 'test-custom-agent',
      name: 'Custom Test Agent',
      title: '自定义测试员',
      tools: ['update_storyboard', 'run_pipeline_step', 'export_jianying_draft']
    });

    const prompt = buildGroundedSystemPrompt({
      thread: 'main',
      agentId: 'test-custom-agent',
      messages: [{ role: 'user', content: '测试自定义工具' }]
    });

    assert.ok(prompt.includes('Custom Test Agent') || prompt.includes('自定义测试员'));
    assert.ok(prompt.includes('update_storyboard'), 'Custom Agent must have update_storyboard');
    assert.ok(prompt.includes('run_pipeline_step'), 'Custom Agent must have run_pipeline_step');
    assert.ok(prompt.includes('export_jianying_draft'), 'Custom Agent must have export_jianying_draft');

    await defaultAgentSystem.deleteAgent('test-custom-agent');
  });

  it('should provide pipeline execution tools to Super Brain and Director by default', () => {
    const brainPrompt = buildGroundedSystemPrompt({
      thread: 'main',
      agentId: 'super-brain',
      messages: [{ role: 'user', content: '你好' }]
    });
    assert.ok(brainPrompt.includes('run_pipeline_step'), 'Super Brain must have run_pipeline_step');
    assert.ok(brainPrompt.includes('run_pipeline'), 'Super Brain must have run_pipeline');
    assert.ok(brainPrompt.includes('get_pipeline_status'), 'Super Brain must have get_pipeline_status');

    const directorPrompt = buildGroundedSystemPrompt({
      thread: 'workflow',
      agentId: 'director',
      messages: [{ role: 'user', content: '开工做视频' }]
    });
    assert.ok(directorPrompt.includes('run_pipeline_step'), 'Director must have run_pipeline_step');
    assert.ok(directorPrompt.includes('run_pipeline'), 'Director must have run_pipeline');
    assert.ok(directorPrompt.includes('update_storyboard'), 'Director must have update_storyboard');
  });
});
