import test from 'node:test';
import assert from 'node:assert/strict';
import { getOperator } from '../src/pipeline/operators/index.js';
import { getPipelineTemplateById } from '../src/pipeline/templates.js';
import { storage } from '../src/storage/index.js';
import { ARTIFACT_KINDS, TASK_TYPES } from '../src/core/contracts/enums.js';
import { defaultMCPHub } from '../src/runtime/mcpHub.js';
import { registerLocalVideoTools } from '../src/runtime/registerLocalTools.js';

test('Code-as-Video Motion Scene Synthesis Operator & Pipeline Template', async (t) => {
  await t.test('1. motion_scene_synthesis 算子应成功注册且元数据完备', () => {
    const op = getOperator('motion_scene_synthesis');
    assert.ok(op, '算子应存在');
    assert.equal(op.id, 'motion_scene_synthesis');
    assert.equal(op.agentId, 'code-motion-engineer');
    assert.ok(op.inputs.includes('storyboard'));
    assert.ok(op.outputs.includes('motion_manifest'));
  });

  await t.test('2. template_code_motion_explainer 模板应包含完整动效流水线阶段', () => {
    const tpl = getPipelineTemplateById('template_code_motion_explainer');
    assert.ok(tpl, '动效模板应存在');
    assert.equal(tpl.category, '代码动效');
    assert.equal(tpl.stages.length, 4);
    assert.equal(tpl.stages[2].operatorId, 'motion_scene_synthesis');
  });

  await t.test('3. motionSceneOperator 应基于空分镜自动推演并装配 4 幕标准动效组件', async (subT) => {
    const testProjectId = `test_motion_proj_${Date.now()}`;
    subT.after(async () => {
      await storage.deleteProject(testProjectId).catch(() => {});
    });
    await storage.saveProject({ id: testProjectId, title: 'AI 确定性动效解说测试', category: '科技' });
    await storage.saveStoryboard(testProjectId, []);

    const op = getOperator('motion_scene_synthesis');
    const logs = [];
    const result = await op.execute({
      projectId: testProjectId,
      project: { id: testProjectId, title: 'AI 确定性动效解说测试', category: '科技' },
      options: { fps: 30 },
      emitLog: (msg) => logs.push(msg)
    });

    assert.ok(result.motionManifest, '应输出 motionManifest');
    assert.equal(result.motionManifest.scenes.length, 4, '应生成 4 幕动效');
    assert.equal(result.outputOverview.engine, 'Remotion React (Code-as-Video)');

    const sceneTypes = result.motionManifest.scenes.map(s => s.componentType);
    assert.ok(sceneTypes.includes('KineticTypography'), '应包含动态大字');
    assert.ok(sceneTypes.includes('ArchitectureFlow'), '应包含架构流转');
    assert.ok(sceneTypes.includes('DataChart'), '应包含数据图表');
    assert.ok(sceneTypes.includes('TechTerminal'), '应包含科技终端');

    // 验证 storage 持久化
    const saved = await storage.getMotionManifest(testProjectId);
    assert.ok(saved, 'motion_manifest 应持久化');
    assert.equal(saved.scenes.length, 4);
  });

  await t.test('4. 核心契约与枚举应已纳管 motion 领域产物与任务类型', () => {
    assert.ok(ARTIFACT_KINDS.includes('motion_manifest'), 'ARTIFACT_KINDS 应包含 motion_manifest');
    assert.ok(ARTIFACT_KINDS.includes('motion_scene'), 'ARTIFACT_KINDS 应包含 motion_scene');
    assert.ok(ARTIFACT_KINDS.includes('motion_preview'), 'ARTIFACT_KINDS 应包含 motion_preview');

    assert.ok(TASK_TYPES.includes('motion_plan'), 'TASK_TYPES 应包含 motion_plan');
    assert.ok(TASK_TYPES.includes('motion_code'), 'TASK_TYPES 应包含 motion_code');
    assert.ok(TASK_TYPES.includes('motion_render'), 'TASK_TYPES 应包含 motion_render');
  });

  await t.test('5. 本地工具应支持 get_motion_components_catalog 与 get_motion_manifest', async (subT) => {
    registerLocalVideoTools(defaultMCPHub);

    const catalogTool = defaultMCPHub.localTools.get('get_motion_components_catalog');
    assert.ok(catalogTool, '应注册 get_motion_components_catalog 工具');
    const catalog = await defaultMCPHub.callTool('get_motion_components_catalog', {});
    assert.equal(catalog.engine, 'Remotion React (Code-as-Video)');
    assert.equal(catalog.components.length, 4);

    const testProjectId = `test_motion_tool_${Date.now()}`;
    subT.after(async () => {
      await storage.deleteProject(testProjectId).catch(() => {});
    });
    await storage.saveMotionManifest(testProjectId, {
      projectId: testProjectId,
      version: 1,
      scenes: [{ id: 's1', componentType: 'TechTerminal' }]
    });

    const manifestRes = await defaultMCPHub.callTool('get_motion_manifest', {}, { projectId: testProjectId });
    assert.ok(manifestRes);
    assert.equal(manifestRes.scenes.length, 1);
  });
});
