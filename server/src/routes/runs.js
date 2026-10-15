import express from 'express';
import { storage, requireProjectId } from '../storage/index.js';
import { defaultEventBus } from '../core/bus/eventBus.js';
import { runManager, resolveExecutor } from '../core/run/runManager.js';
import {
  createRunFromTemplate,
  createRunFromStages,
  loadRun,
  executeRun,
  buildTasksFromStages
} from '../core/run/orchestrator.js';
import { createRun } from '../core/contracts/index.js';
import { createCheckpoint, listCheckpoints, rollbackTo } from '../core/run/checkpoints.js';
import { validateDag } from '../core/scheduler/dag.js';
import { getPipelineTemplateById, getAllPipelineTemplates } from '../pipeline/templates.js';
import { resolveOperatorForStage } from '../pipeline/operators/index.js';

const router = express.Router();

/** 终态:这些状态下不再推流(客户端补完历史即可收尾) */
const TERMINAL_STATUSES = ['completed', 'failed', 'aborted', 'paused', 'blocked'];
const MAX_RUN_CONCURRENCY = 16;

function prepareProjectPipelineStages(pipeline) {
  const stages = pipeline.stages;
  const stageIds = new Set(stages.map((stage) => stage.id));
  const canonicalStages = getPipelineTemplateById(pipeline.templateId)?.stages || [];
  const canonicalById = new Map(canonicalStages.map((stage) => [stage.id, stage]));

  return stages.map((stage, index) => {
    if (Array.isArray(stage.dependsOn)) return stage;
    const canonical = canonicalById.get(stage.id);
    if (Array.isArray(canonical?.dependsOn) && canonical.dependsOn.every((id) => stageIds.has(id))) {
      return { ...stage, dependsOn: canonical.dependsOn };
    }
    return { ...stage, dependsOn: index > 0 ? [stages[index - 1].id] : [] };
  });
}

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function writeEvent(res, event) {
  // id = seq,客户端断线重连时 EventSource 自动带 Last-Event-ID
  res.write(`id: ${event.seq}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/** Studio Demo 专用落盘 Run(固定 id,保证刷新可复用同一份状态) */
const DEMO_RUN_ID = 'run_studio_demo';

/**
 * GET /api/runs/demo-snapshot?projectId=...
 * 读取 Studio Demo 的持久化状态(刷新后恢复用)。
 * 注意:必须注册在 /:runId 之前,否则会被 /:runId 捕获。
 */
router.get('/demo-snapshot', requireProjectIdMiddlewareFactory(), async (req, res) => {
  try {
    const snapshot = await storage.getRunSnapshot(req.projectId, DEMO_RUN_ID);
    const run = await storage.getRun(req.projectId, DEMO_RUN_ID);
    res.json({ runId: DEMO_RUN_ID, snapshot: snapshot || null, run: run || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/runs/demo-snapshot
 * body: { projectId, snapshot }
 * 原子写入 <workDir>/runs/run_studio_demo/snapshot.json。
 */
router.post('/demo-snapshot', requireProjectIdMiddlewareFactory(), async (req, res) => {
  try {
    const { snapshot } = req.body || {};
    if (snapshot === undefined || snapshot === null) {
      return res.status(400).json({ error: 'snapshot 必填' });
    }
    let run = await storage.getRun(req.projectId, DEMO_RUN_ID);
    if (!run) {
      run = createRun({
        id: DEMO_RUN_ID,
        projectId: req.projectId,
        templateId: 'template_custom',
        autonomy: 'L3',
        taskIds: []
      });
      run.status = 'running';
      await storage.saveRun(req.projectId, run);
      await defaultEventBus.emit(req.projectId, DEMO_RUN_ID, {
        type: 'run.created',
        actor: { kind: 'boss', id: 'user' },
        payload: { source: 'studio-demo', templateId: 'template_custom' }
      });
    }
    run.updatedAt = Date.now();
    await storage.saveRun(req.projectId, run);
    await storage.saveRunSnapshot(req.projectId, DEMO_RUN_ID, {
      ...snapshot,
      savedAt: Date.now()
    });
    res.json({ success: true, runId: DEMO_RUN_ID, savedAt: run.updatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/runs/templates —— 可创建的模板(含 dependsOn DAG 边)
 */
router.get('/templates', (req, res) => {
  try {
    res.json(getAllPipelineTemplates().map((t) => ({
      ...t,
      dag: validateDag(buildTasksFromStages({
        projectId: '_schema_',
        runId: '_schema_',
        stages: t.stages
      }))
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/runs?projectId=... —— 列出项目全部 Run
 */
router.get('/', requireProjectIdMiddlewareFactory(), async (req, res) => {
  try {
    const runs = await storage.listRuns(req.projectId);
    res.json({ runs, active: runManager.listActive().filter((a) => a.projectId === req.projectId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/runs —— 由模板创建 Run(不执行)
 * body: { projectId, templateId?, autonomy?, driver? }
 */
router.post('/', requireProjectIdMiddlewareFactory(), async (req, res) => {
  const {
    templateId = 'template_tutorial_guide',
    autonomy = 'L2',
    source = 'template'
  } = req.body || {};
  const driver = req.body?.driver || (source === 'project-pipeline' ? 'operator' : 'mock');
  try {
    if (!['template', 'project-pipeline'].includes(source)) {
      return res.status(400).json({ error: `未知 Run 来源: ${source}` });
    }
    if (!['mock', 'operator'].includes(driver)) {
      return res.status(400).json({ error: `未知执行器: ${driver}` });
    }
    let created;
    if (source === 'project-pipeline') {
      const pipeline = await storage.getPipeline(req.projectId);
      if (!Array.isArray(pipeline?.stages) || pipeline.stages.length === 0 ||
        pipeline.stages.some((stage) => !stage || typeof stage.id !== 'string')) {
        return res.status(400).json({ error: '当前项目没有可执行的流水线阶段' });
      }
      if (driver === 'operator') {
        const unsupported = pipeline.stages.filter((stage) => !resolveOperatorForStage(stage));
        if (unsupported.length) {
          return res.status(400).json({
            error: `这些流水线阶段没有已注册算子: ${unsupported.map((stage) => stage.name || stage.id).join('、')}`
          });
        }
      }
      created = await createRunFromStages({
        projectId: req.projectId,
        templateId: pipeline.templateId || 'template_custom',
        stages: prepareProjectPipelineStages(pipeline),
        autonomy
      });
    } else {
      const template = getPipelineTemplateById(templateId);
      if (!template) return res.status(400).json({ error: `未知模板: ${templateId}` });
      created = await createRunFromTemplate({
        projectId: req.projectId, templateId, autonomy
      });
    }
    const { run, tasks } = created;
    await defaultEventBus.emit(req.projectId, run.id, {
      type: 'run.created',
      actor: { kind: 'boss', id: 'user' },
      payload: { templateId: run.templateId, source, driver, taskCount: tasks.length }
    });

    res.json({ run, tasks, templateId: run.templateId, source, driver });
  } catch (err) {
    res.status(err.code === 'INVALID_PIPELINE' ? 400 : 500).json({ error: err.message });
  }
});

/**
 * GET /api/runs/:runId?projectId=... —— Run 快照(状态投影)
 */
router.get('/:runId', requireProjectIdMiddlewareFactory(), async (req, res) => {
  try {
    const { run, tasks } = await loadRun(req.projectId, req.params.runId);
    const events = await storage.readEvents(req.projectId, run.id);
    res.json({
      run,
      tasks,
      running: runManager.isRunning(req.projectId, run.id),
      activeRun: runManager.getActive(req.projectId, run.id)
        ? { paused: runManager.getActive(req.projectId, run.id).paused } : null,
      lastSeq: events.reduce((max, e) => Math.max(max, e.seq ?? 0), -1),
      status: run.status,
      runningTaskIds: tasks.filter((t) => t.status === 'running').map((t) => t.id)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/runs/:runId/start —— 启动执行(后台)
 * body: { projectId, driver: 'mock'|'operator', concurrency }
 */
router.post('/:runId/start', requireProjectIdMiddlewareFactory(), async (req, res) => {
  const { driver = 'mock', concurrency = 3 } = req.body || {};
  try {
    if (!['mock', 'operator'].includes(driver)) {
      return res.status(400).json({ error: `未知执行器: ${driver}` });
    }
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_RUN_CONCURRENCY) {
      return res.status(400).json({ error: `concurrency 必须是 1 到 ${MAX_RUN_CONCURRENCY} 之间的整数` });
    }
    const { run } = await loadRun(req.projectId, req.params.runId);
    if (run.status === 'completed' || run.status === 'failed') {
      return res.status(409).json({ error: `Run 已处于终态 ${run.status},请重新创建` });
    }
    const result = runManager.start({
      projectId: req.projectId, runId: run.id, executorKind: driver, concurrency
    });
    res.json({ success: result.started, ...result, driver });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/runs/:runId/pause */
router.post('/:runId/pause', requireProjectIdMiddlewareFactory(), (req, res) => {
  const ok = runManager.pause(req.projectId, req.params.runId);
  res.status(ok ? 200 : 404).json({ success: ok });
});

/** POST /api/runs/:runId/resume */
router.post('/:runId/resume', requireProjectIdMiddlewareFactory(), (req, res) => {
  const ok = runManager.resume(req.projectId, req.params.runId);
  res.status(ok ? 200 : 404).json({ success: ok });
});

/** POST /api/runs/:runId/abort */
router.post('/:runId/abort', requireProjectIdMiddlewareFactory(), (req, res) => {
  const ok = runManager.abort(req.projectId, req.params.runId);
  res.status(ok ? 200 : 404).json({ success: ok });
});

/**
 * GET /api/runs/:runId/events?projectId=...&sinceSeq=-1 —— 事件回放(HTTP,非 SSE)
 */
router.get('/:runId/events', requireProjectIdMiddlewareFactory(), async (req, res) => {
  try {
    const sinceSeq = req.query.sinceSeq !== undefined ? Number(req.query.sinceSeq) : -1;
    const events = await defaultEventBus.replay(req.projectId, req.params.runId, { sinceSeq });
    res.json({ events, lastSeq: events.reduce((m, e) => Math.max(m, e.seq ?? 0), -1) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/runs/:runId/stream?projectId=...&sinceSeq=-1 —— SSE 事件流
 *
 * 断线续传:EventSource 重连时自动带 `Last-Event-ID`(= 最后收到的 seq),
 * 服务端先回放 [sinceSeq+1, ∞),再转为实时推送。
 * 先订阅后回放,避免「回放与实时之间」丢事件。
 */
router.get('/:runId/stream', requireProjectIdMiddlewareFactory(), async (req, res) => {
  const runId = req.params.runId;
  const headerId = req.headers['last-event-id'];
  const querySeq = req.query.sinceSeq;
  let sinceSeq = headerId !== undefined ? Number(headerId)
    : querySeq !== undefined ? Number(querySeq) : -1;
  if (!Number.isFinite(sinceSeq)) sinceSeq = -1;

  sseHeaders(res);

  const closed = { flag: false };
  const backlog = [];
  let replaying = true;

  // 1) 先订阅(缓冲),再回放,最后按 seq 去重 → 无缝衔接
  const unsubscribe = defaultEventBus.subscribe(runId, (event) => {
    if (closed.flag) return;
    if (replaying) { backlog.push(event); return; }
    if (event.seq > sinceSeq) {
      sinceSeq = event.seq;
      writeEvent(res, event);
      if (event.type === 'run.blocked') close();
    }
  }, req.projectId);

  const heartbeat = setInterval(() => {
    if (!closed.flag) res.write(': hb\n\n');
  }, 15000);

  const close = () => {
    if (closed.flag) return;
    closed.flag = true;
    clearInterval(heartbeat);
    unsubscribe();
    try { res.end(); } catch { /* noop */ }
  };

  req.on('close', close);
  res.on('close', close);

  try {
    const { run } = await loadRun(req.projectId, runId);
    const history = await defaultEventBus.replay(req.projectId, runId, { sinceSeq });

    for (const e of history) {
      if (closed.flag) return;
      sinceSeq = Math.max(sinceSeq, e.seq);
      writeEvent(res, e);
    }

    replaying = false;
    for (const e of backlog) {
      if (closed.flag) return;
      if (e.seq > sinceSeq) {
        sinceSeq = e.seq;
        writeEvent(res, e);
      }
    }
    backlog.length = 0;

    // 一个 `ready` 事件标记「历史回放完毕,此后为实时」
    res.write(`event: stream.ready\ndata: ${JSON.stringify({ lastSeq: sinceSeq, status: run.status })}\n\n`);

    // 已是终态且不在运行 → 回放完即可收尾,避免客户端一直挂着
    if (TERMINAL_STATUSES.includes(run.status) && !runManager.isRunning(req.projectId, runId)) {
      close();
    }
  } catch (err) {
    if (!closed.flag) {
      res.write(`event: stream.error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      close();
    }
  }
});

