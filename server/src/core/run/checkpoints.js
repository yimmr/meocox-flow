/**
 * Checkpoint:Run 的快照与回滚(时光倒流)。
 *
 * 事件日志是 append-only 的真相源,因此回滚**不修改历史**:
 *   - 快照 = { run, tasks } 在某一 `seq` 的状态拷贝,落盘为 checkpoints/<seq>.json;
 *   - 回滚 = 把 run/tasks 恢复到快照内容,并追加一条 `run.rolledback` 事件。
 * 这样历史仍是单调递增的审计链,回滚本身也是可审计的一次「正向事件」。
 */
import { storage } from '../../storage/index.js';
import { defaultEventBus } from '../bus/eventBus.js';
import { CHECKPOINT_SCHEMA, assertValid } from '../contracts/index.js';

const TERMINAL_RUN_STATUSES = ['completed', 'failed', 'aborted', 'paused'];

/**
 * 创建一个检查点。
 * @param {object} input
 * @param {string} input.projectId
 * @param {string} input.runId
 * @param {string} [input.label]
 * @returns {Promise<object>} 落盘的 checkpoint
 */
export async function createCheckpoint({ projectId, runId, label = 'manual' }) {
  const run = await storage.getRun(projectId, runId);
  if (!run) throw new Error(`未找到 Run: ${runId}`);

  const tasks = await storage.listTasks(projectId, runId);
  const events = await storage.readEvents(projectId, runId);
  const seq = events.reduce((max, e) => Math.max(max, e.seq ?? 0), -1);

  const checkpoint = {
    id: `ckpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    runId,
    seq,
    ts: Date.now(),
    label,
    runSnapshot: JSON.parse(JSON.stringify(run)),
    taskSnapshots: tasks.reduce((acc, t) => ({ ...acc, [t.id]: JSON.parse(JSON.stringify(t)) }), {}),
    artifactRefs: tasks.map((t) => t.resultRef).filter(Boolean)
  };
  assertValid(CHECKPOINT_SCHEMA, checkpoint, 'Checkpoint');

  await storage.saveCheckpoint(projectId, runId, seq, checkpoint);
  await defaultEventBus.emit(projectId, runId, {
    type: 'checkpoint.created',
    actor: { kind: 'boss', id: 'user' },
    payload: { checkpointId: checkpoint.id, label, seq, taskCount: tasks.length }
  });
  return checkpoint;
}

/** 列出某 run 的全部检查点 */
export async function listCheckpoints(projectId, runId) {
  return storage.listCheckpoints(projectId, runId);
}

/**
 * 回滚到指定检查点(seq 或 checkpoint 对象)。
 * @returns {Promise<{checkpoint, run, tasks}>}
 */
export async function rollbackTo({ projectId, runId, seq }) {
  const checkpoint = await storage.getCheckpoint(projectId, runId, Number(seq));
  if (!checkpoint) throw new Error(`未找到检查点 seq=${seq}`);

  const run = JSON.parse(JSON.stringify(checkpoint.runSnapshot));
  const tasks = Object.values(checkpoint.taskSnapshots);
  if (!TERMINAL_RUN_STATUSES.includes(run.status)) run.status = 'paused';
  run.updatedAt = Date.now();

  await storage.saveRun(projectId, run);
  for (const t of tasks) await storage.saveTask(projectId, runId, t);

  await defaultEventBus.emit(projectId, runId, {
    type: 'run.rolledback',
    actor: { kind: 'boss', id: 'user' },
    payload: {
      checkpointId: checkpoint.id,
      targetSeq: checkpoint.seq,
      label: checkpoint.label,
      taskIds: tasks.map((t) => t.id),
      restoredStatus: run.status
    }
  });

  return { checkpoint, run, tasks };
}
