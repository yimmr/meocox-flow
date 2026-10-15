import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import settingsRouter from '../src/routes/settings.js';
import { testConnection } from '../src/services/ai.js';

function createTestServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/settings', settingsRouter);
  return app;
}

test('Provider Settings & Connectivity Test Endpoints (/api/settings/providers/*)', async (t) => {
  const app = createTestServer();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Mock upstream target (OpenAI & Anthropic style)
  let mockReceivedHeaders = null;
  let mockReceivedBody = null;
  const mockUpstream = http.createServer((req, res) => {
    mockReceivedHeaders = req.headers;
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        mockReceivedBody = JSON.parse(body || '{}');
      } catch {
        mockReceivedBody = null;
      }

      if (req.url.includes('/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: [
            { id: 'mock-model-1', name: 'Mock Model 1' },
            { id: 'mock-model-2', name: 'Mock Model 2' }
          ]
        }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg_123',
        choices: [{ message: { content: 'pong' } }]
      }));
    });
  });

  await new Promise((resolve) => mockUpstream.listen(0, resolve));
  const upstreamPort = mockUpstream.address().port;
  const upstreamUrl = `http://127.0.0.1:${upstreamPort}`;

  t.after(() => {
    server.close();
    mockUpstream.close();
  });

  await t.test('POST /api/settings/providers/test successfully pings standard endpoint', async () => {
    const res = await fetch(`${baseUrl}/api/settings/providers/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: upstreamUrl,
        apiKey: 'test-token',
        model: 'mock-model-1'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(typeof data.latency === 'number');
    assert.equal(data.model, 'mock-model-1');
    assert.equal(mockReceivedHeaders['authorization'], 'Bearer test-token');
  });

  await t.test('POST /api/settings/providers/detect-models detects models list from upstream', async () => {
    const res = await fetch(`${baseUrl}/api/settings/providers/detect-models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: upstreamUrl,
        apiKey: 'test-token'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.models.length, 2);
    assert.equal(data.models[0].id, 'mock-model-1');
  });

  await t.test('testConnection handles anthropic_messages protocol with x-api-key', async () => {
    const result = await testConnection({
      baseUrl: upstreamUrl,
      apiKey: 'sk-ant-test',
      model: 'claude-3-7-sonnet',
      apiMode: 'anthropic_messages'
    });

    assert.equal(result.success, true);
    assert.equal(mockReceivedHeaders['x-api-key'], 'sk-ant-test');
    assert.equal(mockReceivedHeaders['anthropic-version'], '2023-06-01');
    assert.equal(mockReceivedBody?.model, 'claude-3-7-sonnet');
  });
});
