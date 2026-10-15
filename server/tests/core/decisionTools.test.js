import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSystemTools } from '../../src/engine/tool/systemTools.js';

describe('System Tools · apply_workflow_decision (主脑代裁决与解冻工具)', () => {
  const tools = createSystemTools({});
  const decisionTool = tools.find((t) => t.name === 'apply_workflow_decision');

  it('1. 系统工具集应包含 apply_workflow_decision 且具备规范入参 Schema', () => {
    assert.ok(decisionTool, 'apply_workflow_decision 工具必须存在');
    assert.equal(decisionTool.isSystem, true);
    assert.ok(decisionTool.inputSchema.properties.decisionId, '入参必须包含 decisionId');
    assert.ok(decisionTool.inputSchema.required.includes('decisionId'), 'decisionId 必须为必填项');
  });

  it('2. 缺失 decisionId 时应返回标准错误 Envelope', async () => {
    const res = await decisionTool.handler({});
    assert.equal(res.success, false);
    assert.equal(res.error?.code, 'INVALID_DECISION_ID');
  });

  it('3. 正确传入裁决参数时应生成合法 Envelope 载荷', async () => {
    const res = await decisionTool.handler({
      decisionId: 'dec_test_001',
      optionId: 'opt_a',
      choiceText: '采用快节奏镜头方案 A',
      reason: '方案 A 前 3 秒具有高燃视觉冲击力，契合平台推荐算法'
    });

    assert.equal(res.success, true);
    assert.equal(res.data?.isDecisionApplied, true);
    assert.equal(res.data?.decisionId, 'dec_test_001');
    assert.equal(res.data?.optionId, 'opt_a');
    assert.equal(res.data?.actor, 'super-brain');
    assert.ok(res.summary.includes('主脑已代为执行裁决'));
  });
});
