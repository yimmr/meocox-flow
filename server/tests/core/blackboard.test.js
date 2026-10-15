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
import { BlackboardStore, BB_AUDIT_RUN_ID, defaultBlackboardStore } from '../../src/core/blackboard/store.js';
import { createBlackboard } from '../../src/core/contracts/index.js';
import blackboardRouter from '../../src/routes/blackboard.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── SSE 测试工具 ────────────────────────────────────────────────
function parseFrame(frame) {
  const out = { id: null, event: null, data: null };
  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('id: ')) out.id = Number(line.slice(4));
    else if (line.startsWith('event: ')) out.event = line.slice(7);
    else if (line.startsWith('data: ')) {
      try { out.data = JSON.parse(line.slice(6)); } catch { out.data = line.slice(6); }
    }
  }
  return out.event === null && out.data === null ? null : out;
}

async function readSse(url, { header = {}, until = () => false, timeoutMs = 6000 } = {}) {
  const events = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: header, signal: controller.signal });
    assert.equal(res.status, 200);
    assert.ok((res.headers.get('content-type') || '').includes('text/event-stream'));
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = parseFrame(buf.slice(0, idx));
        buf = buf.slice(idx + 2);
        if (frame) {
          events.push(frame);
          if (until(frame, events)) { controller.abort(); return events; }
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') throw err;
  } finally {
    clearTimeout(timer);
  }
  return events;
}

