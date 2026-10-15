import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { storage } from '../src/storage/index.js';

test('Global Libraries Storage & Multi-Root Management', async (t) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meocox-lib-test-'));
  const tmpSettings = path.join(tmpDir, 'settings.json');
  const sampleFolderA = path.join(tmpDir, 'FolderA');
  const sampleFolderB = path.join(tmpDir, 'FolderB');
  await fs.mkdir(sampleFolderA, { recursive: true });
  await fs.mkdir(sampleFolderB, { recursive: true });

  await t.test('1. should start with empty libraries or fallback', async () => {
    const libs = await storage.getGlobalLibraries(tmpSettings);
    assert.ok(Array.isArray(libs));
    assert.equal(libs.length, 0);
  });

  await t.test('2. should add new global library and reject non-directory', async () => {
    const res = await storage.addGlobalLibrary({ name: '素材库A', path: sampleFolderA }, tmpSettings);
    assert.equal(res.isNew, true);
    assert.equal(res.library.name, '素材库A');
    assert.equal(path.resolve(res.library.path), path.resolve(sampleFolderA));

    // Duplicate path should return existing
    const dupRes = await storage.addGlobalLibrary({ name: '重命名A', path: sampleFolderA }, tmpSettings);
    assert.equal(dupRes.isNew, false);
    assert.equal(dupRes.library.id, res.library.id);

    // Non-existent path should throw
    await assert.rejects(
      async () => storage.addGlobalLibrary({ name: '无效', path: path.join(tmpDir, 'NotExist') }, tmpSettings),
      /目标路径不存在/
    );
  });

  await t.test('3. should support adding second directory and listing all', async () => {
    const resB = await storage.addGlobalLibrary({ name: '音效包B', path: sampleFolderB }, tmpSettings);
    assert.equal(resB.isNew, true);

    const all = await storage.getGlobalLibraries(tmpSettings);
    assert.equal(all.length, 2);
    assert.ok(all.some(l => l.name === '素材库A'));
    assert.ok(all.some(l => l.name === '音效包B'));
  });

  await t.test('4. should update library alias', async () => {
    const all = await storage.getGlobalLibraries(tmpSettings);
    const target = all.find(l => l.name === '素材库A');
    const updated = await storage.updateGlobalLibrary(target.id, { name: 'B-Roll高精素材' }, tmpSettings);
    assert.equal(updated.name, 'B-Roll高精素材');

    const fresh = await storage.getGlobalLibraries(tmpSettings);
    assert.ok(fresh.some(l => l.name === 'B-Roll高精素材'));
  });

  await t.test('5. should remove library safely without deleting folder on disk', async () => {
    const all = await storage.getGlobalLibraries(tmpSettings);
    const target = all.find(l => l.name === '音效包B');
    const remRes = await storage.removeGlobalLibrary(target.id, tmpSettings);
    assert.equal(remRes.success, true);

    const fresh = await storage.getGlobalLibraries(tmpSettings);
    assert.equal(fresh.length, 1);

    // Physical folder must still exist!
    const folderExists = await fs.stat(sampleFolderB).then(() => true).catch(() => false);
    assert.equal(folderExists, true, 'Physical folder must not be deleted on unbind');
  });

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});
