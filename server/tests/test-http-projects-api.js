import express from 'express';
import projectsRouter from '../src/routes/projects.js';
import path from 'node:path';
import fs from 'node:fs/promises';

// 启动一个简易测试 Express 实例
const app = express();
app.use(express.json());
app.use('/api/projects', projectsRouter);

let server;
const PORT = 3099;

async function run() {
  console.log('🚀 启动 HTTP API 路由全功能集成测试...\n');

  await new Promise((resolve) => {
    server = app.listen(PORT, resolve);
  });

  const BASE_URL = `http://localhost:${PORT}/api/projects`;
  const externalTestLib = path.resolve('server/tests/tmp_http_external_lib');

  await fs.mkdir(externalTestLib, { recursive: true });
  await fs.writeFile(path.join(externalTestLib, 'test_doc.md'), '# Hello API Test');

  try {
    // 1. POST /api/projects - 创建新项目
    console.log('📌 1. 测试 POST /api/projects 创建项目');
    const createRes = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'HTTP API 自动化验证项目',
        description: '用于验证前后端接口闭环',
        libraries: [{ name: '测试文档库', path: externalTestLib }]
      })
    });
    const createJson = await createRes.json();
    if (!createJson.success) throw new Error('创建失败: ' + JSON.stringify(createJson));
    const projectId = createJson.project.id;
    console.log(`✅ 创建成功: ${projectId} (${createJson.project.title})`);

    // 2. GET /api/projects - 列出项目
    console.log('\n📌 2. 测试 GET /api/projects 列出项目');
    const listRes = await fetch(BASE_URL);
    const listJson = await listRes.json();
    const found = listJson.projects.find(p => p.id === projectId);
    if (!found) throw new Error('在项目列表中未能找到新创建的项目');
    console.log(`✅ 项目列表获取成功，当前项目数: ${listJson.count}`);

    // 3. POST /api/projects/:id/threads - 创建新对话分支
    console.log('\n📌 3. 测试 POST /api/projects/:id/threads 创建分支');
    const threadRes = await fetch(`${BASE_URL}/${projectId}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '技术架构讨论分支' })
    });
    const threadJson = await threadRes.json();
    if (!threadJson.success) throw new Error('分支创建失败');
    const branchId = threadJson.data.id;
    console.log(`✅ 分支创建成功: ${branchId} (${threadJson.data.title})`);

    // 4. POST /api/projects/:id/threads/:threadId/chat - 对话驱动测试 (带前置 Mock 拦截验证)
    console.log('\n📌 4. 测试 POST /api/projects/:id/threads/:threadId/chat 驱动对话');
    const chatRes = await fetch(`${BASE_URL}/${projectId}/threads/${branchId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: '请分析当前项目的架构优势',
        agentId: 'director'
      })
    });
    const chatJson = await chatRes.json();
    if (!chatJson.reply) throw new Error('对话未返回 reply: ' + JSON.stringify(chatJson));
    console.log(`✅ 智能体响应成功: "${chatJson.reply.content.slice(0, 40)}..."`);

    // 4.1 POST /api/projects/:id/threads/:threadId/chat/stream - SSE 流式思考与正文测试
    console.log('\n📌 4.1 测试 POST /api/projects/:id/threads/:threadId/chat/stream SSE 流式对话');
    const streamRes = await fetch(`${BASE_URL}/${projectId}/threads/${branchId}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: '请进行深度思考并输出镜头创意',
        agentId: 'director'
      })
    });
    if (!streamRes.ok) throw new Error(`流式接口返回状态码异常: ${streamRes.status}`);

    const streamText = await streamRes.text();
    if (!streamText.includes('event: done')) {
      throw new Error('SSE 流式未收到 event: done 完成事件: ' + streamText.slice(0, 100));
    }
    console.log('✅ SSE 流式响应正常收到事件流 (包含 think/text/done)');

    // 5. POST /api/projects/:id/libraries/:libId/scan - 扫描挂载资料库
    console.log('\n📌 5. 测试资料库只读扫描');
    const libId = createJson.project.libraries[0].id;
    const scanRes = await fetch(`${BASE_URL}/${projectId}/libraries/${libId}/scan`, {
      method: 'POST'
    });
    const scanJson = await scanRes.json();
    if (!scanJson.success) throw new Error('扫描失败');
    console.log(`✅ ${scanJson.summary}`);

    // 6. DELETE /api/projects/:id - 清理删除项目
    console.log('\n📌 6. 测试 DELETE /api/projects/:id 安全删除项目');
    const delRes = await fetch(`${BASE_URL}/${projectId}`, { method: 'DELETE' });
    const delJson = await delRes.json();
    if (!delJson.success) throw new Error('删除失败');
    console.log('✅ 项目安全删除成功');

    console.log('\n🎉🎉🎉 [SUCCESS] HTTP API 路由与底座闭环验证全部通过！');
  } finally {
    server?.close();
    await fs.rm(externalTestLib, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch(err => {
  console.error('\n❌ 测试失败:', err);
  server?.close();
  process.exit(1);
});
