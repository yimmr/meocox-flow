/**
 * QualityGate:任务产出的自动质检闸门。
 *
 * 工业级语义:
 *   - 任务执行成功后,若 task.policy.qualityGateId 命中注册表,
 *     用执行结果的 metrics 对闸门规则逐条判定;
 *   - **达标自动放行**(gate.passed,无需人工);
 *   - **未达标按 gate.onFail 处置**(retry / escalate / autoFix),
 *     只有 severity='block' 的规则才会卡住闸门,warn/info 只留痕;
 *   - 判定与事件全部留痕(gate.passed / gate.failed),可回放可审计。
 *
 * 注册表是进程内默认实例;测试 / 路由可注入自己的 GateRegistry。
 */
import { createQualityGate } from '../contracts/index.js';

/** 单条规则判定。
 * @param {{metric:string, op:string, value?:*}} rule
 * @param {Record<string, *>} metrics
 * @returns {boolean} 该规则是否通过
 */
export function evaluateRule(rule, metrics = {}) {
  const actual = metrics?.[rule.metric];
  const expected = rule.value;

  switch (rule.op) {
    case '>=':
    case '<=': {
      const a = Number(actual);
      const b = Number(expected);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return rule.op === '>=' ? a >= b : a <= b;
    }
    case '==': {
      if (typeof expected === 'number' || typeof actual === 'number') {
        const a = Number(actual);
        const b = Number(expected);
        if (Number.isFinite(a) && Number.isFinite(b)) return a === b;
      }
      return actual === expected || String(actual) === String(expected);
    }
    case '!=': {
      if (typeof expected === 'number' || typeof actual === 'number') {
        const a = Number(actual);
        const b = Number(expected);
        if (Number.isFinite(a) && Number.isFinite(b)) return a !== b;
      }
      return !(actual === expected || String(actual) === String(expected));
    }
    case 'contains':
      if (actual === undefined || actual === null) return false;
      return String(actual).includes(String(expected));
    case 'regex':
      if (actual === undefined || actual === null) return false;
      try {
        return new RegExp(expected).test(String(actual));
      } catch {
        return false;
      }
    case 'custom':
      return typeof expected === 'function' ? Boolean(expected(actual, metrics)) : false;
    default:
      return false;
  }
}

/**
 * 整个闸门判定。
 *
 * 无 severity 的规则默认按 'block' 处理(从严);
 * info / warn 级别的失败只进 warnings,不拦路。
 *
 * @returns {{pass:boolean, failures:Array, warnings:Array, verdicts:Array}}
 */
export function evaluateGate(gate, metrics = {}) {
  const verdicts = [];
  const failures = [];
  const warnings = [];

  for (const rule of gate.rules || []) {
    let pass = false;
    try {
      pass = evaluateRule(rule, metrics);
    } catch {
      pass = false;
    }
    const entry = {
      ruleId: rule.id,
      metric: rule.metric,
      op: rule.op,
      expected: rule.value instanceof Function ? '[fn]' : rule.value,
      actual: metrics?.[rule.metric] ?? null,
      severity: rule.severity || 'block',
      pass
    };
    verdicts.push(entry);
    if (pass) continue;
    if (entry.severity === 'block') failures.push(entry);
    else warnings.push(entry);
  }

  return { pass: failures.length === 0, failures, warnings, verdicts };
}

/**
 * 判定并在未达标时抛出 EGATE(带 failureAction,供 runtime 分支处置)。
 * @throws {Error} code='EGATE'
 */
export function enforceGate(gate, metrics = {}) {
  const verdict = evaluateGate(gate, metrics);
  if (verdict.pass) return verdict;

  const detail = verdict.failures
    .map((f) => `${f.metric} ${f.op} ${f.expected} (实际: ${f.actual})`)
    .join('; ');
  const err = new Error(`[Gate ${gate.id}] 质检未通过: ${detail}`);
  err.code = 'EGATE';
  err.gateId = gate.id;
  err.failureAction = gate.onFail || null;
  err.failures = verdict.failures;
  err.verdict = verdict;
  throw err;
}

/** 闸门注册表(id -> gate) */
export class GateRegistry {
  constructor(gates = []) {
    /** @type {Map<string, object>} */
    this.gates = new Map();
    for (const g of gates) this.register(g);
  }

  /** 注册(或覆盖)一个闸门,入参走契约校验 */
  register(gate) {
    const normalized = createQualityGate(gate);
    this.gates.set(normalized.id, normalized);
    return normalized;
  }

  get(id) {
    return this.gates.get(id) || null;
  }

  has(id) {
    return this.gates.has(id);
  }

  list() {
    return Array.from(this.gates.values());
  }
}

/** 进程内默认闸门表(可被 routes / 测试按需注册) */
export const defaultGateRegistry = new GateRegistry();
