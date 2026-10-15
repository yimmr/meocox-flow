import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  GateRegistry,
  evaluateRule,
  evaluateGate,
  enforceGate
} from '../../src/core/policy/qualityGate.js';
import { autoResolvePlan, resolveAutonomy } from '../../src/core/policy/autonomy.js';
import { checkBudget } from '../../src/core/policy/budget.js';
import { createQualityGate } from '../../src/core/contracts/index.js';

// ── QualityGate ───────────────────────────────────────────────
describe('QualityGate · 规则判定 / 闸门 / 注册表', () => {
  test('各算子逐条判定,缺指标即不通过', () => {
    const m = { score: 0.9, note: '画面达标', count: 3 };
    assert.equal(evaluateRule({ id: 'r', metric: 'score', op: '>=', value: 0.8 }, m), true);
    assert.equal(evaluateRule({ id: 'r', metric: 'score', op: '>=', value: 0.95 }, m), false);
    assert.equal(evaluateRule({ id: 'r', metric: 'score', op: '<=', value: 0.95 }, m), true);
    assert.equal(evaluateRule({ id: 'r', metric: 'count', op: '==', value: 3 }, m), true);
    assert.equal(evaluateRule({ id: 'r', metric: 'count', op: '!=', value: 3 }, m), false);
    assert.equal(evaluateRule({ id: 'r', metric: 'note', op: 'contains', value: '达标' }, m), true);
    assert.equal(evaluateRule({ id: 'r', metric: 'note', op: 'regex', value: '^画面' }, m), true);
    // 指标缺失 => 任何算子都不通过
    assert.equal(evaluateRule({ id: 'r', metric: 'missing', op: '>=', value: 0 }, m), false);
    // 非法正则不抛异常,判 false
    assert.equal(evaluateRule({ id: 'r', metric: 'note', op: 'regex', value: '([' }, m), false);
  });

  test('block 级失败卡闸门;warn/info 只留痕仍放行', () => {
    const gate = createQualityGate({
      id: 'gate_unit_rules',
      appliesTo: 'report',
      rules: [
        { id: 'r1', metric: 'score', op: '>=', value: 0.8 },
        { id: 'r2', metric: 'note', op: 'contains', value: '需重做', severity: 'warn' }
      ],
      onPass: 'advance',
      onFail: 'escalate'
    });

    // 达标,但附带一个 warn 级失败 => 放行(只留痕)
    const pass = evaluateGate(gate, { score: 0.9, note: '画面不错' });
    assert.equal(pass.pass, true);
    assert.equal(pass.failures.length, 0);
    assert.equal(pass.warnings.length, 1);
    assert.equal(pass.warnings[0].severity, 'warn');

    // 全部达标 => 放行且无留痕
    const passClean = evaluateGate(gate, { score: 0.9, note: '需重做' });
    assert.equal(passClean.pass, true);
    assert.equal(passClean.warnings.length, 0);

    // block 级失败 => 卡住(warn 级的失败仍只留痕)
    const fail = evaluateGate(gate, { score: 0.5, note: '画面不错' });
    assert.equal(fail.pass, false);
    assert.equal(fail.failures.length, 1);
    assert.equal(fail.failures[0].metric, 'score');
    assert.equal(fail.failures[0].actual, 0.5);
  });

  test('enforceGate 未达标抛 EGATE,携带 failureAction', () => {
    const gate = createQualityGate({
      id: 'gate_unit_enforce',
      appliesTo: 'report',
      rules: [{ id: 'r1', metric: 'score', op: '>=', value: 0.8 }],
      onFail: 'retry'
    });
    const verdict = enforceGate(gate, { score: 0.9 });
    assert.equal(verdict.pass, true);

    assert.throws(
      () => enforceGate(gate, { score: 0.1 }),
      (err) => err.code === 'EGATE' && err.failureAction === 'retry' && err.gateId === 'gate_unit_enforce'
    );
  });

  test('注册表:register 走契约校验,get/list 可查', () => {
    const reg = new GateRegistry();
    reg.register({ id: 'gate_reg_1', appliesTo: 'storyboard', rules: [{ id: 'r', metric: 'x', op: '>=' }] });
    assert.ok(reg.get('gate_reg_1'));
    assert.equal(reg.has('gate_reg_1'), true);
    assert.equal(reg.list().length, 1);
    assert.equal(reg.get('nope'), null);

    // 非法 op 注册即抛
    assert.throws(
      () => reg.register({ id: 'gate_reg_bad', appliesTo: 'storyboard', rules: [{ id: 'r', metric: 'x', op: '~>' }] }),
      /校验失败/
    );
  });
});

