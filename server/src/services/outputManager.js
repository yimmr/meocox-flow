import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import { storage } from '../storage/index.js';
import { config } from '../config.js';

/**
 * 清洗文件夹或文件名，过滤 Windows / POSIX 非法字符并防止目录穿越
 */
export function sanitizePathSegment(segment, fallback = 'default') {
  if (!segment || typeof segment !== 'string') return fallback;
  const clean = segment
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^\.+/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return clean || fallback;
}

export function sanitizeFileName(fileName, fallback = 'output.dat') {
  if (!fileName || typeof fileName !== 'string') return fallback;
  const clean = fileName
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 150);
  return clean || fallback;
}

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
 * 解析当前任务/对话的最终产物落盘目录
 * 
 * 路由规则：
 * 1. 规则 B (自定义模式): 若全局设置了 customOutputDir (产物根目录)
 *    -> 输出到: <customOutputDir>/<项目标题>/<threadId>/
 * 2. 规则 A (默认模式): 若未配置或留空
 *    -> 输出到: <projectWorkDir>/outputs/<threadId>/
 * 
 * @param {object} params
 * @param {string} params.projectId 项目 ID
 * @param {string} [params.threadId='main'] 对话/线程 ID
 * @returns {Promise<string>} 绝对落盘路径
 */
export async function resolveArtifactOutputDir({ projectId, threadId = 'main' }) {
  if (!projectId) throw new Error('projectId is required to resolve output directory');

  const settings = await storage.getSystemSettings().catch(() => ({}));
  const project = await storage.getProject(projectId).catch(() => null);

  const safeProjectTitle = sanitizePathSegment(project?.title || projectId, projectId);
  const safeThreadId = sanitizePathSegment(threadId || 'main', 'main');

  // 规则 B: 用户设置了自定义全局产物根目录
  if (settings?.customOutputDir && typeof settings.customOutputDir === 'string' && settings.customOutputDir.trim()) {
    const customRoot = path.resolve(settings.customOutputDir.trim());
    const targetDir = path.join(customRoot, safeProjectTitle, safeThreadId);
    await ensureDir(targetDir);
    return targetDir;
  }

  // 规则 A: 默认输出在项目沙箱内部各对话独立目录
  const projectWorkDir = await storage.getProjectWorkDir(projectId).catch(() => {
    return path.join(config.paths.projectsRoot, projectId);
  });
  const defaultDir = path.join(projectWorkDir, 'outputs', safeThreadId);
  await ensureDir(defaultDir);
  return defaultDir;
}

/**
 * 强约束落盘门面：专管最终用户交付物写入
 * 
 * @param {object} params
 * @param {string} params.projectId
 * @param {string} [params.threadId='main']
 * @param {string} params.fileName
 * @param {Buffer|string|Uint8Array} params.data
 * @returns {Promise<{ filePath: string, fileName: string, outputDir: string, projectId: string, threadId: string }>}
 */
export async function saveArtifactOutput({ projectId, threadId = 'main', fileName, data }) {
  if (!fileName) throw new Error('fileName is required for saveArtifactOutput');
  const safeFileName = sanitizeFileName(fileName, `output_${Date.now()}`);
  const outputDir = await resolveArtifactOutputDir({ projectId, threadId });
  const finalFilePath = path.join(outputDir, safeFileName);

  if (typeof data === 'string' || Buffer.isBuffer(data) || data instanceof Uint8Array) {
    await fs.writeFile(finalFilePath, data);
  } else if (data && typeof data === 'object') {
    await fs.writeFile(finalFilePath, JSON.stringify(data, null, 2), 'utf-8');
  } else {
    throw new Error('Unsupported data payload type for saveArtifactOutput');
  }

  return {
    filePath: finalFilePath,
    fileName: safeFileName,
    outputDir,
    projectId,
    threadId
  };
}

/**
 * 强约束落盘门面：专管音视频/多模态底层分析持久化落盘
 * 完全锁死在 %LOCALAPPDATA%\MeocoxFlow\storage\assets\<fingerprint>\，保证外部资料库纯净只读
 * 
 * @param {string} mediaFingerprint 媒体指纹
 * @param {object} cachePayload
 */
export async function saveAssetCache(mediaFingerprint, { specs = null, vision = null, transcription = null, raw = null } = {}) {
  if (!mediaFingerprint) throw new Error('mediaFingerprint is required');
  const safeMfp = sanitizePathSegment(mediaFingerprint, 'unknown_mfp');
  const targetDir = path.join(config.paths.storageDir, 'assets', safeMfp);
  await ensureDir(targetDir);

  if (specs) {
    await fs.writeFile(path.join(targetDir, 'meta.json'), JSON.stringify(specs, null, 2), 'utf-8');
  }
  if (vision || transcription || raw) {
    const payload = raw || { vision, transcription, cachedAt: Date.now() };
    await fs.writeFile(path.join(targetDir, 'perception.json'), JSON.stringify(payload, null, 2), 'utf-8');
  }

  return targetDir;
}
