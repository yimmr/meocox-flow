import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AgentSystem } from '../../src/runtime/agentLoader.js';
import { SkillLoader } from '../../src/engine/skill/loader.js';
import { LeadOrchestrator } from '../../src/engine/orchestrator/orchestrator.js';
import { buildLeadOrchestratorPrompt } from '../../src/engine/orchestrator/promptBuilder.js';
import { createSystemTools } from '../../src/engine/tool/systemTools.js';
import { createLeanPackage, dehydrateSubagentResult } from '../../src/engine/orchestrator/contextPackager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

describe('Tripartite Multi-Agent Architecture (主脑 · 内容感知 · 系统进化)', () => {
  let agentLoader;
  let skillLoader;
  let orchestrator;
  let systemTools;

  before(async () => {
    agentLoader = new AgentSystem({
      agentsDir: path.join(projectRoot, 'agents'),
      skillsDir: path.join(projectRoot, 'skills')
    });
    await agentLoader.loadFromDisk();

    skillLoader = new SkillLoader({
      skillsDir: path.join(projectRoot, 'skills')
    });
    await skillLoader.loadAll();

    orchestrator = new LeadOrchestrator({
      agentLoader,
      skillLoader
    });

    systemTools = createSystemTools({
      agentLoader,
      skillLoader,
      orchestrator
    });
  });

  it('1. 三大基石智能体均已在 agents/ 真实就绪', () => {
    const superBrain = agentLoader.getAgent('super-brain');
    assert.ok(superBrain, 'super-brain 必须存在');
    assert.equal(superBrain.id, 'super-brain');

    const perception = agentLoader.getAgent('perception-specialist');
    assert.ok(perception, 'perception-specialist 必须存在');
    assert.equal(perception.id, 'perception-specialist');
    assert.equal(perception.title, '多模态内容感知专员');
    assert.ok(perception.skills.includes('video-perception'));
    assert.ok(perception.skills.includes('audio-perception'));
    assert.ok(perception.skills.includes('image-perception'));
    assert.ok(perception.skills.includes('doc-perception'));

    const evolution = agentLoader.getAgent('evolution-specialist');
    assert.ok(evolution, 'evolution-specialist 必须存在');
    assert.equal(evolution.id, 'evolution-specialist');
    assert.equal(evolution.title, '系统架构与进化专家');
    assert.ok(evolution.skills.includes('system-blueprint-guide'));
    assert.ok(evolution.skills.includes('system-compliance-check'));
    assert.ok(evolution.tools.includes('register_dynamic_agent'));
    assert.ok(evolution.tools.includes('register_dynamic_skill'));
    assert.ok(evolution.tools.includes('inspect_system_capabilities'));
  });

  it('2. 三大基石智能体和核心技能享有系统级防误删保护', async () => {
    // 智能体保护
    await assert.rejects(
      async () => await agentLoader.deleteAgent('super-brain'),
      /系统内置角色不允许删除/
    );
    await assert.rejects(
      async () => await agentLoader.deleteAgent('perception-specialist'),
      /系统内置角色不允许删除/
    );
    await assert.rejects(
      async () => await agentLoader.deleteAgent('evolution-specialist'),
      /系统内置角色不允许删除/
    );

    // 核心技能保护
    await assert.rejects(
      async () => await agentLoader.deleteSkill('system-blueprint-guide'),
      /系统内置技能规约不允许删除/
    );
    await assert.rejects(
      async () => await agentLoader.deleteSkill('system-compliance-check'),
      /系统内置技能规约不允许删除/
    );
    await assert.rejects(
      async () => await agentLoader.deleteSkill('video-perception'),
      /系统内置技能规约不允许删除/
    );
  });

  it('3. 系统架构法典与合规自检技能均完整落盘并包含关键规约', () => {
    const blueprintSkill = agentLoader.getSkill('system-blueprint-guide');
    assert.ok(blueprintSkill, 'system-blueprint-guide 技能必须存在');
    assert.ok(blueprintSkill.rules.includes('零拷贝'));
    assert.ok(blueprintSkill.rules.includes('agent.yml'));
    assert.ok(blueprintSkill.rules.includes('SKILL.md'));

    const complianceSkill = agentLoader.getSkill('system-compliance-check');
    assert.ok(complianceSkill, 'system-compliance-check 技能必须存在');
    assert.ok(complianceSkill.rules.includes('Checklist') || complianceSkill.rules.includes('清单'));
    assert.ok(complianceSkill.rules.includes('register_dynamic_agent'));
  });

  it('4. dispatch_agent 工具支持 mandate 与 contextRefs 精炼下发', async () => {
    const dispatchTool = systemTools.find(t => t.name === 'dispatch_agent');
    assert.ok(dispatchTool, '必须注册 dispatch_agent 工具');

    const result = await dispatchTool.handler({
      targetAgentId: 'perception-specialist',
      mandate: '探测并切分主战斗高光镜头',
      contextRefs: {
        assetPath: 'D:/assets/boss_battle.mp4',
        cacheKey: 'cas_fingerprint_001'
      },
      constraints: ['仅输出客观时间戳', '零业务创意干扰']
    }, {
      projectId: 'proj_tripartite_test'
    });

    assert.equal(result.success, true);
    assert.equal(result.data.delegatedTo, 'perception-specialist');
    assert.equal(result.data.mandate, '探测并切分主战斗高光镜头');
    assert.equal(result.data.contextRefs.assetPath, 'D:/assets/boss_battle.mp4');
    assert.ok(result.data.leanPackage, '必须生成 leanPackage');
    assert.equal(result.data.leanPackage.targetAgentId, 'perception-specialist');
    assert.equal(result.data.leanPackage.localAssets.length, 1);
    assert.equal(result.data.leanPackage.localAssets[0].path, 'D:/assets/boss_battle.mp4');
  });

  it('5. 主脑 4-Tier 提示词正确注入三位一体分工与角色拓扑', () => {
    const prompt = buildLeadOrchestratorPrompt({
      project: { id: 'p_tripartite', title: '三位一体基石工程' },
      registeredAgents: agentLoader.getAllAgents(),
      registeredSkills: skillLoader.getManifests?.() || []
    });

    // Tier 1 含有三位一体声明
    assert.ok(prompt.includes('Tripartite Core Separation'), 'Prompt 应包含三位一体核心分工');
    assert.ok(prompt.includes('perception-specialist'), 'Prompt 应说明内容感知专员');
    assert.ok(prompt.includes('evolution-specialist'), 'Prompt 应说明系统进化专家');
    assert.ok(prompt.includes('dispatch_agent'), 'Prompt 应说明 dispatch_agent 调度令');

    // 团队拓扑中显示三大专员
    assert.ok(prompt.includes('Perception Specialist'), '团队列表中应出现内容感知专员');
    assert.ok(prompt.includes('Evolution Specialist'), '团队列表中应出现系统进化专家');
  });
});
