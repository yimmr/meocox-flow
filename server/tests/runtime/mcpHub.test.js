import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MCPHub } from '../../src/runtime/mcpHub.js';

describe('MCPHub via Official SDK', () => {
  it('should initialize with empty server pool', () => {
    const hub = new MCPHub();
    assert.deepEqual(hub.getLoadedServers(), []);
    assert.deepEqual(hub.getAllTools(), []);
  });

  it('should register local in-memory tools directly into pool', () => {
    const hub = new MCPHub();
    hub.registerLocalTool({
      name: 'probe_media',
      description: 'Probe media file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
      handler: async ({ path }) => ({ duration: 12.5, path })
    });

    assert.equal(hub.hasTool('probe_media'), true);
    const schemas = hub.getToolsSchema();
    assert.equal(schemas.length, 1);
    assert.equal(schemas[0].function.name, 'probe_media');
  });

  it('should execute local tool through hub', async () => {
    const hub = new MCPHub();
    hub.registerLocalTool({
      name: 'probe_media',
      description: 'Probe media file',
      handler: async ({ path }) => ({ duration: 12.5, path })
    });

    const res = await hub.callTool('probe_media', { path: 'a.mp4' });
    assert.deepEqual(res, { duration: 12.5, path: 'a.mp4' });
  });
});
