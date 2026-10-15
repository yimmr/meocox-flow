/**
 * 就绪队列:从「就绪集合」中挑选此刻真正可开跑的任务。
 *
 * 两个约束:
 *   1. 优先级(policy.priority,越大越先);
 *   2. 并发组(policy.concurrencyGroup 相同的任务互斥,避免争抢同一资源)。
 */

/**
 * 对就绪任务排序。
 * @param {string[]} readyIds
 * @param {Map<string, object>} taskMap
 * @returns {string[]}
 */
export function orderReadyTasks(readyIds, taskMap) {
  return [...readyIds].sort((a, b) => {
    const pa = taskMap.get(a)?.policy?.priority ?? 0;
    const pb = taskMap.get(b)?.policy?.priority ?? 0;
    if (pa !== pb) return pb - pa;
    return String(a).localeCompare(String(b));
  });
}

/**
 * 判断某任务是否满足并发组约束(同组不能同时在跑)。
 * @param {object} task
 * @param {object[]} activeTasks 当前正在运行的任务
 */
export function respectConcurrencyGroups(task, activeTasks) {
  const group = task?.policy?.concurrencyGroup;
  if (!group) return true;
  return !activeTasks.some((t) => t?.policy?.concurrencyGroup === group);
}