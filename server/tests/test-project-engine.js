import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import {
  createProject,
  getProject,
  listProjects,
  updateProject,
  deleteProject,
  createThread,
  listThreads,
  getThreadMessages,
  appendThreadMessages,
  deleteThread,
  switchActiveThread,
  mountLibrary,
  unmountLibrary,
  listLibraries,
  scanLibrary
} from '../src/engine/index.js';

async function runTests() {
  console.log('🚀 开始测试【项目/多对话/多资料库引擎】核心底座...\n');

  const testRoot = path.resolve('server/tests/tmp_project_workspace');
  const externalLibDir = path.resolve('server/tests/tmp_external_library');

  // 清理临时测试环境
  await fs.rm(testRoot, { recursive: true, force: true });
  await fs.rm(externalLibDir, { recursive: true, force: true });

  // 准备外部资料库测试数据 (外部用户目录)
  await fs.mkdir(externalLibDir, { recursive: true });
  await fs.writeFile(path.join(externalLibDir, 'scene_intro.mp4'), 'mock video content');
  await fs.writeFile(path.join(externalLibDir, 'lore_document.txt'), 'mock story text');
  const initialExternalFiles = await fs.readdir(externalLibDir);

  const opts = { projectsRoot: testRoot };

  try {
    // ── 1. 创建项目沙箱 ──────────────────────────────────────────
    console.log('📌 测试 1: 自动生成项目受管私有目录');
    const createRes = await createProject({
      title: '赛博纪元先导片',
      description: '工业级智能体协同短片工程',
      settings: { aspectRatio: '9:16' }
    }, opts);

    if (!createRes.success) throw new Error(`创建项目失败: ${createRes.summary}`);
    const projectId = createRes.data.id;
    const projectDir = createRes.data.projectDir;
    console.log(`✅ 项目创建成功: ${projectId} -> ${projectDir}`);

    // 验证物理沙箱子目录
    if (!fsSync.existsSync(path.join(projectDir, 'project.json'))) throw new Error('缺少 project.json');
    if (!fsSync.existsSync(path.join(projectDir, 'threads', 'main.json'))) throw new Error('缺少 threads/main.json');
    if (!fsSync.existsSync(path.join(projectDir, 'artifacts'))) throw new Error('缺少 artifacts/');
    if (!fsSync.existsSync(path.join(projectDir, 'uploads'))) throw new Error('缺少 uploads/');
    if (!fsSync.existsSync(path.join(projectDir, '.cache'))) throw new Error('缺少 .cache/');
    console.log('✅ 项目沙箱内部物理子目录校验完整通过！');

    // ── 2. 多对话（Thread）分支与隔离测试 ─────────────────────────
    console.log('\n📌 测试 2: 多对话（Thread）独立隔离与切换');
    const threadRes = await createThread(projectId, {
      title: '视觉风格专项调试',
      agentId: 'vision-designer'
    }, opts);

    if (!threadRes.success) throw new Error(`创建新对话失败: ${threadRes.summary}`);
    const branchThreadId = threadRes.data.id;
    console.log(`✅ 创建对话分支成功: ${branchThreadId} (${threadRes.data.title})`);

    // 写入主对话
    await appendThreadMessages(projectId, 'main', {
      role: 'user',
      content: '主线：规划前3秒黄金钩子'
    }, opts);

    // 写入分支对话
    await appendThreadMessages(projectId, branchThreadId, {
      role: 'user',
      content: '分支：测试赛博朋克调色方案'
    }, opts);

    // 验证两边消息严格隔离
    const mainMsgs = await getThreadMessages(projectId, 'main', opts);
    const branchMsgs = await getThreadMessages(projectId, branchThreadId, opts);

    if (mainMsgs.length !== 1 || !mainMsgs[0].content.includes('主线')) {
      throw new Error('主对话消息异常或未正确持久化');
    }
    if (branchMsgs.length !== 1 || !branchMsgs[0].content.includes('分支')) {
      throw new Error('分支对话消息异常或未正确持久化');
    }
    console.log(`✅ 主对话消息数: ${mainMsgs.length}, 分支对话消息数: ${branchMsgs.length} (严格物理隔离)`);

    // 切换活跃对话
    await switchActiveThread(projectId, branchThreadId, opts);
    const projDetail = await getProject(projectId, opts);
    if (projDetail.activeThreadId !== branchThreadId) {
      throw new Error('活跃对话切换未能生效');
    }
    console.log(`✅ 当前活跃对话成功切换至: ${projDetail.activeThreadId}`);

    // ── 3. 外部多资料库只读挂载与安全扫描测试 ─────────────────────
    console.log('\n📌 测试 3: 外部资料库只读挂载与防污染校验');
    const mountRes = await mountLibrary(projectId, {
      name: '机甲素材库',
      path: externalLibDir,
      type: 'media'
    }, opts);

    if (!mountRes.success) throw new Error(`挂载资料库失败: ${mountRes.summary}`);
    const libId = mountRes.data.id;
    console.log(`✅ 资料库挂载成功: ${libId} -> ${externalLibDir} (只读模式)`);

    // 安全扫描
    const scanRes = await scanLibrary(projectId, libId, {}, opts);
    if (!scanRes.success) throw new Error(`扫描资料库失败: ${scanRes.summary}`);
    console.log(`✅ ${scanRes.summary}`);

    // 验证防污染约束：外部资料库目录中绝对不能有新文件生成
    const currentExternalFiles = await fs.readdir(externalLibDir);
    if (currentExternalFiles.length !== initialExternalFiles.length) {
      throw new Error('❌ 致命警告：外部资料库目录被污染！检测到了未经允许写入的新文件！');
    }
    console.log('✅ 零污染校验通过：外部资料库无任何脏文件写入！');

    // 验证索引是否保存在项目内部的 .cache/
    const internalCacheFile = path.join(projectDir, '.cache', 'libraries', `${libId}.json`);
    if (!fsSync.existsSync(internalCacheFile)) {
      throw new Error('未能在项目自身 .cache/ 找到索引缓存文件');
    }
    console.log('✅ 索引缓存位置校验通过：完全封闭在项目自身的 .cache/ 内部');

    // ── 4. 安全删除项目 ──────────────────────────────────────────
    console.log('\n📌 测试 4: 项目删除与外部资料库无损测试');
    const delRes = await deleteProject(projectId, opts);
    if (!delRes.success) throw new Error(`删除项目失败: ${delRes.summary}`);

    if (fsSync.existsSync(projectDir)) {
      throw new Error('项目目录未被成功移除');
    }
    console.log('✅ 项目自身私有目录已被彻底清理');

    // 外部资料库原封不动
    const afterDelExternalFiles = await fs.readdir(externalLibDir);
    if (afterDelExternalFiles.length !== 2) {
      throw new Error('外部资料库文件数量异常！');
    }
    console.log('✅ 外部资料库完好无损，文件数量依然为 2！');

    console.log('\n🎉 所有测试全部通过！项目、多对话、多资料库底座运行严谨且稳固！');
  } finally {
    // 清理测试临时目录
    await fs.rm(testRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(externalLibDir, { recursive: true, force: true }).catch(() => {});
  }
}

runTests().catch(err => {
  console.error('\n❌ 测试失败:', err);
  process.exit(1);
});
