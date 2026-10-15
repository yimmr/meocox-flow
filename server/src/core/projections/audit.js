/**
 * 审计白皮书投影:events.jsonl → 结构化审计报表(+ Markdown 渲染)。
 *
 * 设计原则:
 *   - append-only 的事件流是唯一真相源,审计只能「读」,永不回写;
 *   - 台账(ledger)按原语折叠:升级单 / 裁决 / 返工 / 闸门 / 失败 / 检查点;
 *   - integrity 校验 seq 连续性 —— 日志被篡改时会在这里露馅。
 *
 * `renderAuditMarkdown` 输出可直接归档/发送的白皮书文本。
 */
import { foldEscalations } from '../primitives/escalation.js';

function bySeq(events) {
  return [...events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

/** seq 连续性校验:返回缺口列表(封顶 50 条) */
function checkIntegrity(sorted) {
  if (sorted.length <= 1) return { contiguous: true, gaps: [] };
  const gaps = [];
  const seen = new Set();
  let min = Infinity;
  let max = -Infinity;
  for (const e of sorted) {
    const s = e.seq;
    if (typeof s !== 'number') continue;
    seen.add(s);
    min = Math.min(min, s);
    max = Math.max(max, s);
  }
  for (let s = min; s <= max && gaps.length < 50; s += 1) {
    if (!seen.has(s)) gaps.push(s);
  }
  return { contiguous: gaps.length === 0, gaps };
}

function actorKey(e) {
  return `${e.actor?.kind || 'unknown'}:${e.actor?.id || 'unknown'}`;
}

/**
 * 构建审计报表。
 *
 * @param {Array<object>} events events.jsonl 内容
 * @param {{runId?:string, projectId?:string}} [meta]
 * @returns {object} 审计报表(可 JSON 序列化)
 */
export function buildAuditReport(events = [], meta = {}) {
  const sorted = bySeq(events);
  const runId = meta.runId ?? sorted.find((e) => e.runId)?.runId ?? null;
  const projectId = meta.projectId ?? sorted.find((e) => e.projectId)?.projectId ?? null;

  const lifecycle = [];
  const decisions = [];
  const changeRequests = [];
  const gates = [];
  const failures = [];
  const rollbacks = [];
  const checkpoints = [];
  const actorsMap = new Map();

  let usage = null;
  let finalStatus = null;
  let autoResolved = 0;
  let humanResolved = 0;
  const decisionById = new Map();
  const crById = new Map();

  for (const e of sorted) {
    const p = e.payload || {};

    // 参与方活动
    const key = actorKey(e);
    let actor = actorsMap.get(key);
    if (!actor) {
      actor = {
        kind: e.actor?.kind || 'unknown',
        id: e.actor?.id || 'unknown',
        events: 0,
        firstTs: e.ts ?? null,
        lastTs: e.ts ?? null
      };
      actorsMap.set(key, actor);
    }
    actor.events += 1;
    if (e.ts != null) actor.lastTs = e.ts;

    if (e.type.startsWith('run.')) {
      lifecycle.push({
        seq: e.seq,
        ts: e.ts,
        type: e.type,
        actor: { kind: e.actor?.kind || 'unknown', id: e.actor?.id || 'unknown' },
        payload: p
      });
      if (e.type === 'run.completed') { finalStatus = 'completed'; if (p.usage) usage = p.usage; }
      else if (e.type === 'run.failed') { finalStatus = 'failed'; if (p.usage) usage = p.usage; }
      else if (e.type === 'run.aborted') finalStatus = 'aborted';
      else if (e.type === 'run.blocked') { finalStatus = 'blocked'; if (p.usage) usage = p.usage; }
      else if (e.type === 'run.rolledback') {
        rollbacks.push({
          seq: e.seq,
          ts: e.ts,
          checkpointId: p.checkpointId ?? null,
          targetSeq: p.targetSeq ?? null,
          label: p.label ?? null,
          restoredStatus: p.restoredStatus ?? null
        });
      }
    }

    switch (e.type) {
      case 'escalation.opened':
        // payload = 完整升级单
        break;
      case 'decision.received':
        decisionById.set(p.id, {
          id: p.id,
          seq: e.seq,
          ts: e.ts,
          scope: p.scope ?? null,
          refId: p.refId ?? null,
          intent: p.intent ?? null,
          actor: { kind: e.actor?.kind || 'unknown', id: e.actor?.id || String(p.actor ?? 'unknown') },
          payload: p.payload ?? null,
          applied: false,
          appliedResult: null,
          appliedSeq: null
        });
        break;
      case 'decision.applied': {
        const prev = decisionById.get(p.id);
        if (prev) {
          prev.applied = true;
          prev.appliedResult = p.result ?? null;
          prev.appliedSeq = e.seq;
        }
        break;
      }
      case 'change.requested':
        crById.set(p.id, {
          id: p.id,
          openedSeq: e.seq,
          ts: e.ts,
          reason: p.reason ?? null,
          scope: p.scope ?? null,
          requestedChange: p.requestedChange ?? null,
          impact: p.impact ?? null,
          status: p.status ?? 'open',
          events: [{ seq: e.seq, ts: e.ts, type: e.type }]
        });
        break;
      case 'change.accepted':
      case 'change.rejected':
      case 'change.applied': {
        const prev = crById.get(p.id);
        if (prev) {
          prev.status = p.status ?? prev.status;
          prev.events.push({ seq: e.seq, ts: e.ts, type: e.type });
        } else {
          crById.set(p.id, {
            id: p.id, openedSeq: e.seq, ts: e.ts, reason: null, scope: null,
            requestedChange: null, impact: null,
            status: p.status ?? 'open',
            events: [{ seq: e.seq, ts: e.ts, type: e.type }]
          });
        }
        break;
      }
      case 'gate.passed':
      case 'gate.failed':
        gates.push({
          seq: e.seq,
          ts: e.ts,
          taskId: e.taskId ?? null,
          gateId: p.gateId ?? null,
          pass: Boolean(p.pass),
          onFail: p.onFail ?? null,
          failures: p.failures ?? [],
          warnings: p.warnings ?? []
        });
        break;
      case 'task.failed':
        failures.push({
          seq: e.seq,
          ts: e.ts,
          taskId: e.taskId ?? null,
          action: p.action ?? null,
          terminalStatus: p.terminalStatus ?? null,
          error: p.error ?? null,
          autoResolved: p.autoResolved ?? null,
          autonomy: p.autonomy ?? null
        });
        break;
      case 'checkpoint.created':
        checkpoints.push({
          seq: e.seq,
          ts: e.ts,
          checkpointId: p.checkpointId ?? null,
          label: p.label ?? null,
          snapshotSeq: p.seq ?? null,
          taskCount: p.taskCount ?? null
        });
        break;
      default:
        break;
    }
  }

  // 升级单台账(复用既有 fold,补 openedSeq/resolvedSeq)
  const escalations = foldEscalations(sorted).map((esc) => {
    const opened = sorted.find((e) => e.type === 'escalation.opened' && e.payload?.id === esc.id);
    const resolved = sorted.find((e) => e.type === 'escalation.resolved' && e.payload?.id === esc.id);
    return {
      id: esc.id,
      taskId: esc.taskId ?? null,
      severity: esc.severity ?? null,
      code: esc.code ?? null,
      title: esc.title ?? null,
      status: esc.status ?? 'open',
      openedSeq: opened?.seq ?? esc.openedSeq ?? null,
      ts: opened?.ts ?? esc.openedAt ?? null,
      resolvedSeq: resolved?.seq ?? null,
      resolvedAt: esc.resolvedAt ?? null,
      resolution: esc.resolution ?? null
    };
  }).sort((a, b) => (a.openedSeq ?? 0) - (b.openedSeq ?? 0));

  const decisionList = Array.from(decisionById.values()).sort((a, b) => a.seq - b.seq);
  for (const d of decisionList) {
    if (d.applied && d.actor?.kind === 'system') autoResolved += 1;
    else humanResolved += 1;
  }

  const integrity = checkIntegrity(sorted);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  return {
    meta: {
      runId,
      projectId,
      generatedAt: Date.now(),
      totalEvents: sorted.length,
      window: {
        fromSeq: first?.seq ?? null,
        toSeq: last?.seq ?? null,
        from: first?.ts ?? null,
        to: last?.ts ?? null,
        durationMs: first?.ts != null && last?.ts != null ? Math.max(0, last.ts - first.ts) : 0
      },
      integrity
    },
    verdict: {
      finalStatus,
      autoResolved,
      humanResolved,
      openEscalations: escalations.filter((e) => e.status === 'open').length,
      blockedTasks: lifecycle.find((e) => e.type === 'run.blocked')?.payload?.blockedTaskIds?.length ?? 0,
      budgetExceeded: lifecycle.some((e) => e.type === 'run.blocked' && e.payload?.reason === 'budget_exceeded')
    },
    usage,
    lifecycle,
    ledger: {
      escalations,
      decisions: decisionList,
      changeRequests: Array.from(crById.values()).sort((a, b) => a.openedSeq - b.openedSeq),
      gates,
      failures,
      checkpoints,
      rollbacks
    },
    actors: Array.from(actorsMap.values()).sort((a, b) => b.events - a.events)
  };
}

function fmtTs(ts) {
  if (ts == null) return '-';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function mdTable(headers, rows) {
  if (!rows.length) return '_（无记录）_\n';
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}\n`;
}

/**
 * 审计报表 → Markdown 白皮书(可直接归档)。
 * @param {object} report buildAuditReport 的输出
 * @returns {string}
 */
export function renderAuditMarkdown(report) {
  const { meta, verdict, usage, lifecycle, ledger, actors } = report;
  const L = [];

  L.push(`# Run 审计白皮书 · ${meta.runId || 'unknown'}`);
  L.push('');
  L.push(`> 项目:${meta.projectId || '-'} · 生成时间:${fmtTs(meta.generatedAt)} · 事件数:${meta.totalEvents}`);
  L.push(`> 事件窗口:seq [${meta.window.fromSeq ?? '-'} → ${meta.window.toSeq ?? '-'}] · ${fmtTs(meta.window.from)} → ${fmtTs(meta.window.to)}(跨度 ${meta.window.durationMs}ms)`);
  L.push(`> 日志完整性:${meta.integrity.contiguous ? '✅ seq 连续,未发现缺口' : `⚠️ 缺失 seq:${meta.integrity.gaps.join(', ')}`}`);
  L.push('');

  L.push('## 1. 结论摘要');
  L.push('');
  L.push(`- 终态:**${verdict.finalStatus || '未收尾'}**`);
  L.push(`- 裁决:自动脱困 ${verdict.autoResolved} 次 / 人工裁决 ${verdict.humanResolved} 次 · 未关闭升级单 ${verdict.openEscalations} 张`);
  L.push(`- 质检闸门:通过 ${ledger.gates.filter((g) => g.pass).length} / 未通过 ${ledger.gates.filter((g) => !g.pass).length}`);
  L.push(`- 任务失败记录:${ledger.failures.length} 条 · 检查点 ${ledger.checkpoints.length} 个 · 回滚 ${ledger.rollbacks.length} 次`);
  if (verdict.budgetExceeded) L.push('- ⚠️ 本 Run 因**预算超限**被硬停');
  if (usage) {
    L.push(`- 用量:tokens ${usage.tokens ?? 0} · cost ${usage.cost ?? 0} · seconds ${usage.seconds ?? 0} · gpuSeconds ${usage.gpuSeconds ?? 0}`);
  }
  L.push('');

  L.push('## 2. 生命周期(run.*)');
  L.push('');
  L.push(mdTable(
    ['seq', '时间', '事件', '要点'],
    lifecycle.map((e) => [
      String(e.seq),
      fmtTs(e.ts),
      `\`${e.type}\``,
      (e.payload?.reason || e.payload?.label || e.payload?.templateId
        || (e.payload?.blockedTaskIds ? `阻塞 ${e.payload.blockedTaskIds.length} 任务` : '')
        || (e.payload?.failedTaskIds ? `失败 ${e.payload.failedTaskIds.length} 任务` : '') || '-')
        .toString().replace(/\|/g, '/')
    ])
  ));

  L.push('## 3. 升级单(异常自下而上)');
  L.push('');
  L.push(mdTable(
    ['seq', '任务', '严重级', '标题', '状态', '裁决 seq'],
    ledger.escalations.map((e) => [
      String(e.openedSeq ?? '-'),
      `\`${e.taskId || '-'}\``,
      e.severity || '-',
      (e.title || '-').replace(/\|/g, '/'),
      e.status,
      e.resolvedSeq != null ? String(e.resolvedSeq) : '未裁决'
    ])
  ));

  L.push('## 4. 裁决记录(intent 化,杜绝静默改写)');
  L.push('');
  L.push(mdTable(
    ['seq', '作用域', '意图', '目标', '裁决方', '已作用'],
    ledger.decisions.map((d) => [
      String(d.seq),
      d.scope || '-',
      `\`${d.intent || '-'}\``,
      `\`${d.refId || '-'}\``,
      `${d.actor?.kind || '-'}:${d.actor?.id || '-'}`,
      d.applied ? `✅ (seq ${d.appliedSeq})` : '⏳'
    ])
  ));

  L.push('## 5. 返工变更单');
  L.push('');
  L.push(mdTable(
    ['seq', '状态', '原因', '重算集'],
    ledger.changeRequests.map((c) => [
      String(c.openedSeq),
      c.status || '-',
      (c.reason || '-').replace(/\|/g, '/'),
      (c.impact?.recomputeSet?.length ? `${c.impact.recomputeSet.length} 任务` : '-')
    ])
  ));

  L.push('## 6. 质检闸门与任务失败');
  L.push('');
  L.push(mdTable(
    ['seq', '任务', '闸门', '判定'],
    ledger.gates.map((g) => [
      String(g.seq),
      `\`${g.taskId || '-'}\``,
      `\`${g.gateId || '-'}\``,
      g.pass ? '✅ 通过' : `❌ 未通过${g.failures.length ? `(${g.failures.map((f) => f.metric).join(', ')})` : ''}`
    ])
  ));
  L.push(mdTable(
    ['seq', '任务', '处置', '终态', '错误'],
    ledger.failures.map((f) => [
      String(f.seq),
      `\`${f.taskId || '-'}\``,
      `${f.action || '-'}${f.autoResolved ? '(自动)' : ''}`,
      f.terminalStatus || '-',
      (f.error?.message || '-').replace(/\|/g, '/').slice(0, 80)
    ])
  ));

  L.push('## 7. 检查点与回滚(时光树)');
  L.push('');
  L.push(mdTable(
    ['事件 seq', '快照 seq', '标签', '时间'],
    ledger.checkpoints.map((c) => [
      String(c.seq),
      String(c.snapshotSeq ?? '-'),
      (c.label || '-').replace(/\|/g, '/'),
      fmtTs(c.ts)
    ])
  ));
  L.push(mdTable(
    ['事件 seq', '回滚至 seq', '检查点', '恢复状态'],
    ledger.rollbacks.map((r) => [
      String(r.seq),
      String(r.targetSeq ?? '-'),
      (r.label || r.checkpointId || '-').replace(/\|/g, '/'),
      r.restoredStatus || '-'
    ])
  ));

  L.push('## 8. 参与方活动');
  L.push('');
  L.push(mdTable(
    ['参与方', '事件数', '最近活动'],
    actors.map((a) => [`${a.kind}:${a.id}`, String(a.events), fmtTs(a.lastTs)])
  ));

  L.push('---');
  L.push('');
  L.push('_本白皮书为 `events.jsonl` 的只读投影;历史 append-only,任何回滚都不改写本报告的事实基础。_');
  L.push('');
  return L.join('\n');
}

export default { buildAuditReport, renderAuditMarkdown };
