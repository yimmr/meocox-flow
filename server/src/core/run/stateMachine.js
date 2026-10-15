/**
 * Run / Task 状态机:集中所有状态迁移与合法性校验,
 * 避免各处直接赋值 status 导致非法中间态。
 */
import { RUN_STATUSES, TASK_STATUSES } from '../contracts/enums.js';

const RUN_TRANSITIONS = {
  idle: ['planning', 'running', 'aborted'],
  planning: ['running', 'failed', 'aborted'],
  running: ['paused', 'blocked', 'completed', 'failed', 'aborted'],
  paused: ['running', 'aborted'],
  blocked: ['running', 'failed', 'aborted', 'completed'],
  completed: [],
  failed: ['running'],
  aborted: []
};

const TASK_TRANSITIONS = {
  pending: ['ready', 'running', 'blocked', 'skipped', 'stale'],
  ready: ['running', 'pending', 'blocked', 'stale'],
  running: ['succeeded', 'failed', 'blocked', 'stale'],
  blocked: ['running', 'failed', 'stale'],
  succeeded: ['stale'],
  failed: ['running', 'stale'],
  stale: ['pending', 'running'],
  skipped: []
};

/**
 * 判断状态迁移是否合法。
 */
export function canTransition(kind, from, to) {
  const table = kind === 'run' ? RUN_TRANSITIONS : TASK_TRANSITIONS;
  return (table[from] || []).includes(to);
}

/**
 * 执行一次状态迁移(非法则抛错)。
 * @throws {Error}
 */
export function transition(kind, entity, to) {
  const from = entity.status;
  if (!(kind === 'run' ? RUN_STATUSES : TASK_STATUSES).includes(to)) {
    throw new Error(`[stateMachine] 未知的 ${kind} 状态: ${to}`);
  }
  if (!canTransition(kind, from, to)) {
    throw new Error(`[stateMachine] 非法迁移: ${kind} ${from} -> ${to}`);
  }
  entity.status = to;
  entity.updatedAt = Date.now();
  return entity;
}

/** 宽松设置(用于从磁盘恢复/外部注入,不做迁移校验) */
export function forceSetStatus(entity, to) {
  entity.status = to;
  return entity;
}