import { ProjectManager } from './manager.js';
import { ThreadManager } from './thread.js';
import { LibraryManager } from './library.js';

export { ProjectManager, ThreadManager, LibraryManager };

// ── 内部默认单例 (外部免手动 new，开箱即用) ──
let defaultProjectManager = null;
let defaultThreadManager = null;
let defaultLibraryManager = null;

function ensureProjectEngine(customProjectsRoot = null) {
  if (!defaultProjectManager || (customProjectsRoot && defaultProjectManager.projectsRoot !== customProjectsRoot)) {
    defaultProjectManager = new ProjectManager({ projectsRoot: customProjectsRoot });
    defaultThreadManager = new ThreadManager({ projectManager: defaultProjectManager });
    defaultLibraryManager = new LibraryManager({ projectManager: defaultProjectManager });
  }
}

// ─────────────────────────────────────────────────────────────
// 🌟 纯函数开箱即用 API (支持可选在 options 中传 projectsRoot)
// ─────────────────────────────────────────────────────────────

/** 1. 创建项目 (自动分配沙箱、初始化 main 对话与受管子目录) */
export async function createProject(params = {}, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultProjectManager.createProject(params);
}

/** 2. 获取指定项目详情 */
export async function getProject(projectId, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultProjectManager.getProject(projectId);
}

/** 3. 列出所有项目 */
export async function listProjects({ projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultProjectManager.listProjects();
}

/** 4. 更新项目元数据 */
export async function updateProject(projectId, updates, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultProjectManager.updateProject(projectId, updates);
}

/** 5. 安全删除项目 (销毁私有目录，外部资料库毫发无损) */
export async function deleteProject(projectId, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultProjectManager.deleteProject(projectId);
}

/** 6. 创建项目内对话分支 */
export async function createThread(projectId, params = {}, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultThreadManager.createThread(projectId, params);
}

/** 7. 列出项目内所有对话 */
export async function listThreads(projectId, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultThreadManager.listThreads(projectId);
}

/** 8. 获取对话历史消息 */
export async function getThreadMessages(projectId, threadId = 'main', { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultThreadManager.getMessages(projectId, threadId);
}

/** 9. 向对话追加消息 */
export async function appendThreadMessages(projectId, threadId, messages, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultThreadManager.appendMessages(projectId, threadId, messages);
}

/** 10. 删除项目内指定对话分支 */
export async function deleteThread(projectId, threadId, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultThreadManager.deleteThread(projectId, threadId);
}

/** 11. 切换项目当前活跃对话 */
export async function switchActiveThread(projectId, threadId, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultThreadManager.switchActiveThread(projectId, threadId);
}

/** 11.1 更新对话元数据 (如 pendingDecision) */
export async function updateThread(projectId, threadId, updates, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultThreadManager.updateThread(projectId, threadId, updates);
}

/** 11.2 获取对话元数据与详情 */
export async function getThread(projectId, threadId, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultThreadManager.getThread(projectId, threadId);
}

/** 11.3 获取任务完整工作流数据 (feedItems, artifacts) */
export async function getThreadDetails(projectId, threadId, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultThreadManager.getThreadDetails(projectId, threadId);
}

/** 11.4 保存任务工作流与产物数据 */
export async function saveThreadDetails(projectId, threadId, data, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultThreadManager.saveThreadDetails(projectId, threadId, data);
}

/** 11.5 清空任务工作流 */
export async function clearThreadStream(projectId, threadId, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultThreadManager.clearThreadStream(projectId, threadId);
}

/** 12. 挂载外部资料库目录 (纯只读引用) */
export async function mountLibrary(projectId, params = {}, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultLibraryManager.mountLibrary(projectId, params);
}

/** 13. 卸载外部资料库目录 (不删除外部文件) */
export async function unmountLibrary(projectId, libraryId, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultLibraryManager.unmountLibrary(projectId, libraryId);
}

/** 14. 查看项目已挂载的所有资料库 */
export async function listLibraries(projectId, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultLibraryManager.listLibraries(projectId);
}

/** 15. 安全只读扫描资料库 (索引存入项目私有 .cache，零外部污染) */
export async function scanLibrary(projectId, libraryId, options = {}, { projectsRoot = null } = {}) {
  ensureProjectEngine(projectsRoot);
  return await defaultLibraryManager.scanLibrary(projectId, libraryId, options);
}
