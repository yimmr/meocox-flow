import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { storage } from '../../src/storage/index.js';
import runsRouter from '../../src/routes/runs.js';
import primitivesRouter from '../../src/routes/primitives.js';
import projectionsRouter from '../../src/routes/projections.js';
import { buildTelemetry } from '../../src/core/projections/telemetry.js';
import { buildAuditReport, renderAuditMarkdown } from '../../src/core/projections/audit.js';
import { buildTimeTree } from '../../src/core/projections/timeTree.js';
import { diffSnapshots } from '../../src/core/projections/diff.js';

const TERMINAL = new Set(['completed', 'failed', 'aborted', 'paused']);

/** 合成一条事件(仅形状,不落盘) */
function ev(seq, type, over = {}) {
  return {
    id: `evt_${seq}`,
    runId: 'run_x',
    projectId: 'proj_x',
    seq,
    ts: 1_700_000_000_000 + seq * 1000,
    type,
    actor: { kind: 'system', id: 'scheduler' },
    ...over
  };
}

describe('Projections 单元 · 遥测 / 审计 / 时光树 / Diff(合成事件)', () => {
  test('buildTelemetry:空事件流返回结构完整的空投影', () => {
    const t = buildTelemetry([]);
    assert.equal(t.summary.totalEvents, 0);
    assert.deepEqual(t.tasks, []);
    assert.equal(t.usage, null);
    assert.equal(t.window.durationMs, 0);
  });

  test('buildTelemetry:遥测条起止 / 重试 / 预算 / 用量', () => {
    const events = [
      ev(0, 'run.created', { actor: { kind: 'boss', id: 'user' }, payload: { templateId: 't' } }),
      ev(1, 'run.started', { payload: { concurrency: 3 } }),
      ev(2, 'task.started', { taskId: 'step_a', actor: { kind: 'agent', id: 'op_a' }, payload: { attempt: 1 } }),
      ev(3, 'task.log', { taskId: 'step_a', payload: { text: 'hi', level: 'info' } }),
      ev(4, 'task.retrying', { taskId: 'step_a', payload: { attempt: 1, backoffMs: 500, error: 'boom' } }),
      ev(5, 'task.succeeded', { taskId: 'step_a', actor: { kind: 'agent', id: 'op_a' }, payload: { overview: 'ok' } }),
      ev(6, 'task.started', { taskId: 'step_b', actor: { kind: 'agent', id: 'op_b' }, payload: { attempt: 1 } }),
      ev(7, 'task.failed', {
        taskId: 'step_b',
        payload: {
          error: { message: 'CUDA OOM', code: 'ECUDA' },
          action: 'escalate',
          terminalStatus: 'blocked'
        }
      }),
      ev(8, 'budget.tick', { actor: { kind: 'system', id: 'budget' }, payload: { usage: { tokens: 100 }, breaches: [] } }),
      ev(9, 'budget.exceeded', { actor: { kind: 'system', id: 'budget' }, payload: { usage: { tokens: 999 }, breaches: ['tokens'] } }),
      ev(10, 'run.blocked', { actor: { kind: 'system', id: 'budget' }, payload: { reason: 'budget_exceeded', usage: { tokens: 999 } } })
    ];

    const t = buildTelemetry(events);
    const a = t.tasks.find((b) => b.taskId === 'step_a');
    const b = t.tasks.find((x) => x.taskId === 'step_b');

    // 遥测条:起止 + 时长 + 重试
    assert.equal(a.startSeq, 2);
    assert.equal(a.endSeq, 5);
    assert.equal(a.status, 'succeeded');
    assert.equal(a.durationMs, 3000); // (5-2)*1000
    assert.equal(a.retries, 1);
    assert.equal(a.attempts, 1);
    assert.equal(a.logs, 1);

    // 失败条:terminalStatus 生效
    assert.equal(b.status, 'blocked');
    assert.equal(b.error.message, 'CUDA OOM');
    assert.equal(b.durationMs, 1000);

    // 汇总 / 预算 / 用量
    assert.equal(t.summary.totalEvents, 11);
    assert.equal(t.summary.succeeded, 1);
    assert.equal(t.summary.failed, 1);
    assert.equal(t.summary.retries, 1);
    assert.equal(t.summary.budgetExceeded, true);
    assert.equal(t.budget.exceeded.seq, 9);
    assert.equal(t.budget.ticks.length, 1);
    assert.deepEqual(t.usage, { tokens: 999 });
    assert.equal(t.window.durationMs, 10000);
    assert.ok(t.actors.some((x) => x.id === 'budget'));
  });

  test('buildAuditReport:台账折叠 + seq 完整性 + Markdown 渲染', () => {
    const events = [
      ev(0, 'run.created', { actor: { kind: 'boss', id: 'user' }, payload: { templateId: 'tpl' } }),
      ev(1, 'task.started', { taskId: 'step_a', payload: { attempt: 1 } }),
      ev(2, 'gate.failed', {
        taskId: 'step_a',
        actor: { kind: 'agent', id: 'qa' },
        payload: { gateId: 'gate_qa', pass: false, onFail: 'escalate', failures: [{ metric: 'coverage', op: '>=', expected: 0.9, actual: 0.5 }], warnings: [] }
      }),
      ev(3, 'task.failed', { taskId: 'step_a', payload: { error: { message: 'coverage 0.5' }, action: 'escalate', terminalStatus: 'blocked' } }),
      ev(4, 'escalation.opened', {
        taskId: 'step_a',
        actor: { kind: 'system', id: 'scheduler' },
        payload: { id: 'esc_1', runId: 'run_x', taskId: 'step_a', severity: 'block', code: 'TASK_FAILED', title: '任务失败', status: 'open' }
      }),
      ev(5, 'decision.received', {
        actor: { kind: 'boss', id: 'user' },
        payload: { id: 'dec_1', runId: 'run_x', scope: 'escalation', refId: 'esc_1', intent: 'selectOption', payload: { optionId: 'retry' }, actor: 'boss', ts: 1 }
      }),
      ev(6, 'decision.applied', {
        actor: { kind: 'boss', id: 'user' },
        payload: { id: 'dec_1', scope: 'escalation', refId: 'esc_1', intent: 'selectOption', result: { action: 'retry' }, appliedAt: 2 }
      }),
      ev(7, 'escalation.resolved', { actor: { kind: 'boss', id: 'user' }, payload: { id: 'esc_1', status: 'resolved', resolution: { optionId: 'retry' }, resolvedAt: 3 } }),
      ev(8, 'change.requested', {
        actor: { kind: 'boss', id: 'user' },
        payload: { id: 'cr_1', runId: 'run_x', projectId: 'proj_x', reason: '画风不符', scope: { artifactId: 'art_1', version: 1 }, status: 'open', impact: { recomputeSet: ['step_b'] } }
      }),
      ev(9, 'change.applied', { actor: { kind: 'system', id: 'rework' }, payload: { id: 'cr_1', status: 'applied', recomputeSet: ['step_b'], requeued: ['step_b'], artifactsStaled: [] } }),
      ev(10, 'checkpoint.created', { actor: { kind: 'boss', id: 'user' }, payload: { checkpointId: 'ckpt_1', label: '启动前', seq: 0, taskCount: 4 } }),
      ev(11, 'run.completed', { payload: { usage: { tokens: 42, cost: 1, seconds: 9, gpuSeconds: 0 } } })
    ];

    const report = buildAuditReport(events, { runId: 'run_x', projectId: 'proj_x' });

    // 完整性 / 结论
    assert.equal(report.meta.integrity.contiguous, true);
    assert.equal(report.meta.integrity.gaps.length, 0);
    assert.equal(report.meta.totalEvents, 12);
    assert.equal(report.verdict.finalStatus, 'completed');
    assert.equal(report.verdict.humanResolved, 1);
    assert.deepEqual(report.usage, { tokens: 42, cost: 1, seconds: 9, gpuSeconds: 0 });

    // 台账
    assert.equal(report.ledger.escalations.length, 1);
    assert.equal(report.ledger.escalations[0].status, 'resolved');
    assert.equal(report.ledger.escalations[0].resolvedSeq, 7);
    assert.equal(report.ledger.decisions.length, 1);
    assert.equal(report.ledger.decisions[0].applied, true);
    assert.equal(report.ledger.changeRequests.length, 1);
    assert.equal(report.ledger.changeRequests[0].status, 'applied');
    assert.equal(report.ledger.gates.length, 1);
    assert.equal(report.ledger.gates[0].pass, false);
    assert.equal(report.ledger.failures.length, 1);
    assert.equal(report.ledger.checkpoints.length, 1);
    assert.equal(report.lifecycle.some((e) => e.type === 'run.created'), true);

    // Markdown 白皮书
    const md = renderAuditMarkdown(report);
    assert.ok(md.includes('# Run 审计白皮书 · run_x'));
    assert.ok(md.includes('## 3. 升级单'));
    assert.ok(md.includes('esc_1') || md.includes('任务失败'));
    assert.ok(md.includes('## 7. 检查点与回滚'));
    assert.ok(md.includes('seq 连续'));
  });

  test('buildAuditReport:seq 缺口被完整性校验捕获', () => {
    const events = [
      ev(0, 'run.created', {}),
      ev(1, 'run.started', {}),
      ev(5, 'run.completed', { payload: { usage: {} } })
    ];
    const report = buildAuditReport(events);
    assert.equal(report.meta.integrity.contiguous, false);
    assert.deepEqual(report.meta.integrity.gaps, [2, 3, 4]);
  });

  test('buildTimeTree:回滚产生废弃分支(历史不删,只标记)', () => {
    const events = [
      ev(0, 'run.created', { actor: { kind: 'boss', id: 'user' }, payload: { templateId: 'tpl' } }),
      ev(1, 'checkpoint.created', { actor: { kind: 'boss', id: 'user' }, payload: { checkpointId: 'ckpt_a', label: 'A', seq: 0, taskCount: 2 } }),
      ev(2, 'task.started', { taskId: 'step_a', payload: { attempt: 1 } }),
      ev(3, 'task.succeeded', { taskId: 'step_a', payload: {} }),
      ev(4, 'run.rolledback', { actor: { kind: 'boss', id: 'user' }, payload: { checkpointId: 'ckpt_a', targetSeq: 1, label: 'A', taskIds: [], restoredStatus: 'paused' } }),
      ev(5, 'run.completed', { payload: { usage: {} } })
    ];
    const tree = buildTimeTree(events, []);

    const kinds = tree.nodes.map((n) => n.kind);
    assert.deepEqual(kinds, ['origin', 'checkpoint', 'rollback', 'terminal']);
    const rb = tree.nodes.find((n) => n.kind === 'rollback');
    assert.equal(rb.rewindToSeq, 1);
    assert.equal(rb.discardedEvents, 3);

    assert.equal(tree.branches.filter((b) => b.kind === 'main').length, 1);
    const discarded = tree.branches.filter((b) => b.kind === 'discarded');
    assert.equal(discarded.length, 1);
    assert.equal(discarded[0].eventCount, 2); // seq 2,3 ∈ (1, 4]
    assert.equal(tree.current.discardedBranchCount, 1);
    assert.equal(tree.current.status, 'completed');
  });

  test('diffSnapshots:字段级差异 + 新增/移除任务', () => {
    const from = {
      run: { status: 'idle', autonomy: 'L2', usage: { tokens: 0 } },
      tasks: {
        step_a: { id: 'step_a', status: 'pending', attempts: 0, progress: 0 },
        step_gone: { id: 'step_gone', status: 'pending', attempts: 0, progress: 0 }
      }
    };
    const to = {
      run: { status: 'completed', autonomy: 'L3', usage: { tokens: 120 } },
      tasks: {
        step_a: { id: 'step_a', status: 'succeeded', attempts: 1, progress: 100, resultRef: { artifactId: 'art_1', version: 2 } },
        step_new: { id: 'step_new', status: 'pending', attempts: 0, progress: 0 }
      }
    };

    const d = diffSnapshots(from, to);
    assert.equal(d.run.find((f) => f.field === 'status').before, 'idle');
    assert.equal(d.run.find((f) => f.field === 'status').after, 'completed');
    assert.equal(d.run.find((f) => f.field === 'usage.tokens').after, 120);

    const a = d.tasks.find((t) => t.taskId === 'step_a');
    assert.equal(a.change, 'modified');
    assert.ok(a.fields.some((f) => f.field === 'status' && f.after === 'succeeded'));
    assert.ok(a.fields.some((f) => f.field === 'resultRef' && f.after === 'art_1@v2'));
    assert.equal(d.tasks.find((t) => t.taskId === 'step_gone').change, 'removed');
    assert.equal(d.tasks.find((t) => t.taskId === 'step_new').change, 'added');
    assert.equal(d.summary.tasksModified, 1);
  });
});

