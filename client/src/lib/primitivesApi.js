/**
 * 协作原语 API 客户端(升级单 / 裁决 / 返工变更单)。
 *
 * 分层非破坏式接入:
 *   - 演示的本地编排(setTimeout choreography)**原样保留**;
 *   - 三个原本「硬编码」的老板动作(报错呈报 / 拍板裁决 / 逆向打回)
 *     在本地演出的同时,把同一件事实写进服务端事件流(可回放可审计);
 *   - 任何失败都**不打断演示**:返回 null,由调用方决定是否提示。
 *
 * 服务端契约见 server/src/routes/primitives.js。
 */
import { apiUrl } from '@/lib/apiClient.js';

/** Studio 演示 Run(与 server routes/runs.js 的 DEMO_RUN_ID 对齐) */
export const DEMO_RUN_ID = 'run_studio_demo';

const BASE = '/api/runs';

async function post(path, body) {
  try {
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function get(path) {
  try {
    const res = await fetch(apiUrl(path), { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * 打开一张升级单(异常自下而上汇报)。
 * @returns {Promise<object|null>} 规范化升级单(带 id);失败返回 null
 */
export async function openEscalation(projectId, runId, escalation) {
  if (!projectId || !escalation) return null;
  const data = await post(`${BASE}/${encodeURIComponent(runId || DEMO_RUN_ID)}/escalations`, {
    projectId,
    escalation
  });
  return data?.escalation ?? null;
}

/**
 * 解决一张升级单(老板拍板 / 自治脱困)。
 * @returns {Promise<boolean>}
 */
export async function resolveEscalation(projectId, runId, id, resolution = {}) {
  if (!projectId || !id) return false;
  const data = await post(
    `${BASE}/${encodeURIComponent(runId || DEMO_RUN_ID)}/escalations/${encodeURIComponent(id)}/resolve`,
    { projectId, resolution, actor: 'boss' }
  );
  return Boolean(data?.success);
}

/**
 * 记录一条 intent 化裁决(服务端按 scope 作用到对应原语)。
 * @returns {Promise<object|null>} { decision, applied };失败返回 null
 */
export async function sendDecision(projectId, runId, decision) {
  if (!projectId || !decision) return null;
  const data = await post(`${BASE}/${encodeURIComponent(runId || DEMO_RUN_ID)}/decisions`, {
    projectId,
    decision
  });
  return data ?? null;
}

/**
 * 发起返工变更单(服务端做影响面分析)。
 * @returns {Promise<object|null>} { changeRequest, impact };失败返回 null
 */
export async function requestChange(projectId, runId, input) {
  if (!projectId || !input) return null;
  const data = await post(`${BASE}/${encodeURIComponent(runId || DEMO_RUN_ID)}/change-requests`, {
    projectId,
    ...input
  });
  return data ?? null;
}

/**
 * 应用返工(受影响产物 stale + 受影响任务重排)。
 * @returns {Promise<object|null>} { recomputeSet, requeued, artifactsStaled }
 */
export async function applyChange(projectId, runId, changeRequestId) {
  if (!projectId || !changeRequestId) return null;
  const data = await post(
    `${BASE}/${encodeURIComponent(runId || DEMO_RUN_ID)}/change-requests/${encodeURIComponent(changeRequestId)}/apply`,
    { projectId }
  );
  return data ?? null;
}

/**
 * 读取协作状态折叠(升级单 / 变更单 / 裁决)。
 * @returns {Promise<object|null>}
 */
export async function loadCollaboration(projectId, runId) {
  if (!projectId) return null;
  const data = await get(
    `${BASE}/${encodeURIComponent(runId || DEMO_RUN_ID)}/collaboration?projectId=${encodeURIComponent(projectId)}`
  );
  return data ?? null;
}

export default {
  DEMO_RUN_ID,
  openEscalation,
  resolveEscalation,
  sendDecision,
  requestChange,
  applyChange,
  loadCollaboration
};
