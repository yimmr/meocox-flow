import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

const CACHE_DIR = path.join(config.paths.cacheDir, 'assets');

async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
}

/**
 * Compute fast composite media fingerprint (< 5ms)
 * Combines file size + mtime + first 64KB + mid 64KB + tail 64KB
 */
export async function computeFastMediaFingerprint(filePath) {
  const stats = await fs.stat(filePath);
  const size = stats.size;
  const mtimeMs = stats.mtimeMs;

  const sampleSize = Math.min(64 * 1024, size);
  const headBuf = Buffer.alloc(sampleSize);
  const midBuf = Buffer.alloc(sampleSize);
  const tailBuf = Buffer.alloc(sampleSize);

  let fd;
  try {
    fd = fsSync.openSync(filePath, 'r');
    // 1. Read Head
    fsSync.readSync(fd, headBuf, 0, sampleSize, 0);

    // 2. Read Mid
    const midPos = Math.max(0, Math.floor(size / 2) - Math.floor(sampleSize / 2));
    fsSync.readSync(fd, midBuf, 0, sampleSize, midPos);

    // 3. Read Tail
    const tailPos = Math.max(0, size - sampleSize);
    fsSync.readSync(fd, tailBuf, 0, sampleSize, tailPos);
  } finally {
    if (fd !== undefined) {
      fsSync.closeSync(fd);
    }
  }

  const hash = crypto.createHash('sha1');
  hash.update(`SIZE:${size}|MTIME:${mtimeMs}|`);
  hash.update(headBuf);
  hash.update(midBuf);
  hash.update(tailBuf);

  return `mfp_${hash.digest('hex').slice(0, 16)}`;
}

/**
 * Get cached metadata & tags by fingerprint
 */
export async function getAssetCache(fingerprint) {
  if (!fingerprint) return null;
  await ensureCacheDir();
  const filePath = path.join(CACHE_DIR, `${fingerprint}.json`);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save asset metadata & tags to global cache
 */
export async function saveAssetCache(fingerprint, data) {
  if (!fingerprint) return;
  await ensureCacheDir();
  const filePath = path.join(CACHE_DIR, `${fingerprint}.json`);
  const cacheData = {
    ...data,
    fingerprint,
    updatedAt: Date.now()
  };
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tempPath, JSON.stringify(cacheData, null, 2), 'utf-8');
  await fs.rename(tempPath, filePath);
  return cacheData;
}
