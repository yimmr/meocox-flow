import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { computeFastMediaFingerprint, getAssetCache, saveAssetCache } from '../src/services/cache.js';

describe('Global Asset Cache & Fingerprint', () => {
  const testFile = path.resolve('./tests/dummy_video.bin');

  before(async () => {
    // Create a dummy binary file (> 128KB to test head/mid/tail sampling)
    await fs.mkdir(path.dirname(testFile), { recursive: true });
    const buf = Buffer.alloc(200 * 1024, 0x42);
    await fs.writeFile(testFile, buf);
  });

  after(async () => {
    try {
      await fs.unlink(testFile);
    } catch {}
  });

  it('should compute deterministic fingerprint for the same file', async () => {
    const fp1 = await computeFastMediaFingerprint(testFile);
    const fp2 = await computeFastMediaFingerprint(testFile);
    assert.ok(fp1.startsWith('mfp_'));
    assert.equal(fp1, fp2);
  });

  it('should save and retrieve asset cache by fingerprint', async () => {
    const fp = 'mfp_test_sample_123';
    const testData = {
      meta: { durationSec: 120, resolution: '1920x1080' },
      scenes: [{ startSec: 0, endSec: 4 }],
      visualTags: ['Boss战', '黑风大王']
    };

    await saveAssetCache(fp, testData);
    const cached = await getAssetCache(fp);

    assert.ok(cached);
    assert.equal(cached.meta.durationSec, 120);
    assert.deepEqual(cached.visualTags, ['Boss战', '黑风大王']);
  });
});
