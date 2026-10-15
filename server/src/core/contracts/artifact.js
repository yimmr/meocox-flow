/**
 * Artifact(版本化产物)与 ArtifactRef 契约。
 */
import { ARTIFACT_KINDS, ARTIFACT_STATUSES } from './enums.js';

export const ARTIFACT_REF_SCHEMA = {
  type: 'object',
  required: ['artifactId', 'version'],
  properties: {
    artifactId: { type: 'string', minLength: 1 },
    version: { type: 'integer' },
    hash: { type: 'string' }
  }
};

export const ARTIFACT_VERSION_META_SCHEMA = {
  type: 'object',
  required: ['version', 'hash', 'schemaId', 'lineage', 'producedBy', 'createdAt', 'payloadRef'],
  properties: {
    version: { type: 'integer' },
    hash: { type: 'string', minLength: 1 },
    schemaId: { type: 'string', minLength: 1 },
    lineage: { type: 'array', items: ARTIFACT_REF_SCHEMA },
    producedBy: {
      type: 'object',
      properties: { taskId: { type: 'string' }, agentId: { type: 'string' }, operatorId: { type: 'string' } }
    },
    createdAt: { type: 'integer' },
    payloadRef: { type: 'string', minLength: 1 }
  }
};

export const ARTIFACT_SCHEMA = {
  type: 'object',
  required: ['id', 'projectId', 'kind', 'currentVersion', 'status', 'versions'],
  properties: {
    id: { type: 'string', minLength: 1 },
    projectId: { type: 'string', minLength: 1 },
    kind: { type: 'string', enum: ARTIFACT_KINDS },
    currentVersion: { type: 'integer' },
    status: { type: 'string', enum: ARTIFACT_STATUSES },
    versions: { type: 'array', items: ARTIFACT_VERSION_META_SCHEMA }
  }
};