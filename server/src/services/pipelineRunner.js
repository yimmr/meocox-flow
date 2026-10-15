import { storage, requireProjectId } from '../storage/index.js';
import { resolveOperatorForStage, getOperator, listAllOperators } from '../pipeline/operators/index.js';
import { 
  getAllPipelineTemplates, 
  getPipelineTemplateById, 
  instantiatePipelineStages 
} from '../pipeline/templates.js';

function formatLogTime() {
  const d = new Date();
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

/**
 * 工业级动态流水线分步执行引擎（算子驱动模式）
 */
export async function executePipelineStep(projectId, stageId, options = {}) {
  const pId = requireProjectId(projectId, 'unknown');
  const project = (await storage.getProject(pId)) || {};
  let pipeline = (await storage.getPipeline(pId)) || {};

  if (!pipeline.stages || pipeline.stages.length === 0) {
    pipeline.stages = getDefaultDistributedPipeline().stages;
    pipeline.templateId = 'template_tutorial_guide';
    pipeline.templateName = '保姆级攻略解说教学流';
  }

  const stages = pipeline.stages || [];
  let stage = stages.find(s => s.id === stageId);
  if (!stage) {
    stage = stages.find(s => s.operatorId === stageId);
  }

  const startTime = Date.now();
  const logs = [];

  const addLog = (text, type = 'info') => {
    const entry = {
      time: formatLogTime(),
      text,
      type
    };
    logs.push(entry);
    return entry;
  };

  const stageDisplayName = stage?.name || stageId;
  addLog(`[调度中心] 启动流水线阶段「${stageDisplayName}」...`, 'info');

  try {
    // 1. 动态寻址对应算子（Operator Resolver）
    const operator = resolveOperatorForStage(stage) || getOperator(stageId);
    if (!operator) {
      throw new Error(`未找到流水线阶段「${stageId}」对应的可执行算子。可用算子: ${listAllOperators().map(o => o.id).join(', ')}`);
    }

    addLog(`[算子装载] 挂载执行算子: ${operator.name} (${operator.id}) [责任Agent: ${operator.agentName || operator.agentId}]`, 'info');

    // 2. 调度算子微内核执行
    const execResult = await operator.execute({
      projectId: pId,
      project,
      stage,
      options,
      emitLog: addLog
    });

    const outputOverview = execResult?.outputOverview || {};
    const details = execResult?.details || `阶段「${stageDisplayName}」已顺利执行完毕`;

    // 3. 统计耗时与阶段状态回填
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    addLog(`[调度中心] 阶段「${stageDisplayName}」执行完成，耗时 ${durationSec} 秒`, 'success');

    if (stage) {
      stage.status = 'completed';
      stage.progress = 100;
      stage.details = details;
      stage.outputOverview = outputOverview;
      stage.logs = logs;
      stage.completedAt = Date.now();
      stage.durationSec = Number(durationSec);
      if (operator.agentId) stage.agentId = operator.agentId;
      if (operator.agentName) stage.agentName = operator.agentName;
      if (operator.skillId) stage.skillId = operator.skillId;
    }

    // 4. 计算并同步全流程总进度
    const totalProg = pipeline.stages.reduce((acc, s) => acc + (s.progress || 0), 0);
    pipeline.overallProgress = Math.round(totalProg / pipeline.stages.length);
    await storage.savePipeline(pId, pipeline);

    return {
      success: true,
      stageId,
      stage,
      outputOverview,
      logs,
      details,
      durationSec,
      pipeline
    };

  } catch (err) {
    addLog(`[错误] 阶段执行异常: ${err.message}`, 'error');
    if (stage) {
      stage.status = 'failed';
      stage.details = `执行失败: ${err.message}`;
      stage.logs = logs;
      await storage.savePipeline(pId, pipeline);
    }
    throw err;
  }
}

/**
 * 为项目应用指定的流水线模版
 */
export async function applyPipelineTemplate(projectId, templateId) {
  const pId = requireProjectId(projectId, 'addLog');
  const tpl = getPipelineTemplateById(templateId) || getPipelineTemplateById('template_tutorial_guide');
  const stages = instantiatePipelineStages(tpl.id);
  const pipeline = {
    templateId: tpl.id,
    templateName: tpl.name,
    category: tpl.category,
    currentStage: stages[0]?.id || 'STEP_1',
    overallProgress: 0,
    stages
  };
  await storage.savePipeline(pId, pipeline);
  return pipeline;
}

/**
 * 获取标准 5 步分步式流水线模板（向后兼容）
 */
export function getDefaultDistributedPipeline() {
  const tpl = getPipelineTemplateById('template_tutorial_guide');
  return {
    templateId: tpl.id,
    templateName: tpl.name,
    currentStage: 'STEP_1',
    overallProgress: 0,
    stages: instantiatePipelineStages(tpl.id)
  };
}

export { 
  getAllPipelineTemplates, 
  getPipelineTemplateById, 
  instantiatePipelineStages,
  listAllOperators
};
