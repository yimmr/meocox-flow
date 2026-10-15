import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { createEnvelope } from '../tool/envelope.js';
import { assertSafePathSegment } from '../../utils/safePath.js';

/**
 * 确保目录存在
 */
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

/**
 * 安全读取 JSON
 */
async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * 原子写入 JSON
 */
async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  try {
    await fs.rename(tempPath, filePath);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      await new Promise(r => setTimeout(r, 25));
      try {
        await fs.rename(tempPath, filePath);
      } catch {
        await fs.copyFile(tempPath, filePath);
        await fs.unlink(tempPath).catch(() => {});
      }
    } else {
      throw err;
    }
  }
}

// Serialize project.json / thread file read-modify-write operations so concurrent
// operations cannot overwrite each other's updates.
const projectFileLocks = new Map();
export async function withProjectFileLock(filePath, fn) {
  const lockKey = path.resolve(String(filePath));
  const previous = projectFileLocks.get(lockKey) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const chain = previous.then(() => gate);
  projectFileLocks.set(lockKey, chain);
  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (projectFileLocks.get(lockKey) === chain) projectFileLocks.delete(lockKey);
  }
}

/**
 * 生成规范项目 ID: proj_<timestamp36>_<random4>
 */
export function generateProjectId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `proj_${ts}_${rand}`;
}

/**
 * 工业级项目工作区管理器
 * 
 * 核心原则：
 * 1. 项目主目录由系统自动分配和管理，绝对隔离于宿主文件夹。
 * 2. 外部资料库仅为只读引用，绝不乱写入缓存，项目删除时资料库完好无损。
 * 3. 内部原生支持多对话（threads/）、生成物（artifacts/）、私有上传（uploads/）和私有缓存（.cache/）。
 */
export class ProjectManager {
  constructor({ projectsRoot = null } = {}) {
    this.projectsRoot = projectsRoot || config.paths?.projectsRoot || path.join(process.cwd(), 'projects_workspace');
  }

  getProjectPath(projectId) {
    return path.join(this.projectsRoot, assertSafePathSegment(projectId?.trim(), 'projectId'));
  }

