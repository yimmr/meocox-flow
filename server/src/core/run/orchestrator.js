/**
 * Orchestrator:把「模板 / 自定义 DAG」物化为 Run + Tasks,并驱动调度器执行。
 *
 * 这是 legacy `routes/tasks.js`(run-step / run-all)将来统一转发的目标:
 *   legacy 动作 -> orchestrator -> SchedulerRuntime -> EventBus(落盘)
 */
import { storage } from '../../storage/index.js';
import { ulid } from '../contracts/ids.js';
import { createRun, createTask, RUN_SCHEMA, TASK_SCHEMA, assertValid } from '../contracts/index.js';
import { getPipelineTemplateById } from '../../pipeline/templates.js';
import { getOperator, resolveOperatorForStage } from '../../pipeline/operators/index.js';
import { defaultArtifactStore } from '../artifacts/store.js';
import { defaultEventBus } from '../bus/eventBus.js';
import { defaultBlackboardStore } from '../blackboard/store.js';
import { SchedulerRuntime } from '../scheduler/runtime.js';
import { validateDag } from '../scheduler/dag.js';
import { OUTPUT_KIND_MAP } from '../scheduler/executors/operatorExecutor.js';
import { assertSafePathSegment } from '../../utils/safePath.js';

function invalidPipeline(message) {
  return Object.assign(new Error(message), { code: 'INVALID_PIPELINE' });
}

/** 由算子 outputs / 显式声明推导产物种类 */
function deriveProduces(stage) {
  const op = resolveOperatorForStage(stage) || getOperator(stage.operatorId);
  const fromOp = (op?.outputs || []).map((o) => OUTPUT_KIND_MAP[o]).filter(Boolean);
  return stage.produces?.length ? stage.produces : fromOp;
}

/** 由算子推断任务类型 */
function deriveTaskType(stage) {
  if (stage.type) return stage.type;
  const op = resolveOperatorForStage(stage) || getOperator(stage.operatorId);
  const out = op?.outputs?.[0];
  const map = {
    assets: 'scan',
    storyboard: 'script',
    prompts: 'render',
    images: 'render',
    voiceover: 'tts',
    clip_match: 'match',
    timeline_manifest: 'synthesize',
    jianying_draft: 'synthesize'
  };
  return map[out] || 'custom';
}

/**
 * 把模板 stage 列表物化为 Task 列表(带 dependsOn DAG 边)。
 * @returns {object[]}
 */
export function buildTasksFromStages({ projectId, runId, stages, decorate = null }) {
  return stages.map((stg) => {
    const operator = resolveOperatorForStage(stg) || getOperator(stg.operatorId);
    const task = createTask({
      id: stg.id,
      runId,
      projectId,
      title: stg.name || operator?.name || stg.id,
      description: stg.description || '',
      type: deriveTaskType(stg),
      operatorId: operator?.id || stg.operatorId,
      agentId: stg.agentId || operator?.agentId,
      dependsOn: stg.dependsOn || [],
      produces: deriveProduces(stg),
      policy: stg.policy || {},
      mock: stg.mock || null
    });
    return decorate ? (decorate(task, stg) || task) : task;
  });
}

/**
 * 创建一次 Run(不执行)。
 * @param {{projectId:string, templateId?:string, autonomy?:string, runId?:string}} input
 * @returns {Promise<{run:object, tasks:object[]}>}
 */
export async function createRunFromTemplate({
  projectId,
  templateId = 'template_tutorial_guide',
  autonomy = 'L2',
  runId,
  decorate = null
}) {
  const template = getPipelineTemplateById(templateId);
  if (!template) throw new Error(`未找到流水线模板: ${templateId}`);

  return createRunFromStages({
    projectId,
    templateId,
    stages: template.stages || [],
    autonomy,
    runId,
    decorate
  });
}

/**
 * 将现有项目流水线或调用方提供的阶段物化为规范 Run + Tasks。
 */
export async function createRunFromStages({
  projectId,
  templateId = 'template_custom',
  stages = [],
  autonomy = 'L2',
  runId,
  decorate = null
}) {
  if (!Array.isArray(stages)) {
    throw invalidPipeline('流水线阶段必须为数组');
  }
  if (stages.length === 0 && templateId !== 'template_custom') {
    throw invalidPipeline('流水线至少需要一个阶段');
  }
  const id = runId || ulid('run');
  try { assertSafePathSegment(id, 'runId'); }
  catch (error) { throw invalidPipeline(error.message); }
  if (stages.some((stage) => !stage || typeof stage !== 'object' || typeof stage.id !== 'string')) {
    throw invalidPipeline('每个流水线阶段都必须包含有效的 id');
  }
  if (stages.some((stage) =>
    (stage.dependsOn !== undefined && !Array.isArray(stage.dependsOn)) ||
    (stage.produces !== undefined && !Array.isArray(stage.produces)) ||
    (stage.policy !== undefined && (!stage.policy || typeof stage.policy !== 'object' || Array.isArray(stage.policy)))
  )) {
    throw invalidPipeline('dependsOn、produces 和 policy 必须使用有效的数据类型');
  }
  const tasks = buildTasksFromStages({ projectId, runId: id, stages, decorate });
  const dag = validateDag(tasks);
  if (!dag.valid) throw invalidPipeline(`DAG 非法: ${dag.errors.join('; ')}`);
  try {
    for (const task of tasks) assertSafePathSegment(task.id, 'taskId');
  } catch (error) {
    throw invalidPipeline(error.message);
  }

  const run = createRun({
    id,
    projectId,
    templateId,
    autonomy,
    taskIds: tasks.map((t) => t.id)
  });

  assertValid(RUN_SCHEMA, run, 'Run');
  for (const t of tasks) assertValid(TASK_SCHEMA, t, 'Task');

  await storage.saveRun(projectId, run);
  for (const t of tasks) await storage.saveTask(projectId, id, t);

  return { run, tasks };
}

/**
 * 从已落盘的 Run 恢复 Tasks(断点续跑的基础)。
 */
export async function loadRun(projectId, runId) {
  const run = await storage.getRun(projectId, runId);
  if (!run) throw new Error(`未找到 Run: ${runId}`);
  const tasks = await storage.listTasks(projectId, runId);
  return { run, tasks };
}

/**
 * 执行一个已创建的 Run。
 * @param {{projectId:string, runId:string, executor:object, concurrency?:number, bus?:object, artifactStore?:object}} input
 */
export async function executeRun({
  projectId,
  runId,
  executor,
  concurrency = 3,
  bus = defaultEventBus,
  artifactStore = defaultArtifactStore,
  blackboard = defaultBlackboardStore
}) {
  const { run, tasks } = await loadRun(projectId, runId);
  const runtime = new SchedulerRuntime({ bus, storage, artifactStore, executor, concurrency, blackboard });
  return runtime.execute({ run, tasks });
}

/**
 * 一步到位:建 Run + 执行。
 */
export async function runTemplate({
  projectId,
  templateId,
  autonomy = 'L2',
  executor,
  concurrency = 3,
  decorate = null
}) {
  const { run, tasks } = await createRunFromTemplate({ projectId, templateId, autonomy, decorate });
  const runtime = new SchedulerRuntime({
    bus: defaultEventBus,
    storage,
    artifactStore: defaultArtifactStore,
    executor,
    concurrency,
    blackboard: defaultBlackboardStore
  });
  return runtime.execute({ run, tasks });
}
