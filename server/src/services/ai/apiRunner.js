import axios from 'axios';
import { formatCompletionsUrl } from '../ai.js';

export { formatCompletionsUrl };

export class ApiRunner {
  /**
   * Execute non-streaming Chat Completion against any OpenAI-compatible API endpoint
   */
  async chat({ baseUrl, apiKey, model, messages, temperature = 0.2, max_tokens = null, response_format = null, timeout = 60000 }) {
    if (!baseUrl) {
      throw new Error('API 执行器缺少目标 Base URL');
    }

    const targetUrl = formatCompletionsUrl(baseUrl);
    const key = (apiKey || '').trim();

    const headers = {
      'Content-Type': 'application/json',
    };
    if (key && key !== 'your_api_key_here') {
      headers['Authorization'] = `Bearer ${key}`;
    }

    const payload = {
      model,
      messages,
      temperature
    };
    if (max_tokens) {
      payload.max_tokens = max_tokens;
    }
    if (response_format) {
      payload.response_format = response_format;
    }

    const response = await axios({
      method: 'post',
      url: targetUrl,
      headers,
      data: payload,
      timeout
    });

    return response.data;
  }

  /**
   * Execute streaming Chat Completion with SSE line processing
   */
  async stream({ baseUrl, apiKey, model, messages, temperature = 0.7, max_tokens = null, timeout = 60000, onChunk, onComplete, onError }) {
    if (!baseUrl) {
      const err = new Error('API 执行器缺少目标 Base URL');
      if (onError) onError(err);
      throw err;
    }

    const targetUrl = formatCompletionsUrl(baseUrl);
    const key = (apiKey || '').trim();

    const headers = {
      'Content-Type': 'application/json',
    };
    if (key && key !== 'your_api_key_here') {
      headers['Authorization'] = `Bearer ${key}`;
    }

    try {
      const requestData = {
        model,
        messages,
        stream: true,
        temperature
      };
      if (max_tokens) {
        requestData.max_tokens = max_tokens;
      }

      const response = await axios({
        method: 'post',
        url: targetUrl,
        headers,
        data: requestData,
        responseType: 'stream',
        timeout
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
    } catch (error) {
      let errorDetail = error.message;
      if (error.response?.data) {
        const data = error.response.data;
        errorDetail = typeof data === 'object' ? (data.error?.message || JSON.stringify(data)) : String(data);
      }
      const wrappedErr = new Error(`API 请求失败: ${errorDetail}`);
      if (onError) onError(wrappedErr);
      else throw wrappedErr;
    }
  }
}

export const apiRunner = new ApiRunner();
