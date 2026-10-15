import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';

const STORAGE_ROOT = path.join(config.paths.storageDir, 'assets');

/**
 * Ensure a directory exists safely
 */
async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

/**
 * Safe JSON file reader with fallback
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
 * Atomic JSON write via temporary file
 */
async function writeJsonAtomic(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  try {
    await fs.rename(tempPath, filePath);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      await new Promise(r => setTimeout(r, 20));
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

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * CAS Storage manager for perception outputs
 */
export class PerceptionStorage {
  constructor(storageRoot = STORAGE_ROOT) {
    this.storageRoot = storageRoot;
  }

  /**
   * Get physical directory for a specific mediaId
   * @param {string} mediaId 
   * @returns {string}
   */
  getMediaDir(mediaId) {
    const safeId = String(mediaId).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.storageRoot, safeId);
  }

  /**
   * Check if perception.json exists for a mediaId
   * @param {string} mediaId 
   * @returns {Promise<boolean>}
   */
  async hasPerception(mediaId) {
    const pPath = path.join(this.getMediaDir(mediaId), 'perception.json');
    try {
      await fs.access(pPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read perception.json for a mediaId
   * @param {string} mediaId 
   * @returns {Promise<object|null>}
   */
  async readPerception(mediaId) {
    const pPath = path.join(this.getMediaDir(mediaId), 'perception.json');
    const data = await readJson(pPath, null);
    if (data) {
      // Background non-blocking touch of lastAccessedAt in meta.json
      this.touchAccess(mediaId).catch(() => {});
    }
    return data;
  }

  /**
   * Update lastAccessedAt in meta.json
   */
  async touchAccess(mediaId) {
    const meta = await this.readMeta(mediaId);
    if (meta) {
      meta.lastAccessedAt = Date.now();
      meta.accessCount = (meta.accessCount || 0) + 1;
      const mPath = path.join(this.getMediaDir(mediaId), 'meta.json');
      await writeJsonAtomic(mPath, meta);
    }
  }

  /**
   * Save perception.json atomically
   * @param {string} mediaId 
   * @param {object} data 
   */
  async savePerception(mediaId, data) {
    const dir = this.getMediaDir(mediaId);
    await ensureDir(dir);
    const pPath = path.join(dir, 'perception.json');
    await writeJsonAtomic(pPath, data);
  }

  /**
   * Check if meta.json exists
   * @param {string} mediaId 
   * @returns {Promise<boolean>}
   */
  async hasMeta(mediaId) {
    const mPath = path.join(this.getMediaDir(mediaId), 'meta.json');
    try {
      await fs.access(mPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read meta.json
   * @param {string} mediaId 
   * @returns {Promise<object|null>}
   */
  async readMeta(mediaId) {
    const mPath = path.join(this.getMediaDir(mediaId), 'meta.json');
    return await readJson(mPath, null);
  }

  /**
   * Save meta.json atomically
   * @param {string} mediaId 
   * @param {object} meta 
   */
  async saveMeta(mediaId, meta) {
    const dir = this.getMediaDir(mediaId);
    await ensureDir(dir);
    const mPath = path.join(dir, 'meta.json');
    const enriched = {
      ...meta,
      lastAccessedAt: Date.now(),
      updatedAt: Date.now()
    };
    await writeJsonAtomic(mPath, enriched);
  }

  /**
   * Save an artifact (thumbnail, waveform, etc.) under mediaId/artifacts/
   * @param {string} mediaId 
   * @param {string} filename 
   * @param {Buffer|string} content 
   * @returns {Promise<string>} Full path of the saved artifact
   */
  async saveArtifact(mediaId, filename, content) {
    const safeFilename = path.basename(filename);
    const artifactsDir = path.join(this.getMediaDir(mediaId), 'artifacts');
    await ensureDir(artifactsDir);
    const filePath = path.join(artifactsDir, safeFilename);
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempPath, content);
    await fs.rename(tempPath, filePath);
    return filePath;
  }

  /**
   * Get full path to an artifact if it exists
   * @param {string} mediaId 
   * @param {string} filename 
   * @returns {string}
   */
  getArtifactPath(mediaId, filename) {
    const safeFilename = path.basename(filename);
    return path.join(this.getMediaDir(mediaId), 'artifacts', safeFilename);
  }

  /**
   * Get comprehensive storage statistics across CAS storage
   * @returns {Promise<object>}
   */
  async getStorageStats() {
    await ensureDir(this.storageRoot);
    let totalBytes = 0;
    let artifactsBytes = 0;
    let metadataBytes = 0;
    let artifactFilesCount = 0;
    let orphanedCount = 0;
    const orphanedMediaIds = [];
    const byType = { video: 0, audio: 0, image: 0, other: 0 };

    let entries = [];
    try {
      entries = await fs.readdir(this.storageRoot, { withFileTypes: true });
    } catch {
      entries = [];
    }

    const mediaDirs = entries.filter(e => e.isDirectory());

    for (const d of mediaDirs) {
      const mediaId = d.name;
      const mediaDirPath = path.join(this.storageRoot, mediaId);

      const metaPath = path.join(mediaDirPath, 'meta.json');
      const perceptionPath = path.join(mediaDirPath, 'perception.json');
      const artifactsDirPath = path.join(mediaDirPath, 'artifacts');

      let meta = null;
      try {
        const metaStat = await fs.stat(metaPath);
        metadataBytes += metaStat.size;
        totalBytes += metaStat.size;
        meta = await readJson(metaPath, null);
      } catch {}

      try {
        const pStat = await fs.stat(perceptionPath);
        metadataBytes += pStat.size;
        totalBytes += pStat.size;
      } catch {}

      if (meta?.mediaType && byType[meta.mediaType] !== undefined) {
        byType[meta.mediaType]++;
      } else {
        byType.other++;
      }

      // Check if original source file is orphaned
      if (meta?.originalPath || meta?.fileInfo?.originalPath) {
        const orig = meta.originalPath || meta.fileInfo.originalPath;
        if (!fsSync.existsSync(orig)) {
          orphanedCount++;
          orphanedMediaIds.push(mediaId);
        }
      }

      // Scan artifacts/
      try {
        const artFiles = await fs.readdir(artifactsDirPath, { withFileTypes: true });
        for (const af of artFiles) {
          if (af.isFile()) {
            const afStat = await fs.stat(path.join(artifactsDirPath, af.name)).catch(() => null);
            if (afStat) {
              artifactFilesCount++;
              artifactsBytes += afStat.size;
              totalBytes += afStat.size;
            }
          }
        }
      } catch {}
    }

    return {
      storageRoot: this.storageRoot,
      totalBytes,
      totalFormatted: formatBytes(totalBytes),
      artifactsBytes,
      artifactsFormatted: formatBytes(artifactsBytes),
      metadataBytes,
      metadataFormatted: formatBytes(metadataBytes),
      mediaCount: mediaDirs.length,
      artifactFilesCount,
      orphanedCount,
      orphanedMediaIds,
      byType
    };
  }

  /**
   * L1 Safe Slimming: Delete derivative artifacts (thumbnails, keyframes)
   * while keeping meta.json and perception.json intact!
   * @param {object} [options]
   * @param {number} [options.olderThanDays=0]
   * @param {string[]} [options.mediaIds=null]
   * @returns {Promise<{ success: boolean, freedBytes: number, freedFormatted: string, deletedFilesCount: number }>}
   */
  async cleanArtifacts({ olderThanDays = 0, mediaIds = null } = {}) {
    await ensureDir(this.storageRoot);
    let freedBytes = 0;
    let deletedFilesCount = 0;

    const entries = await fs.readdir(this.storageRoot, { withFileTypes: true }).catch(() => []);
    const targetDirs = entries
      .filter(e => e.isDirectory())
      .filter(e => !mediaIds || mediaIds.includes(e.name));

    const cutoffMs = olderThanDays > 0 ? Date.now() - olderThanDays * 86400 * 1000 : null;

    for (const d of targetDirs) {
      const artifactsDirPath = path.join(this.storageRoot, d.name, 'artifacts');
      try {
        const files = await fs.readdir(artifactsDirPath, { withFileTypes: true });
        for (const f of files) {
          if (f.isFile()) {
            const fPath = path.join(artifactsDirPath, f.name);
            const stat = await fs.stat(fPath).catch(() => null);
            if (stat) {
              if (cutoffMs && stat.mtimeMs > cutoffMs) {
                continue;
              }
              await fs.unlink(fPath).catch(() => {});
              freedBytes += stat.size;
              deletedFilesCount++;
            }
          }
        }
      } catch {}
    }

    return {
      success: true,
      freedBytes,
      freedFormatted: formatBytes(freedBytes),
      deletedFilesCount
    };
  }

  /**
   * L2 Cleanup: Delete CAS directories for media whose original source file was removed
   * @returns {Promise<{ success: boolean, freedBytes: number, freedFormatted: string, deletedDirsCount: number }>}
   */
  async cleanOrphaned() {
    const stats = await this.getStorageStats();
    let freedBytes = 0;
    let deletedDirsCount = 0;

    for (const mediaId of stats.orphanedMediaIds) {
      const mediaDirPath = path.join(this.storageRoot, mediaId);
      try {
        // Calculate size of this directory before deleting
        const dirSize = await this.calculateDirSize(mediaDirPath);
        await fs.rm(mediaDirPath, { recursive: true, force: true });
        freedBytes += dirSize;
        deletedDirsCount++;
      } catch {}
    }

    return {
      success: true,
      freedBytes,
      freedFormatted: formatBytes(freedBytes),
      deletedDirsCount
    };
  }

  /**
   * Auto LRU Enforcement: Evict oldest artifacts when total cache exceeds quota
   * @param {number} maxSizeBytes
   * @returns {Promise<{ evictedCount: number, freedBytes: number, freedFormatted: string }>}
   */
  async enforceLru(maxSizeBytes) {
    const stats = await this.getStorageStats();
    if (stats.totalBytes <= maxSizeBytes) {
      return { evictedCount: 0, freedBytes: 0, freedFormatted: '0 B' };
    }

    // List all media with lastAccessedAt
    const items = [];
    const entries = await fs.readdir(this.storageRoot, { withFileTypes: true }).catch(() => []);
    for (const d of entries) {
      if (d.isDirectory()) {
        const meta = await this.readMeta(d.name);
        items.push({
          mediaId: d.name,
          lastAccessedAt: meta?.lastAccessedAt || meta?.updatedAt || 0
        });
      }
    }

    // Sort ascending (oldest accessed first)
    items.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

    let freedBytes = 0;
    let evictedCount = 0;
    let currentBytes = stats.totalBytes;

    for (const item of items) {
      if (currentBytes <= maxSizeBytes) break;
      const res = await this.cleanArtifacts({ mediaIds: [item.mediaId] });
      if (res.freedBytes > 0) {
        freedBytes += res.freedBytes;
        currentBytes -= res.freedBytes;
        evictedCount++;
      }
    }

    return {
      evictedCount,
      freedBytes,
      freedFormatted: formatBytes(freedBytes)
    };
  }

  /**
   * Helper: calculate directory size recursively
   */
  async calculateDirSize(dirPath) {
    let size = 0;
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const e of entries) {
        const full = path.join(dirPath, e.name);
        if (e.isDirectory()) {
          size += await this.calculateDirSize(full);
        } else if (e.isFile()) {
          const stat = await fs.stat(full).catch(() => null);
          if (stat) size += stat.size;
        }
      }
    } catch {}
    return size;
  }
}

export const perceptionStorage = new PerceptionStorage();
