/**
 * Budget:预算硬约束(钱 / token / 时长)。
 *
 * 工业级语义:
 *   - 预算是**硬约束**:优先于自治等级 —— L3 可以自动脱困,但不能超预算;
 *   - run.budget 为空对象 => hasLimits=false,完全不影响现有行为;
 *   - runtime 在调度循环里每轮调用 checkBudget:
 *       · 有额度且用量变化 => emit budget.tick(可观测);
 *       · 超限 => emit budget.exceeded => run.blocked(reason='budget_exceeded')。
 *
 * 预算字段(BUDGET_SCHEMA):maxTokens / maxCost / maxSeconds / maxGpuSeconds。
 */
import { emptyUsage } from '../contracts/index.js';

/** usage 字段 -> 预算字段 */
const LIMIT_KEYS = {
  tokens: 'maxTokens',
  cost: 'maxCost',
  seconds: 'maxSeconds',
  gpuSeconds: 'maxGpuSeconds'
};

/**
 * 核对预算。
 * @param {object} run 含 budget 的 run
 * @param {object[]} tasks 当前任务集(用量取自 task.usage 求和)
 * @returns {{hasLimits:boolean, limits:object, usage:object, breaches:Array, exceeded:boolean}}
 */
export function checkBudget(run, tasks = []) {
  const budget = run?.budget || {};
  const limits = {};
  for (const [metric, key] of Object.entries(LIMIT_KEYS)) {
    if (Number.isFinite(budget[key])) limits[metric] = budget[key];
  }

  const usage = tasks.reduce((acc, t) => ({
    tokens: acc.tokens + (t?.usage?.tokens || 0),
    cost: acc.cost + (t?.usage?.cost || 0),
    seconds: acc.seconds + (t?.usage?.seconds || 0),
    gpuSeconds: acc.gpuSeconds + (t?.usage?.gpuSeconds || 0)
  }), emptyUsage());

  const breaches = Object.entries(limits)
    .filter(([metric, limit]) => (usage[metric] || 0) > limit)
    .map(([metric, limit]) => ({
      metric,
      limit,
      usage: usage[metric] || 0,
      ratio: limit > 0 ? (usage[metric] || 0) / limit : Infinity
    }));

  return {
    hasLimits: Object.keys(limits).length > 0,
    limits,
    usage,
    breaches,
    exceeded: breaches.length > 0
  };
}
