import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { storage } from '../../src/storage/index.js';
import { EventBus } from '../../src/core/bus/eventBus.js';
import { ArtifactStore } from '../../src/core/artifacts/store.js';
import { SchedulerRuntime } from '../../src/core/scheduler/runtime.js';
import { MockExecutor } from '../../src/core/scheduler/executors/mockExecutor.js';
import { OperatorExecutor, OUTPUT_KIND_MAP } from '../../src/core/scheduler/executors/operatorExecutor.js';
import { validateDag, topoSort, readyTaskIds, blockedFrontier } from '../../src/core/scheduler/dag.js';
import { createTask, createRun } from '../../src/core/contracts/index.js';
import { createRunFromTemplate, runTemplate } from '../../src/core/run/orchestrator.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function makeTask(overrides) {
  return createTask({
    id: overrides.id,
    runId: overrides.runId || 'run_1',
    projectId: overrides.projectId || 'p1',
    type: overrides.type || 'custom',
    dependsOn: overrides.dependsOn || [],
    produces: overrides.produces || [],
    policy: overrides.policy || {},
    mock: overrides.mock || null
  });
}

describe('DAG · 图算法', () => {
  const tasks = [
    makeTask({ id: 'a' }),
    makeTask({ id: 'b', dependsOn: ['a'] }),
    makeTask({ id: 'c', dependsOn: ['a'] }),
    makeTask({ id: 'd', dependsOn: ['b', 'c'] })
  ];

  test('拓扑排序满足依赖先后', () => {
    const order = topoSort(tasks);
    assert.equal(order.length, 4);
    assert.ok(order.indexOf('a') < order.indexOf('b'));
    assert.ok(order.indexOf('a') < order.indexOf('c'));
    assert.ok(order.indexOf('b') < order.indexOf('d'));
    assert.ok(order.indexOf('c') < order.indexOf('d'));
  });

  test('检测环与缺失依赖', () => {
    const cyclic = [makeTask({ id: 'x', dependsOn: ['y'] }), makeTask({ id: 'y', dependsOn: ['x'] })];
    const res = validateDag(cyclic);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('环')));

    const missing = validateDag([makeTask({ id: 'm', dependsOn: ['nope'] })]);
    assert.equal(missing.valid, false);
    assert.ok(missing.errors.some((e) => e.includes('不存在')));
  });

  test('就绪判定只放行前置已成功的任务', () => {
    const t = [
      makeTask({ id: 'a' }),
      makeTask({ id: 'b', dependsOn: ['a'] })
    ];
    assert.deepEqual(readyTaskIds(t), ['a']);
    t[0].status = 'succeeded';
    assert.deepEqual(readyTaskIds(t), ['b']);
  });

  test('悬挂前沿识别:前置失败的下游永远不就绪', () => {
    const t = [
      makeTask({ id: 'a' }),
      makeTask({ id: 'b', dependsOn: ['a'] })
    ];
    t[0].status = 'blocked';
    assert.deepEqual(blockedFrontier(t), ['b']);
  });
});

