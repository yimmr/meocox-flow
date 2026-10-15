import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import express from 'express';
import projectsRouter from '../src/routes/projects.js';
import {
  createProject,
  deleteProject,
  getOrchestrator,
  buildLeadOrchestratorPrompt
} from '../src/engine/index.js';
import { storage } from '../src/storage/index.js';

describe('Workspace Memory & Artifact Verification', () => {
  let app;
  let server;
  let baseUrl;
  let testProjectId;
  const PORT = 3197;

  before(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/projects', projectsRouter);

    await new Promise((resolve) => {
      server = app.listen(PORT, resolve);
    });
    baseUrl = `http://localhost:${PORT}/api/projects`;

    const projectEnvelope = await createProject({
      title: '记忆验证项目',
      description: '自动化验证跨会话记忆'
    });
    testProjectId = projectEnvelope.data.id;

  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (testProjectId) {
      await deleteProject(testProjectId).catch(() => {});
    }
  });

  describe('2. 跨会话自动记忆读写 (MEMORY.md Storage & API)', () => {
    it('storage.saveMemory 与 storage.getMemory 应支持项目级持久记忆', async () => {
      const sampleRule = '- 规则1: 视频前3秒必须紧凑，禁止平铺直叙\n- 规则2: 字幕统一使用思源黑体粗体';
      const saveRes = await storage.saveMemory(sampleRule, {
        projectId: testProjectId,
        scope: 'project',
        append: false
      });
      assert.strictEqual(saveRes.success, true);

      const mem = await storage.getMemory(testProjectId);
      assert.ok(mem.projectMemory.includes('视频前3秒必须紧凑'));
      assert.ok(mem.combinedText.includes('项目工程级记忆'));
      assert.ok(mem.combinedText.includes('思源黑体粗体'));
    });

    it('GET /api/projects/:id/memory 应返回结构化记忆数据', async () => {
      const res = await fetch(`${baseUrl}/${testProjectId}/memory`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);
      assert.ok(json.projectMemory.includes('视频前3秒必须紧凑'));
      assert.ok(typeof json.combinedText === 'string');
    });

    it('POST /api/projects/:id/memory 应支持追加经验偏好', async () => {
      const newRule = '- 规则3: 导出的音频需开启 -14 LUFS 响度标准化';
      const res = await fetch(`${baseUrl}/${testProjectId}/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newRule,
          scope: 'project',
          append: true
        })
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.success, true);

      const memRes = await fetch(`${baseUrl}/${testProjectId}/memory`);
      const memJson = await memRes.json();
      assert.ok(memJson.projectMemory.includes('响度标准化'));
      assert.ok(memJson.projectMemory.includes('视频前3秒必须紧凑'));
    });
  });

  describe('3. Tier 3 提示词中对 MEMORY.md 的装配与注入', () => {
    it('当 memoryText 存在时，应在 Tier 3 末尾注入 Section 6 记忆', () => {
      const prompt = buildLeadOrchestratorPrompt({
        project: { id: testProjectId, title: '测试工程' },
        memoryText: '### [项目工程级记忆]\n- 偏好快节奏卡点剪辑'
      });
      assert.ok(prompt.includes('## 6. 跨会话持久经验与偏好记忆 (Persistent Project & User Memory)'));
      assert.ok(prompt.includes('偏好快节奏卡点剪辑'));
    });

    it('当 memoryText 为空时，不应渲染冗余的 Section 6', () => {
      const prompt = buildLeadOrchestratorPrompt({
        project: { id: testProjectId, title: '测试工程' },
        memoryText: ''
      });
      assert.ok(!prompt.includes('## 6. 跨会话持久经验与偏好记忆'));
    });
  });

  describe('4. 客观物理产物验收 (verifyResult)', () => {
    it('orchestrator.verifyResult 应拒绝不存在的本地物理路径产物', async () => {
      const orchestrator = await getOrchestrator();
      const fakeEnvelope = {
        success: true,
        data: {
          draftPath: 'D:\\fake\\path\\to\\nonexistent_draft_12345.json'
        }
      };

      const result = await orchestrator.verifyResult('export_jianying_draft', fakeEnvelope);
      assert.strictEqual(result.verified, false);
      assert.ok(result.reason.includes('不存在'));
    });

    it('orchestrator.verifyResult 应放行真实存在的物理路径产物', async () => {
      const orchestrator = await getOrchestrator();
      const tempFile = path.join(process.cwd(), 'temp_test_verify.txt');
      await fs.writeFile(tempFile, 'test payload');

      try {
        const validEnvelope = {
          success: true,
          data: {
            filePath: tempFile
          }
        };

        const result = await orchestrator.verifyResult('render_image', validEnvelope);
        assert.strictEqual(result.verified, true);
      } finally {
        await fs.unlink(tempFile).catch(() => {});
      }
    });
  });
});
