import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { createEnvelope } from '../tool/envelope.js';

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
 * 外部资料库挂载管理器
 * 
 * 核心设计铁律：
 * 1. 外部资料库（Libraries）是用户的外部文件系统，项目仅做「只读引用/挂载」。
 * 2. 所有的扫描索引、元数据缓存必须写入项目自身的 `.cache/libraries/` 下，
 *    绝对禁止向用户的资料库文件夹中写入任何隐藏配置文件或缓存。
 * 3. 项目卸载或删除资料库时，宿主目录完全不受影响。
 */
export class LibraryManager {
  constructor({ projectManager }) {
    this.projectManager = projectManager;
  }

  getCacheDir(projectId) {
    const projectDir = this.projectManager.getProjectPath(projectId);
    return path.join(projectDir, '.cache', 'libraries');
  }

  /**
   * 挂载外部资料库目录
   */
  async mountLibrary(projectId, {
    id = null,
    name = '',
    path: rawPath = '',
    type = 'generic'
  } = {}) {
    const project = await this.projectManager.getProject(projectId);
    if (!project) {
      return createEnvelope({
        success: false,
        summary: `挂载资料库失败: 未找到项目 "${projectId}"`,
        error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projectId} not found` }
      });
    }

    if (!rawPath || typeof rawPath !== 'string') {
      return createEnvelope({
        success: false,
        summary: '挂载失败: 资料库路径不可为空',
        error: { code: 'INVALID_PATH', message: 'Library path is required' }
      });
    }

    const resolvedPath = path.resolve(rawPath);
    if (!fsSync.existsSync(resolvedPath)) {
      return createEnvelope({
        success: false,
        summary: `挂载失败: 目标路径不存在 (${resolvedPath})`,
        error: { code: 'PATH_NOT_FOUND', message: `Target directory ${resolvedPath} does not exist` }
      });
    }

    const stat = await fs.stat(resolvedPath);
    if (!stat.isDirectory()) {
      return createEnvelope({
        success: false,
        summary: `挂载失败: 目标路径不是一个文件夹 (${resolvedPath})`,
        error: { code: 'NOT_A_DIRECTORY', message: `Target ${resolvedPath} is not a directory` }
      });
    }

    const libraries = project.libraries || [];
    // 检查是否已挂载相同路径
    const existing = libraries.find(lib => path.resolve(lib.path) === resolvedPath);
    if (existing) {
      return createEnvelope({
        success: true,
        summary: `资料库已在项目中挂载 (${existing.name})`,
        data: existing
      });
    }

    const libId = id?.trim() || `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const newLib = {
      id: libId,
      name: name?.trim() || path.basename(resolvedPath),
      path: resolvedPath,
      type: type || 'generic',
      readOnly: true, // 工业级约束：永远只读
      mountedAt: Date.now()
    };

    libraries.push(newLib);
    await this.projectManager.updateProject(projectId, { libraries });

    return createEnvelope({
      success: true,
      summary: `外部资料库【${newLib.name}】已成功只读挂载至项目`,
      data: newLib
    });
  }

  /**
   * 卸载外部资料库（仅解除项目引用，不破坏外部文件）
   */
  async unmountLibrary(projectId, libraryId) {
    const project = await this.projectManager.getProject(projectId);
    if (!project) {
      return createEnvelope({
        success: false,
        summary: `卸载失败: 未找到项目 "${projectId}"`,
        error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projectId} not found` }
      });
    }

    const libraries = (project.libraries || []).filter(lib => lib.id !== libraryId);
    await this.projectManager.updateProject(projectId, { libraries });

    // 清理该资料库在项目内部的私有缓存索引文件
    const cacheFile = path.join(this.getCacheDir(projectId), `${libraryId}.json`);
    try {
      if (fsSync.existsSync(cacheFile)) {
        await fs.unlink(cacheFile);
      }
    } catch {}

    return createEnvelope({
      success: true,
      summary: `资料库 "${libraryId}" 已从项目解除挂载 (外部原文件完整保留)`,
      data: { libraryId }
    });
  }

  /**
   * 查看项目当前挂载的所有资料库及可用状态
   */
  async listLibraries(projectId) {
    const project = await this.projectManager.getProject(projectId);
    if (!project) return [];

    const libraries = project.libraries || [];
    return libraries.map(lib => {
      const exists = fsSync.existsSync(lib.path);
      return {
        ...lib,
        accessible: exists
      };
    });
  }

  /**
   * 安全只读扫描资料库文件列表（缓存写入项目私有 .cache，零外部污染）
   */
  async scanLibrary(projectId, libraryId, { maxDepth = 3, maxFiles = 300 } = {}) {
    const project = await this.projectManager.getProject(projectId);
    if (!project) {
      return createEnvelope({
        success: false,
        summary: `扫描失败: 未找到项目 "${projectId}"`,
        error: { code: 'PROJECT_NOT_FOUND', message: `Project ${projectId} not found` }
      });
    }

    const lib = (project.libraries || []).find(l => l.id === libraryId);
    if (!lib) {
      return createEnvelope({
        success: false,
        summary: `未找到资料库 "${libraryId}"`,
        error: { code: 'LIBRARY_NOT_FOUND', message: `Library ${libraryId} not found` }
      });
    }

    if (!fsSync.existsSync(lib.path)) {
      return createEnvelope({
        success: false,
        summary: `资料库所在路径当前不可用或未连接: ${lib.path}`,
        error: { code: 'LIBRARY_PATH_INACCESSIBLE', message: `Directory ${lib.path} is inaccessible` }
      });
    }

    // 递归安全只读扫描
    const files = [];
    async function traverse(currentDir, currentDepth) {
      if (currentDepth > maxDepth || files.length >= maxFiles) return;
      let entries = [];
      try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (files.length >= maxFiles) break;
        // 忽略常见的隐藏目录与系统垃圾
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '$RECYCLE.BIN') {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);
        const relativePath = path.relative(lib.path, fullPath);

        if (entry.isDirectory()) {
          await traverse(fullPath, currentDepth + 1);
        } else if (entry.isFile()) {
          try {
            const stat = await fs.stat(fullPath);
            files.push({
              name: entry.name,
              relativePath,
              sizeBytes: stat.size,
              mtime: stat.mtimeMs,
              extension: path.extname(entry.name).toLowerCase()
            });
          } catch {}
        }
      }
    }

    await traverse(lib.path, 1);

    // 缓存索引至项目私有沙箱内（绝不往用户文件夹写垃圾）
    const cacheDir = this.getCacheDir(projectId);
    await ensureDir(cacheDir);
    const cacheFile = path.join(cacheDir, `${libraryId}.json`);
    const indexData = {
      libraryId,
      scannedAt: Date.now(),
      fileCount: files.length,
      files
    };
    await fs.writeFile(cacheFile, JSON.stringify(indexData, null, 2), 'utf-8');

    return createEnvelope({
      success: true,
      summary: `资料库【${lib.name}】扫描完成，发现 ${files.length} 个文件`,
      data: {
        libraryId,
        libraryName: lib.name,
        path: lib.path,
        totalFiles: files.length,
        files: files.slice(0, 50), // 摘要返回前 50 个，避免大报文撑爆通信
        hasMore: files.length > 50
      }
    });
  }
}
