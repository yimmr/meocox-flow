import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import express from 'express';
import { storage } from '../src/storage/index.js';
import proxyRouter from '../src/routes/proxy.js';

describe('Web Proxy & Media Sniffer Service', () => {
  let serverInstance = null;
  let baseUrl = '';

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/proxy', proxyRouter);
    await storage.init();
    await new Promise(resolve => {
      serverInstance = app.listen(0, () => {
        const port = serverInstance.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (serverInstance) {
      await new Promise(resolve => serverInstance.close(resolve));
    }
  });

  it('should query stock database for CC0 video and photo items', async () => {
    // Direct test of stock database
    const res = await fetch(`${baseUrl}/api/proxy/stock?q=海浪`);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.total >= 1);
    assert.ok(data.items.some(i => i.title.includes('海浪') || i.tags.includes('海浪')));
  });

  it('should save media to project asset directory and register asset', async () => {
    const testProjId = 'proj_test_proxy_' + Date.now();
    const tempAssetDir = path.join(os.tmpdir(), 'meocoxflow_temp_test_assets_' + Date.now());
    await fs.mkdir(tempAssetDir, { recursive: true });

    try {
      await storage.saveProject({
        id: testProjId,
        title: '测试网络代理素材项目',
        assetDir: tempAssetDir
      });

      // Test stock item download
      const mediaUrl = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80';
      const saveRes = await fetch(`${baseUrl}/api/proxy/save-asset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: testProjId,
          mediaUrl,
          filename: 'test_wave',
          mediaType: 'image'
        })
      });

      const saveData = await saveRes.json();
      assert.equal(saveData.success, true);
      assert.ok(fsSync.existsSync(saveData.savedPath));

      // Verify asset was added to project asset pool
      const assets = await storage.getAssets(testProjId);
      assert.ok(assets.length >= 1);
      assert.equal(assets[0].localPath, saveData.savedPath);

    } finally {
      // Cleanup
      try {
        await storage.deleteProject(testProjId);
        await fs.rm(tempAssetDir, { recursive: true, force: true });
      } catch (e) {}
    }
  });
});
