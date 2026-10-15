import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AgentSystem } from '../../src/runtime/agentLoader.js';

describe('Custom Agent & Skill Directory Conventions', () => {
  const tmpDir = path.resolve('tests', 'tmp_convention_test');
  const tmpAgentsDir = path.join(tmpDir, 'agents');
  const tmpSkillsDir = path.join(tmpDir, 'skills');

  it('should load agent from separate agent.yml and agent.md', async () => {
    await fs.mkdir(path.join(tmpAgentsDir, 'animator'), { recursive: true });
    await fs.writeFile(
      path.join(tmpAgentsDir, 'animator', 'agent.yml'),
      `id: animator\nname: 动画制作大师\nmodel: claude-3-7-sonnet\nskills: [beat-sync]\ntools: [inspect_video_content]\n`
    );
    await fs.writeFile(
      path.join(tmpAgentsDir, 'animator', 'agent.md'),
      `你是一位专业动画与特效大师，擅长卡点与动效排布。`
    );

    const system = new AgentSystem({ agentsDir: tmpAgentsDir, skillsDir: tmpSkillsDir });
    await system.loadFromDisk();

    const agent = system.getAgent('animator');
    assert.ok(agent);
    assert.equal(agent.name, '动画制作大师');
    assert.equal(agent.model, 'claude-3-7-sonnet');
    assert.deepEqual(agent.skills, ['beat-sync']);
    assert.deepEqual(agent.tools, ['inspect_video_content']);
    assert.ok(agent.persona.includes('动画与特效大师'));
  });

  it('should detect handler.ts or handler.js in skill directory', async () => {
    await fs.mkdir(path.join(tmpSkillsDir, 'beat-sync'), { recursive: true });
    await fs.writeFile(
      path.join(tmpSkillsDir, 'beat-sync', 'SKILL.md'),
      `---\nname: beat-sync\ndescription: 节拍卡点规约\ncategory: genres\n---\n# 卡点规则\n0.3-1.5s 镜头切点。`
    );
    await fs.writeFile(
      path.join(tmpSkillsDir, 'beat-sync', 'handler.ts'),
      `export async function execute() { return true; }`
    );

    const system = new AgentSystem({ agentsDir: tmpAgentsDir, skillsDir: tmpSkillsDir });
    await system.loadFromDisk();

    const skill = system.getSkill('beat-sync');
    assert.ok(skill);
    assert.equal(skill.name, 'beat-sync');
    assert.equal(skill.hasHandler, true);
    assert.ok(skill.handlerPath.endsWith('handler.ts'));
  });

  it('should create custom agent files on disk with exact structure', async () => {
    const system = new AgentSystem({ agentsDir: tmpAgentsDir, skillsDir: tmpSkillsDir });
    const created = await system.createCustomAgent({
      id: 'music-master',
      name: '音乐大师',
      model: 'deepseek-r1',
      skills: ['beat-sync'],
      tools: ['inspect_video_content'],
      persona: '负责选曲与节奏铺设。'
    });

    assert.equal(created.id, 'music-master');
    const ymlStat = await fs.stat(path.join(tmpAgentsDir, 'music-master', 'agent.yml'));
    const mdStat = await fs.stat(path.join(tmpAgentsDir, 'music-master', 'agent.md'));
    assert.ok(ymlStat.isFile());
    assert.ok(mdStat.isFile());

    const ymlContent = await fs.readFile(path.join(tmpAgentsDir, 'music-master', 'agent.yml'), 'utf-8');
    assert.ok(ymlContent.includes('name: 音乐大师'));
    assert.ok(ymlContent.includes('model: deepseek-r1'));

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