describe('SchedulerRuntime · 并发 / 重试 / 超时 / 升级', () => {
  const projectId = `test_core_sched_${Date.now()}`;
  const workDir = path.join(os.tmpdir(), `meocoxflow_core_sched_${Date.now()}`);
  const store = new ArtifactStore();

  before(async () => {
    await fs.mkdir(workDir, { recursive: true });
    await storage.saveProject({ id: projectId, title: 'scheduler test', projectDir: workDir });
  });

  after(async () => {
    await storage.deleteProject(projectId).catch(() => {});
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  async function runScenario({ tasks, concurrency = 3, executor = new MockExecutor() }) {
    const bus = new EventBus();
    const run = createRun({ id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, projectId, taskIds: tasks.map((t) => t.id) });
    tasks.forEach((t) => { t.runId = run.id; t.projectId = projectId; });
    await storage.saveRun(projectId, run);
    for (const t of tasks) await storage.saveTask(projectId, run.id, t);
    const runtime = new SchedulerRuntime({ bus, storage, artifactStore: store, executor, concurrency });
    const result = await runtime.execute({ run, tasks });
    const events = await bus.replay(projectId, run.id);
    return { ...result, events, bus };
  }

  test('依赖顺序被严格遵守,且独立分支并发执行', async () => {
    const tasks = [
      makeTask({ id: 'root', mock: { stepDelayMs: 30, steps: ['r1', 'r2'] } }),
      makeTask({ id: 'left', dependsOn: ['root'], mock: { stepDelayMs: 60, steps: ['l1', 'l2', 'l3'] } }),
      makeTask({ id: 'right', dependsOn: ['root'], mock: { stepDelayMs: 60, steps: ['g1', 'g2', 'g3'] } }),
      makeTask({ id: 'join', dependsOn: ['left', 'right'], mock: { stepDelayMs: 20, steps: ['j1'] } })
    ];
    const concurrencySeen = { max: 0 };
    const bus = new EventBus();
    let inFlight = 0;
    const run = createRun({ id: 'run_order', projectId, taskIds: tasks.map((t) => t.id) });
    tasks.forEach((t) => { t.runId = run.id; t.projectId = projectId; });
    await storage.saveRun(projectId, run);
    for (const t of tasks) await storage.saveTask(projectId, run.id, t);
    const runtime = new SchedulerRuntime({ bus, storage, artifactStore: store, executor: new MockExecutor(), concurrency: 3 });
    const unsub = bus.subscribe(run.id, (e) => {
      if (e.type === 'task.started') { inFlight += 1; concurrencySeen.max = Math.max(concurrencySeen.max, inFlight); }
      if (e.type === 'task.succeeded' || e.type === 'task.failed') inFlight -= 1;
    });
    const { tasks: done } = await runtime.execute({ run, tasks });
    unsub();

    const status = Object.fromEntries(done.map((t) => [t.id, t.status]));
    assert.deepEqual(status, { root: 'succeeded', left: 'succeeded', right: 'succeeded', join: 'succeeded' });

    const events = await bus.replay(projectId, 'run_order');
    const startedAt = {};
    const endedAt = {};
    let t0 = null;
    for (const e of events) {
      if (e.type === 'task.started') { startedAt[e.taskId] = e.ts; t0 = t0 ?? e.ts; }
      if (e.type === 'task.succeeded') endedAt[e.taskId] = e.ts;
    }
    // left 必须在 root 之后启动
    assert.ok(startedAt.left >= endedAt.root, 'left 不应早于 root 完成');
    // join 必须在 left/right 都完成之后启动
    assert.ok(startedAt.join >= endedAt.left && startedAt.join >= endedAt.right, 'join 应等待两个分支');
    // 至少观察到 2 个任务同时在跑(root 之后左右并发)
    assert.ok(concurrencySeen.max >= 2, `期望并发度>=2,实际 ${concurrencySeen.max}`);
  });

  test('onFailure=retry:失败重试后成功', async () => {
    const tasks = [
      makeTask({ id: 'flaky', policy: { onFailure: 'retry', maxAttempts: 3 }, mock: { failTimes: 1, steps: ['s1'] } })
    ];
    const { tasks: done, run } = await runScenario({ tasks });
    assert.equal(done[0].status, 'succeeded');
    assert.ok(done[0].attempts >= 2, `期望重试,实际 attempts=${done[0].attempts}`);
    assert.equal(run.status, 'completed');
  });

  test('onFailure=escalate:失败升级为 blocked,下游悬挂,run 置 blocked', async () => {
    const tasks = [
      makeTask({ id: 'bad', policy: { onFailure: 'escalate' }, mock: { alwaysFail: true } }),
      makeTask({ id: 'downstream', dependsOn: ['bad'], mock: { steps: ['x'] } })
    ];
    const { tasks: done, run, events } = await runScenario({ tasks });
    const status = Object.fromEntries(done.map((t) => [t.id, t.status]));
    assert.equal(status.bad, 'blocked');
    assert.equal(status.downstream, 'pending');
    assert.equal(run.status, 'blocked');
    assert.ok(events.some((e) => e.type === 'escalation.opened'));
  });

  test('超时看门狗:超时任务按策略终止', async () => {
    const tasks = [
      makeTask({
        id: 'slow',
        policy: { timeoutMs: 80, onFailure: 'escalate' },
        mock: { stepDelayMs: 100, steps: ['a', 'b', 'c', 'd', 'e'] }
      })
    ];
    const { tasks: done } = await runScenario({ tasks });
    assert.equal(done[0].status, 'blocked');
    assert.ok(done[0].error, '应有错误记录');
  });

  test('产物自动登记并携带 lineage(上游 -> 下游)', async () => {
    const tasks = [
      makeTask({ id: 'gen', produces: ['storyboard'], mock: { steps: ['g'], artifacts: [{ kind: 'storyboard', payload: { shots: 3 } }] } }),
      makeTask({
        id: 'use', dependsOn: ['gen'], produces: ['timeline_manifest'],
        mock: { steps: ['u'], artifacts: [{ kind: 'timeline_manifest', payload: { tracks: 6 } }] }
      })
    ];
    const { tasks: done } = await runScenario({ tasks });
    assert.equal(done[1].status, 'succeeded');
    assert.ok(done[1].resultRef?.artifactId);

    const all = await store.listAll(projectId);
    const manifest = all.find((a) => a.kind === 'timeline_manifest');
    const latest = manifest.versions.find((v) => v.version === manifest.currentVersion);
    assert.ok(latest.lineage.length >= 1, '下游产物应记录上游 lineage');
  });
});

describe('Orchestrator · 模板 -> Run -> 执行', () => {
  const projectId = `test_core_orch_${Date.now()}`;
  const workDir = path.join(os.tmpdir(), `meocoxflow_core_orch_${Date.now()}`);

  before(async () => {
    await fs.mkdir(workDir, { recursive: true });
    await storage.saveProject({ id: projectId, title: 'orchestrator test', projectDir: workDir });
  });

  after(async () => {
    await storage.deleteProject(projectId).catch(() => {});
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  test('模板物化出带 dependsOn 的 DAG 任务,并校验合法', async () => {
    const { run, tasks } = await createRunFromTemplate({
      projectId,
      templateId: 'template_aigc_storyboard',
      decorate: (t) => ({ ...t, mock: { steps: ['x'] } })
    });
    assert.equal(run.templateId, 'template_aigc_storyboard');
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
    assert.deepEqual(byId.step_aigc_generation.dependsOn, ['step_aigc_script']);
    assert.deepEqual(byId.step_aigc_export.dependsOn, ['step_aigc_generation', 'step_aigc_tts']);
    assert.equal(validateDag(tasks).valid, true);
  });

  test('runTemplate 端到端(虚拟驱动)完成并落盘事件', async () => {
    const { run, tasks } = await runTemplate({
      projectId,
      templateId: 'template_gameplay_highlight',
      executor: new MockExecutor(),
      concurrency: 3,
      decorate: (t) => ({ ...t, mock: { steps: ['感知', '产出'], artifacts: [{ kind: 'report', payload: { stage: t.id } }] } })
    });
    assert.equal(run.status, 'completed');
    assert.ok(tasks.every((t) => t.status === 'succeeded'));

    const events = await storage.readEvents(projectId, run.id);
    const types = events.map((e) => e.type);
    assert.ok(types.includes('run.started'));
    assert.ok(types.includes('run.completed'));
    assert.ok(types.filter((t) => t === 'task.succeeded').length === tasks.length);
    // seq 连续
    const seqs = events.map((e) => e.seq);
    assert.deepEqual(seqs, seqs.map((_, i) => i));
  });
});

describe('OperatorExecutor · 真实算子适配', () => {
  test('canExecute 只认已注册算子', () => {
    const ex = new OperatorExecutor({ storage, artifactStore: new ArtifactStore() });
    assert.equal(ex.canExecute({ operatorId: 'script_storyboard_planning' }), true);
    assert.equal(ex.canExecute({ operatorId: 'not_a_real_operator' }), false);
    assert.equal(ex.canExecute({}), false);
  });

  test('OUTPUT_KIND_MAP 覆盖既有算子的输出', () => {
    assert.equal(OUTPUT_KIND_MAP.storyboard, 'storyboard');
    assert.equal(OUTPUT_KIND_MAP.jianying_draft, 'jianying_draft');
    assert.equal(OUTPUT_KIND_MAP.assets, 'asset_index');
  });
});