import { describe, it } from 'node:test';
import assert from 'node:assert';
import { StreamParser } from '../src/engine/model/streamParser.js';

describe('StreamParser · 通用多模型流式解析器', () => {
  it('应正确解析官方 delta.reasoning_content 独立字段 (如 DeepSeek-R1 官方 API)', () => {
    const events = [];
    const parser = new StreamParser({
      onChunk: (c) => events.push(c)
    });

    parser.feedDelta({ reasoning_content: '正在分析素材特征...' });
    parser.feedDelta({ reasoning_content: '准备建议 A 方案。' });
    parser.feedDelta({ content: '推荐方案：' });
    parser.feedDelta({ content: '采用快节奏剪辑。' });

    const result = parser.finish();

    assert.strictEqual(result.reasoning, '正在分析素材特征...准备建议 A 方案。');
    assert.strictEqual(result.text, '推荐方案：采用快节奏剪辑。');
    assert.deepStrictEqual(events, [
      { type: 'think', text: '正在分析素材特征...' },
      { type: 'think', text: '准备建议 A 方案。' },
      { type: 'text', text: '推荐方案：' },
      { type: 'text', text: '采用快节奏剪辑。' }
    ]);
  });

  it('应正确解析内嵌在 delta.content 中的被分片拆分的 <think>...</think> 标签 (如 Ollama DeepSeek)', () => {
    const events = [];
    const parser = new StreamParser({
      onChunk: (c) => events.push(c)
    });

    // 标签被跨 chunk 拆分
    parser.feedDelta({ content: '<th' });
    parser.feedDelta({ content: 'ink>第一步考虑音乐节奏。' });
    parser.feedDelta({ content: '第二步' });
    parser.feedDelta({ content: '分析镜头。</th' });
    parser.feedDelta({ content: 'ink>\n\n最终成片脚本如下：' });
    parser.feedDelta({ content: '分镜一：高燃开场。' });

    const result = parser.finish();

    assert.strictEqual(result.reasoning, '第一步考虑音乐节奏。第二步分析镜头。');
    assert.strictEqual(result.text, '最终成片脚本如下：分镜一：高燃开场。');
    assert.strictEqual(events.filter(e => e.type === 'think').map(e => e.text).join(''), '第一步考虑音乐节奏。第二步分析镜头。');
    assert.strictEqual(events.filter(e => e.type === 'text').map(e => e.text).join(''), '最终成片脚本如下：分镜一：高燃开场。');
  });

  it('对于不含任何思考过程的常规模型 (如 GPT-4o)，应直接输出正文且 reasoning 为空', () => {
    const events = [];
    const parser = new StreamParser({
      onChunk: (c) => events.push(c)
    });

    parser.feedDelta({ content: '您好！' });
    parser.feedDelta({ content: '我是视频总编导。' });

    const result = parser.finish();

    assert.strictEqual(result.reasoning, '');
    assert.strictEqual(result.text, '您好！我是视频总编导。');
    assert.strictEqual(events.every(e => e.type === 'text'), true);
  });

  it('应正确解析 Claude Thinking 模型的 <thinking>...</thinking> 标签及被分片拆分的标签', () => {
    const events = [];
    const parser = new StreamParser({
      onChunk: (c) => events.push(c)
    });

    parser.feedDelta({ content: '<thinking' });
    parser.feedDelta({ content: '>\n深度分析题目意图...\n' });
    parser.feedDelta({ content: '推导结论为9.9大于9.11。\n</thinking' });
    parser.feedDelta({ content: '>\n\n最终结论是 9.9 更大。' });

    const result = parser.finish();

    assert.strictEqual(
      result.reasoning,
      '深度分析题目意图...\n推导结论为9.9大于9.11。'
    );
    assert.strictEqual(result.text, '最终结论是 9.9 更大。');

    const thinkEvents = events.filter(e => e.type === 'think');
    const textEvents = events.filter(e => e.type === 'text');

    assert.ok(thinkEvents.length > 0, '应该收到思考事件');
    assert.ok(textEvents.length > 0, '应该收到正文事件');
  });

  it('应能正确累加 tool_calls 碎片', () => {
    const parser = new StreamParser();

    parser.feedDelta({
      tool_calls: [
        {
          index: 0,
          id: 'call_123',
          type: 'function',
          function: { name: 'match_clips', arguments: '{"tempo":' }
        }
      ]
    });

    parser.feedDelta({
      tool_calls: [
        {
          index: 0,
          function: { arguments: '"fast"}' }
        }
      ]
    });

    const result = parser.finish();

    assert.strictEqual(result.toolCalls.length, 1);
    assert.strictEqual(result.toolCalls[0].id, 'call_123');
    assert.strictEqual(result.toolCalls[0].function.name, 'match_clips');
    assert.strictEqual(result.toolCalls[0].function.arguments, '{"tempo":"fast"}');
  });

  it('应能在正文中段动态捕获并清洗多次或中途出现的 <think> 标签', () => {
    const events = [];
    const parser = new StreamParser({
      onChunk: (c) => events.push(c)
    });

    parser.feedDelta({ content: '前缀正文。' });
    parser.feedDelta({ content: '<think>中间思考内容</think>' });
    parser.feedDelta({ content: '正式回答。' });

    const result = parser.finish();

    assert.strictEqual(result.reasoning, '中间思考内容');
    assert.strictEqual(result.text, '前缀正文。正式回答。');
  });
});
