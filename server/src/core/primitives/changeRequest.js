/**
 * ChangeRequest 原语:任意工位发起返工,只重算受影响产物(事件溯源)。
 *
 * 工业级返工闭环:
 *   1. requestChange —— 基于 lineage 做影响面分析:
 *      `analyzeImpact` 给出下游闭包(不含自身),**scope 产物自身的生产者
 *      也要进 recomputeSet**(要改它就得重跑产它的任务),该并集在本模块内计算,
 *      不动 lineage(lineage 有自己的测试契约);
 *   2. applyChange —— 受影响产物标记 stale + 受影响任务重排
 *      (succeeded/ready/... -> stale -> pending,状态机合法迁移),
 *      并落 change.applied;**不会自动开跑**,返回 recomputeSet,
 *      由后续 runtime.execute 只跑 pending 任务。
 *
 * 所有状态都是事件折叠出来的,历史 append-only 不可变。
 */
import { createChangeRequest } from '../contracts/index.js';
import { analyzeImpact } from '../artifacts/lineage.js';
import { transition } from '../run/stateMachine.js';

function ctxOf(ctx) {
  if (!ctx?.bus?.emit || !ctx?.projectId || !ctx?.runId) {
    throw new Error('[changeRequest] ctx 需要 { bus, projectId, runId }');
  }
  return ctx;
}

