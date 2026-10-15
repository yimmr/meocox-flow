/**
 * 事件日志:构造规范 Event,并维护「每 run 单调递增的 seq」。
 *
 * 事件是 append-only 落盘(runs/<runId>/events.jsonl)的,
 * 因此 seq 是断点续传 / 时光倒流 / 审计的天然游标。
 */
import { ulid } from '../contracts/ids.js';
import { assertValid, EVENT_SCHEMA } from '../contracts/index.js';

/**
 * 组装一个规范事件(不做落盘)。
 */
export function buildEvent({ runId, projectId, seq, type, actor, taskId, artifactRef, payload, ts }) {
  return {
    id: ulid('evt'),
    runId,
    projectId,
    seq,
    ts: ts || Date.now(),
    type,
    actor: actor || { kind: 'system', id: 'core' },
    taskId: taskId || null,
    artifactRef: artifactRef || null,
    payload: payload === undefined ? null : payload
  };
}

/**
 * 从已落盘事件推断下一个 seq(进程重启后恢复计数)。
 * @returns {Promise<number>} lastSeq(无事件时为 -1)
 */
export async function loadLastSeq(storage, projectId, runId) {
  const events = await storage.readEvents(projectId, runId);
  if (!events.length) return -1;
  return events.reduce((max, e) => Math.max(max, e.seq || 0), -1);
}

/**
 * 校验一个事件是否符合契约(开发期把关)。
 * @throws {Error}
 */
export function ensureValidEvent(event) {
  return assertValid(EVENT_SCHEMA, event, 'Event');
}