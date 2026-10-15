import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractToolCalls, ActionStreamParser } from '../src/services/actionParser.js';

describe('ActionParser', () => {
  it('should extract a single complete tool call from text', () => {
    const text = `好的，我来为你编排前三个镜头：\n<tool_call name="update_storyboard">\n{"items":[{"order":1,"title":"黄金钩子","scriptText":"卡关3小时？","matchedClipId":"clip_02","durationSec":4}]}\n</tool_call>\n请确认上述分镜方案。`;
    const { cleanText, toolCalls } = extractToolCalls(text);

    assert.equal(toolCalls.length, 1);
    assert.equal(toolCalls[0].name, 'update_storyboard');
    assert.equal(toolCalls[0].args.items[0].order, 1);
    assert.equal(toolCalls[0].args.items[0].title, '黄金钩子');
    assert.match(cleanText, /好的，我来为你编排前三个镜头/);
    assert.match(cleanText, /请确认上述分镜方案/);
    assert.ok(!cleanText.includes('<tool_call'));
  });

  it('should handle markdown code-block wrapped json inside tool_call', () => {
    const text = `<tool_call name="update_pipeline_stage">\n\`\`\`json\n{"stageId":"step_1","status":"completed","progress":100}\n\`\`\`\n</tool_call>`;
    const { toolCalls } = extractToolCalls(text);

    assert.equal(toolCalls.length, 1);
    assert.equal(toolCalls[0].name, 'update_pipeline_stage');
    assert.equal(toolCalls[0].args.stageId, 'step_1');
    assert.equal(toolCalls[0].args.progress, 100);
  });

  it('should stream parse chunks and emit tool call when completed', () => {
    const parser = new ActionStreamParser();
    const emitted = [];
    parser.on('action', (call) => emitted.push(call));

    parser.feed('你好！正在排期：<tool_call name="scan_local_assets">');
    assert.equal(emitted.length, 0);

    parser.feed('{"directoryPath":"D:/videos"}');
    assert.equal(emitted.length, 0);

    parser.feed('</tool_call> 已经下发扫描指令。');
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].name, 'scan_local_assets');
    assert.equal(emitted[0].args.directoryPath, 'D:/videos');
  });

  it('should emit clean text chunks outside of tool calls', () => {
    const parser = new ActionStreamParser();
    const texts = [];
    parser.on('text', (t) => texts.push(t));

    parser.feed('前置文本');
    parser.feed('<tool_call name="test">{"a":1}</tool_call>');
    parser.feed('后置文本');
    parser.finish();

    assert.equal(texts.join(''), '前置文本后置文本');
  });

  it('should recognise a tool call split across arbitrary stream chunks', () => {
    const full = '好的,马上执行。<tool_call name="test_mcp_task">\n{"serverName":"google-flow","task":"image_generation"}\n</tool_call>\n请稍候。';
    const parser = new ActionStreamParser();
    const texts = [];
    const actions = [];
    parser.on('text', (t) => texts.push(t));
    parser.on('action', (a) => actions.push(a));

    // Feed 3 characters at a time to simulate a real SSE token stream.
    for (let i = 0; i < full.length; i += 3) parser.feed(full.slice(i, i + 3));
    parser.finish();

    assert.equal(actions.length, 1);
    assert.equal(actions[0].name, 'test_mcp_task');
    assert.equal(actions[0].args.serverName, 'google-flow');
    assert.ok(!texts.join('').includes('<tool_call'), 'raw tool_call tag must never leak to the user');
    assert.match(texts.join(''), /好的,马上执行。/);
    assert.match(texts.join(''), /请稍候。/);
  });

  it('should recognise a tool call when the chunk boundary splits the opening tag', () => {
    const parser = new ActionStreamParser();
    const texts = [];
    const actions = [];
    parser.on('text', (t) => texts.push(t));
    parser.on('action', (a) => actions.push(a));

    parser.feed('前置文本 <tool_c');
    parser.feed('all name="update_pipeline_stage">');
    parser.feed('{"stageId":"step_1","progress":50}</tool_call> 后置文本');
    parser.finish();

    assert.equal(actions.length, 1);
    assert.equal(actions[0].name, 'update_pipeline_stage');
    assert.equal(actions[0].args.stageId, 'step_1');
    assert.equal(texts.join(''), '前置文本  后置文本');
    assert.ok(!texts.join('').includes('tool_call'));
  });

  it('should not swallow ordinary text that merely contains a "<" character', () => {
    const parser = new ActionStreamParser();
    const texts = [];
    parser.on('text', (t) => texts.push(t));

    parser.feed('进度 5 <');
    parser.feed(' 3 是成立的,并且 a<b 也成立。');
    parser.finish();

    assert.equal(texts.join(''), '进度 5 < 3 是成立的,并且 a<b 也成立。');
  });
});