// ── Autonomy ──────────────────────────────────────────────────
describe('Autonomy · L1/L2/L3 自治矩阵', () => {
  test('L1 永不自动脱困(即便 info 级)', () => {
    const plan = autoResolvePlan('L1', { severity: 'info' });
    assert.equal(plan.canAuto, false);
    assert.equal(plan.action, null);
    assert.equal(plan.level, 'L1');
  });

  test('L2 仅 info 级自动,block 级必须老板拍板', () => {
    const info = autoResolvePlan('L2', { severity: 'info' });
    assert.equal(info.canAuto, true);
    assert.equal(info.action, 'retry');

    const block = autoResolvePlan('L2', { severity: 'block' });
    assert.equal(block.canAuto, false);

    const warn = autoResolvePlan('L2', { severity: 'warn' });
    assert.equal(warn.canAuto, false);
  });

  test('L3 全自动:先重试,重试耗尽由 runtime 降级为跳过', () => {
    const plan = autoResolvePlan('L3', { severity: 'block' });
    assert.equal(plan.canAuto, true);
    assert.equal(plan.action, 'retry');
    assert.equal(plan.level, 'L3');
  });

  test('未知等级回落 L2;任务级策略优先于 run 级', () => {
    assert.equal(autoResolvePlan('L9', { severity: 'block' }).level, 'L2');
    assert.equal(resolveAutonomy({ policy: { autonomy: 'L1' } }, { autonomy: 'L3' }), 'L1');
    assert.equal(resolveAutonomy({ policy: {} }, { autonomy: 'L3' }), 'L3');
    assert.equal(resolveAutonomy(null, null), 'L2');
  });
});

// ── Budget ────────────────────────────────────────────────────
describe('Budget · 预算硬约束', () => {
  const tasks = [
    { usage: { tokens: 100, cost: 1.5, seconds: 30, gpuSeconds: 10 } },
    { usage: { tokens: 50, cost: 0.5, seconds: 10, gpuSeconds: 0 } }
  ];

  test('空预算 => hasLimits=false,完全不影响既有行为', () => {
    const r = checkBudget({ budget: {} }, tasks);
    assert.equal(r.hasLimits, false);
    assert.equal(r.exceeded, false);
    assert.deepEqual(r.breaches, []);
  });

  test('有额度未超限 => 用量求和,不拦路', () => {
    const r = checkBudget({ budget: { maxCost: 5, maxTokens: 1000 } }, tasks);
    assert.equal(r.hasLimits, true);
    assert.equal(r.exceeded, false);
    assert.equal(r.usage.cost, 2);
    assert.equal(r.usage.tokens, 150);
    assert.equal(r.usage.seconds, 40);
  });

  test('超限 => breaches 精确命中越界的度量', () => {
    const r = checkBudget({ budget: { maxCost: 1, maxGpuSeconds: 5 } }, tasks);
    assert.equal(r.hasLimits, true);
    assert.equal(r.exceeded, true);
    const metrics = r.breaches.map((b) => b.metric).sort();
    assert.deepEqual(metrics, ['cost', 'gpuSeconds']);
    const cost = r.breaches.find((b) => b.metric === 'cost');
    assert.equal(cost.limit, 1);
    assert.equal(cost.usage, 2);
  });

  test('usage 字段缺失按 0 处理', () => {
    const r = checkBudget({ budget: { maxSeconds: 10 } }, [{}, { usage: { seconds: 4 } }]);
    assert.equal(r.exceeded, false);
    assert.equal(r.usage.seconds, 4);
  });
});
