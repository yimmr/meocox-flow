/**
 * Blackboard(全局项目共享事实黑板)契约。
 */
export const MEMORY_RULE_SCHEMA = {
  type: 'object',
  required: ['id', 'rule'],
  properties: {
    id: { type: 'string', minLength: 1 },
    rule: { type: 'string', minLength: 1 },
    weight: { type: 'number' },
    source: { type: 'string' },
    time: { type: 'string' }
  }
};

export const BLACKBOARD_SCHEMA = {
  type: 'object',
  required: ['projectId', 'revision'],
  properties: {
    projectId: { type: 'string', minLength: 1 },
    revision: { type: 'integer' },
    projectDNA: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        targetAudience: { type: 'string' },
        duration: { type: 'string' },
        coreMetaphor: { type: 'string' }
      }
    },
    lockedStyleGuide: {
      type: 'object',
      properties: {
        aesthetic: { type: 'string' },
        palette: { type: 'array', items: { type: 'string' } },
        lighting: { type: 'string' },
        engine: { type: 'string' },
        resolution: { type: 'string' }
      }
    },
    negativeConstraints: { type: 'array', items: { type: 'string' } },
    bgmAtmosphere: {
      type: 'object',
      properties: {
        genre: { type: 'string' },
        tempo: { type: 'string' },
        peakTimestamp: { type: 'string' }
      }
    },
    bossEpisodicMemory: { type: 'array', items: MEMORY_RULE_SCHEMA },
    /** Pub/Sub 轨迹(前端可视化用,与事件日志互补) */
    pubSubEvents: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'action'],
        properties: {
          id: { type: 'string', minLength: 1 },
          time: { type: 'string' },
          agent: { type: 'string' },
          action: { type: 'string', enum: ['read', 'write'] },
          key: { type: 'string' },
          summary: { type: 'string' }
        }
      }
    },
    facts: { type: 'object' },
    updatedAt: { type: 'integer' },
    subscriptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          keys: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
};

/**
 * 创建空黑板。
 */
export function createBlackboard(projectId) {
  return {
    projectId,
    revision: 0,
    projectDNA: {},
    lockedStyleGuide: {},
    negativeConstraints: [],
    bgmAtmosphere: {},
    bossEpisodicMemory: [],
    pubSubEvents: [],
    facts: {},
    subscriptions: [],
    updatedAt: 0
  };
}