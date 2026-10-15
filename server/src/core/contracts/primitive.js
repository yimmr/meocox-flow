/**
 * 协作原语契约:ChangeRequest / Escalation / Decision。
 */
import { ESCALATION_SEVERITIES, DECISION_INTENTS, CHANGE_REQUEST_STATUSES } from './enums.js';
import { ulid } from './ids.js';
import { assertValid } from './validate.js';

export const IMPACT_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    affectedTasks: { type: 'array', items: { type: 'string' } },
    affectedArtifacts: { type: 'array', items: { type: 'object' } },
    recomputeSet: { type: 'array', items: { type: 'string' } },
    estimatedCost: { type: 'object' }
  }
};

export const CHANGE_REQUEST_SCHEMA = {
  type: 'object',
  required: ['id', 'runId', 'projectId', 'reason', 'scope', 'status'],
  properties: {
    id: { type: 'string', minLength: 1 },
    runId: { type: 'string', minLength: 1 },
    projectId: { type: 'string', minLength: 1 },
    source: { type: 'object' },
    target: { type: 'object' },
    reason: { type: 'string', minLength: 1 },
    scope: {
      type: 'object',
      required: ['artifactId', 'version'],
      properties: {
        artifactId: { type: 'string', minLength: 1 },
        version: { type: 'integer' },
        selector: { type: 'string' }
      }
    },
    requestedChange: { type: 'string' },
    status: { type: 'string', enum: CHANGE_REQUEST_STATUSES },
    impact: IMPACT_REPORT_SCHEMA
  }
};

export const RESOLUTION_OPTION_SCHEMA = {
  type: 'object',
  required: ['id', 'title'],
  properties: {
    id: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    desc: { type: 'string' },
    badge: { type: 'string' },
    recommended: { type: 'boolean' },
    effect: { type: 'object' }
  }
};

export const ESCALATION_SCHEMA = {
  type: 'object',
  required: ['id', 'runId', 'taskId', 'severity', 'code', 'title', 'status'],
  properties: {
    id: { type: 'string', minLength: 1 },
    runId: { type: 'string', minLength: 1 },
    taskId: { type: 'string', minLength: 1 },
    severity: { type: 'string', enum: ESCALATION_SEVERITIES },
    code: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    detail: { type: 'string' },
    logs: { type: 'array', items: { type: 'string' } },
    suggestedOptions: { type: 'array', items: RESOLUTION_OPTION_SCHEMA },
    selfHealAttempts: { type: 'integer' },
    status: { type: 'string', enum: ['open', 'resolved', 'expired'] }
  }
};

export const DECISION_SCHEMA = {
  type: 'object',
  required: ['id', 'runId', 'scope', 'refId', 'intent', 'actor', 'ts'],
  properties: {
    id: { type: 'string', minLength: 1 },
    runId: { type: 'string', minLength: 1 },
    scope: { type: 'string', enum: ['escalation', 'changeRequest', 'gate', 'milestone'] },
    refId: { type: 'string' },
    intent: { type: 'string', enum: DECISION_INTENTS },
    payload: { type: 'any' },
    actor: { type: 'string' },
    ts: { type: 'integer' }
  }
};

// ── 工厂(入口把关:一律 assertValid) ────────────────────────────

/**
 * 创建升级单(异常自下而上汇报,等待老板或自治策略裁决)。
 * @throws {Error} 契约不合法时
 */
export function createEscalation({
  id,
  runId,
  taskId,
  severity = 'block',
  code,
  title,
  detail = null,
  logs = [],
  suggestedOptions = [],
  selfHealAttempts = 0,
  status = 'open',
  actor = null,
  openedAt = null,
  ...rest
}) {
  const escalation = {
    id: id || ulid('esc'),
    runId,
    taskId,
    severity,
    code,
    title,
    detail,
    logs: [...(logs || [])],
    suggestedOptions: [...(suggestedOptions || [])],
    selfHealAttempts,
    status,
    actor,
    openedAt: openedAt ?? Date.now(),
    ...rest
  };
  return assertValid(ESCALATION_SCHEMA, escalation, 'Escalation');
}

/**
 * 创建变更单(返工请求,携带影响面报告)。
 * @throws {Error} 契约不合法时
 */
export function createChangeRequest({
  id,
  runId,
  projectId,
  source = null,
  target = null,
  reason,
  scope,
  requestedChange = null,
  status = 'open',
  impact = null
}) {
  const changeRequest = {
    id: id || ulid('cr'),
    runId,
    projectId,
    source,
    target,
    reason,
    scope: { ...scope },
    requestedChange,
    status,
    impact,
    createdAt: Date.now()
  };
  return assertValid(CHANGE_REQUEST_SCHEMA, changeRequest, 'ChangeRequest');
}

/**
 * 创建裁决记录(intent 化:杜绝静默改写产物,一切裁决可审计)。
 * @throws {Error} 契约不合法时
 */
export function createDecision({
  id,
  runId,
  scope,
  refId = null,
  intent,
  payload = null,
  actor = 'boss',
  ts = null
}) {
  const decision = {
    id: id || ulid('dec'),
    runId,
    scope,
    refId,
    intent,
    payload,
    actor,
    ts: ts ?? Date.now()
  };
  return assertValid(DECISION_SCHEMA, decision, 'Decision');
}