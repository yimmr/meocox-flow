import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MCPHub } from '../src/runtime/mcpHub.js';
import { ensureCustomToolsDir, loadCustomToolsFromDisk } from '../src/runtime/toolLoader.js';
import { config } from '../src/config.js';

describe('Custom Tool Loader & Discovery', () => {
  let tempToolsDir;
  let originalToolsDir;

  before(async () => {
    tempToolsDir = path.join(os.tmpdir(), `meocox-tools-test-${Date.now()}`);
    await fs.mkdir(tempToolsDir, { recursive: true });
    originalToolsDir = config.paths.userToolsDir;
    config.paths.userToolsDir = tempToolsDir;
  });

  after(async () => {
    config.paths.userToolsDir = originalToolsDir;
    try {
      await fs.rm(tempToolsDir, { recursive: true, force: true });
    } catch (_) {}
  });

  test('should create user tools directory and default README.md', async () => {
    const dir = await ensureCustomToolsDir();
    assert.strictEqual(dir, tempToolsDir);
    assert.ok(fsSync.existsSync(path.join(tempToolsDir, 'README.md')));
  });

  test('should load valid custom tool from json file', async () => {
    const hub = new MCPHub();
    const toolJsonPath = path.join(tempToolsDir, 'custom_filter.json');
    const toolDef = {
      name: 'custom_filter',
      description: 'A test custom filter tool',
      parameters: {
        type: 'object',
        properties: {
          intensity: { type: 'number', description: 'Filter intensity' }
        },
        required: ['intensity']
      }
    };
    await fs.writeFile(toolJsonPath, JSON.stringify(toolDef), 'utf-8');

    await loadCustomToolsFromDisk(hub);

    const detailedTools = hub.getDetailedTools();
    const loaded = detailedTools.find(t => t.name === 'custom_filter');
    assert.ok(loaded, 'custom_filter tool should be loaded');
    assert.strictEqual(loaded.custom, true);
    assert.strictEqual(loaded.description, 'A test custom filter tool');
    assert.strictEqual(loaded.filePath, toolJsonPath);
    assert.ok(loaded.parameters.properties.intensity);
  });

  test('should support removing custom tool from hub', async () => {
    const hub = new MCPHub();
    hub.registerLocalTool({
      name: 'temp_tool',
      description: 'temp',
      custom: true
    });
    assert.ok(hub.hasTool('temp_tool'));
    hub.removeLocalTool('temp_tool');
    assert.ok(!hub.hasTool('temp_tool'));
  });
});
