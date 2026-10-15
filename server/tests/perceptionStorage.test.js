import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { PerceptionStorage, formatBytes } from '../src/services/perception/storage.js';

describe('PerceptionStorage & LRU Cache Management', () => {
  let testStorageRoot;
  let storage;

  beforeEach(async () => {
    // 用系统临时目录，避免测试数据写进代码仓库
    testStorageRoot = path.join(os.tmpdir(), `meocoxflow_temp_test_storage_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    storage = new PerceptionStorage(testStorageRoot);
    await fs.mkdir(testStorageRoot, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testStorageRoot, { recursive: true, force: true });
    } catch {}
  });

  test('should format bytes properly into human-readable strings', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(1024), '1.0 KB');
    assert.equal(formatBytes(1048576 * 5.5), '5.5 MB');
    assert.equal(formatBytes(1073741824 * 2.1), '2.1 GB');
  });

  test('should calculate accurate storage stats for metadata and artifacts', async () => {
    const mediaId = 'mfp_test_12345';
    const fakeOrigPath = path.join(testStorageRoot, 'real_video.mp4');
    await fs.writeFile(fakeOrigPath, 'video content dummy');

    await storage.saveMeta(mediaId, {
      mediaId,
      mediaType: 'video',
      filename: 'real_video.mp4',
      originalPath: fakeOrigPath,
      fileInfo: { size: 1000 }
    });

    await storage.savePerception(mediaId, {
      mediaId,
      mediaType: 'video',
      status: 'completed',
      video: { summary: 'test video' }
    });

    // Save dummy artifact
    const dummyImg = Buffer.from('fake image binary content 1234567890');
    await storage.saveArtifact(mediaId, 'keyframe_1.jpg', dummyImg);
    await storage.saveArtifact(mediaId, 'keyframe_2.jpg', dummyImg);

    const stats = await storage.getStorageStats();
    assert.equal(stats.mediaCount, 1);
    assert.equal(stats.artifactFilesCount, 2);
    assert.ok(stats.artifactsBytes > 0);
    assert.ok(stats.metadataBytes > 0);
    assert.equal(stats.totalBytes, stats.artifactsBytes + stats.metadataBytes);
    assert.equal(stats.orphanedCount, 0);
    assert.equal(stats.byType.video, 1);
  });

  test('should perform L1 cleanArtifacts: deletes images but preserves perception.json and meta.json', async () => {
    const mediaId = 'mfp_test_slimming';
    const fakeOrigPath = path.join(testStorageRoot, 'test.mp4');
    await fs.writeFile(fakeOrigPath, 'orig content');

    await storage.saveMeta(mediaId, {
      mediaId,
      mediaType: 'video',
      filename: 'test.mp4',
      originalPath: fakeOrigPath
    });

    await storage.savePerception(mediaId, {
      mediaId,
      video: { summary: 'keep this analysis!' }
    });

    await storage.saveArtifact(mediaId, 'kf_1.jpg', Buffer.alloc(1024, 'a'));
    await storage.saveArtifact(mediaId, 'kf_2.jpg', Buffer.alloc(2048, 'b'));

    const beforeStats = await storage.getStorageStats();
    assert.equal(beforeStats.artifactFilesCount, 2);

    // Clean artifacts
    const cleanResult = await storage.cleanArtifacts();
    assert.equal(cleanResult.success, true);
    assert.equal(cleanResult.deletedFilesCount, 2);
    assert.equal(cleanResult.freedBytes, 3072);

    // Verify artifacts are gone
    const afterStats = await storage.getStorageStats();
    assert.equal(afterStats.artifactFilesCount, 0);
    assert.equal(afterStats.artifactsBytes, 0);

    // Verify metadata and perception are completely intact!
    assert.equal(await storage.hasPerception(mediaId), true);
    assert.equal(await storage.hasMeta(mediaId), true);
    const p = await storage.readPerception(mediaId);
    assert.equal(p.video.summary, 'keep this analysis!');
  });

  test('should perform L2 cleanOrphaned: remove CAS directory if source file no longer exists', async () => {
    const mediaId = 'mfp_orphaned_entry';
    const nonExistentPath = path.join(testStorageRoot, 'deleted_by_user.mp4');

    await storage.saveMeta(mediaId, {
      mediaId,
      mediaType: 'video',
      filename: 'deleted_by_user.mp4',
      originalPath: nonExistentPath
    });

    await storage.savePerception(mediaId, { mediaId, status: 'completed' });
    await storage.saveArtifact(mediaId, 'thumb.jpg', Buffer.from('abc'));

    const statsBefore = await storage.getStorageStats();
    assert.equal(statsBefore.orphanedCount, 1);
    assert.ok(statsBefore.orphanedMediaIds.includes(mediaId));

    // Clean orphaned
    const cleanRes = await storage.cleanOrphaned();
    assert.equal(cleanRes.success, true);
    assert.equal(cleanRes.deletedDirsCount, 1);

    const statsAfter = await storage.getStorageStats();
    assert.equal(statsAfter.mediaCount, 0);
    assert.equal(statsAfter.orphanedCount, 0);
  });

  test('should enforce LRU limits by evicting oldest artifacts', async () => {
    const idOld = 'mfp_old';
    const idNew = 'mfp_new';

    await storage.saveMeta(idOld, { mediaId: idOld, originalPath: 'dummy' });
    await storage.saveArtifact(idOld, 'old.jpg', Buffer.alloc(5000, 'x'));

    await storage.saveMeta(idNew, { mediaId: idNew, originalPath: 'dummy' });
    await storage.saveArtifact(idNew, 'new.jpg', Buffer.alloc(5000, 'y'));

    // Set old item to accessed in the past
    const oldMeta = await storage.readMeta(idOld);
    oldMeta.lastAccessedAt = Date.now() - 100000;
    await fs.writeFile(path.join(storage.getMediaDir(idOld), 'meta.json'), JSON.stringify(oldMeta));

    const stats = await storage.getStorageStats();
    assert.ok(stats.totalBytes >= 10000);

    // Limit to 6000 bytes
    const lruRes = await storage.enforceLru(6000);
    assert.ok(lruRes.evictedCount >= 1);
    assert.ok(lruRes.freedBytes >= 5000);

    // Old artifact should be cleaned, new artifact preserved
    assert.equal(fsSync.existsSync(storage.getArtifactPath(idOld, 'old.jpg')), false);
    assert.equal(fsSync.existsSync(storage.getArtifactPath(idNew, 'new.jpg')), true);
  });
});
