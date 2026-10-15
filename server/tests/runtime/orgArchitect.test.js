import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AgentSystem } from '../../src/runtime/agentLoader.js';
import { MCPHub } from '../../src/runtime/mcpHub.js';
import { registerLocalVideoTools } from '../../src/runtime/registerLocalTools.js';
import { config } from '../../src/config.js';

describe('Org Architect & Capability Provisioning (Step 1)', () => {
  const hub = new MCPHub();
  const testAgentsDir = config.paths.agentsDir;
  const testSkillsDir = config.paths.skillsDir;
  const agentSystem = new AgentSystem({ agentsDir: testAgentsDir, skillsDir: testSkillsDir });

  const tempAgentId = 'test-synth-agent';
  const tempSkillId = 'test-synth-skill';

  before(async () => {
    registerLocalVideoTools(hub, agentSystem);
    await agentSystem.loadFromDisk();
  });

  after(async () => {
    // Cleanup temporary files created during testing
    try {
      await fs.rm(path.join(testAgentsDir, tempAgentId), { recursive: true, force: true });
    } catch {}
    try {
      await fs.rm(path.join(testSkillsDir, tempSkillId), { recursive: true, force: true });
    } catch {}
  });

  it('should have architecture tools registered in MCPHub', () => {
    assert.equal(hub.hasTool('inspect_system_capabilities'), true);
    assert.equal(hub.hasTool('create_custom_agent'), true);
    assert.equal(hub.hasTool('create_custom_skill'), true);
  });

  it('should execute inspect_system_capabilities and return current inventory', async () => {
    const res = await hub.executeTool('inspect_system_capabilities', {});
    assert.ok(res.agents && res.agents.length >= 1, 'Should list existing agents');
    assert.ok(Array.isArray(res.skills), 'Skills array must be returned');
    assert.ok(res.tools && res.tools.length >= 1, 'Should list existing tools');

    const agentIds = res.agents.map(a => a.id);
    assert.ok(agentIds.includes('super-brain'), 'Super Brain agent must exist');
  });

  it('should allow org architect to create a modular skill via tool call', async () => {
    const skillRes = await hub.executeTool('create_custom_skill', {
      id: tempSkillId,
      name: '测试瞬态卡点技能',
      description: '针对 120fps 极速瞬态的卡点分析规约',
      markdown: `---\nname: 测试瞬态卡点技能\ndescription: 针对 120fps 极速瞬态的卡点分析规约\n---\n# 瞬态切分规约\n1. 阈值设定在 0.15s 内。`
    });

    assert.equal(skillRes.success, true);
    assert.equal(skillRes.skill.id, tempSkillId);

    // Verify it is discoverable
    const skillFound = agentSystem.getSkill(tempSkillId);
    assert.ok(skillFound, 'Synthesized skill should be instantly discoverable in AgentSystem');
    assert.equal(skillFound.name, '测试瞬态卡点技能');
  });

  it('should allow org architect to create a sub-agent via tool call', async () => {
    const agentRes = await hub.executeTool('create_custom_agent', {
      id: tempAgentId,
      name: '抽卡高光分析员',
      model: 'gemini-3.8-flash',
      skills: [tempSkillId, 'beat-sync'],
      tools: ['inspect_video_content'],
      persona: '你是抽卡高光分析专家，专精检测金色光效与抽卡出金瞬间。'
    });

    assert.equal(agentRes.success, true);
    assert.equal(agentRes.agent.id, tempAgentId);

    // Verify it is discoverable and system prompt compiles correctly
    const agentFound = agentSystem.getAgent(tempAgentId);
    assert.ok(agentFound, 'Synthesized agent should be instantly discoverable in AgentSystem');
    assert.ok(agentFound.skills.includes(tempSkillId));

    const prompt = agentSystem.buildAgentPrompt(tempAgentId, {
      project: { title: '原神抽卡' }
    });
    assert.ok(prompt.includes('抽卡高光分析专家'));
    assert.ok(prompt.includes('测试瞬态卡点技能'));
  });
});
