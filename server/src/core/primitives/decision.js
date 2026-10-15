/**
 * Decision 原语:老板(或自治策略)的 intent 化裁决(事件溯源)。
 *
 * 设计红线:**杜绝静默改写产物** —— 任何状态变更之前先落
 * decision.received(intent + 载荷 + 裁决人),变更完成后落 decision.applied。
 * scope 决定这条裁决作用到哪类原语:
 *   escalation     -> 解决升级单
 *   changeRequest  -> accept(受理返工) / reject(驳回)
 *   gate           -> override(人工放行质检)
 *   milestone      -> 预留(里程碑审批)
 */
import { createDecision } from '../contracts/index.js';

function ctxOf(ctx) {
  if (!ctx?.bus?.emit || !ctx?.projectId || !ctx?.runId) {
    throw new Error('[decision] ctx 需要 { bus, projectId, runId }');
  }
  return ctx;
}

/** 字符串 actor -> 事件 actor 对象 */
function eventActor(actor) {
  if (actor && typeof actor === 'object') return actor;
  const kind = actor === 'boss' ? 'boss'
    : actor === 'system' ? 'system'
      : actor === 'operator' ? 'operator'
        : 'agent';
  return { kind, id: actor || 'unknown' };
}

/**
 * 记录一条裁决(emit decision.received)。
 * @param {{bus, projectId, runId}} ctx
 * @param {{scope:string, refId?:string, intent:string, payload?:*, actor?:string}} input
 * @returns {Promise<object>} 规范化裁决(带 id)
 */
export async function recordDecision(ctx, input) {
  const { bus, projectId, runId } = ctxOf(ctx);
  const decision = createDecision({ runId, ...input });
  await bus.emit(projectId, runId, {
    type: 'decision.received',
    actor: eventActor(decision.actor),
    payload: decision
  });
  return decision;
}

/**
 * 标记裁决已作用完成(emit decision.applied,result 为作用结果摘要)。
 */
export async function markDecisionApplied(ctx, decision, result = null) {
  const { bus, projectId, runId } = ctxOf(ctx);
  const payload = {
    id: decision.id,
    scope: decision.scope,
    refId: decision.refId,
    intent: decision.intent,
    result,
    appliedAt: Date.now()
  };
  await bus.emit(projectId, runId, {
    type: 'decision.applied',
    actor: eventActor(decision.actor),
    taskId: null,
    payload
  });
  return payload;
}

/**
 * 折叠事件流 -> 裁决状态数组。
 * @param {Array<{type:string,payload:object,ts:number}>} events
 * @returns {Array<object>}
 */
export function foldDecisions(events = []) {
  /** @type {Map<string, object>} */
  const byId = new Map();
  for (const e of events) {
    const p = e.payload;
    if (!p) continue;
    if (e.type === 'decision.received' && p.id) {
      byId.set(p.id, { ...p, applied: false, appliedResult: null });
    } else if (e.type === 'decision.applied' && p.id) {
      const prev = byId.get(p.id);
      if (prev) {
        prev.applied = true;
        prev.appliedResult = p.result ?? null;
        prev.appliedAt = p.appliedAt ?? e.ts ?? null;
      } else {
        byId.set(p.id, {
          id: p.id,
          scope: p.scope,
          refId: p.refId,
          intent: p.intent,
          applied: true,
          appliedResult: p.result ?? null,
          appliedAt: p.appliedAt ?? e.ts ?? null
        });
      }
    }
  }
  return Array.from(byId.values());
}
