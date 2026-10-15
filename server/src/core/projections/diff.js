/**
 * Diff 投影:两个检查点(或两份 run/tasks 快照)之间的结构化差异。
 *
 * 用途:
 *   - 时光树的「分支对比」:回滚前 vs 回滚后、启动前 vs 完成后;
 *   - 审计场景:任何两个 checkpoint 的字段级差异(不做时间旅行也能看变化)。
 *
 * 纯函数:输入两个快照,输出 { run, tasks, summary },不读盘不发事件。
 */

/** 快照归一化:接受 checkpoint 对象或 {run, tasks} 结构 */
function normalize(snap) {
  if (!snap) return { run: null, tasks: {} };
  if (snap.runSnapshot || snap.taskSnapshots) {
    return {
      run: snap.runSnapshot ?? null,
      tasks: snap.taskSnapshots ?? {},
      meta: { id: snap.id ?? null, seq: snap.seq ?? null, label: snap.label ?? null, ts: snap.ts ?? null }
    };
  }
  const tasks = Array.isArray(snap.tasks)
    ? snap.tasks.reduce((acc, t) => ({ ...acc, [t.id]: t }), {})
    : (snap.tasks || {});
  return { run: snap.run ?? null, tasks, meta: { id: null, seq: null, label: null, ts: null } };
}

function refStr(ref) {
  if (!ref || !ref.artifactId) return null;
  return `${ref.artifactId}@v${ref.version ?? 1}`;
}

function runDiffFields(a, b) {
  const out = [];
  const push = (field, before, after) => {
    if (JSON.stringify(before) !== JSON.stringify(after)) out.push({ field, before, after });
  };
  const ra = a || {};
  const rb = b || {};
  push('status', ra.status ?? null, rb.status ?? null);
  push('autonomy', ra.autonomy ?? null, rb.autonomy ?? null);
  push('templateId', ra.templateId ?? null, rb.templateId ?? null);
  const ua = ra.usage || {};
  const ub = rb.usage || {};
  for (const k of ['tokens', 'cost', 'seconds', 'gpuSeconds']) {
    push(`usage.${k}`, ua[k] ?? 0, ub[k] ?? 0);
  }
  return out;
}

const TASK_FIELDS = [
  { field: 'status', get: (t) => t?.status ?? null },
  { field: 'attempts', get: (t) => t?.attempts ?? 0 },
  { field: 'progress', get: (t) => t?.progress ?? 0 },
  { field: 'resultRef', get: (t) => refStr(t?.resultRef) },
  { field: 'error', get: (t) => t?.error?.message ?? null },
  { field: 'usage.tokens', get: (t) => t?.usage?.tokens ?? 0 },
  { field: 'usage.cost', get: (t) => t?.usage?.cost ?? 0 }
];

/**
 * 计算两份快照的差异。
 *
 * @param {object} fromSnap checkpoint 或 {run, tasks}
 * @param {object} toSnap checkpoint 或 {run, tasks}
 * @returns {{from:object, to:object, run:Array, tasks:Array, summary:object}}
 */
export function diffSnapshots(fromSnap, toSnap) {
  const from = normalize(fromSnap);
  const to = normalize(toSnap);

  const runChanges = runDiffFields(from.run, to.run);

  const taskChanges = [];
  const ids = new Set([...Object.keys(from.tasks), ...Object.keys(to.tasks)]);
  let added = 0;
  let removed = 0;
  let modified = 0;
  let totalFields = runChanges.length;

  for (const id of ids) {
    const a = from.tasks[id];
    const b = to.tasks[id];
    if (a && !b) {
      taskChanges.push({ taskId: id, change: 'removed', fields: [] });
      removed += 1;
      continue;
    }
    if (!a && b) {
      taskChanges.push({ taskId: id, change: 'added', fields: [] });
      added += 1;
      continue;
    }
    const fields = [];
    for (const { field, get } of TASK_FIELDS) {
      const before = get(a);
      const after = get(b);
      if (JSON.stringify(before) !== JSON.stringify(after)) fields.push({ field, before, after });
    }
    if (fields.length) {
      taskChanges.push({ taskId: id, change: 'modified', fields });
      modified += 1;
      totalFields += fields.length;
    }
  }

  return {
    from: from.meta,
    to: to.meta,
    run: runChanges,
    tasks: taskChanges,
    summary: {
      runChanged: runChanges.length > 0,
      tasksModified: modified,
      tasksAdded: added,
      tasksRemoved: removed,
      totalFields
    }
  };
}

/** 检查点对象的差异(= diffSnapshots 的语法糖) */
export function diffCheckpoints(fromCheckpoint, toCheckpoint) {
  return diffSnapshots(fromCheckpoint, toCheckpoint);
}

export default { diffSnapshots, diffCheckpoints };
