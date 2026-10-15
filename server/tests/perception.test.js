process.env.NODE_ENV = 'test';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { perceptionEngine, computeMediaFingerprint, perceptionStorage, detectMediaType } from '../src/services/perception/index.js';

describe('Media Perception Engine & CAS Infrastructure', () => {
  const tempTestDir = path.join(os.tmpdir(), 'meocoxflow_temp_test_media_' + Date.now());
  const tempStorageDir = path.join(os.tmpdir(), 'meocoxflow_temp_test_perception_storage_' + Date.now());
  const originalStorageRoot = perceptionStorage.storageRoot;
  let sampleVideoPath;
  let sampleImagePath;
  let sampleAudioPath;

  before(async () => {
    await fs.mkdir(tempTestDir, { recursive: true });
    await fs.mkdir(tempStorageDir, { recursive: true });
    perceptionStorage.storageRoot = tempStorageDir;

    // 1. Create a dummy test image
    sampleImagePath = path.join(tempTestDir, 'test_image.png');
    await fs.writeFile(sampleImagePath, Buffer.from('FAKE_PNG_HEADER_DATA_1234567890'));

    // 2. Create a dummy test audio
    sampleAudioPath = path.join(tempTestDir, 'test_audio.mp3');
    await fs.writeFile(sampleAudioPath, Buffer.from('FAKE_MP3_HEADER_DATA_1234567890'));

    // 3. Create a dummy test video
    sampleVideoPath = path.join(tempTestDir, 'test_video.mp4');
    await fs.writeFile(sampleVideoPath, Buffer.from('FAKE_MP4_HEADER_DATA_1234567890_WITH_SOME_PADDING'.repeat(100)));
  });

  after(async () => {
    // Wait for any active background jobs to finish processing in the temporary storage
    for (let i = 0; i < 50; i++) {
      if (perceptionEngine.queue.activeWorkers === 0 && perceptionEngine.queue.queue.length === 0) {
        break;
      }
      await new Promise(r => setTimeout(r, 50));
    }

    try {
      await fs.rm(tempTestDir, { recursive: true, force: true });
      await fs.rm(tempStorageDir, { recursive: true, force: true });
    } catch {}
    perceptionStorage.storageRoot = originalStorageRoot;
  });

  it('should detect media types accurately', () => {
    assert.equal(detectMediaType('clip.mp4'), 'video');
    assert.equal(detectMediaType('photo.png'), 'image');
    assert.equal(detectMediaType('song.mp3'), 'audio');
    assert.equal(detectMediaType('doc.txt'), 'other');
  });

  it('should compute deterministic media fingerprint for files', async () => {
    const fp1 = await computeMediaFingerprint(sampleImagePath, 'image');
    const fp2 = await computeMediaFingerprint(sampleImagePath, 'image');
    assert.ok(fp1.startsWith('mfp_'), 'fingerprint should start with mfp_');
    assert.equal(fp1, fp2, 'fingerprint for the exact same file must match');
  });

  it('should analyze image asset and store in CAS storage', async () => {
    const mediaId = await perceptionEngine.getMediaId(sampleImagePath, 'image');
    const statusBefore = await perceptionEngine.getStatus(mediaId);
    assert.equal(statusBefore.status, 'unprocessed');

    const result = await perceptionEngine.ensureAnalyzed(sampleImagePath, { mediaType: 'image' });
    assert.equal(result.mediaType, 'image');
    assert.equal(result.status, 'completed');
    assert.ok(result.image.tags.includes('PNG'));

    // Verify storage persistence
    const hasStored = await perceptionStorage.hasPerception(mediaId);
    assert.equal(hasStored, true);

    const statusAfter = await perceptionEngine.getStatus(mediaId);
    assert.equal(statusAfter.status, 'completed');
    assert.equal(statusAfter.progress, 100);
  });

  it('should support batch non-blocking enqueue and deduplication', async () => {
    const batchRes = await perceptionEngine.enqueueBatch([sampleAudioPath, sampleImagePath], { priority: 'normal' });
    assert.equal(batchRes.total, 2);
    // sampleImagePath was already analyzed in previous test, so cached should be 1
    assert.equal(batchRes.cached, 1);
    assert.equal(batchRes.queued, 1);

    // Enqueueing audio again should deduplicate
    const audioMediaId = await perceptionEngine.getMediaId(sampleAudioPath, 'audio');
    const status = await perceptionEngine.getStatus(audioMediaId);
    assert.ok(['queued', 'processing', 'completed'].includes(status.status));
  });
});
