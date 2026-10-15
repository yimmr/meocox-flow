import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import path from 'node:path';
import EventEmitter from 'node:events';
import axios from 'axios';
import { findLlamaServerBinary, inspectModelPreset, listAllModelPresets, getModelsBaseDir } from './paths.js';
import { getModelLibrary, getLibraryModelById } from './modelLibrary.js';
import { modelDownloader } from './modelDownloader.js';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);

export class LocalEngineManager extends EventEmitter {
  constructor() {
    super();
    this.binaryPath = findLlamaServerBinary();
    this.childProcess = null;
    this.port = 28999;
    this.status = 'stopped'; // 'stopped' | 'starting' | 'ready' | 'error'
    this.activeModelId = null;
    this.errorMessage = null;
    this.startedAt = null;
    this.lastActiveAt = null;
    this.gpuInfo = {
      detected: false,
      name: 'Scanning...',
      totalMiB: 0,
      freeMiB: 0
    };

    // Auto-clean on process termination
    this._setupExitHooks();

    // Initial background detection
    this.refreshGpuInfo().catch(() => {});
  }

  _setupExitHooks() {
    const cleanup = () => {
      if (this.childProcess) {
        try {
          this.childProcess.kill('SIGKILL');
        } catch {}
      }
    };
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('beforeExit', cleanup);
  }

  /**
   * Probe GPU hardware using llama-server --list-devices
   */
  async refreshGpuInfo() {
    this.binaryPath = findLlamaServerBinary();
    if (!this.binaryPath) {
      this.gpuInfo = { detected: false, name: '未检测到 llama-server 执行器', totalMiB: 0, freeMiB: 0 };
      return this.gpuInfo;
    }

    try {
      const { stdout } = await execFileAsync(this.binaryPath, ['--list-devices'], { timeout: 8000 });
      // Output format:
      // Available devices:
      //   Vulkan0: NVIDIA GeForce RTX 4060 (7956 MiB, 6214 MiB free)
      const match = stdout.match(/(?:Available devices:\s*)?([A-Za-z0-9_]+:\s+[^(\n\r]+?)\s*\((\d+)\s*MiB,\s*(\d+)\s*MiB free\)/i);
      if (match) {
        this.gpuInfo = {
          detected: true,
          name: match[1].trim(),
          totalMiB: Number(match[2]),
          freeMiB: Number(match[3]),
          raw: stdout.trim()
        };
      } else if (stdout.includes('RTX') || stdout.includes('GeForce') || stdout.includes('NVIDIA')) {
        this.gpuInfo = {
          detected: true,
          name: 'NVIDIA GPU (CUDA/Vulkan 加速已就绪)',
          totalMiB: 8192,
          freeMiB: 6144,
          raw: stdout.trim()
        };
      } else {
        this.gpuInfo = {
          detected: false,
          name: 'CPU 模式 (未检测到独立显卡加速)',
          totalMiB: 0,
          freeMiB: 0
        };
      }
    } catch (err) {
      this.gpuInfo = {
        detected: false,
        name: `检测显卡异常: ${err.message}`,
        totalMiB: 0,
        freeMiB: 0
      };
    }

    return this.gpuInfo;
  }

  /**
   * Get comprehensive status for UI
   */
  getStatus() {
    const library = getModelLibrary();
    return {
      runnerInstalled: Boolean(this.binaryPath),
      runnerPath: this.binaryPath,
      status: this.status,
      port: this.port,
      activeModelId: this.activeModelId,
      errorMessage: this.errorMessage,
      startedAt: this.startedAt,
      lastActiveAt: this.lastActiveAt,
      gpu: this.gpuInfo,
      library,
      models: listAllModelPresets(),
      modelsDir: getModelsBaseDir(),
      download: modelDownloader.getStatus()
    };
  }

  isReady() {
    return this.status === 'ready' && Boolean(this.childProcess);
  }

  /**
   * Start local llama-server engine with specified model
   */
  async start({ modelId = 'qwen3-vl-4b', port = 28999 } = {}) {
    if (this._startingPromise) {
      return this._startingPromise;
    }

    this._startingPromise = this._doStart({ modelId, port }).finally(() => {
      this._startingPromise = null;
    });

    return this._startingPromise;
  }

  async _doStart({ modelId = 'qwen3-vl-4b', port = 28999 } = {}) {
    this.binaryPath = findLlamaServerBinary();
    if (!this.binaryPath) {
      throw new Error('未在系统中找到 llama-server 执行器，请确保已安装或将其置于 server/bin/llama/ 目录');
    }

    const model = getLibraryModelById(modelId);
    if (!model) {
      throw new Error(`找不到指定的模型: ${modelId}`);
    }

    if (!model.isInstalled) {
      throw new Error(`模型权重未就绪，请先安装或下载: ${model.name}`);
    }

    if (!model.enabled) {
      throw new Error(`模型已被关闭停用，请先在应用模型库中开启: ${model.name}`);
    }

    // If already running with this model, verify health
    if (this.status === 'ready' && this.activeModelId === model.id && this.childProcess) {
      const healthy = await this._checkHealth(this.port);
      if (healthy) {
        return { success: true, message: '引擎已在运行中', status: this.getStatus() };
      }
    }

    // Stop current instance if running different model or unhealthy
    if (this.childProcess) {
      await this.stop();
    }

    this.port = port;
    this.status = 'starting';
    this.activeModelId = model.id;
    this.errorMessage = null;
    this.emit('status-change', this.getStatus());

    const args = [
      '-m', model.modelPath,
      '--host', '127.0.0.1',
      '--port', String(port),
      '-ngl', '99',                    // 99层全部卸载至显卡 (全显存加速)
      '--sleep-idle-seconds', '300',   // 闲置5分钟自动休眠释放显存
      '--cors-origins', '*',
      '-c', '8192'                     // 8K 上下文窗口
    ];

    if (model.mmprojPath && fs.existsSync(model.mmprojPath)) {
      args.push('--mmproj', model.mmprojPath);
    }

    try {
      this.childProcess = spawn(this.binaryPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });

      this.childProcess.stdout?.on('data', (d) => {
        // Can be routed to log if needed
      });

      this.childProcess.stderr?.on('data', (d) => {
        // Can be routed to log if needed
      });

      this.childProcess.on('exit', (code, signal) => {
        this.status = 'stopped';
        this.childProcess = null;
        this.emit('status-change', this.getStatus());
      });

      this.childProcess.on('error', (err) => {
        this.status = 'error';
        this.errorMessage = err.message;
        this.childProcess = null;
        this.emit('status-change', this.getStatus());
      });

      // Poll health check until ready (up to 45s)
      const isOnline = await this._pollUntilReady(port, 45000);
      if (!isOnline) {
        await this.stop();
        throw new Error('本地推理引擎启动超时，未在规定时间内返回健康信号');
      }

      this.status = 'ready';
      this.startedAt = Date.now();
      this.lastActiveAt = Date.now();
      this.emit('status-change', this.getStatus());

      return { success: true, message: '本地引擎已成功拉起并绑定 GPU', status: this.getStatus() };
    } catch (err) {
      this.status = 'error';
      this.errorMessage = err.message;
      this.emit('status-change', this.getStatus());
      throw err;
    }
  }

