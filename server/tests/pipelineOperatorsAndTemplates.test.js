import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { storage } from '../src/storage/index.js';
import { 
  executePipelineStep, 
  applyPipelineTemplate, 
  getAllPipelineTemplates,
  getPipelineTemplateById,
  instantiatePipelineStages,
  listAllOperators
} from '../src/services/pipelineRunner.js';
import { getOperator, resolveOperatorForStage } from '../src/pipeline/operators/index.js';
import { executeAgentAction } from '../src/services/agentTools.js';

describe('Pluggable Operator Architecture & Pipeline Templates', () => {
  const testProjectId = 'proj_test_operator_pipeline';

  before(async () => {
    await storage.init();
    await storage.saveProject({
      id: testProjectId,
      title: 'AIGC 视觉神话短剧',
      category: '零素材AIGC',
      game: '黑神话：悟空'
    });
  });

  after(async () => {
    try {
      await storage.deleteProject(testProjectId);
    } catch (e) {}
  });

  it('should list all registered pipeline operators with full metadata', () => {
    const operators = listAllOperators();
    assert.ok(operators.length >= 7, 'should have at least 7 atomic operators');

    const opIds = operators.map(o => o.id);
    assert.ok(opIds.includes('media_scan_perception'));
    assert.ok(opIds.includes('audio_beat_detection'));
    assert.ok(opIds.includes('script_storyboard_planning'));
    assert.ok(opIds.includes('semantic_clip_matching'));
    assert.ok(opIds.includes('jianying_draft_synthesis'));
    assert.ok(opIds.includes('aigc_image_generation'));
    assert.ok(opIds.includes('ttsVoiceoverOperator'.toLowerCase()) || opIds.includes('tts_voiceover_synthesis'));

    // Check operator resolving by id and aliases
    const opByStep1 = getOperator('step_1');
    assert.ok(opByStep1);
    assert.equal(opByStep1.id, 'media_scan_perception');

    const opByStepAigc = getOperator('step_aigc_image');
    assert.ok(opByStepAigc);
    assert.equal(opByStepAigc.id, 'aigc_image_generation');

    const resolvedStage = resolveOperatorForStage({ id: 'custom_step', operatorId: 'aigc_image_generation' });
    assert.ok(resolvedStage);
    assert.equal(resolvedStage.id, 'aigc_image_generation');
  });

  it('should list and retrieve standard pipeline templates', () => {
    const templates = getAllPipelineTemplates();
    assert.ok(templates.length >= 4, 'should provide at least 4 production templates');

    const templateIds = templates.map(t => t.id);
    assert.ok(templateIds.includes('template_tutorial_guide'));
    assert.ok(templateIds.includes('template_gameplay_highlight'));
    assert.ok(templateIds.includes('template_aigc_storyboard'));
    assert.ok(templateIds.includes('template_video_commentary'));

    const aigcTemplate = getPipelineTemplateById('template_aigc_storyboard');
    assert.ok(aigcTemplate);
    assert.equal(aigcTemplate.category, '零素材AIGC');
    assert.equal(aigcTemplate.stages.length, 4);

    const instantiated = instantiatePipelineStages('template_aigc_storyboard');
    assert.equal(instantiated.length, 4);
    assert.equal(instantiated[0].operatorId, 'script_storyboard_planning');
    assert.equal(instantiated[1].operatorId, 'aigc_image_generation');
    assert.equal(instantiated[2].operatorId, 'tts_voiceover_synthesis');
    assert.equal(instantiated[3].operatorId, 'jianying_draft_synthesis');
  });

  it('should switch project pipeline template via applyPipelineTemplate', async () => {
    const switchedPipeline = await applyPipelineTemplate(testProjectId, 'template_aigc_storyboard');
    assert.equal(switchedPipeline.templateId, 'template_aigc_storyboard');
    assert.equal(switchedPipeline.templateName, 'AIGC 零素材口播生图流');
    assert.equal(switchedPipeline.stages.length, 4);

    const savedPipeline = await storage.getPipeline(testProjectId);
    assert.equal(savedPipeline.templateId, 'template_aigc_storyboard');
    assert.equal(savedPipeline.stages.length, 4);
  });

  it('should execute AIGC image generation operator and populate visual assets', async () => {
    // Stage 2 is step_aigc_generation (operatorId: aigc_image_generation)
    const result = await executePipelineStep(testProjectId, 'step_aigc_generation', {
      stylePreset: '8K国风写实概念原画'
    });

    assert.equal(result.success, true);
    assert.ok(result.outputOverview.generatedShots > 0);
    assert.equal(result.outputOverview.stylePreset, '8K国风写实概念原画');

    const assets = await storage.getAssets(testProjectId);
    assert.ok(assets.length > 0);
    const aigcAsset = assets.find(a => a.id.startsWith('img_aigc_'));
    assert.ok(aigcAsset, 'should have registered generated AIGC image assets');
    assert.equal(aigcAsset.mediaType, 'image');

    const storyboard = await storage.getStoryboard(testProjectId);
    assert.ok(storyboard.length > 0);
    assert.ok(storyboard[0].matchedClipId.startsWith('img_aigc_'));
  });

  it('should execute TTS voiceover operator and align timestamps', async () => {
    // Stage 3 is step_aigc_tts (operatorId: tts_voiceover_synthesis)
    const result = await executePipelineStep(testProjectId, 'step_aigc_tts', {
      speechRate: 4.2
    });

    assert.equal(result.success, true);
    assert.ok(result.outputOverview.totalVoiceClips > 0);
    assert.ok(result.outputOverview.totalDurationSec > 0);

    const storyboard = await storage.getStoryboard(testProjectId);
    assert.ok(storyboard[0].durationSec > 0);
    assert.ok(storyboard[0].timeRange.includes('-'));
    assert.ok(storyboard[0].audioTrack);
    assert.equal(storyboard[0].audioTrack.status, 'synthesized');
  });

  it('should allow agents to query and apply pipeline templates via agentTools', async () => {
    // 1. list_pipeline_templates tool
    const listRes = await executeAgentAction(testProjectId, 'list_pipeline_templates', {});
    assert.equal(listRes.success, true);
    assert.ok(Array.isArray(listRes.templates));
    assert.ok(listRes.templates.length >= 4);

    // 2. apply_pipeline_template tool
    const applyRes = await executeAgentAction(testProjectId, 'apply_pipeline_template', {
      templateId: 'template_gameplay_highlight'
    });

    assert.equal(applyRes.success, true);
    assert.equal(applyRes.templateId, 'template_gameplay_highlight');
    assert.equal(applyRes.templateName, '游戏高能卡点混剪流');
    assert.equal(applyRes.pipeline.stages.length, 4);

    const curPipeline = await storage.getPipeline(testProjectId);
    assert.equal(curPipeline.templateId, 'template_gameplay_highlight');
  });
});
