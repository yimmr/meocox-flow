/**
 * 协作原语 + 治理 API(挂载在 /api/runs 之下,与 runsRouter 路径不相交)。
 *
 * 契约:
 *   POST /api/runs/:runId/escalations                  打开升级单(emit escalation.opened)
 *   POST /api/runs/:runId/escalations/:id/resolve      解决升级单(emit escalation.resolved)
 *   POST /api/runs/:runId/decisions                    记录裁决,并按 scope 作用:
 *                                                       escalation->resolve / changeRequest->accept|reject+apply
 *                                                       / gate->override
 *   POST /api/runs/:runId/change-requests              发起返工(影响面分析,emit change.requested)
 *   POST /api/runs/:runId/change-requests/:id/apply    应用返工(产物 stale + 任务重排,emit change.applied)
 *   POST /api/runs/:runId/gates/:gateId/evaluate       评估质检闸门(注册表或 body.gate 临时闸门)
 *   GET  /api/runs/:runId/collaboration                协作状态折叠(事件溯源投影)
 *
 * 所有写路径都只是「追加事件」;状态永远以 events.jsonl 为准。
 */
import express from 'express';
import { storage, requireProjectId } from '../storage/index.js';
import { defaultEventBus } from '../core/bus/eventBus.js';
import { defaultArtifactStore } from '../core/artifacts/store.js';
import { openEscalation, resolveEscalation, foldEscalations } from '../core/primitives/escalation.js';
import { recordDecision, markDecisionApplied, foldDecisions } from '../core/primitives/decision.js';
import {
  requestChange,
  applyChange,
  acceptChange,
  rejectChange,
  foldChangeRequests
} from '../core/primitives/changeRequest.js';
import { defaultGateRegistry, evaluateGate } from '../core/policy/qualityGate.js';
import { createQualityGate } from '../core/contracts/index.js';

const router = express.Router();

function requirePid(req, res) {
  try {
    req.projectId = requireProjectId(
      req.body?.projectId || req.query?.projectId,
      `${req.method} ${req.baseUrl}${req.path}`
    );
    return true;
  } catch (err) {
    res.status(400).json({ error: err.message, missingParam: 'projectId' });
    return false;
  }
}

function ctxOf(req) {
  return {
    bus: defaultEventBus,
    projectId: req.projectId,
    runId: req.params.runId,
    storage,
    artifactStore: defaultArtifactStore
  };
}

function fail(res, err, status = 500) {
  const code = err?.code === 'ECR_NOT_FOUND' ? 404 : status;
  res.status(code).json({ error: err?.message || String(err), code: err?.code || null });
}

// ── 升级单 ────────────────────────────────────────────────────

/** 打开升级单 */
router.post('/:runId/escalations', (req, res) => {
  if (!requirePid(req, res)) return;
  openEscalation(ctxOf(req), { ...req.body?.escalation, runId: req.params.runId })
    .then((escalation) => res.json({ escalation }))
    .catch((err) => fail(res, err, 400));
});

/** 解决升级单 */
router.post('/:runId/escalations/:id/resolve', (req, res) => {
  if (!requirePid(req, res)) return;
  resolveEscalation(ctxOf(req), {
    id: req.params.id,
    resolution: req.body?.resolution || {},
    actor: req.body?.actor || null
  })
    .then((resolution) => res.json({ success: true, resolution }))
    .catch((err) => fail(res, err, 400));
});

// ── 裁决(intent 化:按 scope 作用) ────────────────────────────

