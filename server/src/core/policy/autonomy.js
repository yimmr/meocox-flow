/**
 * Autonomy:老板授权的自治等级矩阵(L1 / L2 / L3)。
 *
 * 规则:
 *   - **L1(全人工)** — 任何升级都不自动脱困,一律等老板裁决;
 *   - **L2(辅助)**   — 仅 info 级异常可自动处理;warn / block 必须老板拍板;
 *   - **L3(全自动)** — 自动脱困:先重试,重试耗尽则跳过,让流水线继续;
 *                      (预算硬约束优先于自治 —— 见 policy/budget.js)
 *
 * 输出是「计划」(plan),由 runtime 执行:
 *   { canAuto, action: 'retry'|'skip'|null, level, reason }
 */
import { AUTONOMY_LEVELS } from '../contracts/index.js';

/**
 * 计算一次升级的自动脱困计划。
 * @param {string} level 'L1'|'L2'|'L3'
 * @param {{severity?:string}} escalation 升级单(或等价对象)
 * @returns {{canAuto:boolean, action:'retry'|'skip'|null, level:string, reason:string}}
 */
export function autoResolvePlan(level, escalation = {}) {
  const normalized = AUTONOMY_LEVELS.includes(level) ? level : 'L2';
  const severity = escalation.severity || 'block';

  if (normalized === 'L3') {
    return {
      canAuto: true,
      action: 'retry',
      level: normalized,
      reason: 'L3 全自动:自动脱困(先重试,耗尽则跳过)'
    };
  }

  if (normalized === 'L2') {
    if (severity === 'info') {
      return {
        canAuto: true,
        action: 'retry',
        level: normalized,
        reason: 'L2 辅助:info 级异常可自动脱困'
      };
    }
    return {
      canAuto: false,
      action: null,
      level: normalized,
      reason: `L2 辅助:${severity} 级异常需老板裁决`
    };
  }

  return {
    canAuto: false,
    action: null,
    level: 'L1',
    reason: 'L1 全人工:一切升级均需老板裁决'
  };
}

/**
 * 解析生效的自治等级:任务级策略优先,其次 run 级,默认 L2。
 * @param {object|null} task
 * @param {object|null} run
 * @returns {'L1'|'L2'|'L3'}
 */
export function resolveAutonomy(task, run) {
  const fromTask = task?.policy?.autonomy;
  if (AUTONOMY_LEVELS.includes(fromTask)) return fromTask;
  const fromRun = run?.autonomy;
  if (AUTONOMY_LEVELS.includes(fromRun)) return fromRun;
  return 'L2';
}
