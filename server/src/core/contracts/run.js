/**
 * Run(一次执行实例)契约。
 */
import { RUN_STATUSES, AUTONOMY_LEVELS } from './enums.js';
import { BUDGET_SCHEMA, USAGE_SCHEMA, emptyUsage } from './task.js';

export const RUN_SCHEMA = {
  type: 'object',
  required: ['id', 'projectId', 'templateId', 'status', 'autonomy', 'taskIds', 'activeTaskIds', 'usage'],
  properties: {
    id: { type: 'string', minLength: 1 },
    projectId: { type: 'string', minLength: 1 },
    templateId: { type: 'string' },
    status: { type: 'string', enum: RUN_STATUSES },
    autonomy: { type: 'string', enum: AUTONOMY_LEVELS },
    taskIds: { type: 'array', items: { type: 'string' } },
    activeTaskIds: { type: 'array', items: { type: 'string' } },
    budget: BUDGET_SCHEMA,
    usage: USAGE_SCHEMA,
    checkpointRef: { type: 'string' },
    createdAt: { type: 'integer' },
    updatedAt: { type: 'integer' }
  }
};

/**
 * 创建规范化 Run 实例。
 */
export function createRun({
  id,
  projectId,
  templateId = 'template_tutorial_guide',
  autonomy = 'L2',
  taskIds = [],
  budget = {}
}) {
  const now = Date.now();
  return {
    id,
    projectId,
    templateId,
    status: 'idle',
    autonomy,
    taskIds: [...taskIds],
    activeTaskIds: [],
    budget,
    usage: emptyUsage(),
    checkpointRef: null,
    createdAt: now,
    updatedAt: now
  };
}