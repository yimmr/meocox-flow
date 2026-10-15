import axios from 'axios';
import { localEngine } from '../perception/localEngine/index.js';
import { getLibraryModelById } from '../perception/localEngine/modelLibrary.js';

export class InstalledRunner {
  constructor() {
    this.engine = localEngine;
  }

  /**
   * Strip prefix to get clean preset ID
   * e.g. 'installed:qwen3-vl-4b' -> 'qwen3-vl-4b'
   */
  normalizeModelId(rawId) {
    if (!rawId) return 'qwen3-vl-4b';
    return String(rawId).replace(/^installed:/i, '').trim();
  }

  /**
   * Check if the given model preset is downloaded and installed in the app
   */
  isModelReady(rawId) {
    const cleanId = this.normalizeModelId(rawId);
    const model = getLibraryModelById(cleanId);
    return Boolean(model?.isInstalled && model?.enabled);
  }

  /**
   * Ensure local engine is running with target installed model
   */
  async ensureReady(rawId) {
    const cleanId = this.normalizeModelId(rawId);
    const model = getLibraryModelById(cleanId);

    if (!model || !model.isInstalled) {
      throw new Error(`应用模型未就绪: 模型 [${cleanId}] 尚未下载或导入，请在「设置-应用模型」中安装。`);
    }

    if (!model.enabled) {
      throw new Error(`应用模型已关闭停用: 模型 [${model.name}] 已在模型库中关闭，如需使用请先在「设置-应用模型」中开启。`);
    }

    if (this.engine.isReady() && this.engine.activeModelId === model.id) {
      return;
    }

    // Start or switch to target model
    await this.engine.start({ modelId: model.id });
  }

  /**
   * Non-streaming Chat Completion for installed models
   */
  async chat({ modelId, messages, temperature = 0.2, max_tokens = null, response_format = null }) {
    const presetId = this.normalizeModelId(modelId);
    await this.ensureReady(presetId);

    return await this.engine.chatCompletion({
      model: presetId,
      messages,
      temperature,
      max_tokens,
      response_format
    });
  }

  /**
   * Streaming Chat Completion for installed models via local llama-server
   */
  async stream({ modelId, messages, temperature = 0.7, max_tokens = null, onChunk, onComplete, onError }) {
    const presetId = this.normalizeModelId(modelId);
    try {
      await this.ensureReady(presetId);

      const endpoint = `http://127.0.0.1:${this.engine.port}/v1/chat/completions`;

      const requestData = {
        model: presetId,
        messages,
        stream: true,
        temperature
      };
      if (max_tokens) {
        requestData.max_tokens = max_tokens;
      }

      const response = await axios({
        method: 'post',
        url: endpoint,
        headers: { 'Content-Type': 'application/json' },
        data: requestData,
        responseType: 'stream',
        timeout: 120000
      });

      let buffer = '';

      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const textChunk = data.choices?.[0]?.delta?.content || '';
              if (textChunk && onChunk) {
                onChunk(textChunk);
              }
            } catch {}
          }
        }
      });

      response.data.on('end', () => {
        if (onComplete) onComplete();
      });

      response.data.on('error', (err) => {
        if (onError) onError(err);
      });
    } catch (err) {
      if (onError) onError(err);
      else throw err;
    }
  }
}

export const installedRunner = new InstalledRunner();
