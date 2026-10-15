/**
 * DAG:任务依赖图的构建 / 校验 / 拓扑 / 就绪判定。
 *
 * 这是把「run-all 顺序循环」升级为「依赖驱动的并发执行」的核心。
 * 边 = 数据依赖(dependsOn),不是时间先后。
 */

/**
 * 构建图结构。
 * @param {Array} tasks Task 数组
 * @returns {{taskMap:Map, dependencies:Map<string,string[]>, dependents:Map<string,string[]>}}
 */
export function buildDag(tasks = []) {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const dependencies = new Map();
  const dependents = new Map();

  for (const t of tasks) {
    dependencies.set(t.id, [...(t.dependsOn || [])]);
    if (!dependents.has(t.id)) dependents.set(t.id, []);
  }
  for (const t of tasks) {
    for (const dep of t.dependsOn || []) {
      if (!dependents.has(dep)) dependents.set(dep, []);
      dependents.get(dep).push(t.id);
    }
  }
  return { taskMap, dependencies, dependents };
}

/**
 * 校验 DAG:缺失依赖 / 自依赖 / 环。
 * @returns {{valid:boolean, errors:string[], order:string[]|null}}
 */
export function validateDag(tasks = []) {
  const errors = [];
  const { taskMap } = buildDag(tasks);

  for (const t of tasks) {
    for (const dep of t.dependsOn || []) {
      if (dep === t.id) errors.push(`任务 ${t.id} 依赖自身`);
      else if (!taskMap.has(dep)) errors.push(`任务 ${t.id} 依赖不存在的前置 ${dep}`);
    }
  }

  let order = null;
  try {
    order = topoSort(tasks);
  } catch (err) {
    errors.push(err.message);
  }

  return { valid: errors.length === 0, errors, order };
}

/**
 * 拓扑排序(Kahn),存在环则抛错。
 * @returns {string[]} 任务 id 的拓扑序
 */
export function topoSort(tasks = []) {
  const { dependencies, dependents } = buildDag(tasks);
  const indegree = new Map();
  for (const t of tasks) indegree.set(t.id, (dependencies.get(t.id) || []).length);

  const queue = tasks.filter((t) => indegree.get(t.id) === 0).map((t) => t.id);
  const order = [];

  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of dependents.get(id) || []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  if (order.length !== tasks.length) {
    throw new Error('DAG 存在环,无法拓扑排序');
  }
  return order;
}

/**
 * 计算当前「就绪」任务:状态为 pending,且所有前置均已 succeeded。
 * @param {Array} tasks
 * @returns {string[]} 就绪任务 id
 */
export function readyTaskIds(tasks = []) {
  const { taskMap } = buildDag(tasks);
  const ready = [];
  for (const t of tasks) {
    if (t.status !== 'pending') continue;
    const deps = t.dependsOn || [];
    const allDone = deps.every((d) => taskMap.get(d)?.status === 'succeeded');
    if (allDone) ready.push(t.id);
  }
  return ready;
}

/**
 * 是否存在「因前置失败/阻塞而永远无法就绪」的悬挂任务(死锁前沿)。
 * @returns {string[]}
 */
export function blockedFrontier(tasks = []) {
  const { taskMap } = buildDag(tasks);
  const stuck = [];
  for (const t of tasks) {
    if (t.status !== 'pending') continue;
    const deps = t.dependsOn || [];
    const dead = deps.some((d) => {
      const s = taskMap.get(d)?.status;
      return s === 'failed' || s === 'blocked';
    });
    if (dead) stuck.push(t.id);
  }
  return stuck;
}