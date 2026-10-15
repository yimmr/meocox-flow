/**
 * 投影层 API(挂载在 /api/runs 之下,与 runsRouter / primitivesRouter 路径不相交)。
 *
 * 全部是 events.jsonl 的**只读投影**,不改写任何状态:
 *   GET /api/runs/:runId/telemetry            遥测条 / 汇总 / 预算序列 / 用量
 *   GET /api/runs/:runId/audit?format=json|md 审计白皮书(结构化 / Markdown)
 *   GET /api/runs/:runId/timeline             时光树(节点 + 分支 + 废弃段)
 *   GET /api/runs/:runId/diff?from&to         两个检查点的字段级 Diff
 *                                             (缺省 = 最近两个;from/to 为检查点 seq)
 */
import express from 'express';
import { storage, requireProjectId } from '../storage/index.js';
import { buildTelemetry } from '../core/projections/telemetry.js';
import { buildAuditReport, renderAuditMarkdown } from '../core/projections/audit.js';
import { buildTimeTree } from '../core/projections/timeTree.js';
import { diffCheckpoints } from '../core/projections/diff.js';

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

function fail(res, err, status = 500) {
  const code = err?.code === 'ENOENT' ? 404 : status;
  res.status(code).json({ error: err?.message || String(err), code: err?.code || null });
}

/** 遥测投影 */
router.get('/:runId/telemetry', async (req, res) => {
  if (!requirePid(req, res)) return;
  try {
    const [events, tasks] = await Promise.all([
      storage.readEvents(req.projectId, req.params.runId),
      storage.listTasks(req.projectId, req.params.runId)
    ]);
    res.json(buildTelemetry(events, tasks));
  } catch (err) {
    fail(res, err);
  }
});

/** 审计白皮书(?format=md 输出 Markdown 文本) */
router.get('/:runId/audit', async (req, res) => {
  if (!requirePid(req, res)) return;
  try {
    const events = await storage.readEvents(req.projectId, req.params.runId);
    const report = buildAuditReport(events, {
      runId: req.params.runId,
      projectId: req.projectId
    });
    if (req.query.format === 'md') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.send(renderAuditMarkdown(report));
      return;
    }
    res.json(report);
  } catch (err) {
    fail(res, err);
  }
});

/** 时光树:节点 / 分支 / 回滚 / 升级单 */
router.get('/:runId/timeline', async (req, res) => {
  if (!requirePid(req, res)) return;
  try {
    const [events, checkpoints] = await Promise.all([
      storage.readEvents(req.projectId, req.params.runId),
      storage.listCheckpoints(req.projectId, req.params.runId)
    ]);
    res.json(buildTimeTree(events, checkpoints));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * 检查点 Diff(?from=<seq>&to=<seq>,缺省取最近两个)。
 * from/to 指检查点的快照 seq(与 GET /checkpoints 返回的 seq 一致)。
 */
router.get('/:runId/diff', async (req, res) => {
  if (!requirePid(req, res)) return;
  try {
    const checkpoints = (await storage.listCheckpoints(req.projectId, req.params.runId))
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    if (checkpoints.length < 2) {
      return res.status(400).json({
        error: `至少需要 2 个检查点才能对比(当前 ${checkpoints.length} 个)`,
        code: 'EDIFF_NOT_ENOUGH'
      });
    }

    const pick = (value) => {
      if (value === undefined || value === null || value === '') return null;
      const seq = Number(value);
      if (!Number.isFinite(seq)) {
        const err = new Error(`无效的检查点 seq: ${value}`);
        err.code = 'EDIFF_BAD_SEQ';
        throw err;
      }
      const found = checkpoints.find((c) => c.seq === seq);
      if (!found) {
        const err = new Error(`未找到 seq=${seq} 的检查点`);
        err.code = 'EDIFF_NOT_FOUND';
        throw err;
      }
      return found;
    };

    let from;
    let to;
    if (req.query.from !== undefined || req.query.to !== undefined) {
      from = pick(req.query.from) ?? checkpoints[checkpoints.length - 2];
      to = pick(req.query.to) ?? checkpoints[checkpoints.length - 1];
    } else {
      from = checkpoints[checkpoints.length - 2];
      to = checkpoints[checkpoints.length - 1];
    }

    res.json(diffCheckpoints(from, to));
  } catch (err) {
    const status = err.code === 'EDIFF_NOT_FOUND' || err.code === 'EDIFF_BAD_SEQ' ? 404
      : err.code === 'EDIFF_NOT_ENOUGH' ? 400 : 500;
    fail(res, err, status);
  }
});

export default router;
