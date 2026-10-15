import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../../src/config.js';
import { MCPHub } from '../../src/runtime/mcpHub.js';
import { mcpTestSkip } from '../helpers/mcpTestGate.js';

// 需要真实 google-flow MCP，会拉起浏览器窗口，默认跳过（见 helpers/mcpTestGate.js）
describe('Google Flow MCP Integration Test', { skip: mcpTestSkip }, () => {
  const hub = new MCPHub();

  after(async () => {
    await hub.disconnectAll();
  });

  it('should connect to local google-flow-mcp server and discover 22 tools', async () => {
    await hub.loadConfigFile(config.paths.defaultMcpConfig);

    const loadedServers = hub.getLoadedServers();
    assert.ok(loadedServers.includes('google-flow'), 'google-flow should be connected');

    const tools = hub.getAllTools().filter(t => t.source === 'mcp:google-flow');
    assert.equal(tools.length, 22, `Expected 22 google-flow tools, got ${tools.length}`);

    // Verify key workflow tools
    const toolNames = tools.map(t => t.name);
    assert.ok(toolNames.includes('google-flow__project_create'));
    assert.ok(toolNames.includes('google-flow__flow_start_login'));
    assert.ok(toolNames.includes('google-flow__flow_prepare_generation'));
    assert.ok(toolNames.includes('google-flow__flow_submit_generation'));
    assert.ok(toolNames.includes('google-flow__flow_download_media'));
    assert.ok(toolNames.includes('google-flow__media_validate_local'));
  });

  it('should support dynamic toggle (disconnect and reconnect anytime)', async () => {
    // 1. Disconnect google-flow
    await hub.disconnectMCPServer('google-flow');
    assert.ok(!hub.getLoadedServers().includes('google-flow'), 'google-flow should be removed from active pool');
    const remainingTools = hub.getAllTools().filter(t => t.source === 'mcp:google-flow');
    assert.equal(remainingTools.length, 0, 'all tools belonging to google-flow should be purged');

    // 2. Reconnect google-flow dynamically
    await hub.loadConfigFile(config.paths.defaultMcpConfig);
    assert.ok(hub.getLoadedServers().includes('google-flow'), 'google-flow should reconnect successfully');
    const restoredTools = hub.getAllTools().filter(t => t.source === 'mcp:google-flow');
    assert.equal(restoredTools.length, 22, 'tools should be restored upon reconnect');
  });
});
