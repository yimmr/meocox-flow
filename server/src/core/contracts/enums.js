/**
 * 全内核共用的枚举常量。
 *
 * 单一真相源:所有 schema、工厂、校验都从这里取枚举,
 * 避免各处硬编码字符串导致漂移。
 */

/** 任务节点类型(DAG 顶点语义) */
export const TASK_TYPES = [
  'scan', 'script', 'render', 'tts', 'match', 'synthesize', 'gate', 'human', 'custom',
  'motion_plan', 'motion_code', 'motion_render'
];

/** 任务状态机 */
export const TASK_STATUSES = [
  'pending', 'ready', 'running', 'blocked', 'succeeded', 'failed', 'stale', 'skipped'
];

/** Run 状态机 */
export const RUN_STATUSES = [
  'idle', 'planning', 'running', 'paused', 'blocked', 'completed', 'failed', 'aborted'
];

/** 自主等级 */
export const AUTONOMY_LEVELS = ['L1', 'L2', 'L3'];

/** 产物状态 */
export const ARTIFACT_STATUSES = ['draft', 'approved', 'stale', 'superseded'];

/**
 * 产物种类注册表(与算子 inputs/outputs 对齐)。
 * 内置类型覆盖当前多媒体通用对象；扩展包可在注册算子前追加领域类型。
 */
export const ARTIFACT_KINDS = [
  'asset_index',
  'media_analysis',
  'transcript',
  'document_extract',
  'audio_rhythm',
  'storyboard',
  'prompt_batch',
  'image_set',
  'audio_track',
  'voiceover',
  'clip_match',
  'timeline_manifest',
  'video_render',
  'jianying_draft',
  'report',
  'motion_manifest',
  'motion_scene',
  'motion_preview'
];

/** Register a domain-specific artifact kind before it is validated or produced. */
export function registerArtifactKind(kind) {
  if (typeof kind !== 'string' || !/^[a-z][a-z0-9_.-]{0,63}$/.test(kind)) {
    throw new Error('artifact kind must be a lowercase identifier');
  }
  if (!ARTIFACT_KINDS.includes(kind)) ARTIFACT_KINDS.push(kind);
  return kind;
}

/** 事件类型目录(总线原子单元) */
export const EVENT_TYPES = [
  // run.*
  'run.created', 'run.started', 'run.paused', 'run.blocked',
  'run.completed', 'run.failed', 'run.rolledback', 'run.aborted',
  // task.*
  'task.ready', 'task.started', 'task.progress', 'task.log',
  'task.succeeded', 'task.failed', 'task.stale', 'task.retrying',
  // artifact.*
  'artifact.produced', 'artifact.updated', 'artifact.approved',
  'artifact.stale', 'artifact.superseded',
  // squad.*
  'squad.spawned', 'squad.completed', 'squad.reclaimed',
  // crosstalk.*
  'crosstalk.opened', 'crosstalk.resolved',
  // escalation.*
  'escalation.opened', 'escalation.resolved', 'escalation.expired',
  // change.*
  'change.requested', 'change.accepted', 'change.applied', 'change.rejected',
  // decision.*
  'decision.received', 'decision.applied',
  // blackboard.*
  'blackboard.read', 'blackboard.written',
  // gate.*
  'gate.passed', 'gate.failed',
  // budget.*
  'budget.tick', 'budget.exceeded',
  // checkpoint.*
  'checkpoint.created'
];

/** 事件发起方类型 */
export const ACTOR_KINDS = ['agent', 'boss', 'system', 'operator'];

/** 升级严重级 */
export const ESCALATION_SEVERITIES = ['info', 'warn', 'block'];

/** 裁决意图(杜绝静默改写产物) */
export const DECISION_INTENTS = ['approve', 'reject', 'modify', 'selectOption', 'instruct'];

/** 变更单(返工)状态 */
export const CHANGE_REQUEST_STATUSES = ['open', 'accepted', 'rejected', 'applied'];

/** 任务失败处理策略 */
export const FAILURE_ACTIONS = ['retry', 'escalate', 'degrade', 'skip', 'abort'];
