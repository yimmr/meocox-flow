import axios from 'axios';
import { StreamParser } from './streamParser.js';

/**
 * 统一大模型执行适配器 (Model Runner)
 * 
 * 职责：
 * 1. 适配任意兼容 OpenAI 协议的 API 端点 (OpenAI, Gemini, DeepSeek, 本地 Ollama, vLLM 等)
 * 2. 原生支持官方标准的 Function Calling (tools / tool_choice / tool_calls)
 * 3. 抹平厂商底层网络传输细节，向外提供统一调用承诺
 */
export class ModelRunner {
  constructor({ baseUrl = '', apiKey = '', model = 'gemini-3.8-flash' } = {}) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * 格式化补全端点 URL
   */
  formatUrl(baseUrl) {
    let target = (baseUrl || '').trim().replace(/\/+$/, '');
    if (!target.endsWith('/chat/completions')) {
      if (!target.endsWith('/v1')) {
        target = `${target}/v1`;
      }
      target = `${target}/chat/completions`;
    }
    return target;
  }

  /**
   * 统一单次模型推理入口 (带原生工具声明支持)
   */
  async call({ messages = [], systemPrompt = '', tools = [], options = {} } = {}) {
    const baseUrl = options.baseUrl || this.baseUrl;
    const apiKey = options.apiKey !== undefined ? options.apiKey : this.apiKey;
    const model = options.model || this.model;

    if (!baseUrl) {
      throw new Error('[ModelRunner] 缺少模型服务 baseUrl');
    }

    const fullMessages = [];
    if (systemPrompt) {
      fullMessages.push({ role: 'system', content: systemPrompt });
    }
    fullMessages.push(...messages);

    const payload = {
      model,
      messages: fullMessages,
      temperature: options.temperature ?? 0.7
    };
    if (options.max_tokens) {
      payload.max_tokens = options.max_tokens;
    }

    // 传入符合标准 Function Calling 规范的工具清单
    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = options.tool_choice || 'auto';
    }

    const headers = { 'Content-Type': 'application/json' };
    const key = (apiKey || '').trim();
    if (key && key !== 'your_api_key_here') {
      headers['Authorization'] = `Bearer ${key}`;
    }

    const targetUrl = this.formatUrl(baseUrl);

    try {
      const response = await axios.post(targetUrl, payload, {
        headers,
        timeout: options.timeout || 60000
      });

      const choice = response.data?.choices?.[0]?.message || {};
      let reasoning = choice.reasoning_content || choice.thinking || '';
      let text = choice.content || '';

      if (!reasoning && text.includes('<think>')) {
        const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/i);
        if (thinkMatch) {
          reasoning = thinkMatch[1].trim();
          text = text.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
        }
      }

      const toolCalls = [];
      if (Array.isArray(choice.tool_calls) && choice.tool_calls.length > 0) {
        for (const tc of choice.tool_calls) {
          if (tc.type === 'function' && tc.function) {
            let parsedArgs = {};
            try {
              parsedArgs = JSON.parse(tc.function.arguments || '{}');
            } catch (err) {
              console.warn('[ModelRunner] 解析工具参数失败:', tc.function.arguments);
            }
            toolCalls.push({
              id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: tc.function.name,
              args: parsedArgs
            });
          }
        }
      }

      return {
        text,
        reasoning,
        toolCalls,
        usage: response.data?.usage || null
      };
    } catch (error) {
      let errorDetail = error.message;
      if (error.response?.data) {
        const data = error.response.data;
        errorDetail = typeof data === 'object' ? (data.error?.message || JSON.stringify(data)) : String(data);
      }
      throw new Error(`[ModelRunner API 失败] ${errorDetail}`);
    }
  }

  /**
   * 统一流式模型推理入口 (原生支持 reasoning_content 与 <think> 思维链解析)
   */
  async callStream({ messages = [], systemPrompt = '', tools = [], options = {}, onChunk } = {}) {
    const baseUrl = options.baseUrl || this.baseUrl;
    const apiKey = options.apiKey !== undefined ? options.apiKey : this.apiKey;
    const model = options.model || this.model;

    if (!baseUrl) {
      throw new Error('[ModelRunner] 缺少模型服务 baseUrl');
    }

    const fullMessages = [];
    if (systemPrompt) {
      fullMessages.push({ role: 'system', content: systemPrompt });
    }
    fullMessages.push(...messages);

    const payload = {
      model,
      messages: fullMessages,
      stream: true,
      temperature: options.temperature ?? 0.7
    };
    if (options.max_tokens) {
      payload.max_tokens = options.max_tokens;
    }

    if (Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = options.tool_choice || 'auto';
    }

    const headers = { 'Content-Type': 'application/json' };
    const key = (apiKey || '').trim();
    if (key && key !== 'your_api_key_here') {
      headers['Authorization'] = `Bearer ${key}`;
    }

    const targetUrl = this.formatUrl(baseUrl);
    const parser = new StreamParser({ onChunk });

    try {
      const response = await axios.post(targetUrl, payload, {
        headers,
        responseType: 'stream',
        timeout: options.timeout || 120000
      });

      let lineBuffer = '';

      for await (const chunk of response.data) {
        lineBuffer += chunk.toString('utf-8');
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop(); // 保留最后一个未闭合行

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const delta = parsed.choices?.[0]?.delta || {};
              parser.feedDelta(delta);
            } catch {}
          }
        }
      }

      if (lineBuffer.trim().startsWith('data: ') && lineBuffer.trim() !== 'data: [DONE]') {
        try {
          const parsed = JSON.parse(lineBuffer.trim().slice(6));
          const delta = parsed.choices?.[0]?.delta || {};
          parser.feedDelta(delta);
        } catch {}
      }

      return parser.finish();
    } catch (error) {
      let errorDetail = error.message;
      if (error.response?.data) {
        const data = error.response.data;
        errorDetail = typeof data === 'object' ? (data.error?.message || JSON.stringify(data)) : String(data);
      }
      throw new Error(`[ModelRunner API 流式失败] ${errorDetail}`);
    }
  }
}
