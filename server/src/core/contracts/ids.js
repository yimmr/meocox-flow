/**
 * 内核 ID 与哈希工具。
 *
 * - ulid(prefix):时间有序 + 进程内单调的轻量 ID(非严格 ULID,但可排序)。
 * - hashPayload:对 payload 做稳定序列化后取 sha256,用于产物去重 / Diff / 幂等。
 */
import crypto from 'node:crypto';

let lastTs = 0;
let seqCounter = 0;

/**
 * 生成带前缀的单调递增 ID。
 * @param {string} prefix 如 'run' | 'tsk' | 'art' | 'evt'
 * @returns {string}
 */
export function ulid(prefix = 'id') {
  const ts = Date.now();
  if (ts === lastTs) {
    seqCounter += 1;
  } else {
    lastTs = ts;
    seqCounter = 0;
  }
  const rand = crypto.randomBytes(5).toString('hex');
  return `${prefix}_${ts.toString(36)}${seqCounter.toString(36)}${rand}`;
}

/**
 * 递归稳定序列化(对象键排序),保证同内容 payload 哈希一致。
 * @param {*} value
 * @returns {string}
 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(',');
  return `{${body}}`;
}

/**
 * 计算 payload 内容哈希。
 * @param {*} payload
 * @returns {string} 形如 'sha256:<hex>'
 */
export function hashPayload(payload) {
  const json = stableStringify(payload);
  return `sha256:${crypto.createHash('sha256').update(json).digest('hex')}`;
}