/**
 * Escalation 原语:异常自下而上汇报 + 裁决脱困(事件溯源)。
 *
 * 状态即回放:没有任何「当前状态」文件 —— 升级单的真相永远是
 * `runs/<runId>/events.jsonl` 里 escalation.opened / escalation.resolved
 * 的折叠结果(foldEscalations)。
 *
 * 动作只做一件事:通过 bus 落盘事件(works with runtime busProxy)。
 */
import { createEscalation } from '../contracts/index.js';

/** 统一的协作原语执行上下文 */
function ctxOf(ctx) {
  if (!ctx?.bus?.emit || !ctx?.projectId || !ctx?.runId) {
    throw new Error('[escalation] ctx 需要 { bus, projectId, runId }');
  }
  return ctx;
}

/**
 * actor 归一化:事件契约要求 actor 是对象;允许调用方传字符串('boss' | 'system' | ...)。
 * @param {object|string|null} actor
 * @param {object} fallback 未提供时的默认 actor
 */
function toEventActor(actor, fallback) {
  if (!actor) return fallback;
  if (typeof actor === 'object') return actor;
  const kind = actor === 'boss' || actor === 'system' || actor === 'operator' ? actor : 'agent';
  return { kind, id: actor };
}

/**
 * 任务失败 -> 升级单输入(纯构造,不发事件)。
 * payload 是旧扁平 payload(severity/code/title/detail/suggestedOptions)的超集,
 * 老消费者不受影响。
 */
export function taskEscalationInput({ run, task, err }) {
  const isGate = Boolean(err?.gateId) || err?.code === 'EGATE';
  return {
    runId: run.id,
    taskId: task.id,
    severity: err?.severity || 'block',
    code: isGate ? 'GATE_FAILED' : 'TASK_FAILED',
    title: `任务「${task.operatorId || task.id}」失败,等待裁决`,
    detail: err?.message || String(err),
    suggestedOptions: [
      { id: 'retry', title: '重试一次', recommended: true },
      { id: 'skip', title: '跳过并继续' },
      { id: 'abort', title: '中止本次执行' }
    ],
    actor: { kind: 'system', id: 'scheduler' }
  };
}

/**
 * 打开一张升级单(emit escalation.opened,payload = 完整升级单对象)。
 * @param {{bus, projectId, runId}} ctx
 * @param {object|object[]} input 升级单输入(或已创建的升级单)
 * @returns {Promise<object>} 规范化升级单(带 id)
 */
export async function openEscalation(ctx, input) {
  const { bus, projectId, runId } = ctxOf(ctx);
  const escalation = createEscalation({ runId, ...input });
  await bus.emit(projectId, runId, {
    type: 'escalation.opened',
    taskId: escalation.taskId,
    actor: toEventActor(escalation.actor, { kind: 'system', id: 'scheduler' }),
    payload: escalation
  });
  return escalation;
}

/**
 * 解决一张升级单(emit escalation.resolved)。
 * 历史不被改写 —— resolved 只是追加的一条事件。
 */
export async function resolveEscalation(ctx, { id, resolution = {}, actor = null }) {
  const { bus, projectId, runId } = ctxOf(ctx);
  if (!id) throw new Error('[escalation] resolveEscalation 需要升级单 id');
  const payload = { id, status: 'resolved', resolution, resolvedAt: Date.now() };
  await bus.emit(projectId, runId, {
    type: 'escalation.resolved',
    actor: toEventActor(actor, { kind: 'boss', id: 'user' }),
    payload
  });
  return payload;
}

/**
 * 折叠事件流 -> 升级单状态数组(事件溯源投影)。
 * @param {Array<{type:string,payload:object,ts:number,seq?:number}>} events
 * @returns {Array<object>}
 */
export function foldEscalations(events = []) {
  /** @type {Map<string, object>} */
  const byId = new Map();
  for (const e of events) {
    const p = e.payload;
    if (!p) continue;
    if (e.type === 'escalation.opened' && p.id) {
      byId.set(p.id, { ...p, openedAt: p.openedAt ?? e.ts ?? null, openedSeq: e.seq ?? null });
    } else if (e.type === 'escalation.resolved' && p.id) {
      const prev = byId.get(p.id);
      if (prev) {
        prev.status = 'resolved';
        prev.resolution = p.resolution ?? null;
        prev.resolvedAt = p.resolvedAt ?? e.ts ?? null;
      } else {
        byId.set(p.id, {
          id: p.id,
          status: 'resolved',
          resolution: p.resolution ?? null,
          resolvedAt: p.resolvedAt ?? e.ts ?? null
        });
      }
    } else if (e.type === 'escalation.expired' && p.id) {
      const prev = byId.get(p.id);
      if (prev) prev.status = 'expired';
      else byId.set(p.id, { id: p.id, status: 'expired' });
    }
  }
  return Array.from(byId.values());
}
