/**
 * 统一执行封套 (Unified Execution Envelope)
 * 
 * 规范：系统中所有工具 (Tool)、函数 (Function)、命令 (CMD)、子智能体 (Subagent)
 * 的执行输出必须统一收敛为此结构。
 */

export function createEnvelope({
  success = true,
  summary = '',
  data = null,
  artifacts = [],
  error = null
} = {}) {
  const isSuccess = Boolean(success) && !error;

  const base = {
    // 执行状态标示：true 表示正常执行完成，false 表示遇到错误或异常
    success: isSuccess,

    // 关键摘要：供大模型在上下文有限时直接感知结果，避免海量日志污染 Context
    summary: String(summary || (isSuccess ? '执行成功' : '执行失败')),

    // 结构化业务数据：工具产生的主要结构化内容
    data: data !== undefined ? data : null,

    // 产生或引用的物理/虚拟资产列表
    artifacts: Array.isArray(artifacts) ? artifacts : [],

    // 错误信息捕获：杜绝不可控异常崩盘，让主智能体可以据此反思、重试或上报
    error: error
      ? {
          code: error.code || 'EXECUTION_ERROR',
          message: error.message || String(error),
          details: error.details || null
        }
      : null
  };

  // 向后兼容支持：如果 data 为普通对象，在不覆盖标准封套字段的前提下将业务属性浅映射至根
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data)) {
      if (!(k in base)) {
        base[k] = v;
      }
    }
  }

  return base;
}

const DEFAULT_MAX_INBOUND_STRING_CHARS = 16000;

function pruneOversizedValue(value, maxChars, state, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (value.length > maxChars) {
      state.pruned = true;
      state.prunedBytes += value.length - maxChars;
      return `${value.slice(0, maxChars)}... [Inbound Pruned: original ${value.length} chars]`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => pruneOversizedValue(item, maxChars, state, depth + 1));
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = pruneOversizedValue(v, maxChars, state, depth + 1);
    }
    return out;
  }

  return value;
}

/**
 * 入站即脱水守卫 (Inbound Payload Pruning)
 * 防止工具单次返回数万字原始日志或内联 Base64 撑爆上下文窗口并破坏 KV Cache
 */
export function dehydrateOversizedEnvelope(envelope, { maxStringLength = DEFAULT_MAX_INBOUND_STRING_CHARS } = {}) {
  if (!envelope || typeof envelope !== 'object') return envelope;

  const state = { pruned: false, prunedBytes: 0 };
  const prunedData = pruneOversizedValue(envelope.data, maxStringLength, state, 0);

  if (!state.pruned) {
    return envelope;
  }

  const rebuilt = createEnvelope({
    success: envelope.success,
    summary: envelope.summary,
    data: prunedData,
    artifacts: envelope.artifacts,
    error: envelope.error
  });
  rebuilt._inboundPruned = true;
  rebuilt._prunedChars = state.prunedBytes;
  return rebuilt;
}

/**
 * 安全包装执行函数，确保无论发生何种异常，均返回合规且经入站脱水守卫处理的 Envelope
 */
export async function wrapExecution(fn, defaultSummary = '', options = {}) {
  try {
    const rawResult = await fn();

    // 只有完整符合封套结构的对象才按 Envelope 处理。业务结果本身也常有
    // success / summary 字段，不能因此把其余结果字段丢掉。
    const isEnvelope = rawResult && typeof rawResult === 'object' &&
      ['success', 'summary', 'data', 'artifacts', 'error'].every((key) =>
        Object.prototype.hasOwnProperty.call(rawResult, key)
      );
    if (isEnvelope) {
      return dehydrateOversizedEnvelope(createEnvelope(rawResult), options);
    }

    if (rawResult && typeof rawResult === 'object' && rawResult.success === false) {
      return dehydrateOversizedEnvelope(createEnvelope({
        success: false,
        summary: rawResult.summary || defaultSummary || '执行失败',
        data: rawResult.data ?? null,
        artifacts: rawResult.artifacts || [],
        error: rawResult.error || { message: rawResult.message || '工具执行失败' }
      }), options);
    }

    // 否则将原生返回值封装进 data
    return dehydrateOversizedEnvelope(createEnvelope({
      success: rawResult?.success !== false,
      summary: rawResult?.summary || defaultSummary || '执行成功',
      data: rawResult
    }), options);
  } catch (err) {
    return createEnvelope({
      success: false,
      summary: `执行异常: ${err.message || String(err)}`,
      error: {
        code: err.code || 'RUN_EXCEPTION',
        message: err.message || String(err),
        details: err.stack || null
      }
    });
  }
}
