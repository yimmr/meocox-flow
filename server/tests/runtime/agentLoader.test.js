import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AgentSystem } from '../../src/runtime/agentLoader.js';

describe('AgentSystem Text Loader', () => {
  it('should register and compile system prompt for agent', () => {
    const system = new AgentSystem();

    system.registerSkillText('game-guide', `---
name: game-guide
description: 游戏攻略SOP
---
- 语速严格控制在 4.2字/秒
- 3~10秒切换关键镜头`);

    system.registerAgentText('screenwriter', `---
id: screenwriter
name: 文案编剧
skills: [game-guide]
tools: [update_storyboard]
---
你是顶级短视频文案大师，负责撰写有节奏感的解说词。`);

    const agent = system.getAgent('screenwriter');
    assert.equal(agent.name, '文案编剧');
    assert.deepEqual(agent.skills, ['game-guide']);

    const prompt = system.buildAgentPrompt('screenwriter', { project: { title: '黑神话攻略' } });
    assert.ok(prompt.includes('你是顶级短视频文案大师'));
    assert.ok(prompt.includes('语速严格控制在 4.2字/秒'));
    assert.ok(prompt.includes('黑神话攻略'));
  });
});
