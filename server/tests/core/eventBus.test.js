import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { storage } from '../../src/storage/index.js';
import { EventBus } from '../../src/core/bus/eventBus.js';

describe('EventBus · 落盘 / 分发 / 重放', () => {
  const projectId = `test_core_bus_${Date.now()}`;
  const runId = 'run_bus_1';
  const workDir = path.join(os.tmpdir(), `meocoxflow_core_bus_${Date.now()}`);
  const bus = new EventBus();

  before(async () => {
    await fs.mkdir(workDir, { recursive: true });
    await storage.saveProject({ id: projectId, title: 'bus test', projectDir: workDir });
  });

  after(async () => {
    await storage.deleteProject(projectId).catch(() => {});
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  test('seq 从 0 单调递增并落盘', async () => {
    const e0 = await bus.emit(projectId, runId, { type: 'run.created', actor: { kind: 'system', id: 'core' } });
    const e1 = await bus.emit(projectId, runId, { type: 'run.started', actor: { kind: 'boss', id: 'boss' } });
    const e2 = await bus.emit(projectId, runId, { type: 'task.log', actor: { kind: 'agent', id: 'leo' }, taskId: 'tsk_1', payload: { text: 'hi' } });

    assert.equal(e0.seq, 0);
    assert.equal(e1.seq, 1);
    assert.equal(e2.seq, 2);
    assert.ok(e0.id.startsWith('evt_'));

    const persisted = await storage.readEvents(projectId, runId);
    assert.equal(persisted.length, 3);
    assert.equal(persisted[2].payload.text, 'hi');
  });

  test('订阅者实时收到事件', async () => {
    const received = [];
    const unsub = bus.subscribe(runId, (e) => received.push(e));
    await bus.emit(projectId, runId, { type: 'checkpoint.created', actor: { kind: 'system', id: 'core' } });
    unsub();
    await bus.emit(projectId, runId, { type: 'budget.tick', actor: { kind: 'system', id: 'core' } });

    assert.equal(received.length, 1);
    assert.equal(received[0].type, 'checkpoint.created');
  });

  test('单个监听器抛错不影响其他监听器', async () => {
    const ok = [];
    const unsub1 = bus.subscribe(runId, () => { throw new Error('boom'); });
    const unsub2 = bus.subscribe(runId, (e) => ok.push(e.type));
    await bus.emit(projectId, runId, { type: 'gate.passed', actor: { kind: 'system', id: 'core' } });
    unsub1(); unsub2();
    assert.deepEqual(ok, ['gate.passed']);
  });

  test('replay 支持 sinceSeq 游标(断点续传基础)', async () => {
    const all = await bus.replay(projectId, runId);
    const tail = await bus.replay(projectId, runId, { sinceSeq: 1 });
    assert.ok(all.length > tail.length);
    assert.ok(tail.every((e) => e.seq > 1));
  });

  test('新总线实例可从磁盘恢复 seq(进程重启续号)', async () => {
    const fresh = new EventBus();
    const lastKnown = await storage.readEvents(projectId, runId);
    const maxSeq = Math.max(...lastKnown.map((e) => e.seq));
    const next = await fresh.emit(projectId, runId, { type: 'run.completed', actor: { kind: 'system', id: 'core' } });
    assert.equal(next.seq, maxSeq + 1);
  });
});