import EventEmitter from 'node:events';
import { perceptionStorage } from './storage.js';
import { detectMediaType } from './fingerprint.js';
import { VideoAnalyzer } from './analyzers/videoAnalyzer.js';
import { ImageAnalyzer } from './analyzers/imageAnalyzer.js';
import { AudioAnalyzer } from './analyzers/audioAnalyzer.js';
import { semanticSearchEngine } from './semanticSearch.js';

export class PerceptionQueue extends EventEmitter {
  constructor({ concurrency = 2 } = {}) {
    super();
    this.concurrency = concurrency;
    this.activeWorkers = 0;
    this.queue = []; // Array of job objects
    this.jobs = new Map(); // mediaId -> job state

    // Analyzers registry
    this.analyzers = {
      video: new VideoAnalyzer(),
      image: new ImageAnalyzer(),
      audio: new AudioAnalyzer()
    };
  }

  /**
   * Get an analyzer by media type
   */
  getAnalyzer(mediaType) {
    return this.analyzers[mediaType] || this.analyzers.video;
  }

  /**
   * Add a media analysis job to queue
   * @param {string} mediaId 
   * @param {string} filePath 
   * @param {object} [options] 
   * @param {'high'|'normal'} [options.priority='normal']
   * @param {object} [options.customConfig]
   * @returns {Promise<object>} Resolves to perception data
   */
  enqueue(mediaId, filePath, options = {}) {
    const priority = options.priority || 'normal';

    // 1. Deduplication: check if already active or queued
    if (this.jobs.has(mediaId)) {
      const existing = this.jobs.get(mediaId);
      if (existing.status === 'queued' || existing.status === 'processing') {
        // Upgrade priority if requesting high priority
        if (priority === 'high' && existing.priority !== 'high') {
          existing.priority = 'high';
          const idx = this.queue.indexOf(existing);
          if (idx > 0) {
            this.queue.splice(idx, 1);
            this.queue.unshift(existing);
          }
        }
        return existing.promise;
      }
      if (existing.status === 'completed' && existing.result) {
        return Promise.resolve(existing.result);
      }
    }

    // 2. Create new job deferred promise
    let resolveJob, rejectJob;
    const promise = new Promise((resolve, reject) => {
      resolveJob = resolve;
      rejectJob = reject;
    });

    const mediaType = options.mediaType || detectMediaType(filePath);
    const job = {
      mediaId,
      filePath,
      mediaType,
      priority,
      options,
      status: 'queued',
      progress: 0,
      enqueuedAt: Date.now(),
      promise,
      resolve: resolveJob,
      reject: rejectJob,
      result: null,
      error: null
    };

    this.jobs.set(mediaId, job);

    if (priority === 'high') {
      this.queue.unshift(job);
    } else {
      this.queue.push(job);
    }

    this.emit('job:queued', { mediaId, filePath, mediaType, priority });
    this.scheduleNext();

    return promise;
  }

  /**
   * Schedule worker execution
   */
  scheduleNext() {
    while (this.activeWorkers < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      this.executeJob(job);
    }
  }

  /**
   * Execute single analysis job
   */
  async executeJob(job) {
    this.activeWorkers++;
    job.status = 'processing';
    job.startedAt = Date.now();
    this.emit('job:started', { mediaId: job.mediaId, filePath: job.filePath, mediaType: job.mediaType });

    try {
      const analyzer = this.getAnalyzer(job.mediaType);
      
      this.emit('job:progress', { mediaId: job.mediaId, progress: 20, stage: 'probing' });

      // Run analyzer
      const { meta, perception } = await analyzer.analyze(job.mediaId, job.filePath, job.options);

      this.emit('job:progress', { mediaId: job.mediaId, progress: 80, stage: 'saving' });

      // Save to CAS storage
      await perceptionStorage.saveMeta(job.mediaId, meta);
      await perceptionStorage.savePerception(job.mediaId, perception);

      // Index in zero-setup semantic search engine
      semanticSearchEngine.indexAsset(job.mediaId, meta, perception).catch(() => {});

      job.status = 'completed';
      job.result = perception;
      job.completedAt = Date.now();

      this.emit('job:completed', { mediaId: job.mediaId, perception });
      job.resolve(perception);
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
      this.emit('job:failed', { mediaId: job.mediaId, error: err.message });
      job.reject(err);
    } finally {
      this.activeWorkers--;
      this.cleanup();
      this.scheduleNext();
    }
  }

  /**
   * Query status of a mediaId
   * @param {string} mediaId 
   * @returns {{ status: string, job: object|null }}
   */
  getStatus(mediaId) {
    if (this.jobs.has(mediaId)) {
      const j = this.jobs.get(mediaId);
      return {
        status: j.status,
        progress: j.progress,
        error: j.error,
        result: j.result
      };
    }
    return { status: 'idle', progress: 0, error: null, result: null };
  }

  /**
   * Clean up old finished jobs from memory map (keep last 500)
   */
  cleanup(limit = 500) {
    if (this.jobs.size > limit) {
      const completedEntries = Array.from(this.jobs.entries())
        .filter(([_, j]) => j.status === 'completed' || j.status === 'failed')
        .slice(0, this.jobs.size - limit);
      for (const [id] of completedEntries) {
        this.jobs.delete(id);
      }
    }
  }
}

export const perceptionQueue = new PerceptionQueue();
