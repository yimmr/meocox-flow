import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { assertSafePathSegment } from '../utils/safePath.js';

const writeChains = new Map();

function getEventFile(projectId, threadId, turnId) {
  const safeProjectId = assertSafePathSegment(projectId, 'projectId');
  const safeThreadId = assertSafePathSegment(threadId, 'threadId');
  const safeTurnId = assertSafePathSegment(turnId, 'turnId');
  return path.join(
    config.paths.projectsRoot,
    safeProjectId,
    'threads',
    '.events',
    safeThreadId,
    `${safeTurnId}.jsonl`
  );
}

/** Persist a semantic chat event before the next queued event is written. */
export function appendThreadTurnEvent(projectId, threadId, turnId, event) {
  const filePath = getEventFile(projectId, threadId, turnId);
  const previous = writeChains.get(filePath) || Promise.resolve();
  const next = previous.then(async () => {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, `${JSON.stringify(event)}\n`, 'utf-8');
  });
  const safeNext = next.catch(() => {});
  writeChains.set(filePath, safeNext);
  return next.finally(() => {
    if (writeChains.get(filePath) === safeNext) writeChains.delete(filePath);
  });
}

/** Read persisted events after a per-turn sequence cursor. */
export async function readThreadTurnEvents(projectId, threadId, turnId, { sinceSeq = -1 } = {}) {
  const filePath = getEventFile(projectId, threadId, turnId);
  let content;
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  return content
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const event = JSON.parse(line);
        return Number.isInteger(event.seq) && event.seq > sinceSeq ? [event] : [];
      } catch {
        return [];
      }
    });
}
