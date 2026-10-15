/**
 * Event(总线原子单元)契约。
 */
import { EVENT_TYPES, ACTOR_KINDS } from './enums.js';

export const ACTOR_SCHEMA = {
  type: 'object',
  required: ['kind'],
  properties: {
    kind: { type: 'string', enum: ACTOR_KINDS },
    id: { type: 'string' },
    name: { type: 'string' }
  }
};

export const EVENT_SCHEMA = {
  type: 'object',
  required: ['id', 'runId', 'projectId', 'seq', 'ts', 'type', 'actor'],
  properties: {
    id: { type: 'string', minLength: 1 },
    runId: { type: 'string', minLength: 1 },
    projectId: { type: 'string', minLength: 1 },
    seq: { type: 'integer' },
    ts: { type: 'integer' },
    type: { type: 'string', enum: EVENT_TYPES },
    actor: ACTOR_SCHEMA,
    taskId: { type: 'string' },
    artifactRef: { type: 'object' },
    payload: { type: 'any' }
  }
};