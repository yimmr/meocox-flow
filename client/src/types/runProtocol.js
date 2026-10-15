/** Public event names emitted by server/src/core/contracts/enums.js. */
export const RUN_EVENT_TYPES = [
  'run.created', 'run.started', 'run.paused', 'run.blocked',
  'run.completed', 'run.failed', 'run.rolledback', 'run.aborted',
  'task.ready', 'task.started', 'task.progress', 'task.log',
  'task.succeeded', 'task.failed', 'task.stale', 'task.retrying',
  'artifact.produced', 'artifact.updated', 'artifact.approved',
  'artifact.stale', 'artifact.superseded',
  'squad.spawned', 'squad.completed', 'squad.reclaimed',
  'crosstalk.opened', 'crosstalk.resolved',
  'escalation.opened', 'escalation.resolved', 'escalation.expired',
  'change.requested', 'change.accepted', 'change.applied', 'change.rejected',
  'decision.received', 'decision.applied',
  'blackboard.read', 'blackboard.written',
  'gate.passed', 'gate.failed', 'budget.tick', 'budget.exceeded',
  'checkpoint.created'
];