  /**
   * Stop local engine and release VRAM
   */
  async stop() {
    if (!this.childProcess) {
      this.status = 'stopped';
      return { success: true, message: '引擎已处于停止状态' };
    }

    const pid = this.childProcess.pid;
    try {
      this.childProcess.kill('SIGTERM');
    } catch {}

    // Wait up to 3 seconds for graceful stop
    const exitedGracefully = await new Promise((resolve) => {
      let count = 0;
      const interval = setInterval(() => {
        count++;
        if (!this.childProcess || count > 15) {
          clearInterval(interval);
          resolve(!this.childProcess);
        }
      }, 200);
    });

    if (!exitedGracefully && this.childProcess) {
      if (process.platform === 'win32' && pid) {
        try {
          await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
        } catch {}
      }
      try {
        this.childProcess?.kill('SIGKILL');
      } catch {}
    }

    this.childProcess = null;
    this.status = 'stopped';
    this.emit('status-change', this.getStatus());

    return { success: true, message: '本地引擎已关闭，显存已全部释放' };
  }

  /**
   * OpenAI compatible Chat Completions API proxy
   */
  async chatCompletion({ messages, temperature = 0.2, max_tokens = null, response_format = null, model = null }) {
    if (!this.isReady()) {
      // Check if a model is downloaded to auto-start
      const models = listAllModelPresets();
      const readyPreset = models.find(m => m.isReady);
      if (readyPreset) {
        await this.start({ modelId: readyPreset.id });
      } else {
        throw new Error('本地推理引擎未运行，且无已就绪的模型权重');
      }
    }

    this.lastActiveAt = Date.now();
    const endpoint = `http://127.0.0.1:${this.port}/v1/chat/completions`;

    const payload = {
      model: model || this.activeModelId || 'qwen3-vl',
      messages,
      temperature
    };
    if (max_tokens) {
      payload.max_tokens = max_tokens;
    }
    if (response_format) {
      payload.response_format = response_format;
    }

    const response = await axios.post(endpoint, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 120000 // 2 minutes timeout for complex video frames
    });

    return response.data;
  }

  _checkHealth(port) {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 1500 }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  async _pollUntilReady(port, maxWaitMs = 45000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      const ok = await this._checkHealth(port);
      if (ok) return true;
      await new Promise(r => setTimeout(r, 600));
    }
    return false;
  }
}

export const localEngine = new LocalEngineManager();
