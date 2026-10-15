import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { 
  localEngine, 
  modelDownloader, 
  findLlamaServerBinary, 
  listAllModelPresets,
  inspectModelPreset 
} from '../src/services/perception/localEngine/index.js';
import mediaRouter from '../src/routes/media.js';

describe('Embedded Local Inference Engine (Scheme A - llama-server)', () => {
  it('should locate llama-server binary in WinGet or system paths', () => {
    const binPath = findLlamaServerBinary();
    assert.ok(binPath, 'Expected llama-server.exe binary path to be resolved');
    assert.ok(binPath.includes('llama-server.exe'), 'Binary filename should be llama-server.exe');
  });

  it('should list all standard Qwen3-VL presets with metadata', () => {
    const presets = listAllModelPresets();
    assert.ok(Array.isArray(presets));
    assert.ok(presets.length >= 3, 'Expected at least 3 presets (2B, 4B, 8B)');

    const p4b = inspectModelPreset('qwen3-vl-4b');
    assert.ok(p4b);
    assert.equal(p4b.id, 'qwen3-vl-4b');
    assert.ok(p4b.hfRepo.includes('Qwen3-VL-4B'));
    assert.ok(p4b.modelFile.endsWith('.gguf'));
    assert.ok(p4b.mmprojFile.endsWith('.gguf'));
    assert.equal(typeof p4b.isReady, 'boolean');
  });

  it('should query GPU hardware info accurately', async () => {
    const gpuInfo = await localEngine.refreshGpuInfo();
    assert.ok(gpuInfo);
    assert.equal(typeof gpuInfo.detected, 'boolean');
    assert.equal(typeof gpuInfo.name, 'string');
    if (gpuInfo.detected) {
      assert.ok(gpuInfo.totalMiB > 0);
      assert.ok(gpuInfo.name.includes('RTX') || gpuInfo.name.includes('GeForce') || gpuInfo.name.includes('Vulkan'));
    }
  });

  it('should return comprehensive engine status', () => {
    const status = localEngine.getStatus();
    assert.ok(status.runnerInstalled);
    assert.ok(status.runnerPath);
    assert.equal(typeof status.status, 'string');
    assert.equal(typeof status.port, 'number');
    assert.ok(Array.isArray(status.models));
    assert.ok(status.gpu);
    assert.ok(status.download);
  });

  it('should reject starting with an un-downloaded model gracefully', async () => {
    // Model files are not yet on disk, so starting must throw an informative error
    await assert.rejects(
      async () => {
        await localEngine.start({ modelId: 'qwen3-vl-8b' });
      },
      (err) => {
        assert.ok(err.message.includes('未就绪') || err.message.includes('下载'));
        return true;
      }
    );
    assert.equal(localEngine.status, 'stopped');
  });

  it('should track downloader status and allow cancel when idle', () => {
    const dlStatus = modelDownloader.getStatus();
    assert.equal(typeof dlStatus.active, 'boolean');
    assert.equal(typeof dlStatus.percent, 'number');

    const cancelled = modelDownloader.cancel();
    assert.equal(cancelled, false, 'Cancel on idle task should return false');
  });
});

describe('Local Engine HTTP API Endpoints', () => {
  let serverInstance = null;
  let baseUrl = '';

  before(async () => {
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
    if (serverInstance) {
      await new Promise(resolve => serverInstance.close(resolve));
    }
  });

  it('GET /api/media/local-engine/status returns full system readiness', async () => {
    const res = await fetch(`${baseUrl}/api/media/local-engine/status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.runnerInstalled, true);
    assert.ok(Array.isArray(body.models));
    assert.ok(body.gpu);
  });

  it('GET /api/media/local-engine/download-progress returns download state', async () => {
    const res = await fetch(`${baseUrl}/api/media/local-engine/download-progress`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.progress);
    assert.equal(typeof body.progress.percent, 'number');
  });

  it('POST /api/media/local-engine/cancel-download handles cancellation', async () => {
    const res = await fetch(`${baseUrl}/api/media/local-engine/cancel-download`, {
      method: 'POST'
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
  });

  it('POST /api/media/local-engine/start rejects unready model with 500 error message', async () => {
    const res = await fetch(`${baseUrl}/api/media/local-engine/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: 'qwen3-vl-8b' })
    });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.ok(body.error.includes('未就绪') || body.error.includes('下载') || body.error.includes('安装'));
  });
});