describe('Projections API · 遥测 / 审计 / 时光树 / Diff(真实执行)', () => {
  const projectId = `test_core_proj_${Date.now()}`;
  const workDir = path.join(os.tmpdir(), `meocoxflow_core_proj_${Date.now()}`);
  let app, server, base;
  let runId;
  let cpStart; // 启动前检查点
  let cpEnd;   // 完成后检查点

  before(async () => {
    await fs.mkdir(workDir, { recursive: true });
    await storage.saveProject({ id: projectId, title: 'projections test', projectDir: workDir });

    app = express();
    app.use(express.json());
    app.use('/api/runs', runsRouter);
    app.use('/api/runs', primitivesRouter);
    app.use('/api/runs', projectionsRouter);
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        base = `http://localhost:${server.address().port}/api/runs`;
        resolve();
      });
    });
  });

  after(async () => {
    server?.close();
    await storage.deleteProject(projectId).catch(() => {});
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  const q = (extra = '') => `${extra ? `${extra}&` : ''}projectId=${projectId}`;

  const getJson = async (url) => {
    const res = await fetch(url);
    const body = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    return { res, body };
  };

  test('创建 Run(启动前检查点)', async () => {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, templateId: 'template_gameplay_highlight', driver: 'mock' })
    });
    assert.equal(res.status, 200);
    const { run, tasks } = await res.json();
    runId = run.id;
    assert.equal(run.status, 'idle');
    assert.equal(tasks.length, 4);

    const cpRes = await fetch(`${base}/${runId}/checkpoints?projectId=${projectId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, label: '启动前' }) });
    assert.equal(cpRes.status, 200);
    const { checkpoint } = await cpRes.json();
    assert.equal(checkpoint.label, '启动前');
    cpStart = checkpoint;
  });

  test('执行至终态(mock 驱动)', async () => {
    const res = await fetch(`${base}/${runId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, driver: 'mock' })
    });
    assert.equal(res.status, 200);

    const deadline = Date.now() + 20000;
    for (;;) {
      const { body } = await getJson(`${base}/${runId}?projectId=${projectId}`);
      if (TERMINAL.has(body.status)) break;
      if (Date.now() > deadline) throw new Error(`Run 未收敛: ${body.status}`);
      await new Promise((r) => setTimeout(r, 100));
    }
    const { body } = await getJson(`${base}/${runId}?projectId=${projectId}`);
    assert.equal(body.status, 'completed');
  });

  test('GET telemetry:遥测条覆盖全部任务,窗口/用量/参与方齐全', async () => {
    const { res, body } = await getJson(`${base}/${runId}/telemetry?${q()}`);
    assert.equal(res.status, 200);
    assert.ok(body.summary.totalEvents > 10);
    assert.equal(body.summary.succeeded, 4);
    assert.equal(body.tasks.length, 4);
    for (const bar of body.tasks) {
      assert.equal(bar.status, 'succeeded', `${bar.taskId} 应成功`);
      assert.ok(bar.startSeq != null);
      assert.ok(bar.durationMs >= 0, `${bar.taskId} 时长应 >= 0`);
    }
    assert.equal(body.window.fromSeq, 0);
    assert.ok(body.window.durationMs >= 0);
    assert.ok(body.usage && typeof body.usage.tokens === 'number');
    assert.ok(body.actors.some((a) => a.id === 'scheduler'));
  });

  test('创建「完成后」检查点 + GET diff:启动前 vs 完成后的字段级差异', async () => {
    const cpRes = await fetch(`${base}/${runId}/checkpoints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, label: '完成后' })
    });
    assert.equal(cpRes.status, 200);
    cpEnd = (await cpRes.json()).checkpoint;

    // 缺省 = 最近两个检查点
    const { res, body } = await getJson(`${base}/${runId}/diff?${q()}`);
    assert.equal(res.status, 200);
    assert.ok(body.run.some((f) => f.field === 'status' && f.before === 'idle' && f.after === 'completed'));
    assert.equal(body.summary.tasksModified, 4);
    assert.ok(body.tasks.every((t) => t.change === 'modified'));

    // 显式 from/to
    const explicit = await getJson(`${base}/${runId}/diff?${q(`from=${cpStart.seq}&to=${cpEnd.seq}`)}`);
    assert.equal(explicit.res.status, 200);
    assert.equal(explicit.body.summary.tasksModified, 4);

    // 不存在的检查点 → 404
    const missing = await getJson(`${base}/${runId}/diff?${q('from=999999')}`);
    assert.equal(missing.res.status, 404);
    assert.equal(missing.body.code, 'EDIFF_NOT_FOUND');
  });

  test('GET timeline:回滚前是线性主线', async () => {
    const { res, body } = await getJson(`${base}/${runId}/timeline?${q()}`);
    assert.equal(res.status, 200);
    const kinds = body.nodes.map((n) => n.kind);
    // run.completed 发生在「完成后」检查点创建之前
    assert.deepEqual(kinds, ['origin', 'checkpoint', 'terminal', 'checkpoint']);
    assert.equal(body.current.checkpointCount, 2);
    assert.equal(body.current.discardedBranchCount, 0);
    assert.equal(body.branches.length, 1);
    assert.equal(body.current.status, 'completed');
  });

  test('一键回滚到「启动前」检查点 → 时光树出现废弃分支', async () => {
    const res = await fetch(`${base}/${runId}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, seq: cpStart.seq })
    });
    assert.equal(res.status, 200);
    const { run } = await res.json();
    assert.equal(run.status, 'paused'); // 非终态快照恢复为 paused

    const { res: tlRes, body: tree } = await getJson(`${base}/${runId}/timeline?${q()}`);
    assert.equal(tlRes.status, 200);
    const kinds = tree.nodes.map((n) => n.kind);
    assert.ok(kinds.includes('rollback'));
    assert.equal(tree.current.discardedBranchCount, 1);
    assert.equal(tree.rollbacks.length, 1);
    assert.equal(tree.rollbacks[0].targetSeq, cpStart.seq);
    const discarded = tree.branches.find((b) => b.kind === 'discarded');
    assert.equal(discarded.fromSeq, cpStart.seq);
    assert.ok(discarded.eventCount > 0);
  });

  test('GET audit:审计报表(含回滚)完整 + Markdown 白皮书可归档', async () => {
    const { res, body } = await getJson(`${base}/${runId}/audit?${q()}`);
    assert.equal(res.status, 200);
    assert.equal(body.meta.integrity.contiguous, true);
    assert.equal(body.verdict.finalStatus, 'completed');
    assert.equal(body.ledger.checkpoints.length, 2);
    assert.equal(body.ledger.rollbacks.length, 1);
    assert.equal(body.ledger.rollbacks[0].targetSeq, cpStart.seq);
    assert.ok(body.actors.length >= 2);
    assert.ok(body.lifecycle.some((e) => e.type === 'run.completed'));
    assert.ok(body.lifecycle.some((e) => e.type === 'run.rolledback'));

    const mdRes = await fetch(`${base}/${runId}/audit?${q('format=md')}`);
    assert.equal(mdRes.status, 200);
    assert.ok((mdRes.headers.get('content-type') || '').includes('text/markdown'));
    const md = await mdRes.text();
    assert.ok(md.includes(`# Run 审计白皮书 · ${runId}`));
    assert.ok(md.includes('## 2. 生命周期'));
    assert.ok(md.includes('## 7. 检查点与回滚'));
    assert.ok(md.includes('run.rolledback'));
  });
});