/** 数组并集(保序去重) */
function union(...lists) {
  const seen = new Set();
  const out = [];
  for (const item of lists.flat()) {
    if (item === undefined || item === null) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/** 取某版本的生产者任务(找不到版本则取最新版) */
function producerTaskOf(index, version) {
  if (!index) return null;
  const versions = index.versions || [];
  const meta = versions.find((v) => v.version === version) || versions.at(-1);
  return meta?.producedBy?.taskId || null;
}

/**
 * 发起返工:影响面分析 + 落 change.requested。
 *
 * @param {{bus, projectId, runId, artifactStore}} ctx
 * @param {{reason:string, scope:{artifactId:string,version:number,selector?:string},
 *          requestedChange?:string, source?:object, target?:object, actor?:string}} input
 * @returns {Promise<object>} 规范化变更单(含 impact)
 */
export async function requestChange(ctx, input) {
  const { bus, projectId, runId } = ctxOf(ctx);
  if (!ctx.artifactStore?.listAll) {
    throw new Error('[changeRequest] ctx 需要 artifactStore');
  }
  const { reason, scope, requestedChange, source, target } = input || {};
  if (!scope?.artifactId) throw new Error('[changeRequest] scope.artifactId 必填');

  const indexes = await ctx.artifactStore.listAll(projectId);
  const scopeIndex = indexes.find((a) => a.id === scope.artifactId) || null;
  const scopeVersion = scope.version ?? scopeIndex?.currentVersion ?? 1;

  // 下游闭包(不含自身)+ 自身生产者 = 最小重算集
  const base = analyzeImpact(indexes, { artifactId: scope.artifactId, version: scopeVersion });
  const scopeProducer = producerTaskOf(scopeIndex, scopeVersion);

  const affectedArtifactIds = union(base.affectedArtifacts, [scope.artifactId]);
  const affectedArtifacts = affectedArtifactIds.map((id) => {
    const idx = indexes.find((a) => a.id === id) || null;
    return {
      artifactId: id,
      kind: idx?.kind ?? null,
      version: id === scope.artifactId ? scopeVersion : (idx?.currentVersion ?? null),
      status: idx?.status ?? null
    };
  });

  const recomputeSet = union(base.recomputeSet, scopeProducer);
  const affectedTasks = union(base.affectedTasks, scopeProducer);

  const changeRequest = createChangeRequest({
    runId,
    projectId,
    source: source ?? null,
    target: target ?? null,
    reason,
    scope: { ...scope, version: scopeVersion },
    requestedChange: requestedChange ?? null,
    status: 'open',
    impact: {
      affectedArtifacts,
      affectedTasks,
      recomputeSet,
      estimatedCost: { taskCount: recomputeSet.length }
    }
  });

  await bus.emit(projectId, runId, {
    type: 'change.requested',
    actor: input?.actor ? normalizeActor(input.actor) : { kind: 'boss', id: 'user' },
    payload: changeRequest
  });
  return changeRequest;
}

function normalizeActor(actor) {
  if (actor && typeof actor === 'object') return actor;
  return { kind: actor === 'system' ? 'system' : 'boss', id: actor || 'user' };
}

/**
 * 应用返工:受影响产物 -> stale,受影响任务 -> 重排为 pending,落 change.applied。
 *
 * **不会自动开跑** —— 返回 recomputeSet,后续 runtime.execute 只跑 pending。
 *
 * @param {{bus, projectId, runId, artifactStore, storage}} ctx
 * @param {object} changeRequest 折叠出的变更单(需含 impact)
 * @returns {Promise<{recomputeSet:string[], requeued:string[], artifactsStaled:string[], changeRequestId:string}>}
 */
export async function applyChange(ctx, changeRequest) {
  const { bus, projectId, runId } = ctxOf(ctx);
  if (!changeRequest?.id) {
    const err = new Error('[changeRequest] 变更单不存在');
    err.code = 'ECR_NOT_FOUND';
    throw err;
  }

  const recomputeSet = changeRequest.impact?.recomputeSet || [];
  const affectedArtifacts = changeRequest.impact?.affectedArtifacts || [];

  // 1) 受影响产物标记 stale(可追溯:事件随后统一落盘)
  const artifactsStaled = [];
  for (const art of affectedArtifacts) {
    if (!art?.kind || !ctx.artifactStore?.markStale) continue;
    const idx = await ctx.artifactStore.markStale(projectId, art.kind, art.artifactId);
    if (idx) artifactsStaled.push(art.artifactId);
  }

  // 2) 受影响任务重排:succeeded/ready/... -> stale -> pending(状态机合法迁移)
  const requeued = [];
  if (ctx.storage?.listTasks && recomputeSet.length) {
    const tasks = await ctx.storage.listTasks(projectId, runId);
    for (const task of tasks) {
      if (!recomputeSet.includes(task.id)) continue;
      if (task.status === 'pending') continue;
      try { transition('task', task, 'stale'); } catch { task.status = 'stale'; }
      try { transition('task', task, 'pending'); } catch { task.status = 'pending'; }
      task.attempts = 0;
      task.progress = 0;
      task.error = null;
      task.finishedAt = null;
      task.updatedAt = Date.now();
      await ctx.storage.saveTask(projectId, runId, task);
      await bus.emit(projectId, runId, {
        type: 'task.stale',
        taskId: task.id,
        actor: { kind: 'system', id: 'rework' },
        payload: { reason: 'change_request', changeRequestId: changeRequest.id, from: 'requeued' }
      });
      requeued.push(task.id);
    }
  }

  // 3) 变更单 -> applied(append-only,不回改历史)
  const payload = {
    id: changeRequest.id,
    status: 'applied',
    recomputeSet,
    requeued,
    artifactsStaled,
    appliedAt: Date.now()
  };
  await bus.emit(projectId, runId, {
    type: 'change.applied',
    actor: { kind: 'system', id: 'rework' },
    payload
  });

  return {
    changeRequestId: changeRequest.id,
    recomputeSet,
    requeued,
    artifactsStaled
  };
}

/**
 * 受理返工(change.accepted)。
 */
export async function acceptChange(ctx, changeRequest, actor = null) {
  const { bus, projectId, runId } = ctxOf(ctx);
  const payload = { id: changeRequest.id, status: 'accepted', acceptedAt: Date.now() };
  await bus.emit(projectId, runId, {
    type: 'change.accepted',
    actor: normalizeActor(actor || 'boss'),
    payload
  });
  return payload;
}

/**
 * 驳回返工(change.rejected)。
 */
export async function rejectChange(ctx, changeRequest, { reason = null, actor = null } = {}) {
  const { bus, projectId, runId } = ctxOf(ctx);
  const payload = { id: changeRequest.id, status: 'rejected', reason, rejectedAt: Date.now() };
  await bus.emit(projectId, runId, {
    type: 'change.rejected',
    actor: normalizeActor(actor || 'boss'),
    payload
  });
  return payload;
}

/**
 * 折叠事件流 -> 变更单状态数组。
 * @param {Array<{type:string,payload:object,ts:number}>} events
 * @returns {Array<object>}
 */
export function foldChangeRequests(events = []) {
  /** @type {Map<string, object>} */
  const byId = new Map();
  for (const e of events) {
    const p = e.payload;
    if (!p) continue;
    if (e.type === 'change.requested' && p.id) {
      byId.set(p.id, { ...p, updatedAt: e.ts ?? null });
    } else if (p.id && byId.has(p.id)) {
      const prev = byId.get(p.id);
      if (e.type === 'change.accepted') {
        prev.status = 'accepted';
        prev.acceptedAt = p.acceptedAt ?? e.ts ?? null;
      } else if (e.type === 'change.applied') {
        prev.status = 'applied';
        prev.recomputeSet = p.recomputeSet ?? prev.impact?.recomputeSet ?? [];
        prev.requeued = p.requeued ?? [];
        prev.artifactsStaled = p.artifactsStaled ?? [];
        prev.appliedAt = p.appliedAt ?? e.ts ?? null;
      } else if (e.type === 'change.rejected') {
        prev.status = 'rejected';
        prev.rejectedReason = p.reason ?? null;
        prev.rejectedAt = p.rejectedAt ?? e.ts ?? null;
      }
      prev.updatedAt = e.ts ?? prev.updatedAt;
    }
  }
  return Array.from(byId.values());
}
