import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { storage } from '../../src/storage/index.js';
import { ArtifactStore } from '../../src/core/artifacts/store.js';
import { analyzeImpact, buildLineageGraph } from '../../src/core/artifacts/lineage.js';

describe('ArtifactStore · 版本 / 哈希 / 谱系', () => {
  const projectId = `test_core_art_${Date.now()}`;
  const workDir = path.join(os.tmpdir(), `meocoxflow_core_art_${Date.now()}`);
  const store = new ArtifactStore();

  before(async () => {
    await fs.mkdir(workDir, { recursive: true });
    await storage.saveProject({ id: projectId, title: 'artifact test', projectDir: workDir });
  });

  after(async () => {
    await storage.deleteProject(projectId).catch(() => {});
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  });

  test('首次产出建立 v1 并可读回', async () => {
    const { artifact, versionMeta } = await store.produce(projectId, {
      kind: 'storyboard',
      payload: [{ order: 1, scriptText: '第一镜' }],
      producedBy: { taskId: 'tsk_script' }
    });
    assert.equal(artifact.currentVersion, 1);
    assert.equal(versionMeta.version, 1);
    assert.ok(versionMeta.hash.startsWith('sha256:'));

    const read = await store.get(projectId, 'storyboard', artifact.id);
    assert.deepEqual(read.payload, [{ order: 1, scriptText: '第一镜' }]);
  });

  test('内容变化追加 v2,lineage 被记录', async () => {
    const { artifact } = await store.produce(projectId, {
      kind: 'storyboard', payload: [{ order: 1, scriptText: '第一镜' }], producedBy: { taskId: 'tsk_script' }
    });
    const { artifact: updated, versionMeta } = await store.produce(projectId, {
      artifactId: artifact.id,
      kind: 'storyboard',
      payload: [{ order: 1, scriptText: '第一镜(改)' }],
      producedBy: { taskId: 'tsk_script' }
    });
    assert.equal(updated.currentVersion, 2);
    assert.equal(versionMeta.version, 2);
    assert.equal(updated.versions.length, 2);
  });

  test('相同内容幂等:不产生新版本', async () => {
    const { artifact } = await store.produce(projectId, {
      kind: 'voiceover', payload: { text: 'a' }, producedBy: { taskId: 'tsk_tts' }
    });
    const again = await store.produce(projectId, {
      artifactId: artifact.id, kind: 'voiceover', payload: { text: 'a' }, producedBy: { taskId: 'tsk_tts' }
    });
    assert.equal(again.deduped, true);
    assert.equal(again.artifact.currentVersion, 1);
  });

  test('lineage 建图 + 影响面分析:下游被命中', async () => {
    const sb = await store.produce(projectId, { kind: 'storyboard', payload: { shots: 4 }, producedBy: { taskId: 'T_script' } });
    const pb = await store.produce(projectId, {
      kind: 'prompt_batch', payload: { prompts: 4 },
      lineage: [{ artifactId: sb.artifact.id, version: 1 }],
      producedBy: { taskId: 'T_render' }
    });
    const tl = await store.produce(projectId, {
      kind: 'timeline_manifest', payload: { tracks: 6 },
      lineage: [{ artifactId: pb.artifact.id, version: 1 }],
      producedBy: { taskId: 'T_edit' }
    });

    const all = await store.listAll(projectId);
    const report = analyzeImpact(all, { artifactId: sb.artifact.id, version: 1 });

    assert.ok(report.affectedArtifacts.includes(pb.artifact.id));
    assert.ok(report.affectedArtifacts.includes(tl.artifact.id));
    assert.ok(report.recomputeSet.includes('T_render'));
    assert.ok(report.recomputeSet.includes('T_edit'));
  });

  test('markStale 标记过期', async () => {
    const { artifact } = await store.produce(projectId, { kind: 'report', payload: {}, producedBy: { taskId: 'T_r' } });
    const stale = await store.markStale(projectId, 'report', artifact.id);
    assert.equal(stale.status, 'stale');
  });
});