/** POST /api/runs/:runId/checkpoints —— 创建检查点 */
router.post('/:runId/checkpoints', requireProjectIdMiddlewareFactory(), async (req, res) => {
  try {
    const checkpoint = await createCheckpoint({
      projectId: req.projectId, runId: req.params.runId, label: req.body?.label || 'manual'
    });
    res.json({ success: true, checkpoint });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/runs/:runId/checkpoints */
router.get('/:runId/checkpoints', requireProjectIdMiddlewareFactory(), async (req, res) => {
  try {
    res.json({ checkpoints: await listCheckpoints(req.projectId, req.params.runId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/runs/:runId/rollback —— 时光倒流到检查点 */
router.post('/:runId/rollback', requireProjectIdMiddlewareFactory(), async (req, res) => {
  try {
    const { seq } = req.body || {};
    if (seq === undefined) return res.status(400).json({ error: 'seq 必填' });
    if (runManager.isRunning(req.projectId, req.params.runId)) {
      return res.status(409).json({ error: 'Run 执行中,请先 pause/abort 再回滚' });
    }
    const result = await rollbackTo({ projectId: req.projectId, runId: req.params.runId, seq });
    res.json({ success: true, run: result.run, tasks: result.tasks, checkpoint: result.checkpoint });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 需要 projectId 的统一中间件(与 runtime/requireProjectId 保持一致,
 * 但路由用 :runId,参数来源按 'either' 更宽松)。
 */
function requireProjectIdMiddlewareFactory() {
  return (req, res, next) => {
    try {
      req.projectId = requireProjectId(
        req.body?.projectId || req.query?.projectId,
        `${req.method} ${req.baseUrl}${req.path}`
      );
      next();
    } catch (err) {
      res.status(400).json({ error: err.message, missingParam: 'projectId' });
    }
  };
}

export default router;
