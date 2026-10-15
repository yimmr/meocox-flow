/**
 * 针对桌面端本地绝对路径与长字符串的智能浓缩格式化
 * 优先保留文件名与父级目录，避免因前缀截断导致所有路径看起来都是 "C:\Users\..."
 */
function formatCompactStringValue(rawVal, maxLen = 34) {
  const val = String(rawVal || '').trim();
  if (!val) return '';
  if (val.length <= maxLen) return val;

  // 识别本地或 URL 路径，保留末尾文件名与上一级目录
  if (/[\\/]/.test(val) && !/\s{2,}/.test(val)) {
    const parts = val.split(/[\\/]+/).filter(Boolean);
    if (parts.length >= 2) {
      const tail2 = `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
      if (tail2.length + 2 <= maxLen) return `…/${tail2}`;
    }
    const base = parts[parts.length - 1] || val;
    if (base.length <= maxLen) return `…/${base}`;
    return `…${base.slice(-(maxLen - 1))}`;
  }

  return `${val.slice(0, maxLen - 1)}…`;
}

/**
 * 提取易读的动态调参关键指标 (Key Parameters)
 * 供工作流单行/节点摘要展示，避免直接 dump 庞大的原始 JSON
 */
export function extractKeyParams(inputs) {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) return [];
  const params = [];
  const entries = Object.entries(inputs);
  const ignoredKeys = new Set([
    'projectId',
    'threadId',
    'trigger',
    'userInput',
    'userPrompt',
    'context',
    '_callingContext',
    '_model'
  ]);

  for (const [key, val] of entries) {
    if (params.length >= 4) break;
    if (val === null || val === undefined) continue;
    if (ignoredKeys.has(key) || key.startsWith('_')) continue;

    if (typeof val === 'number' || typeof val === 'boolean') {
      params.push({ key, value: String(val) });
    } else if (typeof val === 'string') {
      if (!val.trim()) continue;
      params.push({ key, value: formatCompactStringValue(val, 34) });
    } else if (Array.isArray(val)) {
      params.push({ key, value: `${val.length} 项` });
    } else if (typeof val === 'object') {
      const keysCount = Object.keys(val).length;
      params.push({ key, value: `${keysCount} 属性` });
    }
  }

  return params;
}

/**
 * 契约驱动的节点输出单行摘要提取器 (Contract-First Output Summary Extractor)
 * 严格遵从执行封套 Envelope (summary / data / artifacts / error) 规范：
 * 只读取显式声明的 summary、错误说明或纯文本输出，绝不通过字段名正则反向猜度业务逻辑
 */
export function extractOutputSummary(outputs, explicitSummary = '') {
  const cleanLine = (str, maxLen = 52) => {
    const firstLine = String(str || '')
      .replace(/^\[MOCK\s*拦截\]\s*/i, '')
      .replace(/^>\s*/, '')
      .trim()
      .split(/[\r\n]+/)
      .find((line) => line.trim());
    if (!firstLine) return '';
    return formatCompactStringValue(firstLine.trim(), maxLen);
  };

  if (typeof explicitSummary === 'string' && explicitSummary.trim()) {
    return cleanLine(explicitSummary, 52);
  }

  if (outputs === null || outputs === undefined) return '';
  if (typeof outputs === 'string') return cleanLine(outputs, 52);
  if (typeof outputs === 'number' || typeof outputs === 'boolean') return String(outputs);

  if (outputs && typeof outputs === 'object' && typeof outputs.summary === 'string' && outputs.summary.trim()) {
    return cleanLine(outputs.summary, 52);
  }

  return '';
}

/**
 * 清洗历史或流式思维链中的占位提示行，保留纯粹的模型推演文本
 */
export function cleanThoughtText(raw = '') {
  if (typeof raw !== 'string' || !raw) return '';
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !line.includes('正在深度分析意图边界与推演执行拓扑'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 从多段思维链 (<think>) 中提炼单行核心结论或最新推演句
 * 杜绝将数千字原始思考瀑布直接倾倒在微工作流主干上
 */
export function extractThoughtConclusion(thought = '', fallback = '') {
  const cleaned = cleanThoughtText(thought);
  const lines = cleaned
    .split(/[\r\n]+/)
    .map((line) => line.replace(/^>\s*/, '').replace(/^[-*#]+\s*/, '').trim())
    .filter((line) => line && !line.startsWith('```'));

  if (lines.length === 0) {
    const cleanFallback = cleanThoughtText(fallback).replace(/^>\s*/, '').trim();
    return cleanFallback ? formatCompactStringValue(cleanFallback, 68) : '';
  }

  const lastMeaningful = lines[lines.length - 1];
  return formatCompactStringValue(lastMeaningful, 72);
}

/** Stable UI-facing envelope between transport events and timeline projections. */
export function normalizeActivityEvent(eventType, payload = {}, context = {}) {
  const timestamp = payload.timestamp || payload.ts || context.now?.() || Date.now();
  const activityId = payload.activityId || payload.logicalStepId || payload.stepId || null;
  return {
    schemaVersion: 1,
    eventId: payload.eventId || context.eventId || null,
    type: eventType,
    timestamp,
    correlationId: payload.correlationId || payload.turnId || context.correlationId || null,
    taskId: payload.taskId || context.taskId || null,
    runId: payload.runId || context.runId || null,
    activityId,
    attemptId: payload.attemptId || (payload.attempt != null ? `${activityId}:${payload.attempt}` : null),
    actor: payload.actor || (payload.agentId || context.agentId
      ? { kind: 'agent', id: payload.agentId || context.agentId }
      : { kind: 'system', id: 'stream-adapter' }),
    payload
  };
}

/**
 * Projects transport events into stable, user-facing timeline items.
 * The event stream is not the agent transcript: it is a presentation read model.
 */
export function applyTimelineEvent(items, inputEvent, legacyPayload = {}, options = {}) {
  const event = typeof inputEvent === 'string'
    ? normalizeActivityEvent(inputEvent, legacyPayload, options)
    : inputEvent;
  if (!event || typeof event.type !== 'string') return Array.isArray(items) ? items : [];
  const eventType = event.type;
  const payload = event.payload || {};
  const now = options.now || Date.now;
  const agentId = options.agentId || event.actor?.id || null;
  const current = Array.isArray(items) ? items : [];

  if (eventType === 'agent_start') {
    // 根会话主导智能体 (如 super-brain 或用户直接对话的主控) 是回合 Host，不作为孤立占位节点
    if (payload.visibility === 'user' || payload.agentId === 'super-brain') {
      return current;
    }
    const activityId = payload.activityId || `${payload.turnId || event.correlationId || 'turn'}:${payload.agentId || 'agent'}`;
    const index = current.findIndex((item) => 
      (item.itemType === 'agent_activity' && item.activityId === activityId) ||
      (item.itemType === 'thinking' && item.agentId === payload.agentId && item.status === 'running')
    );
    const previous = index >= 0 ? current[index] : null;
    const next = {
      ...(previous || {}),
      id: previous?.id || `agent_activity_${activityId}`,
      itemType: previous?.itemType === 'thinking' ? 'thinking' : 'agent_activity',
      activityId,
      stageId: payload.stageId || activityId,
      agentId: payload.agentId || agentId,
      agentName: payload.agentName || payload.agentId || '智能体',
      agentRole: payload.agentRole || '执行中',
      agentAvatar: payload.agentAvatar || null,
      goal: payload.goal || '',
      visibility: payload.visibility || 'internal',
      status: 'running',
      turnId: payload.turnId || event.correlationId || null
    };
    if (index < 0) return [...current, next];
    return current.map((item, itemIndex) => itemIndex === index ? next : item);
  }

  if (eventType === 'step_start') {
    const stepId = payload.stepId || `step_${now()}`;
    const activityId = payload.activityId || payload.logicalStepId || stepId;
    const itemType = payload.type === 'thinking' ? 'thinking' : 'tool_execution';
    // 优先匹配相同 stepId/activityId，或匹配处于运行态的纯占位 agent_activity（消除孤立空块）
    let index = current.findIndex((item) => 
      item.activityId === activityId || 
      item.stepId === stepId ||
      (item.itemType === 'agent_activity' && item.status === 'running')
    );

    // 若当前无其他中间动作，且紧邻的上一节点也是同一智能体的思考节点，则追加合并至同一思考块
    const lastIdx = current.length - 1;
    const lastItem = lastIdx >= 0 ? current[lastIdx] : null;
    const isConsecutiveThinking = index < 0 &&
      itemType === 'thinking' &&
      lastItem?.itemType === 'thinking' &&
      (!payload.agentId || !lastItem.agentId || payload.agentId === lastItem.agentId);
    if (isConsecutiveThinking) {
      index = lastIdx;
    }

    const previous = index >= 0 ? current[index] : null;
    const isPromotingPlaceholder = previous?.itemType === 'agent_activity';
    const isMergingThinking = itemType === 'thinking' && previous?.itemType === 'thinking';
    const aliases = [...new Set([...(previous?.stepAliases || []), previous?.stepId, stepId].filter(Boolean))];
    const inferredAttempt = payload.attempt ||
      (!isPromotingPlaceholder && !isMergingThinking && previous && previous.stepId !== stepId ? (previous.attempt || 1) + 1 : 1);
    const previousAttempts = !isPromotingPlaceholder && !isMergingThinking && previous && previous.stepId !== stepId
      ? [...(previous.previousAttempts || []), {
          stepId: previous.stepId,
          attempt: previous.attempt || 1,
          status: previous.status,
          duration: previous.duration,
          logs: previous.logs || [],
          outputs: previous.outputs || null,
          summary: previous.summary || ''
        }]
      : (previous?.previousAttempts || []);

    // 若事件未显式携带智能体信息，向后回溯继承当前回合最近活跃的智能体上下文
    const recentAgentItem = [...current].reverse().find((it) =>
      (it.agentId || it.agentName) &&
      (!payload.turnId || !it.turnId || it.turnId === payload.turnId)
    );
    const keyParams = extractKeyParams(payload.inputs);
    const agentName = payload.agentName || previous?.agentName || recentAgentItem?.agentName || null;
    const agentRole = payload.agentRole || previous?.agentRole || recentAgentItem?.agentRole || null;
    const agentAvatar = payload.agentAvatar || previous?.agentAvatar || recentAgentItem?.agentAvatar || null;
    const agentIdVal = payload.agentId || previous?.agentId || agentId || recentAgentItem?.agentId || null;
    const stageId = payload.stageId || previous?.stageId || recentAgentItem?.stageId || null;

    let cleanedInitialThought;
    let needsParagraphBreak = false;
    if (itemType === 'thinking') {
      const prevThought = cleanThoughtText(previous?.thought || '');
      const incomingThought = cleanThoughtText(payload.thought || '');
      if (prevThought && incomingThought && prevThought !== incomingThought) {
        cleanedInitialThought = `${prevThought}\n\n${incomingThought}`;
      } else {
        cleanedInitialThought = incomingThought || prevThought;
        needsParagraphBreak = Boolean(isMergingThinking && prevThought && !incomingThought);
      }
    }

    const prevAccumulatedDuration = isMergingThinking
      ? (parseFloat(previous?.duration) || previous?.accumulatedDuration || 0)
      : 0;

    const next = {
      ...(previous || {}),
      id: previous?.id || `activity_${activityId}`,
      itemType,
      activityId: isMergingThinking ? (previous?.activityId || activityId) : activityId,
      stageId,
      stepId,
      stepAliases: aliases,
      attempt: inferredAttempt,
      retryCount: isMergingThinking ? 0 : Math.max(previous?.retryCount || 0, inferredAttempt - 1),
      previousAttempts,
      type: payload.type,
      agentId: agentIdVal,
      agentName,
      agentRole,
      agentAvatar,
      thought: cleanedInitialThought,
      needsParagraphBreak,
      accumulatedDuration: prevAccumulatedDuration,
      segmentStartTime: now(),
      latestThought: itemType === 'thinking' ? cleanThoughtText(payload.thought || previous?.latestThought || '') : undefined,
      thoughtConclusion: itemType === 'thinking' ? extractThoughtConclusion(cleanedInitialThought) : undefined,
      isThinking: itemType === 'thinking',
      name: payload.name || previous?.name,
      title: payload.title || (itemType === 'thinking' && agentName ? `${agentName} 思考推演` : previous?.title),
      description: payload.description || previous?.description || null,
      trigger: payload.trigger || previous?.goal || null,
      inputs: payload.inputs || null,
      keyParams,
      logs: isPromotingPlaceholder ? [] : (previous?.logs || []),
      latestLog: isPromotingPlaceholder ? '' : (previous?.latestLog || ''),
      outputs: null,
      summary: '',
      verified: undefined,
      displayHint: payload.displayHint || null,
      status: 'running',
      startTime: previous?.startTime || now(),
      duration: isMergingThinking && prevAccumulatedDuration > 0 ? prevAccumulatedDuration.toFixed(1) : null,
      turnId: payload.turnId || event.correlationId || null
    };
    if (index < 0) return [...current, next];
    return current.map((item, itemIndex) => itemIndex === index ? next : item);
  }

  if (eventType === 'step_log' || eventType === 'step_end') {
    const stepId = payload.stepId;
    if (!stepId) return current;
    const index = [...current].reverse().findIndex((item) =>
      item.itemType === 'thinking' || item.itemType === 'tool_execution'
        ? item.stepId === stepId || item.stepAliases?.includes(stepId)
        : false
    );
    if (index < 0) return current;
    const itemIndexToUpdate = current.length - index - 1;

    return current.map((item, itemIndex) => {
      if (itemIndex !== itemIndexToUpdate) return item;
      if (eventType === 'step_log') {
        if (item.itemType === 'thinking') {
          const rawChunk = payload.chunk || '';
          const shouldInsertBreak = item.needsParagraphBreak && item.thought?.trim() && rawChunk.trim();
          const joinedRaw = shouldInsertBreak
            ? `${item.thought.trimEnd()}\n\n${rawChunk.replace(/^[\r\n]+/, '')}`
            : `${item.thought || ''}${rawChunk}`;
          const nextThought = cleanThoughtText(joinedRaw);
          const lines = nextThought
            .split(/[\n\r]+/)
            .map((l) => l.replace(/^>\s*/, '').trim())
            .filter(Boolean);
          const latestThought = lines[lines.length - 1] || '';
          return {
            ...item,
            thought: nextThought,
            needsParagraphBreak: shouldInsertBreak ? false : Boolean(item.needsParagraphBreak),
            latestThought,
            thoughtConclusion: extractThoughtConclusion(nextThought, latestThought)
          };
        }
        const cleanChunk = (payload.chunk || '').replace(/^>\s*/, '').replace(/[\r\n]+$/, '').trim();
        return {
          ...item,
          logs: [...(item.logs || []), payload.chunk || ''],
          latestLog: cleanChunk || item.latestLog || ''
        };
      }

      const segmentDuration = payload.duration != null
        ? Number(payload.duration)
        : ((now() - (item.segmentStartTime || item.startTime || now())) / 1000);
      const duration = ((item.accumulatedDuration || 0) + Math.max(0, segmentDuration)).toFixed(1);
      if (item.itemType === 'thinking') {
        let finalThought = cleanThoughtText(item.thought || '');
        if (payload.thought) {
          const cleanedPayloadThought = cleanThoughtText(payload.thought);
          if (!finalThought) {
            finalThought = cleanedPayloadThought;
          } else if (cleanedPayloadThought && !finalThought.includes(cleanedPayloadThought)) {
            finalThought = `${finalThought}\n\n${cleanedPayloadThought}`;
          }
        }
        return {
          ...item,
          isThinking: false,
          needsParagraphBreak: Boolean(finalThought),
          status: payload.status === 'error' ? 'error' : 'success',
          duration,
          accumulatedDuration: parseFloat(duration) || 0,
          thought: finalThought,
          thoughtConclusion: extractThoughtConclusion(finalThought, item.latestThought)
        };
      }
      const resolvedOutputs = payload.outputs ?? item.outputs ?? null;
      const resolvedSummary = extractOutputSummary(resolvedOutputs, payload.summary || item.summary || '');
      return {
        ...item,
        status: ['success', 'succeeded', 'completed'].includes(payload.status) ? 'success' : 'error',
        duration,
        outputs: resolvedOutputs,
        summary: resolvedSummary,
        verified: payload.verified !== undefined ? payload.verified : item.verified,
        displayHint: payload.displayHint || item.displayHint || null,
        description: payload.description || item.description || null
      };
    });
  }

  if (eventType === 'agent_handoff') {
    const handoffId = payload.handoffId || `handoff_${now()}`;
    const fromId = payload.fromId || payload.fromAgentId || null;
    const toId = payload.toId || payload.toAgentId || null;
    const isReturn = Boolean(payload.isReturn || payload.type === 'return');
    return [
      ...current.map((item) => {
        const isSourceAgent = (fromId && item.agentId === fromId) || (payload.fromName && item.agentName === payload.fromName);
        if (isSourceAgent) {
          if (item.itemType === 'agent_activity' || item.itemType === 'agent_execution') {
            return { ...item, status: 'completed' };
          }
          if (item.status === 'running' || item.isThinking) {
            return { ...item, status: 'success', isThinking: false };
          }
        }
        if (item.itemType === 'agent_execution' && ['running', 'waiting_decision'].includes(item.status)) {
          return { ...item, status: 'completed' };
        }
        return item;
      }),
      {
        id: handoffId,
        itemType: 'agent_handoff',
        fromId,
        fromName: payload.fromName,
        toId,
        toName: payload.toName,
        reason: payload.reason,
        type: payload.type || (isReturn ? 'return' : 'forward'),
        isReturn,
        summary: payload.summary || null,
        turnId: payload.turnId || event.correlationId || null
      }
    ];
  }

  if (eventType === 'decision_request') {
    const decisionId = payload.decisionId || `decision_${now()}`;
    const next = current.map((item) => item.itemType === 'agent_execution' && item.status === 'running'
      ? { ...item, status: 'waiting_decision' }
      : item);
    if (next.some((item) => item.itemType === 'decision_request' && item.decisionId === decisionId)) return next;
    return [...next, {
      id: `decision_${decisionId}`,
      itemType: 'decision_request',
      decisionId,
      prompt: payload.prompt,
      options: payload.options || [],
      status: 'pending',
      turnId: payload.turnId || event.correlationId || null
    }];
  }

  if (eventType === 'decision_resolve') {
    return current.map((item) => {
      if (
        item.itemType === 'decision_request' &&
        (item.decisionId === payload.decisionId || item.id === payload.decisionId || item.id === `decision_${payload.decisionId}`)
      ) {
        return {
          ...item,
          status: 'resolved',
          selectedOptionId: payload.selectedOptionId,
          selectedLabel: payload.selectedLabel,
          steeringNotes: payload.steeringNotes !== undefined ? payload.steeringNotes : (item.steeringNotes || '')
        };
      }
      if (item.itemType === 'agent_execution' && item.status === 'waiting_decision') {
        return { ...item, status: 'running' };
      }
      return item;
    });
  }

  if (eventType === 'decision_reopen') {
    return current.map((item) => {
      if (
        item.itemType === 'decision_request' &&
        (item.decisionId === payload.decisionId || item.id === payload.decisionId || item.id === `decision_${payload.decisionId}`)
      ) {
        return {
          ...item,
          status: 'pending',
          selectedOptionId: null,
          selectedLabel: null
        };
      }
      return item;
    });
  }

  if (eventType === 'artifact_publish' || eventType === 'artifact_result' || eventType === 'artifact_notification') {
    const artifact = payload.artifact;
    if (!artifact) return current;
    const index = current.findIndex((item) =>
      ['artifact_result', 'artifact_notification'].includes(item.itemType) && item.artifact?.id === artifact.id
    );
    const next = {
      id: `artifact_${artifact.id}`,
      itemType: 'artifact_result',
      artifact,
      turnId: payload.turnId || event.correlationId || null
    };
    if (index < 0) return [...current, next];
    return current.map((item, itemIndex) => itemIndex === index ? next : item);
  }

  if (eventType === 'system_alert' || eventType === 'diagnostic') {
    const id = payload.eventId || `alert_${payload.code || payload.title || now()}`;
    if (current.some((item) => item.id === id)) return current;
    return [...current, {
      id,
      itemType: 'system_alert',
      level: payload.level || 'warning',
      title: payload.title || '系统诊断提示',
      message: payload.message,
      code: payload.code,
      suggestion: payload.suggestion,
      actions: payload.actions || []
    }];
  }

  if (eventType === 'agent_text_delta') {
    const activityId = payload.activityId || `${payload.turnId || 'turn'}:${payload.agentId || 'agent'}`;
    const index = current.findIndex((item) => item.itemType === 'agent_execution' && item.activityId === activityId);
    if (index < 0) {
      return [...current, {
        id: `agent_${activityId}`,
        activityId,
        itemType: 'agent_execution',
        agentId: payload.agentId,
        agentName: payload.agentName || payload.agentId || '协作智能体',
        agentRole: payload.agentRole || '执行专家',
        goal: payload.goal || '',
        status: 'running',
        steps: [],
        summary: payload.delta || ''
      }];
    }
    return current.map((item, itemIndex) => itemIndex === index
      ? { ...item, summary: `${item.summary || ''}${payload.delta || ''}`, status: 'running' }
      : item);
  }

  if (eventType === 'text_delta') {
    const messageId = payload.messageId || payload.turnId || null;
    const index = [...current].reverse().findIndex((item) => item.itemType === 'summary_text' &&
      (!messageId || !item.messageId || item.messageId === messageId));
    if (index >= 0) {
      const itemIndexToUpdate = current.length - index - 1;
      return current.map((item, itemIndex) => itemIndex === itemIndexToUpdate
        ? { ...item, content: `${item.content || ''}${payload.delta || ''}` }
        : item);
    }
    const id = messageId || `summary_${now()}`;
    return [...current, {
      id,
      messageId,
      itemType: 'summary_text',
      content: payload.delta || '',
      agentId: payload.agentId || agentId,
      turnId: payload.turnId || event.correlationId || null
    }];
  }

  if (eventType === 'done' || eventType === 'stream_done') {
    const reply = payload?.reply || {};
    let next = current.map((item) => {
      if (item.itemType === 'thinking' && (item.isThinking || item.status === 'running')) {
        const duration = item.duration || ((now() - (item.startTime || now())) / 1000).toFixed(1);
        return { ...item, isThinking: false, status: 'success', duration };
      }
      if (item.itemType === 'tool_execution' && item.status === 'running') {
        return { ...item, status: 'success' };
      }
      if (item.itemType === 'agent_execution' && item.status === 'running') {
        return { ...item, status: 'completed' };
      }
      if (item.itemType === 'agent_activity' && item.status === 'running') {
        return { ...item, status: 'completed' };
      }
      return item;
    });
    if (reply.content) {
      const messageId = reply.messageId || reply.turnId || null;
      const index = [...next].reverse().findIndex((item) => item.itemType === 'summary_text' &&
        (!messageId || !item.messageId || item.messageId === messageId));
      if (index >= 0) {
        const itemIndexToUpdate = next.length - index - 1;
        next = next.map((item, itemIndex) => itemIndex === itemIndexToUpdate
          ? { ...item, content: reply.content, agentId: reply.agentId || item.agentId || agentId }
          : item);
      } else {
        const id = messageId || `summary_${now()}`;
        next = [...next, {
          id,
          messageId,
          itemType: 'summary_text',
          content: reply.content,
          agentId: reply.agentId || agentId,
          turnId: reply.turnId || payload.turnId || event.correlationId || null
        }];
      }
    }
    return next;
  }

  if (eventType === 'error' || eventType === 'stream_error') {
    const rawMessage = payload.message || payload.error?.message || payload.error || '执行流异常中断';
    const message = typeof rawMessage === 'string' ? rawMessage : JSON.stringify(rawMessage);
    const finalized = current.map((item) => {
      if (item.itemType === 'thinking' && (item.isThinking || item.status === 'running')) {
        const duration = item.duration || ((now() - (item.startTime || now())) / 1000).toFixed(1);
        return { ...item, isThinking: false, status: 'error', duration };
      }
      if (item.itemType === 'tool_execution' && item.status === 'running') {
        return { ...item, status: 'error' };
      }
      if (item.itemType === 'agent_activity' && item.status === 'running') {
        return { ...item, status: 'failed' };
      }
      return item;
    });
    const alertId = payload.eventId || `stream_error_${payload.code || message}`;
    if (finalized.some((item) => item.id === alertId)) return finalized;
    return [...finalized, {
      id: alertId,
      itemType: 'system_alert',
      level: 'error',
      title: payload.code || '执行中断',
      message
    }];
  }

  return current;
}

/**
 * 将单回合扁平的协同动作序列，聚合为智能体动态协同拓扑（主脑直铺 + 子智能体委派接力）：
 * - 宿主主脑 (Super Brain / 当前直接对话的主控智能体) 自身的思考、技能、工具步骤直接作为一级节点 (`kind: 'step'`) 铺在主干上；
 * - 仅当委派给子智能体 (Subagent) 时，子智能体作为一级复合协同阶段节点 (`kind: 'stage'`) 挂载，表达动态接力流向与阶段关键状态。
 */
export function buildMicroWorkflowStages(items = [], defaultAgent = null) {
  if (!Array.isArray(items) || items.length === 0) {
    return { entries: [], breadcrumbs: [], isMultiStage: false };
  }

  const hostAgentId = defaultAgent?.id || 'super-brain';
  const isHostAgent = (agentId) => !agentId || agentId === 'super-brain' || agentId === hostAgentId;

  const isDispatchTool = (step) =>
    step.name === 'dispatch_agent' ||
    step.name === 'assign_task_to_agent' ||
    Boolean(step.inputs?.targetAgentId || step.inputs?.delegatedTo);

  const entries = [];
  let currentSubagentStage = null;
  let lastSeenAgentId = hostAgentId;
  let pendingDispatchStep = null;

  for (const item of items) {
    if (!item) continue;

    if (item.itemType === 'agent_handoff') {
      currentSubagentStage = null;
      if (item.toId) {
        lastSeenAgentId = item.toId;
      }
      entries.push({
        kind: 'handoff',
        id: item.id || `handoff_${entries.length}`,
        fromId: item.fromId || null,
        fromName: item.fromName || 'Super Brain',
        toId: item.toId || null,
        toName: item.toName || '协同智能体',
        reason: item.reason || pendingDispatchStep?.inputs?.reason || pendingDispatchStep?.inputs?.mandate || '',
        dispatchStep: pendingDispatchStep
      });
      pendingDispatchStep = null;
      continue;
    }

    const stepAgentId = item.agentId || currentSubagentStage?.agentId || lastSeenAgentId || hostAgentId;
    lastSeenAgentId = stepAgentId;

    const inParams = Array.isArray(item.keyParams) && item.keyParams.length > 0
      ? item.keyParams
      : extractKeyParams(item.inputs);
    const outSummary = item.itemType === 'thinking'
      ? (item.thoughtConclusion || extractThoughtConclusion(item.thought, item.latestThought))
      : (item.summary || extractOutputSummary(item.outputs));

    const enrichedStep = {
      ...item,
      thought: item.itemType === 'thinking' ? cleanThoughtText(item.thought) : item.thought,
      latestThought: item.itemType === 'thinking' ? cleanThoughtText(item.latestThought) : item.latestThought,
      agentId: stepAgentId,
      inParams,
      outSummary
    };

    // 1. 宿主主脑自身的步骤：直接作为一级节点挂在左轴主干上，不套娃包裹 Super Brain 外壳
    if (isHostAgent(stepAgentId)) {
      currentSubagentStage = null;

      // 调度编排类元工具（dispatch_agent 等）：静默吸收至后续的交接与子阶段契约中，不在主干上平铺冗余的独立工具行
      if (isDispatchTool(enrichedStep)) {
        pendingDispatchStep = enrichedStep;
        continue;
      }

      // 主脑只允许真实的原子步骤 (thinking 与 tool_execution) 挂载到主干上，过滤 agent_activity, agent_execution 等容器类事件
      if (enrichedStep.itemType !== 'thinking' && enrichedStep.itemType !== 'tool_execution') {
        continue;
      }

      const lastEntry = entries[entries.length - 1];
      if (
        enrichedStep.itemType === 'thinking' &&
        lastEntry?.kind === 'step' &&
        lastEntry.step?.itemType === 'thinking'
      ) {
        const prev = lastEntry.step;
        const combinedThought = [prev.thought, enrichedStep.thought].filter(Boolean).join('\n\n');
        const combinedDur = (parseFloat(prev.duration) || 0) + (parseFloat(enrichedStep.duration) || 0);
        lastEntry.step = {
          ...prev,
          ...enrichedStep,
          id: prev.id,
          startTime: prev.startTime || enrichedStep.startTime,
          thought: combinedThought,
          latestThought: enrichedStep.latestThought || prev.latestThought,
          outSummary: enrichedStep.outSummary || prev.outSummary,
          duration: combinedDur > 0 ? combinedDur.toFixed(1) : (enrichedStep.duration || prev.duration),
          isThinking: Boolean(prev.isThinking || enrichedStep.isThinking),
          status: (prev.status === 'running' || enrichedStep.status === 'running')
            ? 'running'
            : enrichedStep.status
        };
        continue;
      }
      entries.push({
        kind: 'step',
        id: enrichedStep.id || `host_step_${entries.length}`,
        step: enrichedStep
      });
      continue;
    }

    // 2. 委派子智能体 (Subagent) 的步骤：聚合进该子智能体的复合阶段节点
    const isSameSubagentStage = currentSubagentStage && (
      (item.stageId && currentSubagentStage.stageId === item.stageId) ||
      (!item.stageId && currentSubagentStage.agentId === stepAgentId)
    );

    const stepAgentName = item.agentName ||
      (isSameSubagentStage ? currentSubagentStage.agentName : null) ||
      stepAgentId;
    const stepAgentRole = item.agentRole ||
      (isSameSubagentStage ? currentSubagentStage.agentRole : null) ||
      '协同专家';
    const stepAgentAvatar = item.agentAvatar ||
      (isSameSubagentStage ? currentSubagentStage.agentAvatar : null) ||
      '🤖';
    const stepStageId = item.stageId || (isSameSubagentStage ? currentSubagentStage.stageId : `${stepAgentId}_${entries.length}`);

    if (!isSameSubagentStage) {
      const prevEntry = entries[entries.length - 1];
      let associatedHandoff = null;
      if (prevEntry?.kind === 'handoff') {
        associatedHandoff = prevEntry;
        if (pendingDispatchStep && !associatedHandoff.dispatchStep) {
          associatedHandoff.dispatchStep = pendingDispatchStep;
        }
      } else if (pendingDispatchStep) {
        associatedHandoff = {
          kind: 'handoff',
          id: `handoff_${entries.length}`,
          fromName: 'Super Brain',
          toName: stepAgentName,
          reason: pendingDispatchStep.inputs?.reason || pendingDispatchStep.inputs?.mandate || '',
          dispatchStep: pendingDispatchStep
        };
      }
      pendingDispatchStep = null;

      currentSubagentStage = {
        kind: 'stage',
        id: `stage_${stepStageId}_${entries.length}`,
        stageId: stepStageId,
        agentId: stepAgentId,
        agentName: stepAgentName,
        agentRole: stepAgentRole,
        agentAvatar: stepAgentAvatar,
        goal: item.trigger || item.goal || '',
        handoff: associatedHandoff,
        steps: []
      };
      entries.push(currentSubagentStage);
    } else {
      if (item.agentName && (!currentSubagentStage.agentName || currentSubagentStage.agentName === currentSubagentStage.agentId)) {
        currentSubagentStage.agentName = item.agentName;
      }
      if (item.agentRole && (!currentSubagentStage.agentRole || currentSubagentStage.agentRole === '协同专家')) {
        currentSubagentStage.agentRole = item.agentRole;
      }
      if (item.agentAvatar && currentSubagentStage.agentAvatar === '🤖') {
        currentSubagentStage.agentAvatar = item.agentAvatar;
      }
      if ((item.trigger || item.goal) && !currentSubagentStage.goal) {
        currentSubagentStage.goal = item.trigger || item.goal;
      }
    }

    // 智能体生命周期占位 (agent_activity) 或正文执行体 (agent_execution) 是阶段级容器事件，非原子步骤，更新阶段元数据后不推入 steps
    if (enrichedStep.itemType === 'agent_activity' || enrichedStep.itemType === 'agent_execution') {
      if (enrichedStep.summary && !currentSubagentStage.summary) {
        currentSubagentStage.summary = enrichedStep.summary;
      }
      continue;
    }

    // 微工作流原子步骤仅允许 thinking 与 tool_execution，严格过滤其它非步骤实体
    if (enrichedStep.itemType !== 'thinking' && enrichedStep.itemType !== 'tool_execution') {
      continue;
    }

    const lastSubStep = currentSubagentStage.steps[currentSubagentStage.steps.length - 1];
    if (enrichedStep.itemType === 'thinking' && lastSubStep?.itemType === 'thinking') {
      const combinedThought = [lastSubStep.thought, enrichedStep.thought].filter(Boolean).join('\n\n');
      const combinedDur = (parseFloat(lastSubStep.duration) || 0) + (parseFloat(enrichedStep.duration) || 0);
      currentSubagentStage.steps[currentSubagentStage.steps.length - 1] = {
        ...lastSubStep,
        ...enrichedStep,
        id: lastSubStep.id,
        startTime: lastSubStep.startTime || enrichedStep.startTime,
        thought: combinedThought,
        latestThought: enrichedStep.latestThought || lastSubStep.latestThought,
        outSummary: enrichedStep.outSummary || lastSubStep.outSummary,
        duration: combinedDur > 0 ? combinedDur.toFixed(1) : (enrichedStep.duration || lastSubStep.duration),
        isThinking: Boolean(lastSubStep.isThinking || enrichedStep.isThinking),
        status: (lastSubStep.status === 'running' || enrichedStep.status === 'running')
          ? 'running'
          : enrichedStep.status,
        agentName: stepAgentName,
        agentRole: stepAgentRole,
        agentAvatar: stepAgentAvatar
      };
    } else {
      currentSubagentStage.steps.push({
        ...enrichedStep,
        agentName: stepAgentName,
        agentRole: stepAgentRole,
        agentAvatar: stepAgentAvatar
      });
    }
  }

  const stageEntries = entries.filter((e) => e.kind === 'stage');
  const breadcrumbs = [];

  for (const stage of stageEntries) {
    const isRunning = stage.steps.some((s) => s.status === 'running' || s.isThinking);
    const hasError = stage.steps.some((s) => s.status === 'error' || s.status === 'failed');
    const waitingDecision = stage.steps.some((s) => s.status === 'waiting_decision');

    stage.status = isRunning
      ? 'running'
      : waitingDecision
        ? 'waiting_decision'
        : hasError
          ? 'error'
          : 'completed';

    const durSum = stage.steps.reduce((acc, s) => acc + (parseFloat(s.duration) || 0), 0);
    stage.totalDuration = durSum > 0 ? durSum.toFixed(1) : null;
    stage.retryCount = stage.steps.reduce((acc, s) => acc + (s.retryCount || 0), 0);

    const lastBc = breadcrumbs[breadcrumbs.length - 1];
    if (lastBc && lastBc.agentId === stage.agentId) {
      if (stage.status === 'running') lastBc.status = 'running';
      continue;
    }

    breadcrumbs.push({
      id: stage.id,
      agentId: stage.agentId,
      agentName: stage.agentName,
      agentAvatar: stage.agentAvatar,
      status: stage.status
    });
  }

  return {
    entries,
    breadcrumbs,
    isMultiStage: stageEntries.length > 0 || entries.some((e) => e.kind === 'handoff')
  };
}


