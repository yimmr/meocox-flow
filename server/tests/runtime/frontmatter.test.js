import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../../src/runtime/frontmatter.js';

describe('Frontmatter Parser', () => {
  it('should parse yaml metadata and markdown body', () => {
    const raw = `---
id: screenwriter
name: 爆款解说编剧
model: deepseek-r1
skills: [viral-hook, game-guide]
tools: [storyboard_update, tts_preview]
---
你是一位专注短视频黄金3秒的资深编剧。
负责撰写口播台词。`;

    const result = parseFrontmatter(raw);
    assert.equal(result.meta.id, 'screenwriter');
    assert.equal(result.meta.name, '爆款解说编剧');
    assert.equal(result.meta.model, 'deepseek-r1');
    assert.deepEqual(result.meta.skills, ['viral-hook', 'game-guide']);
    assert.deepEqual(result.meta.tools, ['storyboard_update', 'tts_preview']);
    assert.ok(result.body.includes('你是一位专注短视频黄金3秒的资深编剧。'));
  });

  it('should return empty meta if no frontmatter present', () => {
    const raw = '纯 Markdown 内容无 YAML 头部';
    const result = parseFrontmatter(raw);
    assert.deepEqual(result.meta, {});
    assert.equal(result.body, '纯 Markdown 内容无 YAML 头部');
  });
});
