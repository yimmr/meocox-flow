/**
 * 共享黑板 API 客户端(项目级事实黑板)。
 *
 * 分层非破坏式接入:
 *   - `loadBlackboard` 用于挂载时从服务端恢复(服务端为 Agent 可见的真相源);
 *   - `seedBlackboard` 仅在服务端为空时把本地演示默认值推上去,
 *     让「全案 Agent 读到的规则」与屏幕上一致;
 *   - `addBlackboardRule` 在本地乐观更新的同时写服务端;
 *   - 任何失败都**不打断演示**:返回 false,由调用方决定是否提示。
 *
 * 服务端契约见 server/src/routes/blackboard.js。
 */
import { apiUrl } from '@/lib/apiClient.js';

const BASE = '/api/blackboard';

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
 * 读取服务端黑板(惰性创建,永远返回一个对象)。
 * @param {string} projectId
 * @returns {Promise<object|null>} 黑板;失败返回 null
 */
export async function loadBlackboard(projectId) {
  if (!projectId) return null;
  const data = await get(`${BASE}/?projectId=${encodeURIComponent(projectId)}`);
  return data?.blackboard ?? null;
}

/**
 * 服务端黑板是否已有实质内容(用于判断是否需要灌入演示默认值)。
 * @param {object|null} board
 */
export function hasContent(board) {
  if (!board) return false;
  if ((board.revision || 0) > 0) return true;
  return Boolean(
    (board.negativeConstraints?.length) ||
    (board.bossEpisodicMemory?.length) ||
    Object.keys(board.projectDNA || {}).length ||
    Object.keys(board.facts || {}).length
  );
}

/**
 * 把一份黑板整体灌入服务端(仅在服务端为空时调用)。
 * @returns {Promise<boolean>}
 */
export async function seedBlackboard(projectId, blackboard) {
  if (!projectId || !blackboard) return false;
  const data = await post(`${BASE}/write`, {
    projectId,
    patch: {
      projectDNA: blackboard.projectDNA || {},
      lockedStyleGuide: blackboard.lockedStyleGuide || {},
      negativeConstraints: blackboard.negativeConstraints || [],
      bgmAtmosphere: blackboard.bgmAtmosphere || {},
      bossEpisodicMemory: blackboard.bossEpisodicMemory || [],
      pubSubEvents: blackboard.pubSubEvents || []
    },
    actor: { kind: 'system', id: 'studio-demo' },
    reason: 'seed'
  });
  return Boolean(data?.success);
}

/**
 * 追加一条规则(本地 + 服务端)。
 * @returns {Promise<boolean>} 服务端是否写入成功
 */
export async function addBlackboardRule(projectId, { category, rule, source = 'boss' }) {
  if (!projectId || !rule) return false;
  const data = await post(`${BASE}/rule`, {
    projectId,
    category,
    rule,
    source,
    actor: { kind: 'boss', id: 'boss' }
  });
  return Boolean(data?.success);
}

/**
 * 记录一条 pub/sub 轨迹(谁在什么时候动了哪个 key)。
 * @returns {Promise<boolean>}
 */
export async function traceBlackboard(projectId, entry) {
  if (!projectId) return false;
  const data = await post(`${BASE}/trace`, {
    projectId,
    entry,
    actor: { kind: 'agent', id: entry?.agent || 'system' }
  });
  return Boolean(data?.success);
}

/**
 * 合并本地与服务端黑板。
 *
 * 规则:
 *   - 列表型(negativeConstraints / bossEpisodicMemory / pubSubEvents)取**并集**,
 *     服务端条目在前,再补本地独有的 —— 保证既「Agent 看得到」又「屏幕上不丢东西」;
 *   - 对象/标量(projectDNA / lockedStyleGuide / bgmAtmosphere / facts)以服务端为准;
 *   - revision/updatedAt 等元数据跟随服务端。
 *
 * @param {object} local 演示内存态
 * @param {object} server 服务端真相源
 * @returns {object} 合并后的黑板
 */
export function mergeBlackboard(local, server) {
  if (!local) return server || {};
  if (!server) return local;
  const out = { ...local, ...server };

  const unionById = (a = [], b = []) => {
    const seen = new Set();
    const outList = [];
    for (const item of [...b, ...a]) {
      const key = item && typeof item === 'object' ? item.id : item;
      if (key === undefined || key === null) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      outList.push(item);
    }
    return outList;
  };

  out.negativeConstraints = unionById(local.negativeConstraints, server.negativeConstraints);
  out.bossEpisodicMemory = unionById(local.bossEpisodicMemory, server.bossEpisodicMemory);
  out.pubSubEvents = unionById(local.pubSubEvents, server.pubSubEvents);
  return out;
}

export default { loadBlackboard, hasContent, seedBlackboard, addBlackboardRule, traceBlackboard, mergeBlackboard };
