/**
 * StreamParser - 通用多模型流式解析器
 * 
 * 职责：
 * 1. 兼容官方独立字段 (delta.reasoning_content / delta.thinking) 推送思维链的厂商；
 * 2. 兼容在 delta.content 中内联 <think>...</think> 标签的本地或开源推理模型 (如 Ollama DeepSeek-R1)；
 * 3. 兼容不含思考过程的常规大模型，保证零延迟平滑输出正文；
 * 4. 实时汇聚 delta.tool_calls 分片，还原完整的工具调用参数；
 * 5. 向外分发结构化 onChunk 事件 ({ type: 'think' | 'text', text })。
 */
/**
 * 支持的思考标签配对清单 (覆盖 Ollama, DeepSeek-R1, Claude Thinking, Google Gemini 等各类模型)
 */
const THINK_TAG_PAIRS = [
  { open: '<think>', close: '</think>' },
  { open: '<thinking>', close: '</thinking>' },
  { open: '<thought>', close: '</thought>' },
  { open: '<reasoning>', close: '</reasoning>' }
];

export class StreamParser {
  constructor({ onChunk } = {}) {
    this.onChunk = onChunk;
    this.fullReasoning = '';
    this.fullText = '';
    this.toolCallsMap = new Map();

    this.hasExplicitReasoningField = false;
    this.state = 'DETECTING'; // 'DETECTING' | 'IN_THINK' | 'AFTER_THINK'
    this.tagBuffer = '';
    this.currentCloseTag = '</think>';
  }

  emit(type, text) {
    if (!text) return;
    if (type === 'think') {
      this.fullReasoning += text;
    } else if (type === 'text') {
      this.fullText += text;
    }
    this.onChunk?.({ type, text });
  }

