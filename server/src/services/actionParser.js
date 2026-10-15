import { EventEmitter } from 'node:events';

/**
 * Clean JSON string (remove markdown codeblocks if wrapped)
 */
function cleanJsonStr(str) {
  let cleaned = str.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

/**
 * Extract all complete <tool_call name="...">...</tool_call> tags from text
 */
export function extractToolCalls(text) {
  if (!text || typeof text !== 'string') {
    return { cleanText: '', toolCalls: [] };
  }

  const toolCalls = [];
  const regex = /<tool_call\s+name=["']([^"']+)["']>([\s\S]*?)<\/tool_call>/g;

  let match;
  let cleanText = text;

  while ((match = regex.exec(text)) !== null) {
    const [fullTag, toolName, rawArgs] = match;
    let parsedArgs = {};
    try {
      const cleaned = cleanJsonStr(rawArgs);
      parsedArgs = JSON.parse(cleaned);
    } catch (e) {
      console.warn(`[ActionParser] Failed to parse JSON for tool "${toolName}":`, e.message);
    }

    toolCalls.push({
      name: toolName.trim(),
      args: parsedArgs,
      raw: fullTag
    });
  }

  cleanText = cleanText.replace(regex, '').replace(/\n{3,}/g, '\n\n').trim();

  return {
    cleanText,
    toolCalls
  };
}

/**
 * Incremental Action Stream Parser for SSE streams
 */
export class ActionStreamParser extends EventEmitter {
  constructor() {
    super();
    this.buffer = '';
    this.inTag = false;
    this.currentTool = null;
    this.currentArgsBuffer = '';
  }

  feed(chunk) {
    if (!chunk) return;
    this.buffer += chunk;

    const startTagRegex = /<tool_call\s+name=["']([^"']+)["']>/;
    const endTag = '</tool_call>';

    while (this.buffer.length > 0) {
      if (!this.inTag) {
        const match = this.buffer.match(startTagRegex);
        if (match) {
          const index = match.index;
          // Emit text preceding the tool call
          const textBefore = this.buffer.slice(0, index);
          if (textBefore) {
            this.emit('text', textBefore);
          }

          this.inTag = true;
          this.currentTool = match[1];
          this.currentArgsBuffer = '';
          this.buffer = this.buffer.slice(index + match[0].length);
        } else {
          // No complete start tag in the buffer yet. It may be split across chunks,
          // so hold back anything that could become a "<tool_call ...>" once more data arrives.
          const openTag = '<tool_call';
          const lastOpen = this.buffer.lastIndexOf(openTag);

          if (lastOpen !== -1) {
            const gtIndex = this.buffer.indexOf('>', lastOpen);
            if (gtIndex === -1) {
              // Opening tag is still incomplete (e.g. split inside "<tool_call name=..."), hold it.
              const safeText = this.buffer.slice(0, lastOpen);
              if (safeText) this.emit('text', safeText);
              this.buffer = this.buffer.slice(lastOpen);
              break;
            }
            // A closed tag the regex did not recognise is malformed and will never
            // become valid, so flush it as plain text instead of holding it forever.
            this.emit('text', this.buffer);
            this.buffer = '';
            break;
          }

          // Buffer may end with a leading fragment of "<tool_call" (e.g. "<", "<tool_c").
          let partial = 0;
          const maxLen = Math.min(openTag.length - 1, this.buffer.length);
          for (let len = maxLen; len > 0; len--) {
            if (this.buffer.slice(-len) === openTag.slice(0, len)) {
              partial = len;
              break;
            }
          }

          if (partial > 0) {
            const safeText = this.buffer.slice(0, this.buffer.length - partial);
            if (safeText) this.emit('text', safeText);
            this.buffer = this.buffer.slice(this.buffer.length - partial);
          } else {
            this.emit('text', this.buffer);
            this.buffer = '';
          }
          break;
        }
      } else {
        // Hold back a trailing fragment that may be the start of "</tool_call>",
        // otherwise a split closing tag gets swallowed into the JSON and the
        // whole tool call silently disappears.
        const endIndex = this.buffer.indexOf(endTag);
        if (endIndex !== -1) {
          this.currentArgsBuffer += this.buffer.slice(0, endIndex);
          this.buffer = this.buffer.slice(endIndex + endTag.length);
          this.inTag = false;

          let parsedArgs = {};
          try {
            parsedArgs = JSON.parse(cleanJsonStr(this.currentArgsBuffer));
          } catch (err) {
            console.warn(`[ActionStreamParser] Failed to parse args for ${this.currentTool}:`, err.message);
          }

          this.emit('action', {
            name: this.currentTool,
            args: parsedArgs
          });

          this.currentTool = null;
          this.currentArgsBuffer = '';
          continue;
        }

        let partialEnd = 0;
        const endMax = Math.min(endTag.length - 1, this.buffer.length);
        for (let len = endMax; len > 0; len--) {
          if (this.buffer.slice(-len) === endTag.slice(0, len)) {
            partialEnd = len;
            break;
          }
        }

        if (partialEnd > 0) {
          this.currentArgsBuffer += this.buffer.slice(0, this.buffer.length - partialEnd);
          this.buffer = this.buffer.slice(this.buffer.length - partialEnd);
        } else {
          this.currentArgsBuffer += this.buffer;
          this.buffer = '';
        }
        break;
      }
    }
  }

  finish() {
    if (this.inTag && this.currentTool) {
      // Incomplete tag closed at stream finish: append any held buffer (which may
      // contain a partial closing tag) and emit on a best-effort basis.
      this.currentArgsBuffer += this.buffer;
      this.buffer = '';
      try {
        const parsedArgs = JSON.parse(cleanJsonStr(this.currentArgsBuffer));
        this.emit('action', {
          name: this.currentTool,
          args: parsedArgs
        });
      } catch (e) {
        console.warn(`[ActionStreamParser] Incomplete tool call "${this.currentTool}" at stream end:`, e.message);
      }
      this.inTag = false;
      this.currentTool = null;
      this.currentArgsBuffer = '';
    }

    if (this.buffer && !this.inTag) {
      this.emit('text', this.buffer);
      this.buffer = '';
    }
  }
}
