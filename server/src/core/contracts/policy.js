/**
 * 治理策略契约:QualityGate / Autonomy / Checkpoint。
 */
import { ARTIFACT_KINDS, AUTONOMY_LEVELS } from './enums.js';
import { ulid } from './ids.js';
import { assertValid } from './validate.js';

export const GATE_RULE_SCHEMA = {
  type: 'object',
  required: ['id', 'metric', 'op'],
  properties: {
    id: { type: 'string', minLength: 1 },
    metric: { type: 'string', minLength: 1 },
    op: { type: 'string', enum: ['>=', '<=', '==', '!=', 'contains', 'regex', 'custom'] },
    value: { type: 'any' },
    severity: { type: 'string', enum: ['info', 'warn', 'block'] }
  }
};

export const QUALITY_GATE_SCHEMA = {
  type: 'object',
  required: ['id', 'appliesTo', 'rules'],
  properties: {
    id: { type: 'string', minLength: 1 },
    appliesTo: { type: 'string', enum: ARTIFACT_KINDS },
    rules: { type: 'array', items: GATE_RULE_SCHEMA },
    onPass: { type: 'string', enum: ['advance', 'notify'] },
    onFail: { type: 'string', enum: ['retry', 'escalate', 'autoFix'] }
  }
};

export const AUTONOMY_SCHEMA = {
  type: 'object',
  required: ['level'],
  properties: {
    level: { type: 'string', enum: AUTONOMY_LEVELS },
    sensitiveTools: { type: 'array', items: { type: 'string' } },
    autoApprove: { type: 'array', items: { type: 'string' } }
  }
};

export const CHECKPOINT_SCHEMA = {
  type: 'object',
  required: ['id', 'runId', 'seq', 'ts', 'label', 'runSnapshot', 'taskSnapshots'],
  properties: {
    id: { type: 'string', minLength: 1 },
    runId: { type: 'string', minLength: 1 },
    seq: { type: 'integer' },
    ts: { type: 'integer' },
    label: { type: 'string' },
    runSnapshot: { type: 'object' },
    taskSnapshots: { type: 'object' },
    artifactRefs: { type: 'array', items: { type: 'object' } }
  }
};

/** 默认自治策略 */
export function defaultAutonomy(level = 'L2') {
  return {
    level,
    sensitiveTools: ['fs.write_atomic_json', 'comfy-mcp.run_workflow'],
    autoApprove: []
  };
}

/**
 * 创建质检闸门(任务产出后自动判定:达标放行,未达标按 onFail 处置)。
 * @throws {Error} 契约不合法时
 */
export function createQualityGate({ id, appliesTo, rules = [], onPass = 'advance', onFail = 'escalate' }) {
  const gate = {
    id: id || ulid('gate'),
    appliesTo,
    rules: [...rules],
    onPass,
    onFail
  };
  return assertValid(QUALITY_GATE_SCHEMA, gate, 'QualityGate');
}