  feedDelta(delta = {}) {
    // 1. 处理官方独立字段 (reasoning_content, thinking, reasoning 或 thought)
    const explicitReasoning = delta.reasoning_content || delta.thinking || delta.reasoning || delta.thought;
    if (explicitReasoning) {
      this.hasExplicitReasoningField = true;
      this.emit('think', explicitReasoning);
    }

    // 2. 累积工具调用碎片 (tool_calls)
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!this.toolCallsMap.has(idx)) {
          this.toolCallsMap.set(idx, {
            id: tc.id || '',
            type: tc.type || 'function',
            function: {
              name: tc.function?.name || '',
              arguments: ''
            }
          });
        }
        const existing = this.toolCallsMap.get(idx);
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) {
          if (!existing.function.name) {
            existing.function.name = tc.function.name;
          } else if (tc.function.name !== existing.function.name) {
            existing.function.name += tc.function.name;
          }
        }
        if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
      }
    }

    // 3. 处理正文内容 (content)
    const content = delta.content;
    if (typeof content !== 'string' || !content) {
      return;
    }

    // 若已经收到独立思考字段，则 delta.content 确系纯正文，直接直出
    if (this.hasExplicitReasoningField) {
      this.emit('text', content);
      return;
    }

    // 否则针对内嵌 <think>...</think> 或 <thinking>...</thinking> 标签进行流式滑动窗口解析
    this.processEmbeddedContent(content);
  }

  processEmbeddedContent(chunk) {
    let input = this.tagBuffer + chunk;
    this.tagBuffer = '';

    while (input.length > 0) {
      if (this.state === 'DETECTING') {
        const trimmedLeading = input.trimStart();

        // 1. 检查开头是否精准匹配任意 open tag
        const matchedPair = THINK_TAG_PAIRS.find(p => trimmedLeading.startsWith(p.open));
        if (matchedPair) {
          this.state = 'IN_THINK';
          this.currentCloseTag = matchedPair.close;
          const matchIdx = input.indexOf(matchedPair.open);
          const leadingText = input.slice(0, matchIdx);
          if (leadingText.trim()) {
            this.emit('text', leadingText);
          }
          input = input.slice(matchIdx + matchedPair.open.length);
          continue;
        }

        // 2. 检查开头是否是任意 open tag 的前缀（缓冲以防标签被拆包截断）
        const isPrefix = THINK_TAG_PAIRS.some(p => 
          trimmedLeading.length > 0 && p.open.startsWith(trimmedLeading) && trimmedLeading.length < p.open.length
        );
        if (isPrefix) {
          this.tagBuffer = input;
          input = '';
          break;
        }

        // 3. 检查 input 中间是否含有任意 open tag
        let earliestMatch = null;
        let earliestIdx = -1;
        for (const p of THINK_TAG_PAIRS) {
          const idx = input.indexOf(p.open);
          if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
            earliestIdx = idx;
            earliestMatch = p;
          }
        }

        if (earliestMatch) {
          const before = input.slice(0, earliestIdx);
          if (before) this.emit('text', before);
          this.state = 'IN_THINK';
          this.currentCloseTag = earliestMatch.close;
          input = input.slice(earliestIdx + earliestMatch.open.length);
          continue;
        }

        // 既不是前缀也不含思考标签：普通模型无思考直接输出
        this.state = 'AFTER_THINK';
        this.emit('text', input);
        input = '';
        break;
      }

      if (this.state === 'IN_THINK') {
        const closeTag = this.currentCloseTag;
        const closeIdx = input.indexOf(closeTag);
        if (closeIdx !== -1) {
          const thinkText = input.slice(0, closeIdx);
          if (thinkText) this.emit('think', thinkText);
          this.state = 'AFTER_THINK';
          input = input.slice(closeIdx + closeTag.length);
          // 去除紧随闭合标签后的多余换行符
          input = input.replace(/^[\r\n]+/, '');
          continue;
        }

        // 检查尾部是否是闭合标签的前缀 (例如 "</" 或 "</th" 或 "</think")
        let matchedPrefixLength = 0;
        for (let i = 1; i <= Math.min(input.length, closeTag.length - 1); i++) {
          const suffix = input.slice(-i);
          if (closeTag.startsWith(suffix)) {
            matchedPrefixLength = i;
          }
        }

        if (matchedPrefixLength > 0) {
          const safeText = input.slice(0, -matchedPrefixLength);
          if (safeText) this.emit('think', safeText);
          this.tagBuffer = input.slice(-matchedPrefixLength);
          input = '';
          break;
        }

        this.emit('think', input);
        input = '';
        break;
      }

      if (this.state === 'AFTER_THINK') {
        // 即使在正文阶段，也必须能动态检测可能再次出现的思考标签 (如多轮思考或模型异常重复)
        let earliestMatch = null;
        let earliestIdx = -1;
        for (const p of THINK_TAG_PAIRS) {
          const idx = input.indexOf(p.open);
          if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
            earliestIdx = idx;
            earliestMatch = p;
          }
        }

        if (earliestMatch) {
          const before = input.slice(0, earliestIdx);
          if (before) this.emit('text', before);
          this.state = 'IN_THINK';
          this.currentCloseTag = earliestMatch.close;
          input = input.slice(earliestIdx + earliestMatch.open.length);
          continue;
        }

        // 检查末尾是否含有 open tag 的前缀碎片 (例如尾部刚好是 "<" 或 "<th")
        let matchedPrefixLength = 0;
        for (const p of THINK_TAG_PAIRS) {
          for (let i = Math.min(input.length, p.open.length - 1); i >= 1; i--) {
            const suffix = input.slice(-i);
            if (p.open.startsWith(suffix)) {
              if (i > matchedPrefixLength) matchedPrefixLength = i;
            }
          }
        }

        if (matchedPrefixLength > 0) {
          const safeText = input.slice(0, -matchedPrefixLength);
          if (safeText) this.emit('text', safeText);
          this.tagBuffer = input.slice(-matchedPrefixLength);
          input = '';
          break;
        }

        this.emit('text', input);
        input = '';
        break;
      }
    }
  }

  finish() {
    if (this.tagBuffer) {
      if (this.state === 'IN_THINK') {
        this.emit('think', this.tagBuffer);
      } else {
        this.emit('text', this.tagBuffer);
      }
      this.tagBuffer = '';
    }

    // 双重保底清洗：若因分片粘连导致 fullText 仍含有思考标签，彻底清洗并提取归并入 fullReasoning
    for (const p of THINK_TAG_PAIRS) {
      // 1. 闭合标签正则匹配与提取
      const escOpen = p.open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escClose = p.close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const closedRegex = new RegExp(`${escOpen}([\\s\\S]*?)${escClose}`, 'gi');
      let match;
      while ((match = closedRegex.exec(this.fullText)) !== null) {
        if (match[1]) {
          const extracted = match[1].trim();
          if (extracted && !this.fullReasoning.includes(extracted)) {
            this.fullReasoning = (this.fullReasoning ? this.fullReasoning + '\n' : '') + extracted;
          }
        }
      }
      this.fullText = this.fullText.replace(closedRegex, '').trim();

      // 2. 未闭合标签尾部保护
      if (this.fullText.includes(p.open)) {
        const idx = this.fullText.indexOf(p.open);
        const unclosed = this.fullText.slice(idx + p.open.length).trim();
        if (unclosed && !this.fullReasoning.includes(unclosed)) {
          this.fullReasoning = (this.fullReasoning ? this.fullReasoning + '\n' : '') + unclosed;
        }
        this.fullText = this.fullText.slice(0, idx).trim();
      }
    }

    const toolCalls = Array.from(this.toolCallsMap.values());
    return {
      reasoning: this.fullReasoning.trim(),
      text: this.fullText.trim(),
      toolCalls
    };
  }
}
