/**
 * MAS Core 统一出口。
 *
 * 分层:contracts(契约)→ bus(事件)→ artifacts(产物)→ scheduler(调度)
 *      → run(编排)→ primitives/policy(协作与治理)。
 */
export * from './contracts/index.js';
export { EventBus, defaultEventBus } from './bus/eventBus.js';
export * as eventLog from './bus/eventLog.js';
export { ArtifactStore, defaultArtifactStore } from './artifacts/store.js';
export * as lineage from './artifacts/lineage.js';
export { BlackboardStore, defaultBlackboardStore, BB_AUDIT_RUN_ID } from './blackboard/store.js';
export * as dag from './scheduler/dag.js';
export * as readyQueue from './scheduler/readyQueue.js';
export { SchedulerRuntime } from './scheduler/runtime.js';
export { MockExecutor } from './scheduler/executors/mockExecutor.js';
export { OperatorExecutor, OUTPUT_KIND_MAP } from './scheduler/executors/operatorExecutor.js';
export * as stateMachine from './run/stateMachine.js';
export {
  buildTasksFromStages,
  createRunFromTemplate,
  loadRun,
  executeRun,
  runTemplate
} from './run/orchestrator.js';
// ── 协作原语(事件溯源:状态 = events.jsonl 折叠) ────────────────
export {
  openEscalation,
  resolveEscalation,
  foldEscalations,
  taskEscalationInput
} from './primitives/escalation.js';
export {
  recordDecision,
  markDecisionApplied,
  foldDecisions
} from './primitives/decision.js';
export {
  requestChange,
  applyChange,
  acceptChange,
  rejectChange,
  foldChangeRequests
} from './primitives/changeRequest.js';
// ── 治理策略 ──────────────────────────────────────────────────
export {
  GateRegistry,
  defaultGateRegistry,
  evaluateRule,
  evaluateGate,
  enforceGate
} from './policy/qualityGate.js';
export { autoResolvePlan, resolveAutonomy } from './policy/autonomy.js';
export { checkBudget } from './policy/budget.js';
// ── 投影层(事件流 → 遥测 / 审计 / 时光树 / Diff,全部只读) ──────
export { buildTelemetry } from './projections/telemetry.js';
export { buildAuditReport, renderAuditMarkdown } from './projections/audit.js';
export { buildTimeTree } from './projections/timeTree.js';
export { diffSnapshots, diffCheckpoints } from './projections/diff.js';