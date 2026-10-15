import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// In-memory fast cache: `${filePath}:${size}:${mtimeMs}` -> mediaId
const fingerprintCache = new Map();

/**
 * Determine high-level media type from extension
 * @param {string} filePath 
 * @returns {'video'|'audio'|'image'|'other'}
 */
export function detectMediaType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.mp4', '.mov', '.mkv', '.avi', '.flv', '.webm', '.ts', '.m4v'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.aac', '.flac', '.ogg', '.m4a', '.wma'].includes(ext)) return 'audio';
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg', '.tiff'].includes(ext)) return 'image';
  return 'other';
}

/**
 * Fast composite media fingerprint (< 5ms)
 * Combines file size + mtime + sampled head/mid/tail buffers.
 * Supported across video, audio, image.
 * 
 * @param {string} filePath Absolute or relative path to media file
 * @param {string} [mediaType] Optional media type hint ('video'|'audio'|'image')
 * @returns {Promise<string>} e.g. "mfp_a1b2c3d4e5f67890"
 */
export async function computeMediaFingerprint(filePath, mediaType) {
  const stats = await fs.stat(filePath);
  const size = stats.size;
  const mtimeMs = Math.floor(stats.mtimeMs);
  const type = mediaType || detectMediaType(filePath);

  const cacheKey = `${filePath}:${size}:${mtimeMs}`;
  if (fingerprintCache.has(cacheKey)) {
    return fingerprintCache.get(cacheKey);
  }

  // Sample size: up to 64KB
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
  hash.update(`TYPE:${type}|SIZE:${size}|MTIME:${mtimeMs}|`);
  hash.update(headBuf);
  hash.update(midBuf);
  hash.update(tailBuf);

  const mediaId = `mfp_${hash.digest('hex').slice(0, 16)}`;
  fingerprintCache.set(cacheKey, mediaId);
  return mediaId;
}

/**
 * Clear the in-memory lookup cache (useful for tests)
 */
export function clearFingerprintCache() {
  fingerprintCache.clear();
}
