/**
 * 工业级通用多智能体协同 — 标准通信与数据契约规范 (Node.js 后端通用镜像)
 */

export const STREAM_EVENT_TYPES = {
  AGENT_START: 'agent_start',
  AGENT_HANDOFF: 'agent_handoff',
  STEP_START: 'step_start',
  STEP_LOG: 'step_log',
  STEP_END: 'step_end',
  TEXT_DELTA: 'text_delta',
  ARTIFACT_PUBLISH: 'artifact_publish',
  DECISION_REQUEST: 'decision_request',
  DECISION_RESOLVE: 'decision_resolve',
  DECISION_REOPEN: 'decision_reopen',
  SYSTEM_ALERT: 'system_alert',
  STREAM_DONE: 'stream_done',
  STREAM_ERROR: 'stream_error'
};

export const STEP_TYPES = {
  THINKING: 'thinking',
  SKILL: 'skill',
  TOOL: 'tool'
};

export const ARTIFACT_TYPES = {
  DOCUMENT: 'document',
  DATA: 'data',
  CARDS: 'cards',
  CODE: 'code',
  CUSTOM: 'custom'
};

export function createStreamEvent(type, payload = {}) {
  return {
    type,
    timestamp: Date.now(),
    ...payload
  };
}
