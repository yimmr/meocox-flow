import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGroundedSystemPrompt } from '../src/services/ai.js';

describe('AI Grounding Prompt Builder', () => {
  it('should inject real project metadata, assets and storyboard into prompt', () => {
    const project = { title: '测试攻略', game: '黑神话：悟空' };
    const assets = [
      { id: 'clip_real_101', name: 'boss_stun.mp4', duration: '00:04', tags: ['Boss战', '暴击'] }
    ];
    const storyboard = [
      { order: 1, title: '开场钩子', matchedClipId: 'clip_real_101', timeRange: '00:00 - 00:04', scriptText: '注意破招' }
    ];

    const prompt = buildGroundedSystemPrompt({ project, assets, storyboard });

    assert.ok(prompt.includes('测试攻略'));
    assert.ok(prompt.includes('clip_real_101'));
    assert.ok(prompt.includes('boss_stun.mp4'));
    assert.ok(prompt.includes('<tool_call name="update_storyboard">'));
  });
});
