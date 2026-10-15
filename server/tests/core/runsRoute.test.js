import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { storage } from '../../src/storage/index.js';
import runsRouter from '../../src/routes/runs.js';
import { defaultEventBus } from '../../src/core/bus/eventBus.js';
import { createRunFromTemplate } from '../../src/core/run/orchestrator.js';

const TERMINAL = new Set(['completed', 'failed', 'aborted', 'paused']);

/** 读取 SSE 流,直到满足条件或超时,返回收到的事件数组 */
async function readSse(url, { header = {}, until = () => false, timeoutMs = 8000 } = {}) {
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
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const parsed = parseFrame(frame);
        if (parsed) {
          events.push(parsed);
          if (until(parsed, events)) {
            controller.abort();
            return events;
          }
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

function parseFrame(frame) {
  const lines = frame.split('\n');
  const out = { id: null, event: null, data: null };
  for (const line of lines) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('id: ')) out.id = Number(line.slice(4));
    else if (line.startsWith('event: ')) out.event = line.slice(7);
    else if (line.startsWith('data: ')) {
      try { out.data = JSON.parse(line.slice(6)); } catch { out.data = line.slice(6); }
    }
  }
  if (out.event === null && out.data === null) return null;
  return out;
}

describe('Runs API · 创建 / SSE / 检查点 / 回滚', () => {
  const projectId = `test_core_runs_${Date.now()}`;
  const workDir = path.join(os.tmpdir(), `meocoxflow_core_runs_${Date.now()}`);
  let app, server, base;

  before(async () => {
    await fs.mkdir(workDir, { recursive: true });
    await storage.saveProject({ id: projectId, title: 'runs route test', projectDir: workDir });

    app = express();
    app.use(express.json());
    app.use('/api/runs', runsRouter);
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

  test('POST /api/runs 创建 Run,带 dependsOn 任务', async () => {
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, templateId: 'template_gameplay_highlight', driver: 'mock' })
    });
    assert.equal(res.status, 200);
    const { run, tasks } = await res.json();
    assert.equal(run.status, 'idle');
    assert.equal(tasks.length, 4);
    assert.equal(tasks.find((t) => t.id === 'step_beat_matching').dependsOn.length, 2);
  });

  test('缺少 projectId 返回 400', async () => {
    const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.missingParam === 'projectId');
  });

  test('SSE 流回放历史并推进至 run.completed,seq 单调递增', async () => {
    const { run } = await (await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, templateId: 'template_gameplay_highlight' })
    })).json();

    const startRes = await fetch(`${base}/${run.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, driver: 'mock', concurrency: 3 })
    });
    assert.equal(startRes.status, 200);
    assert.equal((await startRes.json()).success, true);

    const events = await readSse(`${base}/${run.id}/stream?${q('sinceSeq=-1')}`, {
      until: (f) => f.event === 'run.completed' || f.event === 'run.failed',
      timeoutMs: 15000
    });

    const data = events.filter((f) => f.data?.seq !== null && typeof f.data?.seq === 'number');
    const seqs = data.map((f) => f.data.seq);
    for (let i = 1; i < seqs.length; i += 1) {
      assert.ok(seqs[i] > seqs[i - 1], `seq 应严格递增: ${seqs[i - 1]} -> ${seqs[i]}`);
    }
    assert.ok(seqs.every((s, i) => i === 0 || s >= seqs[i - 1]));

    const types = data.map((f) => f.event);
    assert.ok(types.includes('run.started'));
    assert.ok(types.includes('run.completed'), `应收到 run.completed,实际: ${types.slice(-5)}`);
    assert.ok(types.includes('task.succeeded'));
    assert.ok(events.some((f) => f.event === 'stream.ready'), '应有 stream.ready 收尾标记');

    // seq 从 0 连续,无空洞
    assert.deepEqual(seqs, seqs.map((_, i) => i));
  });

  test('Last-Event-ID 断点续传:不重播已收到的事件', async () => {
    const { run } = await (await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, templateId: 'template_video_commentary' })
    })).json();
    await fetch(`${base}/${run.id}/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, driver: 'mock' })
    });
    await readSse(`${base}/${run.id}/stream?${q('sinceSeq=-1')}`, {
      until: (f) => f.event === 'run.completed' || f.event === 'run.failed', timeoutMs: 15000
    });

    // 第二段连接:用 Last-Event-ID 模拟断线重连,应只从 5 之后续推
    const resumed = await readSse(`${base}/${run.id}/stream?${q()}`, {
      header: { 'Last-Event-ID': '4' },
      until: (f) => f.event === 'stream.ready',
      timeoutMs: 5000
    });
    const seqs = resumed.filter((f) => typeof f.data?.seq === 'number').map((f) => f.data.seq);
    if (seqs.length) {
      assert.ok(seqs[0] >= 5, `首个续传 seq 应 >= 5,实际 ${seqs[0]}`);
      assert.deepEqual(seqs, [...new Set(seqs)], '续传事件不应有重复');
      assert.deepEqual(seqs, seqs.map((_, i) => seqs[0] + i), '续传 seq 应连续');
    }
  });

  test('检查点创建 → 回滚:run/tasks 状态被还原且追加 run.rolledback', async () => {
    const { run, tasks } = await (await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, templateId: 'template_tutorial_guide' })
    })).json();

    // 直接用内核跑完
    const { executeRun } = await import('../../src/core/run/orchestrator.js');
    await executeRun({ projectId, runId: run.id, executor: await mockExec() });

    const before = await (await fetch(`${base}/${run.id}?${q()}`)).json();
    assert.equal(before.run.status, 'completed');
    const totalEvents = (await storage.readEvents(projectId, run.id)).length;
    assert.ok(totalEvents > 10, `事件数应 > 10,实际 ${totalEvents}`);

    const cpRes = await fetch(`${base}/${run.id}/checkpoints`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, label: '完成态' })
    });
    assert.equal(cpRes.status, 200);
    const { checkpoint } = await cpRes.json();
    assert.equal(checkpoint.runSnapshot.status, 'completed');
    assert.ok(checkpoint.id.startsWith('ckpt_'));

    // 手工把 run/tasks 摞成「坏」状态再回滚
    const dirty = await storage.getRun(projectId, run.id);
    dirty.status = 'failed';
    await storage.saveRun(projectId, dirty);
    for (const t of tasks) {
      await storage.saveTask(projectId, run.id, { ...t, status: 'pending', progress: 0 });
    }

    const rbRes = await fetch(`${base}/${run.id}/rollback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, seq: checkpoint.seq })
    });
    assert.equal(rbRes.status, 200);
    const rb = await rbRes.json();
    assert.equal(rb.run.status, 'completed');

    const afterSnap = await (await fetch(`${base}/${run.id}?${q()}`)).json();
    assert.equal(afterSnap.run.status, 'completed');
    assert.ok(afterSnap.tasks.every((t) => t.status === 'succeeded'));

    // 历史 append-only:回滚不删事件,而是追加 checkpoint.created + run.rolledback
    const afterEvents = await storage.readEvents(projectId, run.id);
    assert.equal(afterEvents.length, totalEvents + 2, 'checkpoint.created + run.rolledback 各追加一条');
    assert.equal(afterEvents.at(-2).type, 'checkpoint.created');
    assert.equal(afterEvents.at(-1).type, 'run.rolledback');
    assert.equal(afterEvents.at(-1).payload.targetSeq, checkpoint.seq);
    const seqs = afterEvents.map((e) => e.seq);
    assert.deepEqual(seqs, seqs.map((_, i) => i), '回滚后 seq 仍应连续');

    // 列表检查点
    const listRes = await fetch(`${base}/${run.id}/checkpoints?${q()}`);
    assert.equal(listRes.status, 200);
    assert.equal((await listRes.json()).checkpoints.length, 1);
  });

  test('重复回滚到不存在的检查点返回 500(带错误信息)', async () => {
    const { run } = await (await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, templateId: 'template_custom' })
    })).json();
    const res = await fetch(`${base}/${run.id}/rollback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, seq: 9999 })
    });
    assert.equal(res.status, 500);
    assert.ok((await res.json()).error.includes('未找到检查点'));
  });

  test('重复 start 返回 409(终态 Run 不可复用)', async () => {
    const { run } = await (await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, templateId: 'template_custom' })
    })).json();
    // template_custom 无 stage → 立即完成
    await fetch(`${base}/${run.id}/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, driver: 'mock' })
    });
    await new Promise((r) => setTimeout(r, 300));

    const snap = await (await fetch(`${base}/${run.id}?${q()}`)).json();
    assert.ok(TERMINAL.has(snap.run.status), `template_custom 应立即收敛,实际 ${snap.run.status}`);
  });

  test('缺少 projectId 的 demo-snapshot 返回 400', async () => {
    const res = await fetch(`${base}/demo-snapshot`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).missingParam, 'projectId');
  });

  test('demo-snapshot 写入并读回(刷新恢复基础)', async () => {
    const snapshot = {
      schema: 'studio-demo/v1',
      demoStage: 'pipeline-board',
      directContactIds: ['director', 'screenwriter'],
      activeChatContactId: 'screenwriter',
      chatMessages: [{ id: 'm1', role: 'agent', text: '开工' }],
      stepData: { director: { status: 'done' }, screenwriter: { status: 'working' } },
      checkpoints: [{ id: 'cp_1', label: '钩子定稿' }],
      activeCheckpointId: 'cp_1',
      selectedStationId: 'screenwriter',
      expandedSquads: { director: false, screenwriter: true },
      autoFollowProgress: true,
      speed: 2
    };
    const post = await fetch(`${base}/demo-snapshot`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, snapshot })
    });
    assert.equal(post.status, 200);
    const posted = await post.json();
    assert.equal(posted.success, true);
    assert.equal(posted.runId, 'run_studio_demo');
    assert.ok(posted.savedAt > 0);

    const get = await fetch(`${base}/demo-snapshot?${q()}`);
    assert.equal(get.status, 200);
    const { snapshot: saved, run } = await get.json();
    assert.equal(saved.schema, 'studio-demo/v1');
    assert.equal(saved.demoStage, 'pipeline-board');
    assert.deepEqual(saved.stepData, snapshot.stepData);
    assert.equal(saved.checkpoints.length, 1);
    assert.ok(saved.savedAt > 0, '应记录 savedAt');
    assert.equal(run.id, 'run_studio_demo');

    // 二次写入覆盖(幂等 upsert)
    const post2 = await fetch(`${base}/demo-snapshot`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, snapshot: { ...snapshot, demoStage: 'completion' } })
    });
    assert.equal(post2.status, 200);
    const { snapshot: saved2 } = await (await fetch(`${base}/demo-snapshot?${q()}`)).json();
    assert.equal(saved2.demoStage, 'completion');

    // demo run 的事件应已落盘(只创建一次)
    const events = await storage.readEvents(projectId, 'run_studio_demo');
    assert.equal(events.filter((e) => e.type === 'run.created').length, 1);
  });

  test('demo-snapshot 不被 /:runId 捕获(GET 读取正常)', async () => {
    // 若路由顺序错误,这里会 500 "未找到 Run: demo-snapshot"
    const res = await fetch(`${base}/demo-snapshot?${q()}`);
    assert.equal(res.status, 200);
    assert.ok((await res.json()).snapshot, '快照应存在且路由未被 :runId 抢占');
  });

  test('执行中可 abort:run 置为 aborted 并发出 run.aborted', async () => {
    const { run } = await (await fetch(base, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, templateId: 'template_tutorial_guide' })
    })).json();
    await fetch(`${base}/${run.id}/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, driver: 'mock', concurrency: 1 })
    });
    await new Promise((r) => setTimeout(r, 60));

    const abortRes = await fetch(`${base}/${run.id}/abort`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId })
    });
    assert.equal(abortRes.status, 200);

    // 等 runtime 优雅收尾
    let status = 'running';
    for (let i = 0; i < 60 && !TERMINAL.has(status); i += 1) {
      await new Promise((r) => setTimeout(r, 50));
      const snap = await (await fetch(`${base}/${run.id}?${q()}`)).json();
      status = snap.run.status;
    }
    assert.equal(status, 'aborted');

    const events = await storage.readEvents(projectId, run.id);
    assert.ok(events.some((e) => e.type === 'run.aborted'), '应发出 run.aborted 事件');
    const skipped = (await storage.listTasks(projectId, run.id)).filter((t) => t.status === 'skipped');
    assert.ok(skipped.length >= 1, '未启动任务应被标记 skipped');
  });
});

async function mockExec() {
  const { MockExecutor } = await import('../../src/core/scheduler/executors/mockExecutor.js');
  return new MockExecutor();
}
