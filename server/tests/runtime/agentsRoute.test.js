import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import agentsRouter from '../../src/routes/agents.js';
import { defaultAgentSystem } from '../../src/runtime/agentLoader.js';
import { defaultMCPHub } from '../../src/runtime/mcpHub.js';

describe('Agents API Router', () => {
  it('should return loaded agents, skills, and tools via router', async () => {
    defaultAgentSystem.registerAgentText('test_agent', `---
id: test_agent
name: 测试员工
skills: []
tools: [*]
---
测试用人设`);

    const app = express();
    app.use('/api/agents', agentsRouter);

    const server = app.listen(0);
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/agents`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.agents.some(a => a.id === 'test_agent'));
    } finally {
      server.close();
    }
  });
});