router.post('/:runId/decisions', async (req, res) => {
  if (!requirePid(req, res)) return;
  const ctx = ctxOf(req);
  try {
    const decision = await recordDecision(ctx, { ...req.body?.decision, runId: req.params.runId });
    let applied = null;

    if (decision.scope === 'escalation') {
      applied = await resolveEscalation(ctx, {
        id: decision.refId,
        resolution: {
          intent: decision.intent,
          optionId: decision.payload?.optionId ?? null,
          note: decision.payload?.note ?? null
        },
        actor: typeof decision.actor === 'string' ? decision.actor : null
      });
    } else if (decision.scope === 'changeRequest') {
      const events = await storage.readEvents(req.projectId, req.params.runId);
      const cr = foldChangeRequests(events).find((c) => c.id === decision.refId) || null;
      if (decision.intent === 'reject') {
        applied = cr
          ? await rejectChange(ctx, cr, { reason: decision.payload?.reason ?? null, actor: decision.actor })
          : { ok: false, reason: 'change_request_not_found' };
      } else if (!cr) {
        applied = { ok: false, reason: 'change_request_not_found' };
      } else {
        await acceptChange(ctx, cr, decision.actor);
        applied = await applyChange(ctx, cr);
      }
    } else if (decision.scope === 'gate') {
      const payload = {
        gateId: decision.refId,
        pass: true,
        override: true,
        decisionId: decision.id,
        metrics: decision.payload?.metrics ?? {}
      };
      await defaultEventBus.emit(req.projectId, req.params.runId, {
        type: 'gate.passed',
        actor: { kind: 'boss', id: 'user' },
        payload
      });
      applied = payload;
    }

    const appliedEvent = await markDecisionApplied(ctx, decision, applied);
    res.json({ decision, applied, appliedEvent });
  } catch (err) {
    fail(res, err, 400);
  }
});

// ── 变更单(返工) ─────────────────────────────────────────────

/** 发起返工(带影响面分析) */
router.post('/:runId/change-requests', (req, res) => {
  if (!requirePid(req, res)) return;
  requestChange(ctxOf(req), {
    reason: req.body?.reason,
    scope: req.body?.scope,
    requestedChange: req.body?.requestedChange,
    source: req.body?.source,
    target: req.body?.target,
    actor: req.body?.actor
  })
    .then((changeRequest) => res.json({ changeRequest, impact: changeRequest.impact }))
    .catch((err) => fail(res, err, 400));
});

/** 应用返工:受影响产物 stale + 受影响任务重排 pending */
router.post('/:runId/change-requests/:id/apply', async (req, res) => {
  if (!requirePid(req, res)) return;
  const ctx = ctxOf(req);
  try {
    const events = await storage.readEvents(req.projectId, req.params.runId);
    const cr = foldChangeRequests(events).find((c) => c.id === req.params.id) || null;
    if (!cr) {
      const err = new Error(`变更单不存在: ${req.params.id}`);
      err.code = 'ECR_NOT_FOUND';
      throw err;
    }
    const result = await applyChange(ctx, cr);
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

// ── 质检闸门 ──────────────────────────────────────────────────

/** 评估闸门(注册表闸门,或 body.gate 现场定义并注册) */
router.post('/:runId/gates/:gateId/evaluate', (req, res) => {
  if (!requirePid(req, res)) return;
  try {
    let gate = defaultGateRegistry.get(req.params.gateId);
    if (!gate && req.body?.gate) {
      gate = createQualityGate({ ...req.body.gate, id: req.params.gateId });
      defaultGateRegistry.register(gate);
    }
    if (!gate) {
      return res.status(404).json({ error: `闸门未注册: ${req.params.gateId}` });
    }
    const metrics = req.body?.metrics || {};
    const verdict = evaluateGate(gate, metrics);
    res.json({ gateId: gate.id, pass: verdict.pass, failures: verdict.failures, warnings: verdict.warnings, verdict });
  } catch (err) {
    fail(res, err, 400);
  }
});

// ── 协作状态折叠 ──────────────────────────────────────────────

/** GET 协作状态(升级单 / 变更单 / 裁决,事件溯源投影) */
router.get('/:runId/collaboration', async (req, res) => {
  if (!requirePid(req, res)) return;
  try {
    const events = await storage.readEvents(req.projectId, req.params.runId);
    const lastSeq = events.reduce((max, e) => Math.max(max, e.seq || 0), -1);
    res.json({
      runId: req.params.runId,
      lastSeq,
      escalations: foldEscalations(events),
      changeRequests: foldChangeRequests(events),
      decisions: foldDecisions(events)
    });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
