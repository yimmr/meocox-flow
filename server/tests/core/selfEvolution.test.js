import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AgentLoader } from '../../src/engine/agent/loader.js';
import { SkillLoader } from '../../src/engine/skill/loader.js';
import { ToolRegistry } from '../../src/engine/tool/registry.js';
import { createSystemTools } from '../../src/engine/tool/systemTools.js';

describe('Core Engine · Self-Evolution & Capability Management', () => {
  let tempDir;
  let agentsDir;
  let skillsDir;
  let agentLoader;
  let skillLoader;
  let toolRegistry;
  let systemTools;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meocox-self-evolve-'));
    agentsDir = path.join(tempDir, 'agents');
    skillsDir = path.join(tempDir, 'skills');
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.mkdir(skillsDir, { recursive: true });

    skillLoader = new SkillLoader({ skillsDir });
    toolRegistry = new ToolRegistry({ toolsDir: path.join(tempDir, 'tools') });
    agentLoader = new AgentLoader({ agentsDir, skillLoader, toolRegistry });

    systemTools = createSystemTools({
      skillLoader,
      agentLoader,
      toolRegistry
    });
  });

  after(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('1. AgentLoader.createAgent 应成功落盘并热加载智能体', async () => {
    const agent = await agentLoader.createAgent({
      id: 'vision_analyst',
      name: '视觉感知分析师',
      title: '高级视觉侦查员',
      description: '负责分析画面结构与镜头语言',
      model: 'gemini-2.5-flash',
      skills: ['frame_slice'],
      tools: ['ffmpeg_probe'],
      persona: '你是一名专注画面特征提取的视觉分析师。'
    });

    assert.equal(agent.id, 'vision_analyst');
    assert.equal(agent.name, '视觉感知分析师');

    // 检查磁盘文件是否真实存在
    const ymlExists = await fs.access(path.join(agentsDir, 'vision_analyst', 'agent.yml')).then(() => true).catch(() => false);
    const mdExists = await fs.access(path.join(agentsDir, 'vision_analyst', 'agent.md')).then(() => true).catch(() => false);
    assert.ok(ymlExists, 'agent.yml 必须生成落盘');
    assert.ok(mdExists, 'agent.md 必须生成落盘');

    // 检查内存中是否立即可见
    const fetched = agentLoader.getAgent('vision_analyst');
    assert.ok(fetched, '内存 Map 中必须立即查到新智能体');
    assert.equal(fetched.title, '高级视觉侦查员');
  });

  it('2. SkillLoader.createSkill 应成功落盘并热加载技能', async () => {
    const skill = await skillLoader.createSkill({
      id: 'beat_detector',
      name: '音乐节拍卡点法',
      description: '精准定位音频峰值并生成卡点切片建议',
      tags: ['audio', 'music'],
      content: '# 音乐节拍卡点操作指南\n1. 导入音频\n2. 提取峰值点'
    });

    assert.equal(skill.id, 'beat_detector');
    assert.equal(skill.name, '音乐节拍卡点法');

    // 检查磁盘文件
    const mdExists = await fs.access(path.join(skillsDir, 'beat_detector', 'SKILL.md')).then(() => true).catch(() => false);
    assert.ok(mdExists, 'SKILL.md 必须生成落盘');

    const fetched = skillLoader.getSkill('beat_detector');
    assert.ok(fetched, '内存 Map 中必须立即查到新技能');
    assert.ok(fetched.content.includes('音乐节拍卡点操作指南'));
  });

  it('3. inspect_system_capabilities 应结构化返回团队全貌与专长', async () => {
    const inspectTool = systemTools.find(t => t.name === 'inspect_system_capabilities');
    assert.ok(inspectTool, '必须包含 inspect_system_capabilities 工具');

    const res = await inspectTool.handler();
    assert.equal(res.success, true);
    assert.ok(res.summary.includes('现有 1 个智能体'));
    assert.equal(res.data.totalAgents, 1);
    assert.equal(res.data.agents[0].id, 'vision_analyst');
    assert.equal(res.data.agents[0].name, '视觉感知分析师');
    assert.equal(res.data.totalSkills, 1);
    assert.equal(res.data.skills[0].id, 'beat_detector');
  });

  it('4. register_dynamic_agent 工具应支持主脑调用并完成动态演化', async () => {
    const registerAgentTool = systemTools.find(t => t.name === 'register_dynamic_agent');
    assert.ok(registerAgentTool, '必须包含 register_dynamic_agent 工具');

    const res = await registerAgentTool.handler({
      id: 'storyboard_director',
      name: '分镜导演',
      title: '主创分镜师',
      description: '负责将剧本或创意转译为视觉故事板',
      persona: '你是一名擅长把握镜头景别与运镜调度的分镜导演。'
    });

    assert.equal(res.success, true);
    assert.ok(res.data.isAgentCreated);
    assert.equal(res.data.agent.id, 'storyboard_director');

    // 再次盘点，智能体数量变为 2
    const all = agentLoader.getAllAgents();
    assert.equal(all.length, 2);
    assert.ok(all.some(a => a.id === 'storyboard_director'));
  });

  it('5. register_dynamic_skill 工具应支持主脑动态沉淀新技能', async () => {
    const registerSkillTool = systemTools.find(t => t.name === 'register_dynamic_skill');
    assert.ok(registerSkillTool, '必须包含 register_dynamic_skill 工具');

    const res = await registerSkillTool.handler({
      id: 'cinematic_framing',
      name: '电影级构图反推法则',
      description: '分析画面景别、机位与焦段',
      tags: ['composition', 'camera'],
      content: '# 电影级构图反推法则\n分析画面的主副体关系与三分线构图。'
    });

    assert.equal(res.success, true);
    assert.ok(res.data.isSkillCreated);

    const manifests = skillLoader.getManifests();
    assert.equal(manifests.length, 2);
    assert.ok(manifests.some(s => s.id === 'cinematic_framing'));
  });
});
