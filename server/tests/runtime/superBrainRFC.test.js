import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AgentSystem } from '../../src/runtime/agentLoader.js';
import { MCPHub } from '../../src/runtime/mcpHub.js';
import { registerLocalVideoTools } from '../../src/runtime/registerLocalTools.js';

describe('Super Brain & Capability Gap Protocol (Step 2)', () => {
  const hub = new MCPHub();
  const testAgentsDir = path.resolve('..', 'agents');
  const testSkillsDir = path.resolve('..', 'skills');
  const agentSystem = new AgentSystem({ agentsDir: testAgentsDir, skillsDir: testSkillsDir });

  const testRfcSkillId = 'rfc-gacha-reversal';

  before(async () => {
    registerLocalVideoTools(hub, agentSystem);
    await agentSystem.loadFromDisk();
  });

  after(async () => {
    try {
      await fs.rm(path.join(testSkillsDir, testRfcSkillId), { recursive: true, force: true });
    } catch {}
  });

  it('should register report_capability_gap tool into MCPHub', () => {
    assert.equal(hub.hasTool('report_capability_gap'), true);
  });

  it('should allow domain agents to submit a structured Capability Gap RFC', async () => {
    const rfcResult = await hub.executeTool('report_capability_gap', {
      gapType: 'skill',
      reason: '需要针对抽卡坠机垫刀与大保底反转的起承转合剪辑法则，现有通用技能无法把控',
      suggestedName: testRfcSkillId,
      suggestedDescription: '抽卡垫刀积蓄压抑感，金光一闪触发强节奏释放的卡点规约'
    }, { projectId: 'test_proj' });

    assert.equal(rfcResult.success, true);
    assert.ok(rfcResult.ticketId.startsWith('rfc_'));
    assert.equal(rfcResult.gapType, 'skill');
    assert.equal(rfcResult.status, 'pending_user_confirmation');
  });

  it('should allow Org Architect to fulfill the RFC by creating the requested skill', async () => {
    // Org architect executes creation to fulfill the gap
    const createRes = await hub.executeTool('create_custom_skill', {
      id: testRfcSkillId,
      name: '抽卡反转与出金高能规约',
      description: '抽卡垫刀积蓄压抑感，金光一闪触发强节奏释放的卡点规约',
      markdown: `---\nname: 抽卡反转与出金高能规约\ndescription: 抽卡垫刀积蓄压抑感，金光一闪触发强节奏释放的卡点规约\n---\n# 抽卡反转剪辑法则\n1. 垫刀蓝紫光单抽时长压缩在 0.8s 并在尾音叠压。\n2. 金光出金瞬间静音 0.3s 制造听觉真空，随后全频带 Drop 炸开。`
    });

    assert.equal(createRes.success, true);

    // Verify it is immediately available to the whole team
    const createdSkill = agentSystem.getSkill(testRfcSkillId);
    assert.ok(createdSkill, 'New skill must be immediately loaded into AgentSystem');
    assert.ok(createdSkill.rules.includes('听觉真空'));
  });
});
