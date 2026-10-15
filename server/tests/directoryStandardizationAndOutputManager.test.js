import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';

import { config } from '../src/config.js';
import { storage } from '../src/storage/index.js';
import {
  sanitizePathSegment,
  sanitizeFileName,
  resolveArtifactOutputDir,
  saveArtifactOutput,
  saveAssetCache
} from '../src/services/outputManager.js';

test('Directory Standardization & Output Manager Suite', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meocox-test-dir-'));
  const testSettingsFile = path.join(tmpDir, 'settings.json');

  t.after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  await t.test('1. sanitizePathSegment & sanitizeFileName should clean illegal characters', () => {
    assert.strictEqual(sanitizePathSegment('Hello: World*?'), 'Hello_ World');
    assert.strictEqual(sanitizePathSegment('../../../dangerous'), 'dangerous');
    assert.strictEqual(sanitizeFileName('my_video?.mp4'), 'my_video_.mp4');
    assert.strictEqual(sanitizePathSegment('', 'fallback'), 'fallback');
  });

  await t.test('2. storage should default to standard Projects directory and support customOutputDir', async () => {
    const settings = await storage.getSystemSettings(testSettingsFile);
    assert.ok(settings.defaultProjectsRoot);
    assert.strictEqual(settings.customOutputDir, '');

    // Save custom output dir
    const customOut = path.join(tmpDir, 'custom_outputs');
    await fs.mkdir(customOut, { recursive: true });

    await storage.saveSystemSettings({ customOutputDir: customOut }, testSettingsFile);
    const updated = await storage.getSystemSettings(testSettingsFile);
    assert.strictEqual(path.resolve(updated.customOutputDir), path.resolve(customOut));
  });

  await t.test('3. Project state standardization: storyboard, pipeline & assets should be stored under state/', async (subT) => {
    const testProjId = `test_proj_${Date.now()}`;
    const projDir = path.join(tmpDir, testProjId);
    await fs.mkdir(projDir, { recursive: true });
    subT.after(async () => {
      await storage.deleteProject(testProjId).catch(() => {});
    });

    await storage.saveProject({
      id: testProjId,
      title: '测试标准化项目',
      projectDir: projDir
    });

    const testStoryboard = [{ order: 1, title: 'Shot 1', scriptText: '开场' }];
    await storage.saveStoryboard(testProjId, testStoryboard);

    // Verify written to state/storyboard.json
    const stateFile = path.join(projDir, 'state', 'storyboard.json');
    assert.ok(fsSync.existsSync(stateFile), 'state/storyboard.json must exist');
    const readFromStorage = await storage.getStoryboard(testProjId);
    assert.strictEqual(readFromStorage.length, 1);
    assert.strictEqual(readFromStorage[0].title, 'Shot 1');

    // Root file should also exist for backward compatibility
    assert.ok(fsSync.existsSync(path.join(projDir, 'storyboard.json')));
  });

  await t.test('4. resolveArtifactOutputDir routing rules', async (subT) => {
    const testProjId = `test_proj_routing_${Date.now()}`;
    const projDir = path.join(tmpDir, testProjId);
    await fs.mkdir(projDir, { recursive: true });
    subT.after(async () => {
      await storage.deleteProject(testProjId).catch(() => {});
    });

    await storage.saveProject({
      id: testProjId,
      title: '神话故事混剪',
      projectDir: projDir
    });

    // 规则 A: 默认留空时，输出到 <projDir>/outputs/<threadId>/
    const defaultOut = await resolveArtifactOutputDir({ projectId: testProjId, threadId: 'topic_01' });
    assert.strictEqual(
      path.resolve(defaultOut),
      path.resolve(path.join(projDir, 'outputs', 'topic_01'))
    );
    assert.ok(fsSync.existsSync(defaultOut));

    // 规则 B: 用户设置了自定义产物根目录时，输出到 <customRoot>/<项目标题>/<threadId>/
    const customExportRoot = path.join(tmpDir, 'my_custom_exports');
    await fs.mkdir(customExportRoot, { recursive: true });

    // Mock system settings for test
    const origGetSystemSettings = storage.getSystemSettings;
    storage.getSystemSettings = async () => ({ customOutputDir: customExportRoot });

    try {
      const customOut = await resolveArtifactOutputDir({ projectId: testProjId, threadId: 'topic_01' });
      assert.strictEqual(
        path.resolve(customOut),
        path.resolve(path.join(customExportRoot, '神话故事混剪', 'topic_01'))
      );
      assert.ok(fsSync.existsSync(customOut));

      // Test saveArtifactOutput
      const saved = await saveArtifactOutput({
        projectId: testProjId,
        threadId: 'topic_01',
        fileName: 'final_video.mp4',
        data: Buffer.from('fake mp4 video bytes')
      });
      assert.ok(fsSync.existsSync(saved.filePath));
      assert.strictEqual(saved.fileName, 'final_video.mp4');
    } finally {
      storage.getSystemSettings = origGetSystemSettings;
    }
  });

  await t.test('5. saveAssetCache should write to global CAS storage under %LOCALAPPDATA%/MeocoxFlow/storage/assets/<mfp>/', async () => {
    const testMfp = `mfp_test_${Date.now()}`;
    const cacheDir = await saveAssetCache(testMfp, {
      specs: { resolution: '1920x1080', fps: 60 },
      vision: { gameOrScene: '战斗演示' }
    });

    assert.ok(fsSync.existsSync(path.join(cacheDir, 'meta.json')));
    assert.ok(fsSync.existsSync(path.join(cacheDir, 'perception.json')));
    // Clean up test mfp
    await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => {});
  });
});
