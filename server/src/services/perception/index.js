import { computeMediaFingerprint, detectMediaType } from './fingerprint.js';
import { perceptionStorage } from './storage.js';
import { perceptionQueue } from './queue.js';
import { semanticSearchEngine } from './semanticSearch.js';

export class PerceptionEngine {
  constructor({ storage = perceptionStorage, queue = perceptionQueue } = {}) {
    this.storage = storage;
    this.queue = queue;
    this.events = this.queue;
  }

  /**
   * Get or compute mediaId for a file
   */
  async getMediaId(filePath, mediaType) {
    return await computeMediaFingerprint(filePath, mediaType);
  }

  /**
   * Ensure a media file has been analyzed.
   * If already analyzed, returns cached result instantly.
   * Otherwise, enqueues with high priority and awaits completion.
   * 
   * @param {string} filePath Absolute or relative path to media file
   * @param {object} [options]
   * @param {'high'|'normal'} [options.priority='high']
   * @param {object} [options.customConfig]
   * @returns {Promise<object>} Perception result
   */
  async ensureAnalyzed(filePath, options = {}) {
    const mediaId = await this.getMediaId(filePath, options.mediaType);

    // 1. Instant cache hit
    if (await this.storage.hasPerception(mediaId)) {
      return await this.storage.readPerception(mediaId);
    }

    // 2. Queue with high priority and await
    const priority = options.priority || 'high';
    return await this.queue.enqueue(mediaId, filePath, { ...options, priority });
  }

  /**
   * Non-blocking background enqueue for a single media file
   * @param {string} filePath 
   * @param {object} [options] 
   * @returns {Promise<{ mediaId: string, status: string }>}
   */
  async enqueue(filePath, options = {}) {
    const mediaId = await this.getMediaId(filePath, options.mediaType);

    if (await this.storage.hasPerception(mediaId)) {
      return { mediaId, status: 'completed' };
    }

    this.queue.enqueue(mediaId, filePath, { ...options, priority: options.priority || 'normal' });
    return { mediaId, status: 'queued' };
  }

  /**
   * Non-blocking batch enqueue
   * @param {string[]} filePaths 
   * @param {object} [options] 
   * @returns {Promise<{ total: number, queued: number, cached: number, items: Array<{ filePath: string, mediaId: string, status: string }> }>}
   */
  async enqueueBatch(filePaths, options = {}) {
    const items = [];
    let queued = 0;
    let cached = 0;

    for (const fPath of filePaths) {
      try {
        const mediaId = await this.getMediaId(fPath, options.mediaType);
        if (await this.storage.hasPerception(mediaId)) {
          cached++;
          items.push({ filePath: fPath, mediaId, status: 'completed' });
        } else {
          queued++;
          this.queue.enqueue(mediaId, fPath, { ...options, priority: options.priority || 'normal' });
          items.push({ filePath: fPath, mediaId, status: 'queued' });
        }
      } catch (err) {
        items.push({ filePath: fPath, mediaId: null, status: 'failed', error: err.message });
      }
    }

    return {
      total: filePaths.length,
      queued,
      cached,
      items
    };
  }

  /**
   * Query status of a mediaId
   * @param {string} mediaId 
   * @returns {Promise<{ mediaId: string, status: 'completed'|'processing'|'queued'|'unprocessed'|'failed', progress: number, perception?: object }>}
   */
  async getStatus(mediaId) {
    if (!mediaId) {
      return { mediaId: null, status: 'unprocessed', progress: 0 };
    }

    // 1. Check in-memory queue state
    const jobState = this.queue.getStatus(mediaId);
    if (jobState.status === 'processing' || jobState.status === 'queued') {
      return {
        mediaId,
        status: jobState.status,
        progress: jobState.progress
      };
    }

    // 2. Check storage
    if (await this.storage.hasPerception(mediaId)) {
      const perception = await this.storage.readPerception(mediaId);
      return {
        mediaId,
        status: 'completed',
        progress: 100,
        perception
      };
    }

    if (jobState.status === 'failed') {
      return {
        mediaId,
        status: 'failed',
        progress: 0,
        error: jobState.error
      };
    }

    return {
      mediaId,
      status: 'unprocessed',
      progress: 0
    };
  }

  /**
   * Batch query statuses
   */
  async getBatchStatus(mediaIds) {
    const results = {};
    for (const id of mediaIds) {
      results[id] = await this.getStatus(id);
    }
    return results;
  }

  /**
   * Read raw perception data for mediaId
   */
  async getPerception(mediaId) {
    return await this.storage.readPerception(mediaId);
  }

  /**
   * Zero-setup semantic search
   */
  async search(query, options = {}) {
    return await semanticSearchEngine.search(query, options);
  }
}

export const perceptionEngine = new PerceptionEngine();
export { computeMediaFingerprint, detectMediaType } from './fingerprint.js';
export { perceptionStorage } from './storage.js';
export { perceptionQueue } from './queue.js';
export { semanticSearchEngine } from './semanticSearch.js';
