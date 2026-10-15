/**
 * Task(DAG 顶点)与 TaskPolicy / Budget / Usage 契约。
 */
import { TASK_TYPES, TASK_STATUSES, AUTONOMY_LEVELS, FAILURE_ACTIONS } from './enums.js';
import { ARTIFACT_REF_SCHEMA } from './artifact.js';

export const BUDGET_SCHEMA = {
  type: 'object',
  properties: {
    maxTokens: { type: 'integer' },
    maxCost: { type: 'number' },
    maxSeconds: { type: 'integer' },
    maxGpuSeconds: { type: 'integer' }
  }
};

export const USAGE_SCHEMA = {
  type: 'object',
  required: ['tokens', 'cost', 'seconds', 'gpuSeconds'],
  properties: {
    tokens: { type: 'integer' },
    cost: { type: 'number' },
    seconds: { type: 'number' },
    gpuSeconds: { type: 'number' }
  }
};

export const TASK_POLICY_SCHEMA = {
  type: 'object',
  properties: {
    autonomy: { type: 'string', enum: AUTONOMY_LEVELS },
    qualityGateId: { type: 'string' },
    budget: BUDGET_SCHEMA,
    timeoutMs: { type: 'integer' },
    maxAttempts: { type: 'integer' },
    onFailure: { type: 'string', enum: FAILURE_ACTIONS },
    concurrencyGroup: { type: 'string' },
    priority: { type: 'integer' }
  }
};

export const TASK_SCHEMA = {
  type: 'object',
  required: ['id', 'runId', 'projectId', 'type', 'dependsOn', 'inputRefs', 'produces', 'policy', 'status'],
  properties: {
    id: { type: 'string', minLength: 1 },
    runId: { type: 'string', minLength: 1 },
    projectId: { type: 'string', minLength: 1 },
    title: { type: 'string' },
    description: { type: 'string' },
    type: { type: 'string', enum: TASK_TYPES },
    operatorId: { type: 'string' },
    agentId: { type: 'string' },
    dependsOn: { type: 'array', items: { type: 'string' } },
    inputRefs: { type: 'array', items: ARTIFACT_REF_SCHEMA },
    produces: { type: 'array', items: { type: 'string' } },
    policy: TASK_POLICY_SCHEMA,
    status: { type: 'string', enum: TASK_STATUSES },
    attempts: { type: 'integer' },
    progress: { type: 'number' },
    resultRef: ARTIFACT_REF_SCHEMA,
    usage: USAGE_SCHEMA,
    error: { type: 'object' },
    checkpointRef: { type: 'string' }
  }
};

/** 空用量 */
export function emptyUsage() {
  return { tokens: 0, cost: 0, seconds: 0, gpuSeconds: 0 };
}

/** 默认任务策略(注意:不注入 autonomy —— 任务未显式指定时跟随 run.autonomy,
 *  见 policy/autonomy.js resolveAutonomy;显式设置的 task.policy.autonomy 优先) */
export function defaultTaskPolicy(overrides = {}) {
  return {
    timeoutMs: 120000,
    maxAttempts: 2,
    onFailure: 'escalate',
    ...overrides
  };
}

/**
 * 创建规范化 Task 实例。
 */
export function createTask({
  id,
  runId,
  projectId,
  title = '',
  description = '',
  type = 'custom',
  operatorId,
  agentId,
  dependsOn = [],
  inputRefs = [],
  produces = [],
  policy = {},
  mock = null,
  status = 'pending'
}) {
  return {
    id,
    runId,
    projectId,
    title,
    description,
    type,
    operatorId: operatorId || null,
    agentId: agentId || null,
    dependsOn: [...dependsOn],
    inputRefs: [...inputRefs],
    produces: [...produces],
    mock,
    policy: defaultTaskPolicy(policy),
    status,
    attempts: 0,
    progress: 0,
    resultRef: null,
    usage: emptyUsage(),
    error: null,
    checkpointRef: null
  };
}