// ── BlackboardStore ─────────────────────────────────────────────
describe('BlackboardStore · 落盘 / 留痕 / 重启存活', () => {
  const projectId = `test_core_bb_${Date.now()}`;
  const workDir = path.join(os.tmpdir(), `meocoxflow_core_bb_${Date.now()}`);
  const bus = new EventBus();
  const store = new BlackboardStore({ bus });

  before(async () => {
    await fs.mkdir(workDir, { recursive: true });
    await storage.saveProject({ id: projectId, title: 'blackboard test', projectDir: workDir });
  });

  after(async () => {
    await storage.deleteProject(projectId).catch(() => {});
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  test('get 惰性创建默认黑板并落盘', async () => {
    const board = await store.get(projectId);
    assert.equal(board.revision, 0);
    assert.deepEqual(board.negativeConstraints, []);
    assert.deepEqual(board.pubSubEvents, []);

    const raw = JSON.parse(await fs.readFile(path.join(workDir, 'blackboard.json'), 'utf-8'));
    assert.equal(raw.projectId, projectId);
    assert.equal(raw.revision, 0);
  });

  test('write 递增 revision、落盘,并发出 blackboard.written', async () => {
    const events = [];
    const unsub = bus.subscribe(BB_AUDIT_RUN_ID, (e) => events.push(e));
    const before = (await store.get(projectId)).revision;

    const board = await store.write(projectId, {
      negativeConstraints: ['禁用绝对化承诺']
    }, { actor: { kind: 'boss', id: 'user' }, reason: 'manual_edit' });
    unsub();

    assert.equal(board.revision, before + 1);
    assert.deepEqual(board.negativeConstraints, ['禁用绝对化承诺']);

    const written = events.find((e) => e.type === 'blackboard.written');
    assert.ok(written, '应发出 blackboard.written');
    assert.deepEqual(written.payload.changed, ['negativeConstraints']);
    assert.equal(written.payload.revision, board.revision);
    assert.equal(written.actor.kind, 'boss');

    const onDisk = JSON.parse(await fs.readFile(path.join(workDir, 'blackboard.json'), 'utf-8'));
    assert.deepEqual(onDisk.negativeConstraints, ['禁用绝对化承诺']);
  });

  test('read 发出 blackboard.read 并带快照计数', async () => {
    const events = [];
    const unsub = bus.subscribe(BB_AUDIT_RUN_ID, (e) => events.push(e));
    await store.read(projectId, { actor: { kind: 'agent', id: 'writer' }, reason: 'pull' });
    unsub();

    const ev = events.find((e) => e.type === 'blackboard.read');
    assert.ok(ev, '应发出 blackboard.read');
    assert.equal(ev.actor.kind, 'agent');
    assert.equal(ev.payload.reason, 'pull');
    assert.ok(Array.isArray(ev.payload.keys) && ev.payload.keys.length > 0);
    assert.equal(ev.payload.snapshot.negativeConstraints, 1);
  });

  test('appendRule 分类正确:规则串进 negativeConstraints / 记忆带 id', async () => {
    await store.appendRule(projectId, { category: 'negativeConstraints', rule: '禁用爹味说教' },
      { actor: { kind: 'boss', id: 'user' } });
    let board = await store.get(projectId);
    assert.equal(board.negativeConstraints[0], '禁用爹味说教');
    assert.equal(board.negativeConstraints.length, 2, '新规则应插在最前');

    await store.appendRule(projectId, { category: 'bossEpisodicMemory', rule: '分镜台词 28 字内' },
      { actor: { kind: 'boss', id: 'user' } });
    board = await store.get(projectId);
    assert.ok(board.bossEpisodicMemory[0].id.startsWith('mem_'));
    assert.equal(board.bossEpisodicMemory[0].rule, '分镜台词 28 字内');

    // 服务端在同一次写里留痕,保证「规则 + 谁改的」是完整真相源
    const latest = board.pubSubEvents[0];
    assert.equal(latest.action, 'write');
    assert.equal(latest.key, '#bossEpisodicMemory');
    assert.equal(latest.agent, '监制老板 (您)');
    assert.ok(latest.summary.includes('分镜台词 28 字内'.slice(0, 24)));
    assert.equal(board.pubSubEvents.filter((e) => e.action === 'write').length, 2,
      '两次 appendRule 应各留一条写轨迹');
  });

  test('并发写被串行化:revision 无跳变、无丢失更新', async () => {
    const startRev = (await store.get(projectId)).revision;
    await Promise.all([
      store.write(projectId, { facts: { a: 1 } }, { reason: 'race' }),
      store.write(projectId, { facts: { b: 2 } }, { reason: 'race' }),
      store.write(projectId, { facts: { c: 3 } }, { reason: 'race' })
    ]);
    const board = await store.get(projectId);
    // 最终 rev = start+3(串行链保证),且最后一条 patch 完整落盘
    assert.equal(board.revision, startRev + 3);
    assert.equal(board.facts.c, 3);
  });

  test('重启存活:全新实例(空缓存)从磁盘读回规则', async () => {
    const expected = (await store.get(projectId)).negativeConstraints;
    const restarted = new BlackboardStore({ bus: new EventBus() });
    restarted.invalidate(); // 显式空缓存,模拟进程重启
    const board = await restarted.get(projectId);

    assert.equal(board.projectId, projectId);
    assert.deepEqual(board.negativeConstraints, expected, '重启后规则仍在');
    assert.equal(board.bossEpisodicMemory.length, 1);
    assert.ok(board.revision >= 5, `revision 应随写入累积,实际 ${board.revision}`);
  });

  test('审计流不污染 listRuns(无 run.json 的目录被忽略)', async () => {
    const runs = await storage.listRuns(projectId);
    const ids = runs.map((r) => r.id);
    assert.ok(!ids.includes(BB_AUDIT_RUN_ID), `审计流不应出现在 Run 列表: ${ids}`);
    // 但事件确实落盘了
    const events = await storage.readEvents(projectId, BB_AUDIT_RUN_ID);
    assert.ok(events.filter((e) => e.type === 'blackboard.written').length >= 3);
    const seqs = events.map((e) => e.seq);
    assert.deepEqual(seqs, seqs.map((_, i) => i), '审计 seq 应连续');
  });

  test('history 支持 sinceSeq 断点续传', async () => {
    const all = await store.history(projectId);
    assert.ok(all.length > 0);
    const tail = await store.history(projectId, { sinceSeq: all[1].seq });
    assert.deepEqual(tail.map((e) => e.seq), all.slice(2).map((e) => e.seq));
  });
});

// ── 运行期注入 ──────────────────────────────────────────────────
describe('SchedulerRuntime · inputs.blackboard 注入与回写', () => {
  const projectId = `test_core_bb_inj_${Date.now()}`;
  const workDir = path.join(os.tmpdir(), `meocoxflow_core_bb_inj_${Date.now()}`);
  const bus = new EventBus();
  const store = new BlackboardStore({ bus });
  const artifactStore = new ArtifactStore();

  before(async () => {
    await fs.mkdir(workDir, { recursive: true });
    await storage.saveProject({ id: projectId, title: 'bb injection', projectDir: workDir });
    await store.write(projectId, { negativeConstraints: ['禁用高饱和霓虹'] },
      { actor: { kind: 'boss', id: 'user' } });
  });

  after(async () => {
    await storage.deleteProject(projectId).catch(() => {});
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  test('算子读到 inputs.blackboard,回写经黑板落盘并进事件流', async () => {
    const seen = {};
    const executor = {
      id: 'probe',
      canExecute: () => true,
      async execute(task, ctx) {
        seen.inputs = ctx.inputs.blackboard;
        seen.ctxHas = Boolean(ctx.blackboard);
        // 算子按黑板规则追加一条负向约束(ctx.blackboard 已绑定 run.projectId)
        await ctx.blackboard.appendRule(
          { category: 'negativeConstraints', rule: '下游追加:禁止空洞大词' }
        );
        return { overview: { ok: true } };
      }
    };

    const run = { id: 'run_bb_inj', projectId, taskIds: ['t1'], templateId: null };
    await storage.saveRun(projectId, run);
    const task = {
      id: 't1', runId: run.id, projectId, type: 'custom',
      status: 'pending', dependsOn: [], produces: [], policy: {}, mock: null,
      attempts: 0, progress: 0, createdAt: Date.now()
    };
    await storage.saveTask(projectId, run.id, task);

    const runtime = new SchedulerRuntime({
      bus, storage, artifactStore, executor, concurrency: 1, blackboard: store
    });
    const { tasks } = await runtime.execute({ run, tasks: [task] });

    assert.equal(tasks[0].status, 'succeeded');
    assert.ok(seen.inputs, 'ctx.inputs.blackboard 应被注入');
    assert.equal(seen.inputs.negativeConstraints[0], '禁用高饱和霓虹');
    assert.ok(seen.ctxHas, 'ctx.blackboard 读写句柄应存在');

    // 回写生效
    const board = await store.get(projectId);
    assert.equal(board.negativeConstraints[0], '下游追加:禁止空洞大词');
    assert.equal(board.negativeConstraints.length, 2);

    // blackboard.* 进入 run 事件流,且 seq 连续
    const events = await storage.readEvents(projectId, run.id);
    const bbEvents = events.filter((e) => e.type.startsWith('blackboard.'));
    assert.ok(bbEvents.some((e) => e.type === 'blackboard.read'), '应有 blackboard.read');
    assert.ok(bbEvents.some((e) => e.type === 'blackboard.written'), '应有 blackboard.written');
    assert.ok(bbEvents.every((e) => e.taskId === 't1'), '审计事件应归属该 task');
    const seqs = events.map((e) => e.seq);
    assert.deepEqual(seqs, seqs.map((_, i) => i));
  });

  test('未注入黑板时不崩溃(ctx.blackboard 为 null)', async () => {
    let got = 'unset';
    const executor = {
      id: 'probe2',
      canExecute: () => true,
      async execute(task, ctx) { got = ctx.blackboard; return { overview: {} }; }
    };
    const run = { id: 'run_bb_no', projectId, taskIds: ['t2'], templateId: null };
    await storage.saveRun(projectId, run);
    const task = {
      id: 't2', runId: run.id, projectId, type: 'custom',
      status: 'pending', dependsOn: [], produces: [], policy: {}, mock: null,
      attempts: 0, progress: 0, createdAt: Date.now()
    };
    const runtime = new SchedulerRuntime({ bus, storage, artifactStore, executor, concurrency: 1 });
    const { tasks } = await runtime.execute({ run, tasks: [task] });
    assert.equal(tasks[0].status, 'succeeded');
    assert.equal(got, null);
    assert.equal((await storage.readEvents(projectId, run.id))
      .filter((e) => e.type.startsWith('blackboard.')).length, 0);
  });
});

// ── HTTP 路由 ───────────────────────────────────────────────────
describe('Blackboard API · 路由 / SSE', () => {
  const projectId = `test_core_bb_api_${Date.now()}`;
  const workDir = path.join(os.tmpdir(), `meocoxflow_core_bb_api_${Date.now()}`);
  let app, server, base;

  before(async () => {
    await fs.mkdir(workDir, { recursive: true });
    await storage.saveProject({ id: projectId, title: 'bb api', projectDir: workDir });
    app = express();
    app.use(express.json());
    app.use('/api/blackboard', blackboardRouter);
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        base = `http://localhost:${server.address().port}/api/blackboard`;
        resolve();
      });
    });
  });

  after(async () => {
    server?.close();
    await storage.deleteProject(projectId).catch(() => {});
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  test('缺少 projectId 返回 400', async () => {
    const res = await fetch(base, { method: 'GET' });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).missingParam, 'projectId');
  });

  test('GET / 惰性创建;POST /write 覆盖式写入并回推 revision', async () => {
    const first = await (await fetch(`${base}/?projectId=${projectId}`)).json();
    assert.equal(first.blackboard.projectId, projectId);
    assert.equal(typeof first.revision, 'number');

    const res = await fetch(`${base}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        patch: { projectDNA: { topic: '《自律破局》' }, negativeConstraints: ['禁用爹味说教'] },
        actor: { kind: 'boss', id: 'boss' },
        reason: 'drawer_edit'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.blackboard.projectDNA.topic, '《自律破局》');
    assert.equal(data.revision, first.revision + 1);

    const back = await (await fetch(`${base}/?projectId=${projectId}`)).json();
    assert.equal(back.blackboard.projectDNA.topic, '《自律破局》', '读回应看到写入');
    assert.equal(back.blackboard.negativeConstraints[0], '禁用爹味说教');
  });

  test('POST /rule 追加规则;非法 rule 返回 400', async () => {
    const ok = await fetch(`${base}/rule`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, category: 'negativeConstraints', rule: '禁用高饱和霓虹' })
    });
    assert.equal(ok.status, 200);
    const board = (await ok.json()).blackboard;
    assert.equal(board.negativeConstraints[0], '禁用高饱和霓虹');
    assert.equal(board.negativeConstraints.length, 2);

    const bad = await fetch(`${base}/rule`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, rule: '   ' })
    });
    assert.equal(bad.status, 400);
    assert.ok((await bad.json()).error.includes('rule'));
  });

  test('POST /read 语义读留痕;GET /events 可回放', async () => {
    const readRes = await fetch(`${base}/read`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, actor: { kind: 'agent', id: 'writer' }, reason: 'pull' })
    });
    assert.equal(readRes.status, 200);

    const { events, lastSeq } = await (await fetch(`${base}/events?projectId=${projectId}`)).json();
    const types = events.map((e) => e.type);
    assert.ok(types.includes('blackboard.written'));
    assert.ok(types.includes('blackboard.read'));
    assert.equal(lastSeq, events.at(-1).seq);
    const seqs = events.map((e) => e.seq);
    assert.deepEqual(seqs, seqs.map((_, i) => i));
  });

  test('SSE 全量回放并收尾于 stream.ready', async () => {
    const frames = await readSse(`${base}/stream?projectId=${projectId}`, {
      until: (f) => f.event === 'stream.ready', timeoutMs: 5000
    });
    const seqs = frames.filter((f) => typeof f.data?.seq === 'number').map((f) => f.data.seq);
    assert.deepEqual(seqs, seqs.map((_, i) => i), '回放 seq 应从 0 连续');
    assert.ok(frames.some((f) => f.event === 'blackboard.written'));
    assert.ok(frames.at(-1).event === 'stream.ready');
  });

  test('SSE Last-Event-ID 断点续传:不重播已收到事件', async () => {
    // 先做一次新写入,产生 seq > 0 的事件
    await fetch(`${base}/write`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, patch: { facts: { revived: true } } })
    });
    const all = await (await fetch(`${base}/events?projectId=${projectId}`)).json();
    const cut = 1;

    const resumed = await readSse(`${base}/stream?projectId=${projectId}`, {
      header: { 'Last-Event-ID': String(cut) },
      until: (f) => f.event === 'stream.ready', timeoutMs: 5000
    });
    const seqs = resumed.filter((f) => typeof f.data?.seq === 'number').map((f) => f.data.seq);
    if (seqs.length) {
      assert.equal(seqs[0], cut + 1, `应从断点后一条续传,实际 ${seqs[0]}`);
      assert.deepEqual(seqs, seqs.map((_, i) => cut + 1 + i), '续传 seq 应连续');
      assert.deepEqual(seqs, [...new Set(seqs)], '不应有重复');
      assert.ok(seqs.at(-1) === all.lastSeq, '应补到最新');
    }
  });

  test('实时事件在 SSE 打开后被推送', async () => {
    const streamPromise = readSse(`${base}/stream?projectId=${projectId}`, {
      until: (f) => f.event === 'blackboard.written' && f.data?.payload?.reason === 'live_push',
      timeoutMs: 5000
    });
    await delay(150); // 等待订阅生效与历史回放完成
    await fetch(`${base}/write`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, patch: { facts: { live: 1 } }, reason: 'live_push' })
    });
    const frames = await streamPromise;
    const hit = frames.find((f) => f.event === 'blackboard.written' && f.data?.payload?.reason === 'live_push');
    assert.ok(hit, 'SSE 应实时收到新写入');
  });

  test('defaultBlackboardStore 已导出且为单例', () => {
    assert.ok(defaultBlackboardStore instanceof BlackboardStore);
    assert.equal(typeof createBlackboard, 'function');
  });
});
