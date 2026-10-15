/**
 * 共享黑板 API(项目级)。
 *
 * 契约:
 *   GET  /api/blackboard?projectId=            当前黑板(惰性创建)
 *   POST /api/blackboard/read                  Agent 语义读(留痕 blackboard.read)
 *   POST /api/blackboard/write                 覆盖式写(留痕 blackboard.written)
 *   POST /api/blackboard/rule                  追加一条规则
 *   POST /api/blackboard/trace                 记录一条 pub/sub 轨迹
 *   GET  /api/blackboard/events?sinceSeq=      审计事件回放(HTTP)
 *   GET  /api/blackboard/stream?sinceSeq=      审计事件流(SSE,支持 Last-Event-ID)
 */
import express from 'express';
import { requireProjectId } from '../storage/index.js';
import { defaultBlackboardStore, BB_AUDIT_RUN_ID } from '../core/blackboard/store.js';

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

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function writeEvent(res, event) {
  res.write(`id: ${event.seq}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/** 当前黑板 */
router.get('/', (req, res) => {
  if (!requirePid(req, res)) return;
  defaultBlackboardStore.get(req.projectId)
    .then((board) => res.json({ blackboard: board, revision: board.revision }))
    .catch((err) => res.status(500).json({ error: err.message }));
});

/** Agent 语义读(发 blackboard.read) */
router.post('/read', (req, res) => {
  if (!requirePid(req, res)) return;
  defaultBlackboardStore.read(req.projectId, {
    actor: req.body?.actor,
    runId: req.body?.runId || null,
    taskId: req.body?.taskId || null,
    keys: req.body?.keys,
    reason: req.body?.reason
  })
    .then((board) => res.json({ blackboard: board, revision: board.revision }))
    .catch((err) => res.status(500).json({ error: err.message }));
});

/** 覆盖式写(发 blackboard.written) */
router.post('/write', (req, res) => {
  if (!requirePid(req, res)) return;
  defaultBlackboardStore.write(req.projectId, req.body?.patch || {}, {
    actor: req.body?.actor,
    runId: req.body?.runId || null,
    taskId: req.body?.taskId || null,
    keys: req.body?.keys,
    reason: req.body?.reason
  })
    .then((board) => res.json({ success: true, blackboard: board, revision: board.revision }))
    .catch((err) => res.status(500).json({ error: err.message }));
});

/** 追加一条规则 */
router.post('/rule', (req, res) => {
  if (!requirePid(req, res)) return;
  defaultBlackboardStore.appendRule(req.projectId, {
    category: req.body?.category,
    rule: req.body?.rule,
    source: req.body?.source,
    agent: req.body?.agent
  }, { actor: req.body?.actor, runId: req.body?.runId || null })
    .then((board) => res.json({ success: true, blackboard: board, revision: board.revision }))
    .catch((err) => res.status(400).json({ error: err.message }));
});

/** 记录 pub/sub 轨迹 */
router.post('/trace', (req, res) => {
  if (!requirePid(req, res)) return;
  defaultBlackboardStore.trace(req.projectId, req.body?.entry || {}, {
    actor: req.body?.actor,
    runId: req.body?.runId || null
  })
    .then((board) => res.json({ success: true, blackboard: board, revision: board.revision }))
    .catch((err) => res.status(400).json({ error: err.message }));
});

/** 审计事件回放(HTTP) */
router.get('/events', (req, res) => {
  if (!requirePid(req, res)) return;
  const raw = req.query.sinceSeq;
  const sinceSeq = raw !== undefined && Number.isFinite(Number(raw)) ? Number(raw) : -1;
  defaultBlackboardStore.history(req.projectId, { sinceSeq })
    .then((events) => res.json({
      events,
      lastSeq: events.reduce((m, e) => Math.max(m, e.seq ?? 0), -1)
    }))
    .catch((err) => res.status(500).json({ error: err.message }));
});

/**
 * 审计事件流(SSE)。
 *
 * 断线续传:`Last-Event-ID` = 最后收到的 seq;先订阅缓冲、再回放、按 seq 去重,
 * 回放与实时之间不留空洞。
 */
router.get('/stream', (req, res) => {
  if (!requirePid(req, res)) return;
  const projectId = req.projectId;

  const headerId = req.headers['last-event-id'];
  const querySeq = req.query.sinceSeq;
  let sinceSeq = headerId !== undefined ? Number(headerId)
    : querySeq !== undefined ? Number(querySeq) : -1;
  if (!Number.isFinite(sinceSeq)) sinceSeq = -1;

  sseHeaders(res);

  const closed = { flag: false };
  const backlog = [];
  let replaying = true;

  const unsubscribe = defaultBlackboardStore.subscribe((event) => {
    if (closed.flag) return;
    if (replaying) { backlog.push(event); return; }
    if (event.seq > sinceSeq) {
      sinceSeq = event.seq;
      writeEvent(res, event);
    }
  }, projectId);

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

  defaultBlackboardStore.history(projectId, { sinceSeq })
    .then((history) => {
      if (closed.flag) return;
      for (const e of history) {
        sinceSeq = Math.max(sinceSeq, e.seq);
        writeEvent(res, e);
      }
      replaying = false;
      for (const e of backlog) {
        if (e.seq > sinceSeq) {
          sinceSeq = e.seq;
          writeEvent(res, e);
        }
      }
      backlog.length = 0;
      res.write(`event: stream.ready\ndata: ${JSON.stringify({ lastSeq: sinceSeq, runId: BB_AUDIT_RUN_ID })}\n\n`);
    })
    .catch((err) => {
      if (closed.flag) return;
      res.write(`event: stream.error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      close();
    });
});

export default router;
