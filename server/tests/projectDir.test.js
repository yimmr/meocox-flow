import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { config } from '../src/config.js';
import { storage } from '../src/storage/index.js';

describe('Project Directory and Storage Customization', () => {
  const testProjId = `test_proj_custom_${Date.now()}`;
  // 用系统临时目录，避免测试数据落进代码仓库
  const customWorkDir = path.join(os.tmpdir(), 'meocoxflow_test_' + Date.now());

  after(async () => {
    await storage.deleteProject(testProjId).catch(() => {});
    await fs.rm(customWorkDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should default to the configured projectsRoot when no projectDir is specified', async () => {
    const proj = await storage.saveProject({
      id: testProjId,
      title: '2026-09-26 21:05 剪辑创作'
    });

    const workDir = await storage.getProjectWorkDir(testProjId);
    assert.ok(workDir.includes(testProjId));
    // 默认落点必须是标准项目工作区，而不是仓库内的 data/projects
    assert.equal(path.resolve(workDir), path.resolve(config.paths.projectsRoot, testProjId));
    assert.equal(proj.title, '2026-09-26 21:05 剪辑创作');
  });

  it('should allow setting a custom projectDir and migrate project files', async () => {
    await fs.mkdir(customWorkDir, { recursive: true });

    // Update project with custom directory
    const updated = await storage.saveProject({
      id: testProjId,
      title: '2026-09-26 21:05 剪辑创作 (迁移)',
      projectDir: customWorkDir
    });

    assert.equal(path.resolve(updated.projectDir), path.resolve(customWorkDir));

    const resolvedWorkDir = await storage.getProjectWorkDir(testProjId);
    assert.equal(path.resolve(resolvedWorkDir), path.resolve(customWorkDir));

    // Verify sub-files exist in the custom directory
    const projectJson = await fs.readFile(path.join(customWorkDir, 'project.json'), 'utf-8');
    assert.ok(projectJson.includes('2026-09-26 21:05 剪辑创作 (迁移)'));
  });

  it('should list projects with resolved projectDir', async () => {
    const list = await storage.listProjects();
    const target = list.find(p => p.id === testProjId);
    assert.ok(target);
    assert.equal(path.resolve(target.projectDir), path.resolve(customWorkDir));
  });
});
