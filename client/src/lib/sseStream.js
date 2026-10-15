/** Consume a fetch-based SSE response and decode JSON event payloads. */
export async function consumeJsonEventStream(response, onEvent, { onParseError } = {}) {
  if (!response?.body?.getReader) throw new Error('Streaming response is unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const dispatchFrame = (frame) => {
    let eventType = 'message';
    const dataLines = [];
    for (const line of frame.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) eventType = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (dataLines.length === 0) return;
    try {
      const payload = JSON.parse(dataLines.join('\n'));
      onEvent?.(eventType, payload);
    } catch (error) {
      onParseError?.(error, eventType);
      if (!onParseError) console.error(`[SSE] 无法处理 ${eventType} 事件:`, error);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';
      for (const frame of frames) dispatchFrame(frame);
    }
    buffer += decoder.decode();
    if (buffer.trim()) dispatchFrame(buffer);
  } finally {
    reader.releaseLock();
  }
}
