process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import mediaRouter from '../src/routes/media.js';
import { perceptionEngine, perceptionStorage } from '../src/services/perception/index.js';

describe('Media Perception HTTP & SSE API Endpoints', () => {
  let serverInstance = null;
  let baseUrl = '';
  const tempTestDir = path.join(os.tmpdir(), 'meocoxflow_temp_http_media_' + Date.now());
  const tempStorageDir = path.join(os.tmpdir(), 'meocoxflow_temp_http_storage_' + Date.now());
  const originalStorageRoot = perceptionStorage.storageRoot;
  let sampleFilePath;

  before(async () => {
    await fs.mkdir(tempTestDir, { recursive: true });
    await fs.mkdir(tempStorageDir, { recursive: true });
    perceptionStorage.storageRoot = tempStorageDir;

    // Create a dummy artifact directory inside isolated test storage for level: 'l1'
    const dummyArtDir = path.join(tempStorageDir, 'mfp_dummy_test', 'artifacts');
    await fs.mkdir(dummyArtDir, { recursive: true });
    await fs.writeFile(path.join(dummyArtDir, 'thumb.jpg'), 'dummy_image_data');

    sampleFilePath = path.join(tempTestDir, 'sample_graphic.png');
    await fs.writeFile(sampleFilePath, Buffer.from('TEST_IMAGE_BYTES_FOR_HTTP_API_TESTING'));

    const app = express();
    app.use(express.json());
    app.use('/api/media', mediaRouter);

    await new Promise(resolve => {
      serverInstance = app.listen(0, () => {
        const port = serverInstance.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Wait for any active background jobs to finish processing in the temporary storage
    for (let i = 0; i < 50; i++) {
      if (perceptionEngine.queue.activeWorkers === 0 && perceptionEngine.queue.queue.length === 0) {
        break;
      }
      await new Promise(r => setTimeout(r, 50));
    }

    if (serverInstance) {
      await new Promise(resolve => serverInstance.close(resolve));
    }
    try {
      await fs.rm(tempTestDir, { recursive: true, force: true });
      await fs.rm(tempStorageDir, { recursive: true, force: true });
    } catch {}
    perceptionStorage.storageRoot = originalStorageRoot;
  });

  it('should query media status via GET /api/media/status', async () => {
    const mediaId = await perceptionEngine.getMediaId(sampleFilePath, 'image');
    const res = await fetch(`${baseUrl}/api/media/status?mediaIds=${mediaId}`);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.statuses[mediaId]);
    assert.equal(data.statuses[mediaId].status, 'unprocessed');
  });

  it('should enqueue files via POST /api/media/analyze', async () => {
    const res = await fetch(`${baseUrl}/api/media/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePaths: [sampleFilePath],
        mediaType: 'image'
      })
    });
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.total, 1);
    assert.ok(data.items.length === 1);

    const mediaId = data.items[0].mediaId;

    // Wait for analysis to finish
    let status = 'processing';
    for (let i = 0; i < 150; i++) {
      await new Promise(r => setTimeout(r, 100));
      const statusRes = await fetch(`${baseUrl}/api/media/status?mediaIds=${mediaId}`);
      const statusData = await statusRes.json();
      status = statusData.statuses?.[mediaId]?.status;
      if (status === 'completed') break;
    }
    assert.equal(status, 'completed');
  });

  it('should fetch perception details via GET /api/media/perception/:mediaId', async () => {
    const mediaId = await perceptionEngine.getMediaId(sampleFilePath, 'image');
    const res = await fetch(`${baseUrl}/api/media/perception/${mediaId}`);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.perception.mediaId, mediaId);
    assert.equal(data.perception.mediaType, 'image');
  });

  it('should return storage stats via GET /api/media/storage/stats', async () => {
    const res = await fetch(`${baseUrl}/api/media/storage/stats`);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.stats);
    assert.equal(typeof data.stats.totalBytes, 'number');
    assert.equal(typeof data.stats.totalFormatted, 'string');
    assert.ok(data.stats.mediaCount >= 1);
  });

  it('should clean artifacts safely via POST /api/media/storage/clean', async () => {
    const res = await fetch(`${baseUrl}/api/media/storage/clean`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'artifacts' })
    });
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.result);
    assert.equal(typeof data.result.freedBytes, 'number');
    assert.ok(data.stats);
  });

  it('should enforce LRU cache via POST /api/media/storage/lru', async () => {
    const res = await fetch(`${baseUrl}/api/media/storage/lru`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxSizeBytes: 1024 * 1024 * 1024 })
    });
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.result);
    assert.ok(data.stats);
  });

  it('should support natural language semantic search via GET /api/media/search', async () => {
    const res = await fetch(`${baseUrl}/api/media/search?q=sample`);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.query, 'sample');
    assert.ok(Array.isArray(data.results));
  });

  it('should rebuild search index via POST /api/media/search/reindex', async () => {
    const res = await fetch(`${baseUrl}/api/media/search/reindex`, {
      method: 'POST'
    });
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(typeof data.total === 'number');
  });

  it('should support opening storage directory via POST /api/media/storage/open-folder', async () => {
    const res = await fetch(`${baseUrl}/api/media/storage/open-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-suite': 'true' },
      body: JSON.stringify({ level: 'l1' })
    });
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.openedPath);
  });
});
