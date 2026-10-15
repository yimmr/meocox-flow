import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import agentsRouter from '../src/routes/agents.js';
import { defaultAgentSystem } from '../src/runtime/agentLoader.js';
import { defaultMCPHub } from '../src/runtime/mcpHub.js';
import { registerLocalVideoTools } from '../src/runtime/registerLocalTools.js';

function createTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/agents', agentsRouter);
  return app;
}

test('Exclusive Settings API - Skills and Tools endpoints', async (t) => {
  // Ensure local tools and skills are loaded into test context
  registerLocalVideoTools(defaultMCPHub);
  await defaultAgentSystem.loadFromDisk();

  const app = createTestServer();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const testSkillId = `test-exclusive-skill-${Date.now()}`;

  t.after(async () => {
    try {
      await fetch(`${baseUrl}/api/agents/skills/${testSkillId}`, { method: 'DELETE' }).catch(() => {});
      await defaultAgentSystem.deleteSkill(testSkillId).catch(() => {});
    } catch {}
    server.close();
  });

  await t.test('GET /api/agents/tools returns detailed tools with parameters schema', async () => {
    const res = await fetch(`${baseUrl}/api/agents/tools`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.tools));
    assert.ok(data.tools.length > 0);

    // Verify detailed fields
    const firstTool = data.tools[0];
    assert.ok(firstTool.name);
    assert.ok(firstTool.source);
    assert.ok(typeof firstTool.parameters === 'object');
  });

  await t.test('PUT /api/agents/skills/:id successfully updates custom skill', async () => {
    const payload = {
      name: '测试独占面板技能',
      category: 'genre',
      description: '测试技能描述',
      markdown: '---\nname: 测试独占面板技能\ndescription: 测试\n---\n# 规约内容\n1. 第一条',
      handlerCode: 'export async function execute() { return true; }'
    };

    const putRes = await fetch(`${baseUrl}/api/agents/skills/${testSkillId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(putRes.status, 200);
    const putData = await putRes.json();
    assert.equal(putData.success, true);
    assert.equal(putData.skill.id, testSkillId);

    // Read back
    const getRes = await fetch(`${baseUrl}/api/agents/skills/${testSkillId}`);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.success, true);
    assert.equal(getData.skill.name, '测试独占面板技能');
    assert.ok(getData.skill.markdown.includes('第一条'));
    assert.ok(getData.skill.handlerCode.includes('export async function execute'));
  });

  await t.test('GET /api/agents/skills/:id returns full skill markdown and handler code', async () => {
    const res = await fetch(`${baseUrl}/api/agents/skills/${testSkillId}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.skill.id, testSkillId);
    assert.ok(typeof data.skill.markdown === 'string');
  });
});
