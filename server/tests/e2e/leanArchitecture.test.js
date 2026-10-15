import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { AgentSystem } from '../../src/runtime/agentLoader.js';
import { MCPHub } from '../../src/runtime/mcpHub.js';
import { registerLocalVideoTools } from '../../src/runtime/registerLocalTools.js';

describe('Lean Architecture End-to-End', () => {
  it('should load text agents, bind local tools and filter schemas', async () => {
    // 1. Init System
    const agentSystem = new AgentSystem();
    const mcpHub = new MCPHub();

    // 2. Register local tools
    registerLocalVideoTools(mcpHub);

    // 3. Register text agents
    agentSystem.registerSkillText('viral-hook', `---
name: viral-hook
---
前3秒必须颠覆认知或提出冲突。`);

    agentSystem.registerAgentText('director', `---
id: director
name: 总导演
skills: [viral-hook]
tools: [update_project_meta, inspect_video_content]
---
负责统领全片。`);

    // 4. Verify prompt generation
    const prompt = agentSystem.buildAgentPrompt('director', {
      project: { title: '测试集锦' },
      assets: [{ id: 'c1' }]
    });
    assert.ok(prompt.includes('总导演'));
    assert.ok(prompt.includes('前3秒必须颠覆认知'));
    assert.ok(prompt.includes('测试集锦'));

    // 5. Verify tool schema filtering based on agent text declaration
    const director = agentSystem.getAgent('director');
    const toolsForDirector = mcpHub.getToolsSchema(director.tools);

    assert.equal(toolsForDirector.length, 2);
    const names = toolsForDirector.map(t => t.function.name);
    assert.ok(names.includes('update_project_meta'));
    assert.ok(names.includes('inspect_video_content'));
    assert.ok(!names.includes('export_jianying_draft')); // editor only
  });

  it('should load actual agent markdown files from agents/ directory', async () => {
    const agentSystem = new AgentSystem();
    await agentSystem.loadFromDisk();

    const superBrain = agentSystem.getAgent('super-brain');
    assert.ok(superBrain, 'Super brain agent file should be discovered');
    assert.equal(superBrain.id, 'super-brain');
    assert.ok(superBrain.name.includes('Super Brain'));
    assert.ok(superBrain.persona.includes('全能主脑') || superBrain.persona.includes('总控参谋长'));
  });
});
