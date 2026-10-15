import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { storage } from '../../src/storage/index.js';
import { EventBus } from '../../src/core/bus/eventBus.js';
import { ArtifactStore } from '../../src/core/artifacts/store.js';
import { SchedulerRuntime } from '../../src/core/scheduler/runtime.js';
import { MockExecutor } from '../../src/core/scheduler/executors/mockExecutor.js';
import {
  createTask,
  createRun,
  createEscalation,
  createChangeRequest,
  createDecision,
  createQualityGate
} from '../../src/core/contracts/index.js';
import {
  openEscalation,
  resolveEscalation,
  foldEscalations,
  taskEscalationInput
} from '../../src/core/primitives/escalation.js';
import { recordDecision, markDecisionApplied, foldDecisions } from '../../src/core/primitives/decision.js';
import {
  requestChange,
  applyChange,
  acceptChange,
  rejectChange,
  foldChangeRequests
} from '../../src/core/primitives/changeRequest.js';
import { defaultGateRegistry } from '../../src/core/policy/qualityGate.js';
import primitivesRouter from '../../src/routes/primitives.js';

// ── 契约工厂 ──────────────────────────────────────────────────
describe('协作原语 · 契约工厂校验', () => {
  test('createEscalation:必填与枚举把关', () => {
    const esc = createEscalation({ runId: 'r1', taskId: 't1', code: 'CUDA_OUT_OF_MEMORY', title: '显存溢出' });
    assert.ok(esc.id.startsWith('esc_'));
    assert.equal(esc.severity, 'block');
    assert.equal(esc.status, 'open');
    assert.equal(esc.runId, 'r1');

    assert.throws(() => createEscalation({ runId: 'r1', taskId: 't1', title: '缺 code' }), /校验失败/);
    assert.throws(
      () => createEscalation({ runId: 'r1', taskId: 't1', code: 'X', title: 'T', severity: 'fatal' }),
      /校验失败/
    );
  });

  test('createChangeRequest:scope 与 reason 必填', () => {
    const cr = createChangeRequest({
      runId: 'r1',
      projectId: 'p1',
      reason: '台词太抽象',
      scope: { artifactId: 'art_1', version: 2 }
    });
    assert.ok(cr.id.startsWith('cr_'));
    assert.equal(cr.status, 'open');
    assert.equal(cr.scope.version, 2);

    assert.throws(
      () => createChangeRequest({ runId: 'r1', projectId: 'p1', reason: 'x', scope: { version: 1 } }),
      /校验失败/
    );
    assert.throws(
      () => createChangeRequest({ runId: 'r1', projectId: 'p1', scope: { artifactId: 'a', version: 1 } }),
      /校验失败/
    );
  });

  test('createDecision:intent / scope 走枚举', () => {
    const d = createDecision({ runId: 'r1', scope: 'escalation', refId: 'esc_1', intent: 'selectOption', actor: 'boss' });
    assert.ok(d.id.startsWith('dec_'));
    assert.equal(d.ts > 0, true);

    assert.throws(
      () => createDecision({ runId: 'r1', scope: 'escalation', refId: 'esc_1', intent: 'shutup' }),
      /校验失败/
    );
    assert.throws(
      () => createDecision({ runId: 'r1', scope: 'unknown', refId: 'esc_1', intent: 'approve' }),
      /校验失败/
    );
  });

  test('createQualityGate:op / appliesTo 枚举把关', () => {
    const gate = createQualityGate({
      id: 'g1',
      appliesTo: 'storyboard',
      rules: [{ id: 'r1', metric: 'score', op: '>=', value: 0.8 }]
    });
    assert.equal(gate.onFail, 'escalate');

    assert.throws(
      () => createQualityGate({ id: 'g2', appliesTo: 'nope', rules: [] }),
      /校验失败/
    );
  });
});

