import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  getModelLibrary,
  getEnabledInstalledModels,
  toggleModelEnabled,
  addCustomModelToLibrary,
  importLocalModel,
  deleteModelFromLibrary,
  getLibraryModelById
} from '../src/services/perception/localEngine/modelLibrary.js';
import { getModelsBaseDir } from '../src/services/perception/localEngine/paths.js';
import mediaRouter from '../src/routes/media.js';

describe('Model Library & Dynamic Enabled/Disabled Lifecycle', () => {
  let server;
  let baseUrl;
  const tempFilesToClean = [];

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/media', mediaRouter);
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    for (const f of tempFilesToClean) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('should list library models with installation and enabled status', () => {
    const library = getModelLibrary();
    assert.ok(Array.isArray(library));
    assert.ok(library.length >= 3, 'Expected at least 3 curated presets');

    const p4b = library.find(m => m.id === 'qwen3-vl-4b');
    assert.ok(p4b);
    assert.equal(p4b.type, 'preset');
    assert.equal(typeof p4b.enabled, 'boolean');
    assert.equal(typeof p4b.isInstalled, 'boolean');
  });

  it('should import a custom GGUF model and auto-enable it in the library', () => {
    const testModelFile = path.join(getModelsBaseDir(), `test_unit_${Date.now()}.gguf`);
    fs.writeFileSync(testModelFile, Buffer.alloc(1500000)); // 1.5MB
    tempFilesToClean.push(testModelFile);

    const importRes = importLocalModel({
      name: '单元测试模型 A',
      filePath: testModelFile,
      description: '自动化验证专用模型'
    });

    assert.ok(importRes.model);
    assert.equal(importRes.model.name, '单元测试模型 A');

    const modelInLib = getLibraryModelById(importRes.model.id);
    assert.ok(modelInLib);
    assert.equal(modelInLib.isInstalled, true);
    assert.equal(modelInLib.enabled, true);

    // Enabled installed list must include it
    const enabledModels = getEnabledInstalledModels();
    assert.ok(enabledModels.some(m => m.id === importRes.model.id));

    // Toggle to disabled
    toggleModelEnabled(importRes.model.id, false);
    const afterDisable = getEnabledInstalledModels();
    assert.ok(!afterDisable.some(m => m.id === importRes.model.id), 'Disabled model must NOT appear in enabled list');

    // Toggle back to enabled
    toggleModelEnabled(importRes.model.id, true);
    const afterReEnable = getEnabledInstalledModels();
    assert.ok(afterReEnable.some(m => m.id === importRes.model.id), 'Re-enabled model must appear in enabled list');

    // Clean up
    deleteModelFromLibrary(importRes.model.id);
    assert.equal(getLibraryModelById(importRes.model.id), null);
  });

  it('should support full HTTP API for library query, toggle, import, and delete', async () => {
    // 1. Query library
    const libRes = await fetch(`${baseUrl}/api/media/local-engine/library`);
    assert.equal(libRes.status, 200);
    const libData = await libRes.json();
    assert.ok(libData.success);
    assert.ok(Array.isArray(libData.library));

    // 2. Import via HTTP
    const dummyGguf = path.join(getModelsBaseDir(), `http_test_${Date.now()}.gguf`);
    fs.writeFileSync(dummyGguf, Buffer.alloc(1200000));
    tempFilesToClean.push(dummyGguf);

    const importHttp = await fetch(`${baseUrl}/api/media/local-engine/library/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'HTTP导入模型',
        filePath: dummyGguf
      })
    });
    assert.equal(importHttp.status, 200);
    const importJson = await importHttp.json();
    assert.ok(importJson.success);
    const newId = importJson.model.id;

    // 3. Toggle via HTTP
    const toggleHttp = await fetch(`${baseUrl}/api/media/local-engine/library/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: newId,
        enabled: false
      })
    });
    assert.equal(toggleHttp.status, 200);
    const toggleJson = await toggleHttp.json();
    assert.equal(toggleJson.enabled, false);

    // 4. Delete via HTTP
    const deleteHttp = await fetch(`${baseUrl}/api/media/local-engine/library/${newId}`, {
      method: 'DELETE'
    });
    assert.equal(deleteHttp.status, 200);
    const deleteJson = await deleteHttp.json();
    assert.ok(deleteJson.success);
  });
});
