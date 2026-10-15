/**
 * 投影层 API 客户端(事件流 → 遥测 / 审计白皮书 / 时光树 / 检查点 Diff)。
 *
 * 分层非破坏式接入:
 *   - 全部是**只读投影**请求 + 检查点/回滚(服务端 append-only,回滚不改历史);
 *   - 任何失败都**不打断演示**:返回 null,由调用方决定是否提示。
 *
 * 服务端契约见 server/src/routes/projections.js。
 */
import { apiUrl } from '@/lib/apiClient.js';
import { DEMO_RUN_ID } from '@/lib/primitivesApi.js';

const BASE = '/api/runs';

async function get(path) {
  try {
    const res = await fetch(apiUrl(path), { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function post(path, body) {
  try {
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      try { return { error: (await res.json())?.error || `HTTP ${res.status}` }; }
      catch { return { error: `HTTP ${res.status}` }; }
    }
    return await res.json();
  } catch (err) {
    return { error: err?.message || String(err) };
  }
}

const runPath = (runId) => `${BASE}/${encodeURIComponent(runId || DEMO_RUN_ID)}`;

/**
 * 遥测投影:遥测条 / 汇总 / 预算序列 / 用量。
 * @returns {Promise<object|null>}
 */
export async function loadTelemetry(projectId, runId) {
  if (!projectId) return null;
  return get(`${runPath(runId)}/telemetry?projectId=${encodeURIComponent(projectId)}`);
}

/**
 * 审计白皮书。
 * @param {'json'|'md'} [format]
 * @returns {Promise<object|string|null>} format='md' 时返回 Markdown 文本
 */
export async function loadAudit(projectId, runId, format = 'json') {
  if (!projectId) return null;
  const url = `${runPath(runId)}/audit?projectId=${encodeURIComponent(projectId)}&format=${format}`;
  if (format === 'md') {
    try {
      const res = await fetch(apiUrl(url), { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }
  return get(url);
}

/**
 * 时光树:节点 / 分支 / 回滚 / 升级单。
 * @returns {Promise<object|null>}
 */
export async function loadTimeline(projectId, runId) {
  if (!projectId) return null;
  return get(`${runPath(runId)}/timeline?projectId=${encodeURIComponent(projectId)}`);
}

/**
 * 两个检查点的字段级 Diff(缺省 = 最近两个)。
 * @param {number} [from] 检查点 seq
 * @param {number} [to] 检查点 seq
 * @returns {Promise<object|null>}
 */
export async function loadDiff(projectId, runId, from, to) {
  if (!projectId) return null;
  const extra = [];
  if (from !== undefined && from !== null) extra.push(`from=${encodeURIComponent(from)}`);
  if (to !== undefined && to !== null) extra.push(`to=${encodeURIComponent(to)}`);
  const qs = [extra.join('&'), `projectId=${encodeURIComponent(projectId)}`].filter(Boolean).join('&');
  return get(`${runPath(runId)}/diff?${qs}`);
}

/** 列出服务端检查点 */
export async function loadCheckpoints(projectId, runId) {
  if (!projectId) return null;
  const data = await get(`${runPath(runId)}/checkpoints?projectId=${encodeURIComponent(projectId)}`);
  return data?.checkpoints ?? null;
}

/**
 * 创建服务端检查点(落盘快照 + checkpoint.created 事件)。
 * @returns {Promise<{checkpoint?:object, error?:string}>}
 */
export async function createServerCheckpoint(projectId, runId, label = 'manual') {
  if (!projectId) return { error: '缺少 projectId' };
  return post(`${runPath(runId)}/checkpoints`, { projectId, label });
}

/**
 * 一键回滚到指定检查点(append-only:回滚本身也是一条正向事件)。
 * @param {number} seq 检查点的快照 seq
 * @returns {Promise<{success?:boolean, run?:object, error?:string}>}
 */
export async function rollbackRun(projectId, runId, seq) {
  if (!projectId) return { error: '缺少 projectId' };
  if (seq === undefined || seq === null) return { error: '缺少检查点 seq' };
  return post(`${runPath(runId)}/rollback`, { projectId, seq });
}

export default {
  DEMO_RUN_ID,
  loadTelemetry,
  loadAudit,
  loadTimeline,
  loadDiff,
  loadCheckpoints,
  createServerCheckpoint,
  rollbackRun
};
