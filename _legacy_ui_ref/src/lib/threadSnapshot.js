/** Restore visible conversation items when a stream finished outside the open UI. */
export function restoreThreadTimeline({ feedItems = [], messages = [], pendingDecision = null } = {}) {
  const restored = [...feedItems];
  const hasMessage = (role, message) => restored.some((item) => {
    if (item.messageId && item.messageId === message.id) return true;
    const isSameRole = role === 'user'
      ? item.itemType === 'user_message'
      : item.itemType === 'summary_text';
    return isSameRole && item.content === message.content;
  });

  for (const message of messages) {
    if (message?.isDecisionResolve && message.decisionId) {
      const decisionIndex = restored.findIndex((item) =>
        item.itemType === 'decision_request' && item.decisionId === message.decisionId
      );
      const resolved = {
        id: `decision_${message.decisionId}`,
        itemType: 'decision_request',
        decisionId: message.decisionId,
        prompt: message.decisionPrompt || '已确认执行方向',
        options: message.decisionOptions || [],
        status: 'resolved',
        selectedOptionId: message.selectedOptionId,
        selectedLabel: message.selectedLabel
      };
      if (decisionIndex >= 0) restored[decisionIndex] = { ...restored[decisionIndex], ...resolved };
      else restored.push(resolved);
      continue;
    }
    if (!message?.content || !['user', 'assistant'].includes(message.role)) continue;
    if (message.visibility === 'internal') continue;
    if (hasMessage(message.role, message)) continue;

    if (message.role === 'user') {
      restored.push({
        id: `message_${message.id}`,
        messageId: message.id,
        itemType: 'user_message',
        content: message.content,
        attachedFiles: message.attachedFiles || message.attachments || [],
        timestamp: message.timestamp,
        turnId: message.turnId || null
      });
    } else {
      // 若包含思考过程且尚未恢复，追加思考步骤
      if (message.reasoning && !restored.some((it) => it.itemType === 'thinking' && it.messageId === message.id)) {
        restored.push({
          id: `think_${message.id}`,
          messageId: message.id,
          itemType: 'thinking',
          type: 'thinking',
          title: '深度思考推演',
          thought: message.reasoning,
          isThinking: false,
          status: 'success',
          duration: message.reasoningDuration ? String(message.reasoningDuration) : null,
          agentId: message.agentId || null,
          turnId: message.turnId || null
        });
      }

      // 若包含工具调用且尚未恢复，追加工具步骤
      if (Array.isArray(message.toolExecutions)) {
        message.toolExecutions.forEach((te, teIdx) => {
          const teId = `tool_${message.id}_${teIdx}`;
          if (!restored.some((it) => it.id === teId)) {
            const isSkill = te.tool === 'invoke_skill' || te.tool === 'load_skill';
            const skillName = te.args?.skillId || te.args?.id || te.args?.name || te.tool;
            restored.push({
              id: teId,
              messageId: message.id,
              itemType: 'tool_execution',
              type: isSkill ? 'skill' : 'tool',
              name: isSkill ? skillName : te.tool,
              title: isSkill ? `调用专业技能：${skillName}` : `调用工具：${te.tool}`,
              inputs: te.args,
              outputs: te.envelope?.data || te.envelope,
              summary: te.envelope?.summary || '',
              verified: te.envelope?.verified,
              status: te.envelope?.success !== false ? 'success' : 'error',
              agentId: message.agentId || null,
              turnId: message.turnId || null
            });
          }
        });
      }

      restored.push({
        id: `message_${message.id}`,
        messageId: message.id,
        itemType: 'summary_text',
        content: message.content,
        agentId: message.agentId || null,
        timestamp: message.timestamp,
        turnId: message.turnId || null
      });
    }
  }

  if (pendingDecision?.decisionId && !restored.some((item) =>
    item.itemType === 'decision_request' && item.decisionId === pendingDecision.decisionId
  )) {
    restored.push({
      id: `decision_${pendingDecision.decisionId}`,
      itemType: 'decision_request',
      decisionId: pendingDecision.decisionId,
      prompt: pendingDecision.prompt,
      options: pendingDecision.options || [],
      status: 'pending'
    });
  }

  return restored;
}
