/**
 * 时光树投影:events.jsonl + checkpoints → 分支/节点结构(纯函数投影)。
 *
 * 模型:
 *   - 主线(main):从 origin(创建)到最后一条事件的一条链;
 *   - 检查点(checkpoint)、回滚(rollback)、终态(terminal)是链上的节点;
 *   - 每次回滚产生一段「废弃分支」(targetSeq → 回滚事件 seq 之间被重放覆盖的事件段),
 *     历史不被删除,只是标记为已废弃 —— 这正是 append-only 的价值。
 */
import { foldEscalations } from '../primitives/escalation.js';

function bySeq(events) {
  return [...events].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

const TERMINAL_BY_TYPE = {
  'run.completed': 'completed',
  'run.failed': 'failed',
  'run.aborted': 'aborted',
  'run.blocked': 'blocked'
};

/**
 * 构建时光树。
 *
 * @param {Array<object>} events events.jsonl 内容
 * @param {Array<object>} [checkpoints] storage.listCheckpoints 的结果(补标签/artifactRefs)
 * @returns {{nodes: Array<object>, branches: Array<object>, current: object, rollbacks: Array<object>, escalations: Array<object>}}
 */
export function buildTimeTree(events = [], checkpoints = []) {
  const sorted = bySeq(events);
  const diskById = new Map(checkpoints.map((c) => [c.id, c]));

  const nodes = [];
  const rollbacks = [];
  const branches = [];
  let lastSeq = null;
  let lastTs = null;
  let status = null;
  let originNode = null;

  for (const e of sorted) {
    lastSeq = e.seq;
    lastTs = e.ts;
    const p = e.payload || {};

    switch (e.type) {
      case 'run.created':
        originNode = {
          kind: 'origin',
          seq: e.seq,
          ts: e.ts,
          id: e.seq,
          label: p.templateId ? `Run 创建 · ${p.templateId}` : 'Run 创建',
          source: p.source ?? null
        };
        nodes.push(originNode);
        break;
      case 'checkpoint.created': {
        const disk = diskById.get(p.checkpointId);
        nodes.push({
          kind: 'checkpoint',
          seq: e.seq,
          ts: e.ts,
          id: p.checkpointId,
          label: p.label || 'manual',
          snapshotSeq: p.seq ?? null,
          taskCount: p.taskCount ?? (disk?.taskSnapshots ? Object.keys(disk.taskSnapshots).length : null)
        });
        break;
      }
      case 'run.rolledback': {
        const target = p.targetSeq ?? null;
        nodes.push({
          kind: 'rollback',
          seq: e.seq,
          ts: e.ts,
          id: p.checkpointId,
          label: p.label || '回滚',
          rewindToSeq: target,
          discardedEvents: target != null ? Math.max(0, e.seq - target) : null,
          restoredStatus: p.restoredStatus ?? null
        });
        rollbacks.push({
          seq: e.seq,
          targetSeq: target,
          checkpointId: p.checkpointId ?? null,
          label: p.label ?? null
        });
        if (target != null) {
          branches.push({
            id: `discarded_${e.seq}`,
            kind: 'discarded',
            label: `回滚废弃段 · seq (${target} → ${e.seq})`,
            fromSeq: target,
            toSeq: e.seq,
            rollbackSeq: e.seq,
            eventCount: Math.max(0, e.seq - target)
          });
        }
        break;
      }
      default:
        if (TERMINAL_BY_TYPE[e.type]) {
          status = TERMINAL_BY_TYPE[e.type];
          nodes.push({
            kind: 'terminal',
            seq: e.seq,
            ts: e.ts,
            status,
            label: `Run ${status}`
          });
        }
        break;
    }
  }

  // 主线分支(始终存在;从 origin/0 到最后一条事件)
  const mainFrom = originNode ? originNode.seq : (sorted[0]?.seq ?? 0);
  const mainEventCount = sorted.filter((e) => (e.seq ?? 0) >= mainFrom).length;
  branches.unshift({
    id: 'main',
    kind: 'main',
    label: '主线',
    fromSeq: mainFrom,
    toSeq: lastSeq,
    eventCount: mainEventCount
  });

  // 废弃段的真实事件数(targetSeq → 回滚事件,不含回滚事件本身)
  for (const b of branches) {
    if (b.kind !== 'discarded') continue;
    b.eventCount = sorted.filter((e) => (e.seq ?? 0) > b.fromSeq && (e.seq ?? 0) < b.toSeq).length;
  }

  const escalations = foldEscalations(sorted)
    .map((esc) => ({
      id: esc.id,
      taskId: esc.taskId ?? null,
      severity: esc.severity ?? null,
      title: esc.title ?? null,
      status: esc.status ?? 'open'
    }));

  return {
    nodes,
    branches,
    rollbacks,
    escalations,
    current: {
      lastSeq,
      lastTs,
      status,
      checkpointCount: nodes.filter((n) => n.kind === 'checkpoint').length,
      discardedBranchCount: branches.filter((b) => b.kind === 'discarded').length
    }
  };
}

export default { buildTimeTree };