// ── 升级单 + 裁决:事件溯源折叠 ────────────────────────────────
describe('Escalation / Decision · 落盘、折叠、历史不可变', () => {
  const projectId = `test_core_prim_esc_${Date.now()}`;
  const workDir = path.join(os.tmpdir(), `meocoxflow_core_prim_esc_${Date.now()}`);
  const runId = 'run_prim_esc';
  const bus = new EventBus();
  const ctx = { bus, projectId, runId };

  before(async () => {
    await fs.mkdir(workDir, { recursive: true });
    await storage.saveProject({ id: projectId, title: 'primitives escalation', projectDir: workDir });
    await storage.saveRun(projectId, createRun({ id: runId, projectId, taskIds: ['t1'] }));
  });

  after(async () => {
    await storage.deleteProject(projectId).catch(() => {});
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  test('openEscalation:escalation.opened 的 payload 是旧扁平 payload 的超集', async () => {
    const esc = await openEscalation(ctx, {
      taskId: 't1',
      code: 'CUDA_OUT_OF_MEMORY',
      title: '显存溢出',
      detail: 'Tried to allocate 4.20 GiB',
      suggestedOptions: [{ id: 'opt_downscale', title: '降级分辨率', recommended: true }]
    });

    const events = await bus.replay(projectId, runId);
    const opened = events.find((e) => e.type === 'escalation.opened' && e.payload.id === esc.id);
    assert.ok(opened, '应有 escalation.opened');
    // 旧扁平 payload 字段全部保留(超集,老消费者不破坏)
    for (const key of ['severity', 'code', 'title', 'detail', 'suggestedOptions']) {
      assert.ok(key in opened.payload, `payload 应含 ${key}`);
    }
    assert.equal(opened.payload.status, 'open');
    assert.equal(opened.payload.severity, 'block');
    assert.equal(opened.taskId, 't1');
    // seq 严格单调递增
    const seqs = events.map((e) => e.seq);
    for (let i = 1; i < seqs.length; i += 1) assert.ok(seqs[i] > seqs[i - 1], 'seq 必须严格递增');
  });

  test('resolveEscalation:追加事件不回改历史,fold 出 resolved', async () => {
    const esc = await openEscalation(ctx, { taskId: 't1', code: 'X', title: '待裁决' });
    const before = (await bus.replay(projectId, runId)).length;

    await resolveEscalation(ctx, { id: esc.id, resolution: { optionId: 'opt_downscale' }, actor: 'boss' });

    const events = await bus.replay(projectId, runId);
    assert.equal(events.length, before + 1, '只追加一条事件');
    assert.equal(events.find((e) => e.payload?.id === esc.id && e.type === 'escalation.opened').payload.status, 'open',
      '历史事件不被改写');

    const folded = foldEscalations(events).find((x) => x.id === esc.id);
    assert.equal(folded.status, 'resolved');
    assert.equal(folded.resolution.optionId, 'opt_downscale');
  });

  test('recordDecision + markDecisionApplied:裁决链可折叠,applied 可追溯', async () => {
    const esc = await openEscalation(ctx, { taskId: 't1', code: 'Y', title: '等待拍板' });
    const decision = await recordDecision(ctx, {
      scope: 'escalation',
      refId: esc.id,
      intent: 'selectOption',
      payload: { optionId: 'retry' },
      actor: 'boss'
    });
    await resolveEscalation(ctx, { id: esc.id, resolution: { optionId: 'retry' }, actor: 'boss' });
    await markDecisionApplied(ctx, decision, { action: 'retry' });

    const events = await bus.replay(projectId, runId);
    const received = events.find((e) => e.type === 'decision.received' && e.payload.id === decision.id);
    assert.ok(received, '应有 decision.received');
    assert.equal(received.payload.scope, 'escalation');
    assert.equal(received.payload.refId, esc.id);
    assert.equal(received.actor.kind, 'boss');

    const folded = foldDecisions(events).find((d) => d.id === decision.id);
    assert.equal(folded.applied, true);
    assert.deepEqual(folded.appliedResult, { action: 'retry' });

    // 升级单与裁决互相关联
    const escFolded = foldEscalations(events).find((x) => x.id === esc.id);
    assert.equal(escFolded.status, 'resolved');
    assert.ok(folded.refId === esc.id);
  });

  test('taskEscalationInput:生成默认升级单输入(旧扁平字段齐备)', () => {
    const input = taskEscalationInput({
      run: { id: 'r1' },
      task: { id: 't1', operatorId: 'op_render' },
      err: new Error('boom')
    });
    assert.equal(input.code, 'TASK_FAILED');
    assert.equal(input.severity, 'block');
    assert.ok(input.title.includes('op_render'));
    assert.equal(input.suggestedOptions.length, 3);
    assert.equal(input.detail, 'boom');
  });
});

// ── 变更单:影响面 + 返工闭环 ──────────────────────────────────
describe('ChangeRequest · 影响面分析与返工闭环', () => {
  const projectId = `test_core_prim_cr_${Date.now()}`;
  const workDir = path.join(os.tmpdir(), `meocoxflow_core_prim_cr_${Date.now()}`);
  const runId = 'run_prim_cr';
  const bus = new EventBus();
  const store = new ArtifactStore();
  const ctx = { bus, projectId, runId, storage, artifactStore: store };

  before(async () => {
    await fs.mkdir(workDir, { recursive: true });
    await storage.saveProject({ id: projectId, title: 'primitives change', projectDir: workDir });
    await storage.saveRun(projectId, createRun({ id: runId, projectId, taskIds: ['t_up', 't_down', 't_other'] }));

    // 谱系:art_up(剧本) -> art_down(时间线);t_up / t_down 分别是它们的生产者
    await store.produce(projectId, {
      artifactId: 'art_up',
      kind: 'storyboard',
      payload: { shots: 3 },
      producedBy: { taskId: 't_up' }
    });
    await store.produce(projectId, {
      artifactId: 'art_down',
      kind: 'timeline_manifest',
      payload: { tracks: 6 },
      lineage: [{ artifactId: 'art_up', version: 1, kind: 'storyboard' }],
      producedBy: { taskId: 't_down' }
    });

    for (const id of ['t_up', 't_down', 't_other']) {
      await storage.saveTask(projectId, runId, createTask({
        id, runId, projectId, type: 'custom', dependsOn: [], produces: []
      }));
      const t = await storage.getTask(projectId, runId, id);
      t.status = 'succeeded';
      await storage.saveTask(projectId, runId, t);
    }
  });

  after(async () => {
    await storage.deleteProject(projectId).catch(() => {});
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  test('requestChange:重算集 = 下游闭包 ∪ scope 自身生产者', async () => {
    const cr = await requestChange(ctx, {
      reason: '第2镜头台词偏抽象说理',
      requestedChange: '重写为具象隐喻',
      scope: { artifactId: 'art_up', version: 1 },
      actor: 'boss'
    });

    const affected = cr.impact.affectedArtifacts.map((a) => a.artifactId).sort();
    assert.deepEqual(affected, ['art_down', 'art_up'], '下游 + 自身都算受影响产物');
    assert.ok(cr.impact.recomputeSet.includes('t_up'), 'scope 自身的生产者必须进重算集');
    assert.ok(cr.impact.recomputeSet.includes('t_down'), '下游生产者进重算集');
    assert.ok(!cr.impact.recomputeSet.includes('t_other'), '无关任务不得进重算集');

    // kind / version 信息齐备(applyChange 标 stale 用)
    const upEntry = cr.impact.affectedArtifacts.find((a) => a.artifactId === 'art_up');
    assert.equal(upEntry.kind, 'storyboard');
    assert.equal(upEntry.version, 1);

    const events = await bus.replay(projectId, runId);
    assert.ok(events.some((e) => e.type === 'change.requested' && e.payload.id === cr.id));
  });

  test('applyChange:产物标 stale、受影响任务重排 pending,无关任务不动', async () => {
    const events = await bus.replay(projectId, runId);
    const cr = foldChangeRequests(events).find((c) => c.status === 'open');
    assert.ok(cr, '应有 open 状态的变更单');

    const result = await applyChange(ctx, cr);
    assert.deepEqual(result.requeued.sort(), ['t_down', 't_up']);
    assert.deepEqual(result.artifactsStaled.sort(), ['art_down', 'art_up']);

    // 产物 stale
    assert.equal((await storage.getArtifactIndex(projectId, 'storyboard', 'art_up')).status, 'stale');
    assert.equal((await storage.getArtifactIndex(projectId, 'timeline_manifest', 'art_down')).status, 'stale');

    // 受影响任务回到 pending(可被下一次 execute 重跑),attempts 清零
    const tUp = await storage.getTask(projectId, runId, 't_up');
    assert.equal(tUp.status, 'pending');
    assert.equal(tUp.attempts, 0);
    // 无关任务原样
    assert.equal((await storage.getTask(projectId, runId, 't_other')).status, 'succeeded');

    // 事件留痕
    const after = await bus.replay(projectId, runId);
    const applied = after.find((e) => e.type === 'change.applied' && e.payload.id === cr.id);
    assert.ok(applied, '应有 change.applied');
    assert.deepEqual(applied.payload.requeued.sort(), ['t_down', 't_up']);
    assert.ok(after.some((e) => e.type === 'task.stale' && e.taskId === 't_up'));

    // fold 状态推进
    const folded = foldChangeRequests(after).find((c) => c.id === cr.id);
    assert.equal(folded.status, 'applied');
  });

  test('acceptChange / rejectChange:受理与驳回都进事件流', async () => {
    const cr2 = await requestChange(ctx, {
      reason: '下游也想改',
      scope: { artifactId: 'art_down', version: 1 },
      actor: 'boss'
    });
    await acceptChange(ctx, cr2, 'boss');
    let folded = foldChangeRequests(await bus.replay(projectId, runId)).find((c) => c.id === cr2.id);
    assert.equal(folded.status, 'accepted');

    await rejectChange(ctx, cr2, { reason: '暂不返工', actor: 'boss' });
    const events = await bus.replay(projectId, runId);
    assert.ok(events.some((e) => e.type === 'change.rejected' && e.payload.id === cr2.id));
    folded = foldChangeRequests(events).find((c) => c.id === cr2.id);
    assert.equal(folded.status, 'rejected');
    assert.equal(folded.rejectedReason, '暂不返工');
  });
});

// ── 路由:挂在 /api/runs 下的协作原语 API ─────────────────────
describe('Routes · /api/runs/:runId 下的协作原语 API', () => {
  const projectId = `test_core_prim_rt_${Date.now()}`;
  const workDir = path.join(os.tmpdir(), `meocoxflow_core_prim_rt_${Date.now()}`);
  let app, server, base;

  before(async () => {
    await fs.mkdir(workDir, { recursive: true });
    await storage.saveProject({ id: projectId, title: 'primitives routes', projectDir: workDir });
    app = express();
    app.use(express.json());
    app.use('/api/runs', primitivesRouter);
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

  const post = (url, body) => fetch(`${base}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  test('POST :runId/escalations 打开升级单', async () => {
    const res = await post('/run_rt_1/escalations', {
      projectId,
      escalation: { taskId: 'visualArtist', code: 'CUDA_OUT_OF_MEMORY', title: '显存溢出', detail: 'OOM 4.2GB' }
    });
    assert.equal(res.status, 200);
    const { escalation } = await res.json();
    assert.ok(escalation.id.startsWith('esc_'));
    assert.equal(escalation.runId, 'run_rt_1');

    const events = await storage.readEvents(projectId, 'run_rt_1');
    assert.ok(events.some((e) => e.type === 'escalation.opened' && e.payload.id === escalation.id));
  });

  test('POST 缺 projectId 返回 400', async () => {
    const res = await post('/run_rt_1/escalations', { escalation: { taskId: 't', code: 'X', title: 'T' } });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.missingParam, 'projectId');
  });

  test('POST :runId/decisions:escalation 裁决自动解决升级单', async () => {
    const openRes = await post('/run_rt_2/escalations', {
      projectId,
      escalation: { taskId: 't', code: 'X', title: '等待拍板' }
    });
    const { escalation } = await openRes.json();

    const res = await post('/run_rt_2/decisions', {
      projectId,
      decision: { scope: 'escalation', refId: escalation.id, intent: 'selectOption', payload: { optionId: 'opt_cloud' }, actor: 'boss' }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.decision.scope, 'escalation');
    assert.equal(data.applied.status, 'resolved');

    const events = await storage.readEvents(projectId, 'run_rt_2');
    assert.ok(events.some((e) => e.type === 'decision.received'));
    assert.ok(events.some((e) => e.type === 'decision.applied'));
    assert.ok(events.some((e) => e.type === 'escalation.resolved' && e.payload.id === escalation.id));

    const collab = await (await fetch(`${base}/run_rt_2/collaboration?projectId=${projectId}`)).json();
    assert.equal(collab.escalations.find((x) => x.id === escalation.id).status, 'resolved');
    assert.equal(collab.decisions.length, 1);
    assert.equal(collab.decisions[0].applied, true);
  });

  test('POST :runId/change-requests:返回影响面;apply 幂等闭环', async () => {
    const res = await post('/run_rt_3/change-requests', {
      projectId,
      reason: '第2镜头台词偏抽象',
      scope: { artifactId: 'storyboard_ghost', version: 1 },
      actor: 'boss'
    });
    assert.equal(res.status, 200);
    const { changeRequest, impact } = await res.json();
    assert.ok(changeRequest.id.startsWith('cr_'));
    // 无谱系:自身仍在影响面里,重算集为「未知生产者 => 空」但结构齐备
    assert.deepEqual(impact.affectedArtifacts.map((a) => a.artifactId), ['storyboard_ghost']);
    assert.deepEqual(impact.recomputeSet, []);

    const applyRes = await post(`/run_rt_3/change-requests/${changeRequest.id}/apply`, { projectId });
    assert.equal(applyRes.status, 200);
    const applied = await applyRes.json();
    assert.deepEqual(applied.recomputeSet, []);

    // 幂等:重复 apply 仍 200
    const again = await post(`/run_rt_3/change-requests/${changeRequest.id}/apply`, { projectId });
    assert.equal(again.status, 200);

    // 不存在的变更单 => 404
    const missing = await post('/run_rt_3/change-requests/cr_nope/apply', { projectId });
    assert.equal(missing.status, 404);
  });

  test('POST :runId/gates/:gateId/evaluate:临时闸门注册 + 判定', async () => {
    const res = await post('/run_rt_4/gates/gate_rt_demo/evaluate', {
      projectId,
      gate: {
        id: 'gate_rt_demo',
        appliesTo: 'report',
        rules: [{ id: 'r1', metric: 'score', op: '>=', value: 0.8 }],
        onFail: 'escalate'
      },
      metrics: { score: 0.95 }
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.pass, true);

    const failRes = await post('/run_rt_4/gates/gate_rt_demo/evaluate', {
      projectId,
      metrics: { score: 0.3 }
    });
    const failData = await failRes.json();
    assert.equal(failData.pass, false);
    assert.equal(failData.failures[0].metric, 'score');

    // 未注册且没有临时定义 => 404
    const notFound = await post('/run_rt_4/gates/gate_rt_missing/evaluate', { projectId, metrics: {} });
    assert.equal(notFound.status, 404);
  });

  test('GET :runId/collaboration:空 run 返回空折叠', async () => {
    const res = await fetch(`${base}/run_rt_empty/collaboration?projectId=${projectId}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.lastSeq, -1);
    assert.deepEqual(data.escalations, []);
    assert.deepEqual(data.changeRequests, []);
    assert.deepEqual(data.decisions, []);
  });
});

// ── Runtime 治理集成:闸门 / 自治 / 预算 ───────────────────────
describe('Runtime 治理集成 · 质检闸门 / L3 自治 / 预算硬约束', () => {
  const projectId = `test_core_prim_gov_${Date.now()}`;
  const workDir = path.join(os.tmpdir(), `meocoxflow_core_prim_gov_${Date.now()}`);
  const store = new ArtifactStore();
  let seq = 0;

  before(async () => {
    await fs.mkdir(workDir, { recursive: true });
    await storage.saveProject({ id: projectId, title: 'governance runtime', projectDir: workDir });
  });

  after(async () => {
    await storage.deleteProject(projectId).catch(() => {});
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  function makeTask(overrides) {
    return createTask({
      id: overrides.id,
      runId: overrides.runId || 'run_gov',
      projectId,
      type: overrides.type || 'custom',
      dependsOn: overrides.dependsOn || [],
      produces: overrides.produces || [],
      policy: overrides.policy || {},
      mock: overrides.mock || null
    });
  }

  async function runScenario({ tasks, autonomy = 'L2', budget = {} }) {
    seq += 1;
    const bus = new EventBus();
    const run = createRun({
      id: `run_gov_${seq}`,
      projectId,
      autonomy,
      budget,
      taskIds: tasks.map((t) => t.id)
    });
    tasks.forEach((t) => { t.runId = run.id; });
    await storage.saveRun(projectId, run);
    for (const t of tasks) await storage.saveTask(projectId, run.id, t);

    const runtime = new SchedulerRuntime({
      bus, storage, artifactStore: store, executor: new MockExecutor(), concurrency: 3
    });
    const result = await runtime.execute({ run, tasks });
    const events = await bus.replay(projectId, run.id);
    return { ...result, events, bus };
  }

  test('质检达标:自动放行,留 gate.passed', async () => {
    defaultGateRegistry.register({
      id: 'gate_gov_pass',
      appliesTo: 'report',
      rules: [{ id: 'r_score', metric: 'score', op: '>=', value: 0.8 }],
      onPass: 'advance',
      onFail: 'escalate'
    });
    const tasks = [
      makeTask({ id: 'gated_pass', policy: { qualityGateId: 'gate_gov_pass' }, mock: { metrics: { score: 0.95 }, steps: ['s'] } })
    ];
    const { tasks: done, events } = await runScenario({ tasks });

    assert.equal(done[0].status, 'succeeded');
    const gateEvent = events.find((e) => e.type === 'gate.passed');
    assert.ok(gateEvent, '应有 gate.passed');
    assert.equal(gateEvent.payload.gateId, 'gate_gov_pass');
    assert.ok(events.some((e) => e.type === 'task.succeeded'));
  });

  test('质检未达标:onFail=escalate -> blocked + gate.failed + EGATE', async () => {
    defaultGateRegistry.register({
      id: 'gate_gov_fail',
      appliesTo: 'report',
      rules: [{ id: 'r_score', metric: 'score', op: '>=', value: 0.8 }],
      onPass: 'advance',
      onFail: 'escalate'
    });
    const tasks = [
      makeTask({ id: 'gated_fail', policy: { qualityGateId: 'gate_gov_fail' }, mock: { metrics: { score: 0.3 }, steps: ['s'] } })
    ];
    const { tasks: done, events, run } = await runScenario({ tasks });

    assert.equal(done[0].status, 'blocked');
    assert.equal(done[0].error.code, 'EGATE');
    const failEvent = events.find((e) => e.type === 'gate.failed');
    assert.ok(failEvent, '应有 gate.failed');
    assert.equal(failEvent.payload.failures[0].actual, 0.3);
    assert.ok(events.some((e) => e.type === 'escalation.opened'));
    assert.equal(run.status, 'blocked');
  });

  test('质检未达标:onFail=retry -> 走重试通道,耗尽后 failed', async () => {
    defaultGateRegistry.register({
      id: 'gate_gov_retry',
      appliesTo: 'report',
      rules: [{ id: 'r_score', metric: 'score', op: '>=', value: 0.8 }],
      onFail: 'retry'
    });
    const tasks = [
      makeTask({
        id: 'gated_retry',
        policy: { qualityGateId: 'gate_gov_retry', maxAttempts: 2, timeoutMs: 5000 },
        mock: { metrics: { score: 0.1 }, steps: ['s'], stepDelayMs: 5 }
      })
    ];
    const { tasks: done, events } = await runScenario({ tasks });

    assert.equal(done[0].status, 'failed');
    assert.equal(events.filter((e) => e.type === 'gate.failed').length, 2, '两次尝试两次判定');
    assert.ok(events.some((e) => e.type === 'task.retrying'), 'gate.onFail=retry 应触发重试');
  });

  test('L3 全自动:失败自动脱困(开升级单+裁决链),耗尽自动跳过,run 跑通', async () => {
    const tasks = [
      makeTask({ id: 'auto_fail', mock: { alwaysFail: true, steps: ['s'], stepDelayMs: 5 } })
    ];
    const { tasks: done, run, events } = await runScenario({ tasks, autonomy: 'L3' });

    assert.equal(run.status, 'completed', 'L3 全自动应跑通');
    assert.equal(done[0].status, 'skipped');

    // 完整脱困链:escalation.opened -> decision.received -> escalation.resolved -> decision.applied
    assert.ok(events.some((e) => e.type === 'escalation.opened'));
    assert.ok(events.some((e) => e.type === 'decision.received' && e.payload.actor === 'system'));
    assert.ok(events.some((e) => e.type === 'escalation.resolved'));
    assert.ok(events.some((e) => e.type === 'decision.applied'));
    assert.ok(events.some((e) => e.type === 'task.retrying' && e.payload.auto === true), '第一次失败自动重试');

    const foldedEsc = foldEscalations(events);
    assert.ok(foldedEsc.length >= 1);
    assert.ok(foldedEsc.every((x) => x.status === 'resolved'), '所有升级单均被自治解决');
    const foldedDec = foldDecisions(events);
    assert.ok(foldedDec.length >= 1);
    assert.ok(foldedDec.every((d) => d.applied === true), '所有裁决均已作用');
  });

  test('L2(默认):block 级升级必须老板拍板,不自动脱困', async () => {
    const tasks = [
      makeTask({ id: 'l2_fail', mock: { alwaysFail: true, steps: ['s'], stepDelayMs: 5 } })
    ];
    const { tasks: done, run, events } = await runScenario({ tasks, autonomy: 'L2' });

    assert.equal(done[0].status, 'blocked');
    assert.equal(run.status, 'blocked');
    assert.ok(events.some((e) => e.type === 'escalation.opened'));
    assert.ok(!events.some((e) => e.type === 'decision.received'), 'L2 不得自动裁决');
  });

  test('预算硬约束:超限停调度,run.blocked 带 reason=budget_exceeded', async () => {
    const tasks = [
      makeTask({ id: 'burn', mock: { steps: ['a', 'b'], stepDelayMs: 30 } })
    ];
    const { run, events } = await runScenario({ tasks, budget: { maxSeconds: 0 } });

    assert.equal(run.status, 'blocked');
    assert.ok(events.some((e) => e.type === 'budget.tick'), '有额度时应有 budget.tick');
    assert.ok(events.some((e) => e.type === 'budget.exceeded'), '应有 budget.exceeded');
    const blocked = events.find((e) => e.type === 'run.blocked');
    assert.ok(blocked);
    assert.equal(blocked.payload.reason, 'budget_exceeded');
    assert.ok(blocked.payload.breaches.some((b) => b.metric === 'seconds'));
  });

  test('预算为空:不发任何 budget 事件,行为与改造前一致', async () => {
    const tasks = [makeTask({ id: 'no_budget', mock: { steps: ['s'], stepDelayMs: 5 } })];
    const { run, events } = await runScenario({ tasks });

    assert.equal(run.status, 'completed');
    assert.equal(events.filter((e) => e.type.startsWith('budget.')).length, 0);
  });
});
