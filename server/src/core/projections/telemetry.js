/**
 * 遥测投影:events.jsonl → 遥测条 / 时间窗 / 汇总。
 *
 * 纯函数投影:只读事件流,不落盘、不发事件、不可改写历史。
 * UI(遥测条、泳道、浮窗)只是本投影的展示层 —— 换数据源不改引擎。
 *
 * 事件 → 遥测的映射:
 *   task.started            → 遥测条起点(带 attempt)
 *   task.retrying           → 重试计数(条内标记)
 *   task.succeeded/failed   → 遥测条终点 + 状态(失败取 terminalStatus)
 *   budget.tick/exceeded    → 预算序列
 *   gate.passed/failed      → 质检判定
 *   run.completed/blocked   → 使用量 usage 快照
 */

/** 按 seq 升序拷贝(seq 缺失视为 0) */
function bySeq(events) {
  return [...events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

function emptyTelemetry(runId = null) {
  return {
    runId,
    generatedAt: Date.now(),
    window: { fromSeq: null, toSeq: null, from: null, to: null, durationMs: 0 },
    summary: {
      totalEvents: 0,
      succeeded: 0,
      failed: 0,
      retries: 0,
      logs: 0,
      gatesPassed: 0,
      gatesFailed: 0,
      escalationsOpened: 0,
      decisions: 0,
      changeRequests: 0,
      checkpoints: 0,
      rollbacks: 0,
      budgetExceeded: false
    },
    tasks: [],
    actors: [],
    budget: { ticks: [], exceeded: null },
    usage: null
  };
}

/**
 * 把事件流投影为遥测结构。
 *
 * @param {Array<object>} events events.jsonl 内容
 * @param {Array<object>} [tasks] 可选的当前任务快照(用于补 type/agentId/最新状态)
 * @returns {object} 遥测投影
 */
export function buildTelemetry(events = [], tasks = []) {
  const sorted = bySeq(events);
  const runId = sorted.find((e) => e.runId)?.runId ?? null;
  if (!sorted.length) return emptyTelemetry(runId);

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const from = first.ts ?? null;
  const to = last.ts ?? null;

  /** @type {Map<string, object>} taskId → 遥测条 */
  const bars = new Map();
  const actorCounts = new Map();
  const summary = {
    totalEvents: sorted.length,
    succeeded: 0,
    failed: 0,
    retries: 0,
    logs: 0,
    gatesPassed: 0,
    gatesFailed: 0,
    escalationsOpened: 0,
    decisions: 0,
    changeRequests: 0,
    checkpoints: 0,
    rollbacks: 0,
    budgetExceeded: false
  };
  const budget = { ticks: [], exceeded: null };
  let usage = null;

  const barOf = (taskId) => {
    if (!bars.has(taskId)) {
      bars.set(taskId, {
        taskId,
        status: 'pending',
        startSeq: null,
        startTs: null,
        endSeq: null,
        endTs: null,
        durationMs: null,
        attempts: 0,
        retries: 0,
        logs: 0,
        error: null
      });
    }
    return bars.get(taskId);
  };

  for (const e of sorted) {
    const p = e.payload || {};

    // 参与方活动(审计用)
    const key = `${e.actor?.kind || 'unknown'}:${e.actor?.id || 'unknown'}`;
    actorCounts.set(key, (actorCounts.get(key) || 0) + 1);

    // ── 任务级 ──
    if (e.taskId && e.type.startsWith('task.')) {
      const bar = barOf(e.taskId);
      switch (e.type) {
        case 'task.started':
          bar.status = 'running';
          bar.startSeq = e.seq;
          bar.startTs = e.ts;
          bar.endSeq = null;
          bar.endTs = null;
          bar.durationMs = null;
          bar.attempts = p.attempt ?? (bar.attempts || 1);
          break;
        case 'task.retrying':
          bar.retries += 1;
          summary.retries += 1;
          bar.attempts = Math.max(bar.attempts, p.attempt ?? bar.attempts);
          break;
        case 'task.log':
          bar.logs += 1;
          summary.logs += 1;
          break;
        case 'task.succeeded':
          bar.status = 'succeeded';
          bar.endSeq = e.seq;
          bar.endTs = e.ts;
          if (bar.startTs != null && e.ts != null) bar.durationMs = e.ts - bar.startTs;
          summary.succeeded += 1;
          break;
        case 'task.failed': {
          const terminal = p.terminalStatus || 'failed';
          bar.status = terminal;
          bar.endSeq = e.seq;
          bar.endTs = e.ts;
          if (bar.startTs != null && e.ts != null) bar.durationMs = e.ts - bar.startTs;
          bar.error = p.error ? { message: p.error.message ?? null, code: p.error.code ?? null } : null;
          if (terminal === 'succeeded') summary.succeeded += 1;
          else summary.failed += 1;
          break;
        }
        case 'task.stale':
          bar.status = 'stale';
          break;
        default:
          break;
      }
    }

    // ── 治理 / 协作 ──
    switch (e.type) {
      case 'gate.passed':
        summary.gatesPassed += 1;
        break;
      case 'gate.failed':
        summary.gatesFailed += 1;
        break;
      case 'escalation.opened':
        summary.escalationsOpened += 1;
        break;
      case 'decision.received':
        summary.decisions += 1;
        break;
      case 'change.requested':
        summary.changeRequests += 1;
        break;
      case 'checkpoint.created':
        summary.checkpoints += 1;
        break;
      case 'run.rolledback':
        summary.rollbacks += 1;
        break;
      case 'budget.tick':
        budget.ticks.push({ seq: e.seq, ts: e.ts, usage: p.usage ?? null, breaches: p.breaches ?? [] });
        break;
      case 'budget.exceeded':
        summary.budgetExceeded = true;
        budget.exceeded = { seq: e.seq, ts: e.ts, breaches: p.breaches ?? [] };
        break;
      case 'run.completed':
      case 'run.blocked':
      case 'run.failed':
      case 'run.aborted':
        if (p.usage) usage = p.usage;
        break;
      default:
        break;
    }
  }

  // 当前任务快照补 type/agentId/最新状态(事件流之外的展示字段)
  const snapshotById = new Map(tasks.map((t) => [t.id, t]));
  const enriched = [];
  for (const bar of bars.values()) {
    const snap = snapshotById.get(bar.taskId);
    enriched.push({
      ...bar,
      type: snap?.type ?? snap?.operatorId ?? null,
      agentId: snap?.agentId ?? snap?.operatorId ?? null,
      // 快照状态更「新鲜」(事件流末尾之后的 rollback/stale 可能未在条上体现)
      snapshotStatus: snap?.status ?? null
    });
  }
  // 只出现在快照里、没有任何事件的任务(如 rollback 恢复后未再执行)也列出
  for (const t of tasks) {
    if (bars.has(t.id)) continue;
    enriched.push({
      taskId: t.id,
      status: t.status || 'pending',
      type: t.type ?? t.operatorId ?? null,
      agentId: t.agentId ?? t.operatorId ?? null,
      snapshotStatus: t.status ?? null,
      startSeq: null, startTs: null, endSeq: null, endTs: null,
      durationMs: null,
      attempts: t.attempts || 0,
      retries: 0,
      logs: 0,
      error: t.error ? { message: t.error.message ?? null, code: t.error.code ?? null } : null
    });
  }
  // 按首次出现顺序(即 startSeq),无起点的排最后
  enriched.sort((a, b) => (a.startSeq ?? Number.MAX_SAFE_INTEGER) - (b.startSeq ?? Number.MAX_SAFE_INTEGER));

  const actors = Array.from(actorCounts.entries())
    .map(([key, count]) => {
      const idx = key.indexOf(':');
      return { kind: key.slice(0, idx), id: key.slice(idx + 1), events: count };
    })
    .sort((a, b) => b.events - a.events);

  return {
    runId: runId ?? first.runId ?? null,
    generatedAt: Date.now(),
    window: {
      fromSeq: first.seq ?? null,
      toSeq: last.seq ?? null,
      from,
      to,
      durationMs: from != null && to != null ? Math.max(0, to - from) : 0
    },
    summary,
    tasks: enriched,
    actors,
    budget,
    usage
  };
}

export default { buildTelemetry };
