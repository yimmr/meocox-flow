import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MCPHub } from '../../src/runtime/mcpHub.js';
import { registerLocalVideoTools } from '../../src/runtime/registerLocalTools.js';
import { createProject, deleteProject } from '../../src/engine/index.js';

describe('Local Video Tools Registration & Envelope Compliance', () => {
  let hub;
  let testProjectId;

  before(async () => {
    hub = new MCPHub();
    registerLocalVideoTools(hub);

    const projRes = await createProject({ title: 'EnvelopeComplianceTest' });
    testProjectId = projRes.data.id;
  });

  after(async () => {
    if (testProjectId) {
      await deleteProject(testProjectId).catch(() => {});
    }
  });

  it('1. should register core video tools into MCPHub', () => {
    assert.equal(hub.hasTool('inspect_video_content'), true);
    assert.equal(hub.hasTool('update_storyboard'), true);
    assert.equal(hub.hasTool('export_jianying_draft'), true);
    assert.equal(hub.hasTool('update_project_meta'), true);
    assert.equal(hub.hasTool('run_pipeline_step'), true);
    assert.equal(hub.hasTool('run_pipeline'), true);
    assert.equal(hub.hasTool('get_pipeline_status'), true);
    assert.equal(hub.hasTool('list_pipeline_templates'), true);
    assert.equal(hub.hasTool('apply_pipeline_template'), true);
    assert.equal(hub.hasTool('get_motion_components_catalog'), true);
    assert.equal(hub.hasTool('synthesize_procedural_sfx'), true);
    assert.equal(hub.hasTool('report_capability_gap'), true);
    assert.equal(hub.hasTool('generate_image'), true);
  });

  it('2. update_project_meta should return standard Envelope specification', async () => {
    const res = await hub.executeTool('update_project_meta', {
      title: '神话卡点实机拆解',
      category: '游戏攻略'
    }, { projectId: testProjectId });

    assert.equal(res.success, true);
    assert.ok(typeof res.summary === 'string');
    assert.ok(res.summary.includes('项目基本信息已更新'));
    assert.ok(res.data && res.data.project);
    assert.equal(res.data.project.title, '神话卡点实机拆解');
    assert.ok(Array.isArray(res.artifacts));
    assert.equal(res.error, null);
  });

  it('3. update_storyboard should return standard Envelope with storyboard artifacts', async () => {
    const items = [
      { order: 1, title: '开场蓄力', scriptText: '黄金3秒开场', durationSec: 3.5 },
      { order: 2, title: '识破反击', scriptText: '高能定身劈棍', durationSec: 4.2 }
    ];

    const res = await hub.executeTool('update_storyboard', { items }, { projectId: testProjectId });

    assert.equal(res.success, true);
    assert.ok(res.summary.includes('已保存 2 幕分镜'));
    assert.equal(res.data.count, 2);
    assert.ok(Array.isArray(res.artifacts));
    assert.equal(res.artifacts.length, 1);
    assert.equal(res.artifacts[0].type, 'storyboard');
    assert.equal(res.artifacts[0].badge, '2 幕');
    assert.equal(res.error, null);
  });

  it('4. list_pipeline_templates should return standard Envelope with template catalog', async () => {
    const res = await hub.executeTool('list_pipeline_templates', {});

    assert.equal(res.success, true);
    assert.ok(res.summary.includes('预置任务流水线模板'));
    assert.ok(Array.isArray(res.data.templates));
    assert.ok(res.data.templates.length >= 3);
    assert.ok(Array.isArray(res.artifacts));
  });

  it('5. get_motion_components_catalog should return standard Envelope with Remotion component schema', async () => {
    const res = await hub.executeTool('get_motion_components_catalog', {});

    assert.equal(res.success, true);
    assert.ok(res.summary.includes('4 大原子确定性代码动效组件库'));
    assert.equal(res.data.engine, 'Remotion React (Code-as-Video)');
    assert.equal(res.data.components.length, 4);
  });

  it('6. synthesize_procedural_sfx should return standard Envelope with audio artifacts and zero-royalty license', async () => {
    const res = await hub.executeTool('synthesize_procedural_sfx', {
      type: 'whoosh'
    }, { projectId: testProjectId });

    assert.equal(res.success, true);
    assert.ok(res.summary.includes('whoosh'));
    assert.ok(res.data.audioPath);
    assert.ok(res.data.license.includes('CC0'));
    assert.ok(Array.isArray(res.artifacts));
    assert.equal(res.artifacts[0].type, 'audio');
    assert.ok(res.artifacts[0].path);
  });

  it('7. report_capability_gap should return standard Envelope with RFC ticket payload', async () => {
    const res = await hub.executeTool('report_capability_gap', {
      gapType: 'skill',
      reason: '需要多轨音频侧链下压规约',
      suggestedName: 'sidechain-ducking'
    }, { projectId: testProjectId });

    assert.equal(res.success, true);
    assert.ok(res.summary.includes('sidechain-ducking'));
    assert.ok(res.data.ticketId.startsWith('rfc_'));
    assert.equal(res.data.status, 'pending_user_confirmation');
    assert.ok(Array.isArray(res.artifacts));
  });
});