  /**
   * 创建新项目（作品沙箱）
   */
  async createProject({
    id = null,
    title = '未命名作品',
    description = '',
    libraries = [],
    settings = {},
    initialAgentId = null
  } = {}) {
    await ensureDir(this.projectsRoot);
    const projectId = id?.trim() || generateProjectId();
    const projectDir = this.getProjectPath(projectId);

    if (fsSync.existsSync(projectDir)) {
      return createEnvelope({
        success: false,
        summary: `项目创建失败: ID "${projectId}" 已存在`,
        error: { code: 'PROJECT_ALREADY_EXISTS', message: `Project directory ${projectId} already exists` }
      });
    }

    // 1. 初始化标准物理沙箱子目录
    const threadsDir = path.join(projectDir, 'threads');
    const artifactsDir = path.join(projectDir, 'artifacts');
    const uploadsDir = path.join(projectDir, 'uploads');
    const cacheDir = path.join(projectDir, '.cache');

    await Promise.all([
      ensureDir(threadsDir),
      ensureDir(artifactsDir),
      ensureDir(uploadsDir),
      ensureDir(cacheDir)
    ]);

    const now = Date.now();

    // 2. 规范化挂载的初始资料库
    const validLibraries = [];
    if (Array.isArray(libraries)) {
      for (const lib of libraries) {
        if (!lib || !lib.path) continue;
        const libPath = path.resolve(lib.path);
        validLibraries.push({
          id: lib.id || `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          name: lib.name || path.basename(libPath),
          path: libPath,
          type: lib.type || 'generic',
          readOnly: true, // 核心约束：外部资料库一律只读挂载
          mountedAt: now
        });
      }
    }

    // 3. 构建 project.json
    const projectData = {
      id: projectId,
      title: String(title).trim(),
      description: String(description || '').trim(),
      createdAt: now,
      updatedAt: now,
      libraries: validLibraries,
      threads: [
        {
          id: 'main',
          title: '主对话',
          agentId: initialAgentId || null,
          createdAt: now,
          updatedAt: now
        }
      ],
      activeThreadId: 'main',
      settings: {
        aspectRatio: settings.aspectRatio || '16:9',
        fps: settings.fps || 30,
        ...settings
      }
    };

    // 4. 写入元数据与初始主对话、状态树
    await Promise.all([
      writeJson(path.join(projectDir, 'project.json'), projectData),
      writeJson(path.join(projectDir, 'state.json'), { status: 'draft', currentStep: null }),
      writeJson(path.join(threadsDir, 'main.json'), [])
    ]);

    return createEnvelope({
      success: true,
      summary: `作品项目【${projectData.title}】创建成功`,
      data: {
        ...projectData,
        projectDir
      }
    });
  }

  /**
   * 获取指定项目详情
   */
  async getProject(projectId) {
    if (!projectId) return null;
    const projectDir = this.getProjectPath(projectId);
    const metaFile = path.join(projectDir, 'project.json');
    const data = await readJson(metaFile);
    if (!data) return null;
    return {
      ...data,
      projectDir
    };
  }

  /**
   * 获取所有项目列表（按更新时间倒序）
   */
  async listProjects() {
    await ensureDir(this.projectsRoot);
    const entries = await fs.readdir(this.projectsRoot, { withFileTypes: true });
    const projects = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaFile = path.join(this.projectsRoot, entry.name, 'project.json');
      const data = await readJson(metaFile);
      if (data && data.id) {
        projects.push({
          ...data,
          projectDir: path.join(this.projectsRoot, entry.name)
        });
      }
    }

    return projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  /**
   * 更新项目元数据
   */
  async updateProject(projectId, updates = {}) {
    const projectDir = this.getProjectPath(projectId);
    const metaFile = path.join(projectDir, 'project.json');
    return withProjectFileLock(metaFile, async () => {
      const project = await this.getProject(projectId);
      if (!project) {
        return createEnvelope({
          success: false,
          summary: `更新失败: 未找到项目 "${projectId}"`,
          error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projectId} not found` }
        });
      }

      const requestedUpdates = typeof updates === 'function' ? updates(project) : updates;
      // 禁止覆盖物理 ID
      const safeUpdates = { ...(requestedUpdates || {}) };
      delete safeUpdates.id;
      delete safeUpdates.projectDir;

      // 兼容设置面板传入的 extraAssetDirs，自动同步进 libraries 挂载列表
      if (Array.isArray(safeUpdates.extraAssetDirs)) {
        const currentLibs = project.libraries || [];
        const newLibs = [...currentLibs];
        for (const dirPath of safeUpdates.extraAssetDirs) {
          if (!dirPath) continue;
          const resolved = path.resolve(dirPath);
          if (!newLibs.some(l => path.resolve(l.path) === resolved)) {
            newLibs.push({
              id: `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
              name: path.basename(resolved),
              path: resolved,
              type: 'generic',
              readOnly: true,
              mountedAt: Date.now()
            });
          }
        }
        safeUpdates.libraries = newLibs;
      }

      const updated = {
        ...project,
        ...safeUpdates,
        updatedAt: Date.now()
      };
      await writeJson(metaFile, updated);

      return createEnvelope({
        success: true,
        summary: `项目【${updated.title}】配置已更新`,
        data: updated
      });
    });
  }

  /**
   * 删除项目（只销毁私有目录，外部挂载的资料库毫发无损）
   */
  async deleteProject(projectId) {
    const projectDir = this.getProjectPath(projectId);
    if (!fsSync.existsSync(projectDir)) {
      return createEnvelope({
        success: false,
        summary: `删除失败: 未找到项目 "${projectId}"`,
        error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projectId} not found` }
      });
    }

    try {
      await fs.rm(projectDir, { recursive: true, force: true });
      return createEnvelope({
        success: true,
        summary: `项目 "${projectId}" 已安全删除 (外部资料库未受任何影响)`,
        data: { projectId }
      });
    } catch (err) {
      return createEnvelope({
        success: false,
        summary: `删除项目异常: ${err.message}`,
        error: { code: 'DELETE_ERROR', message: err.message }
      });
    }
  }
}
