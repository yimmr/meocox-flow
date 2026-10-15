import fs from 'node:fs';
import path from 'node:path';
import EventEmitter from 'node:events';
import https from 'node:https';
import http from 'node:http';
import { getModelPresetDir, inspectModelPreset } from './paths.js';

export class ModelDownloader extends EventEmitter {
  constructor() {
    super();
    this.activeTask = null;
    this.currentReq = null;
    this.isCancelled = false;
  }

  getStatus() {
    if (!this.activeTask) {
      return {
        active: false,
        modelId: null,
        status: 'idle',
        percent: 0,
        speedMbps: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        currentFile: null,
        error: null
      };
    }
    return { ...this.activeTask };
  }

  /**
   * Cancel ongoing download task
   */
  cancel() {
    if (this.activeTask) {
      this.isCancelled = true;
      if (this.currentReq) {
        this.currentReq.destroy();
        this.currentReq = null;
      }
      this.activeTask.status = 'cancelled';
      this.activeTask.active = false;
      this.emit('cancelled', { modelId: this.activeTask.modelId });
      return true;
    }
    return false;
  }

  /**
   * Start downloading a model preset (model file + mmproj file)
   */
  async downloadPreset(presetId, options = {}) {
    if (this.activeTask && this.activeTask.active) {
      throw new Error(`Another download is already in progress: ${this.activeTask.modelId}`);
    }

    const preset = inspectModelPreset(presetId);
    if (!preset) {
      throw new Error(`Unknown model preset: ${presetId}`);
    }

    if (preset.isReady) {
      return { success: true, message: 'Model is already downloaded and ready', preset };
    }

    this.isCancelled = false;
    const useMirror = options.useMirror !== false; // default true for high speed in China
    const baseHost = useMirror ? 'https://hf-mirror.com' : 'https://huggingface.co';

    const filesToDownload = [];
    if (!preset.modelExists || preset.modelSize < 1000000) {
      filesToDownload.push({
        name: preset.modelFile,
        targetPath: preset.modelPath,
        url: `${baseHost}/${preset.hfRepo}/resolve/main/${preset.modelFile}`,
        expectedSize: preset.modelSizeBytes
      });
    }
    if (!preset.mmprojExists || preset.mmprojSize < 1000000) {
      filesToDownload.push({
        name: preset.mmprojFile,
        targetPath: preset.mmprojPath,
        url: `${baseHost}/${preset.hfRepo}/resolve/main/${preset.mmprojFile}`,
        expectedSize: preset.mmprojSizeBytes
      });
    }

    const totalBytesAll = filesToDownload.reduce((acc, f) => acc + f.expectedSize, 0);

    this.activeTask = {
      active: true,
      modelId: presetId,
      status: 'downloading',
      percent: 0,
      speedMbps: 0,
      downloadedBytes: 0,
      totalBytes: totalBytesAll,
      currentFile: filesToDownload[0]?.name || null,
      error: null,
      startedAt: Date.now()
    };

    this.emit('started', this.getStatus());

    try {
      let cumulativeBytesDownloaded = 0;

      for (const fileItem of filesToDownload) {
        if (this.isCancelled) break;

        this.activeTask.currentFile = fileItem.name;
        this.emit('file-started', { file: fileItem.name });

        await this._downloadSingleFile(fileItem.url, fileItem.targetPath, (bytesDelta, currentSpeed) => {
          cumulativeBytesDownloaded += bytesDelta;
          const percent = totalBytesAll > 0 
            ? Number(((cumulativeBytesDownloaded / totalBytesAll) * 100).toFixed(1)) 
            : 0;

          this.activeTask.downloadedBytes = cumulativeBytesDownloaded;
          this.activeTask.percent = Math.min(100, percent);
          this.activeTask.speedMbps = currentSpeed;

          this.emit('progress', this.getStatus());
        });
      }

      if (this.isCancelled) {
        this.activeTask.status = 'cancelled';
        this.activeTask.active = false;
        return { success: false, cancelled: true };
      }

      this.activeTask.status = 'completed';
      this.activeTask.percent = 100;
      this.activeTask.active = false;
      this.emit('completed', this.getStatus());

      return { success: true, preset: inspectModelPreset(presetId) };
    } catch (err) {
      this.activeTask.status = 'error';
      this.activeTask.active = false;
      this.activeTask.error = err.message;
      this.emit('error', { error: err.message });
      throw err;
    }
  }

  /**
   * Download a single file with redirects following and temp file staging
   */
  _downloadSingleFile(fileUrl, targetPath, onProgress) {
    return new Promise((resolve, reject) => {
      const partPath = `${targetPath}.part`;

      // Check existing part file size for potential resume
      let startBytes = 0;
      if (fs.existsSync(partPath)) {
        try {
          startBytes = fs.statSync(partPath).size;
        } catch {}
      }

      const fetchWithRedirects = (currentUrl, redirectCount = 0) => {
        if (redirectCount > 8) {
          return reject(new Error('Too many redirects while downloading model file'));
        }
        if (this.isCancelled) {
          return resolve();
        }

        const parsedUrl = new URL(currentUrl);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const headers = {
          'User-Agent': 'MeocoxFlow/1.0.0 (Local-Engine-Downloader)'
        };
        if (startBytes > 0) {
          headers['Range'] = `bytes=${startBytes}-`;
        }

        const req = client.get(parsedUrl, { headers }, (res) => {
          // Handle redirects (301, 302, 307, 308)
          if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
            const redirectUrl = res.headers.location;
            if (!redirectUrl) {
              return reject(new Error(`Redirect response without location header: ${res.statusCode}`));
            }
            const absoluteUrl = new URL(redirectUrl, currentUrl).href;
            res.resume();
            return fetchWithRedirects(absoluteUrl, redirectCount + 1);
          }

          if (res.statusCode !== 200 && res.statusCode !== 206) {
            res.resume();
            return reject(new Error(`Download failed with HTTP ${res.statusCode} from ${currentUrl}`));
          }

          const fileStream = fs.createWriteStream(partPath, {
            flags: res.statusCode === 206 ? 'a' : 'w'
          });

          let lastTick = Date.now();
          let bytesSinceLastTick = 0;

          res.on('data', (chunk) => {
            if (this.isCancelled) {
              req.destroy();
              fileStream.close();
              return resolve();
            }

            fileStream.write(chunk);
            bytesSinceLastTick += chunk.length;

            const now = Date.now();
            if (now - lastTick >= 400) {
              const seconds = (now - lastTick) / 1000;
              const speedMbps = Number(((bytesSinceLastTick / seconds / 1024 / 1024) * 8).toFixed(2));
              onProgress(bytesSinceLastTick, speedMbps);
              bytesSinceLastTick = 0;
              lastTick = now;
            }
          });

          res.on('end', () => {
            fileStream.end(async () => {
              if (this.isCancelled) {
                return resolve();
              }
              if (bytesSinceLastTick > 0) {
                onProgress(bytesSinceLastTick, 0);
              }
              try {
                if (fs.existsSync(targetPath)) {
                  fs.unlinkSync(targetPath);
                }
                fs.renameSync(partPath, targetPath);
                resolve();
              } catch (renameErr) {
                reject(renameErr);
              }
            });
          });

          res.on('error', (err) => {
            fileStream.close();
            reject(err);
          });
        });

        req.on('error', (err) => {
          reject(err);
        });

        this.currentReq = req;
      };

      fetchWithRedirects(fileUrl);
    });
  }
}

export const modelDownloader = new ModelDownloader();
