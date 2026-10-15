import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { AgentSystem } from '../src/runtime/agentLoader.js';

describe('Agent & Skill Deletion', () => {
  test('should create and delete a custom agent', async () => {
    const tmpDir = path.join(os.tmpdir(), `agent_del_test_${Date.now()}`);
    const agentsDir = path.join(tmpDir, 'agents');
    const skillsDir = path.join(tmpDir, 'skills');
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.mkdir(skillsDir, { recursive: true });

    const system = new AgentSystem({
      agentsDir,
      skillsDir
    });

    const agent = await system.createCustomAgent({
      id: 'test-agent-del',
      name: '测试删除',
      title: '临时测试员',
      model: 'gemini-3.8-flash',
      skills: [],
      tools: ['*'],
      persona: '你是一个测试删除的智能体。'
    });

    assert.equal(system.getAgent('test-agent-del')?.name, '测试删除');

    // Delete custom agent
    const res = await system.deleteAgent('test-agent-del');
    assert.equal(res.success, true);
    assert.equal(system.getAgent('test-agent-del'), undefined);

    // Verify folder on disk was deleted
    const folderExists = await fs.access(path.join(agentsDir, 'test-agent-del')).then(() => true).catch(() => false);
    assert.equal(folderExists, false);

    // Reject deleting builtin agent
    await assert.rejects(
      async () => system.deleteAgent('super-brain'),
      /系统内置角色不允许删除/
    );

    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  test('should create and delete a custom skill', async () => {
    const tmpDir = path.join(os.tmpdir(), `skill_del_test_${Date.now()}`);
    const agentsDir = path.join(tmpDir, 'agents');
    const skillsDir = path.join(tmpDir, 'skills');
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.mkdir(skillsDir, { recursive: true });

    const system = new AgentSystem({
      agentsDir,
      skillsDir
    });

    const skill = await system.createCustomSkill({
      id: 'test-skill-del',
      name: '测试删除规约',
      category: 'genre',
      description: '临时测试技能',
      rules: '# 临时测试规则'
    });

    assert.equal(system.getSkill('test-skill-del')?.name, '测试删除规约');

    // Delete custom skill
    const res = await system.deleteSkill('test-skill-del');
    assert.equal(res.success, true);
    assert.equal(system.getSkill('test-skill-del'), null);

    // Reject deleting builtin skill
    await assert.rejects(
      async () => system.deleteSkill('high-energy'),
      /系统内置技能规约不允许删除/
    );

    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });
});
