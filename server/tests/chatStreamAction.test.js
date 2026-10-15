import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ActionStreamParser } from '../src/services/actionParser.js';

describe('Chat Action Stream Integration', () => {
  it('should cleanly separate text chunks and action events', () => {
    const parser = new ActionStreamParser();
    const texts = [];
    const actions = [];

    parser.on('text', t => texts.push(t));
    parser.on('action', a => actions.push(a));

    parser.feed('已生成方案。<tool_call name="update_pipeline_stage">{"stageId":"step_1","status":"completed"}</tool_call>分镜准备完毕。');
    parser.finish();

    assert.equal(texts.join(''), '已生成方案。分镜准备完毕。');
    assert.equal(actions.length, 1);
    assert.equal(actions[0].name, 'update_pipeline_stage');
    assert.equal(actions[0].args.stageId, 'step_1');
  });
});
