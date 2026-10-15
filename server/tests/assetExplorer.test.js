import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateDefaultProjectTitle } from '../src/routes/projects.js';

describe('Asset Explorer and Short Title Specifications', () => {
  it('should generate a concise default project title (e.g. MMDD_HHmm 剪辑, <= 15 chars)', () => {
    const title = generateDefaultProjectTitle();
    assert.ok(title.length <= 15, `Title "${title}" is too long (${title.length} chars)`);
    assert.match(title, /^\d{4}_\d{4} 剪辑$/);
  });

  it('should create and read system settings with only defaultProjectsRoot', async () => {
    const { storage } = await import('../src/storage/index.js');
    // 用隔离的临时 settings 文件：测试绝不触碰用户真实的 %LOCALAPPDATA% 配置
    const tmpSettings = path.join(os.tmpdir(), 'meocoxflow_test_settings_' + Date.now() + '.json');
    const tmpRoot = path.join(os.tmpdir(), 'meocoxflow_test_projects_root_' + Date.now());
    await fs.mkdir(tmpRoot, { recursive: true });

    try {
      const initial = await storage.getSystemSettings(tmpSettings);
      assert.ok(initial.defaultProjectsRoot);

      const updated = await storage.saveSystemSettings({ defaultProjectsRoot: tmpRoot }, tmpSettings);
      assert.equal(updated.defaultProjectsRoot, tmpRoot);

      // 修复前 defaultAssetLibraryDir 会在保存时被丢弃，现应被保留
      const withAsset = await storage.saveSystemSettings(
        { defaultAssetLibraryDir: tmpRoot },
        tmpSettings
      );
      assert.equal(withAsset.defaultAssetLibraryDir, tmpRoot);
      assert.equal(withAsset.defaultProjectsRoot, tmpRoot, '保存其他字段时不应丢失 defaultProjectsRoot');
    } finally {
      await fs.rm(tmpSettings, { force: true }).catch(() => {});
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('should require project to manually set assetDir, returning notConfigured when unset', async () => {
    const { storage } = await import('../src/storage/index.js');
    const testProjId = `test_unset_asset_${Date.now()}`;
    await storage.saveProject({
      id: testProjId,
      title: '未设置素材目录测试'
    });

    const assetDir = await storage.getProjectAssetDir(testProjId);
    assert.equal(assetDir, null);
    await storage.deleteProject(testProjId);
  });

  it('should resolve multiple asset directories (assetDir + extraAssetDirs)', async () => {
    const { storage } = await import('../src/storage/index.js');
    const testProjId = `test_multi_asset_${Date.now()}`;
    const primaryDir = path.resolve(import.meta.dirname, '../src');
    const extraDir = path.resolve(import.meta.dirname);

    await storage.saveProject({
      id: testProjId,
      title: '多素材目录测试',
      assetDir: primaryDir,
      extraAssetDirs: [extraDir]
    });

    const dirs = await storage.getProjectAssetDirs(testProjId);
    assert.equal(dirs.length, 2);
    assert.equal(dirs[0], primaryDir);
    assert.equal(dirs[1], extraDir);

    await storage.deleteProject(testProjId);
  });
});
