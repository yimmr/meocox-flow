import {
  getProject,
  getThreadMessages,
  appendThreadMessages,
  updateThread,
  runAgentStream,
  callModelStream,
  getAgent,
  getTool,
  getSkill,
  createLeanPackage,
  buildSubagentExecutionMessages,
  dehydrateSubagentResult,
  formatDehydratedFactCard
} from '../engine/index.js';
import { storage } from '../storage/index.js';
import { triggerAutoMemoryConvergence } from './autoMemoryExtractor.js';


/**
 * 彻底清洗并提纯正文与思考过程，杜绝 <think> / <thinking> 标签泄露至正文
 */
export function extractAndCleanThinking(rawText = '', existingReasoning = '') {
  let text = typeof rawText === 'string' ? rawText : '';
  let reasoning = typeof existingReasoning === 'string' ? existingReasoning : '';
  
  const thinkRegex = /<(?:think|thinking|thought|reasoning)>([\s\S]*?)<\/(?:think|thinking|thought|reasoning)>/gi;
  let match;
  while ((match = thinkRegex.exec(text)) !== null) {
    if (match[1]) {
      const extracted = match[1].trim();
      if (extracted && !reasoning.includes(extracted)) {
        reasoning = (reasoning ? reasoning + '\n' : '') + extracted;
      }
    }
  }
  text = text.replace(thinkRegex, '').trim();

  // 清洗可能未闭合的残余标签
  const unclosedMatch = text.match(/<(?:think|thinking|thought|reasoning)>([\s\S]*)$/i);
  if (unclosedMatch) {
    const unclosed = unclosedMatch[1].trim();
    if (unclosed && !reasoning.includes(unclosed)) {
      reasoning = (reasoning ? reasoning + '\n' : '') + unclosed;
    }
    text = text.replace(/<(?:think|thinking|thought|reasoning)>[\s\S]*$/i, '').trim();
  }

  return { text, reasoning };
}

/**
 * 独立的任务流式会话执行器 (UI-Agnostic Thread Turn Execution Engine)
 * 
 * 职责：
 * 1. 记录用户消息并置线程为 running
 * 2. 调度多智能体流式循环 (Super Brain / Workers)
 * 3. 处理协同交接 (Handoff)、精炼派发 (Lean Packaging)、脱水收敛 (Dehydration) 与 人机协同 (HITL) 决策挂起
 * 4. 驱动事件回调 emitEvent，持久化 assistant 消息并流转线程终态 (completed / waiting_user / failed)
 */
export async function executeThreadTurn({
  projectId,
  threadId,
  prompt,
  agentId = null,
  model = null,
  enableThinking = true,
  attachedFiles = [],
  internalPrompt = false,
  turnId = null
}, {
  emitEvent = () => {},
  isAborted = () => false
} = {}) {
  const effectiveTurnId = turnId || `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  emitEvent('stream_started', { turnId: effectiveTurnId });

  // 1. 追加用户消息 (包含引用的附件列表)
  const userMsg = {
    role: 'user',
    content: prompt.trim(),
    attachedFiles: Array.isArray(attachedFiles) ? attachedFiles : [],
    visibility: internalPrompt ? 'internal' : 'user',
    turnId: effectiveTurnId,
    timestamp: Date.now()
  };
  await appendThreadMessages(projectId, threadId, userMsg);
  await updateThread(projectId, threadId, {
    status: 'running',
    activeTurnId: effectiveTurnId,
    lastTurnId: effectiveTurnId,
    activeTurnStartedAt: userMsg.timestamp,
    pendingDecision: null
  });

  // 格式化附件引用上下文 (零拷贝物理路径映射)
  let referenceContext = '';
  if (Array.isArray(attachedFiles) && attachedFiles.length > 0) {
    referenceContext = `\n\n【用户引用的资料库附件文件映射表】:\n` +
      attachedFiles.map(f => `- @${f.tag || f.name}: ${f.name} (本地真实路径: ${f.path}, 类型: ${f.type || 'file'})`).join('\n') +
      `\n注意：用户在指令中可能使用 @${attachedFiles[0]?.tag || '文件1'} 等代号指代上述真实文件，执行分析与工具调用时请严格对照真实路径。未显式@的附件亦为本次任务的重要输入资源。`;
  }

  // 2. 组装输入给模型的上下文
  const history = await getThreadMessages(projectId, threadId);
  const modelMessages = history.map(m => ({
    role: m.role || 'user',
    content: m.content || ''
  }));

  const outgoingMessages = modelMessages.map((m, idx) => {
    if (idx === modelMessages.length - 1 && m.role === 'user') {
      let enhancedContent = m.content;
      if (referenceContext) {
        enhancedContent += referenceContext;
      }
      if (enableThinking) {
        enhancedContent += `\n\n【思考规约】：请务必先在 <think> 与 </think> 标签内进行清晰严密的深度思考推演（分析真实诉求、梳理核心步骤与策略），思考完毕关闭 </think> 标签后再给出正式答复。`;
      }
      return {
        ...m,
        content: enhancedContent
      };
    }
    return m;
  });

  const projectEnv = await getProject(projectId).catch(() => null);
  const activeProject = projectEnv?.data || projectEnv || {};

  const memoryData = await storage.getMemory(projectId).catch(() => ({ combinedText: '' }));
  const memoryText = memoryData.combinedText || '';

  // 3. 驱动多智能体流式推理总线
  let currentAgentId = agentId || 'super-brain';
  let delegatedBy = null;
  let activeLeanPackage = null;
  let currentGoal = prompt;
  let currentMessages = [...outgoingMessages];
  let handoffDepth = 0;
  const maxHandoffDepth = 4;

  let finalEnvelope = null;
  let isWaitingDecision = false;

  while (handoffDepth <= maxHandoffDepth) {
    if (isAborted()) break;

    let agentMeta = null;
    if (currentAgentId) {
      agentMeta = await getAgent(currentAgentId).catch(() => null);
      emitEvent('agent_start', {
        agentId: currentAgentId,
        agentName: agentMeta?.name || agentMeta?.title || currentAgentId,
        agentRole: agentMeta?.title || agentMeta?.role || '执行专家',
        agentAvatar: agentMeta?.avatar || (
          currentAgentId.includes('code') ? '💻' :
          currentAgentId.includes('render') ? '🎞️' :
          currentAgentId.includes('sound') ? '🔊' :
          currentAgentId.includes('voice') ? '🎙️' :
          currentAgentId.includes('perception') ? '🔍' :
          currentAgentId.includes('director') ? '🎬' :
          currentAgentId.includes('scout') ? '👁️' :
          currentAgentId.includes('edit') ? '✂️' :
          currentAgentId.includes('screen') ? '✍️' :
          currentAgentId.includes('brain') ? '🧠' : '🤖'
        ),
        goal: delegatedBy ? currentGoal : undefined,
        turnId: effectiveTurnId,
        activityId: `${effectiveTurnId}:${handoffDepth}:${currentAgentId}`,
        visibility: delegatedBy ? 'internal' : 'user'
      });
    }

    let thinkStepActive = false;
    let thinkStepId = null;
    let lastThinkStepId = null;
    let hasEmittedThinkForStep = false;
    let thinkStartTime = null;
    let activeToolStepId = null;
    let activeToolActivity = null;
    let toolStepSequence = 0;
    const toolActivityBySignature = new Map();
    let pendingHandoff = null;
    let pendingDecision = null;

    const handleStreamEvent = (ev, data) => {
      emitEvent(ev, data);

      if (ev === 'think') {
        if (!thinkStepActive) {
          thinkStepActive = true;
          thinkStartTime = Date.now();
          if (!thinkStepId) {
            thinkStepId = `step_think_${effectiveTurnId}_${handoffDepth}_${Date.now()}`;
          }
          lastThinkStepId = thinkStepId;
          hasEmittedThinkForStep = false;
          emitEvent('step_start', {
            stepId: thinkStepId,
            type: 'thinking',
            title: delegatedBy ? `${agentMeta?.name || currentAgentId} 思考推演` : '深度思考推演',
            trigger: delegatedBy && currentGoal ? `响应意图: ${currentGoal}` : undefined,
            agentId: currentAgentId,
            agentName: agentMeta?.name || (currentAgentId === 'super-brain' ? 'Super Brain' : currentAgentId),
            agentRole: agentMeta?.title || agentMeta?.role || (currentAgentId === 'super-brain' ? '系统总控编排' : '执行专家'),
            agentAvatar: agentMeta?.avatar || (currentAgentId.includes('brain') ? '🧠' : '🤖'),
            stageId: `${effectiveTurnId}:${handoffDepth}:${currentAgentId}`,
            turnId: effectiveTurnId
          });
        }
        if (data.delta) {
          hasEmittedThinkForStep = true;
          emitEvent('step_log', { stepId: thinkStepId, chunk: data.delta, turnId: effectiveTurnId });
        }
      } else if (ev === 'think_end') {
        if (thinkStepActive && thinkStepId) {
          const dur = data.duration != null
            ? Number(data.duration).toFixed(1)
            : (thinkStartTime ? Number(((Date.now() - thinkStartTime) / 1000).toFixed(1)) : '1.0');
          emitEvent('step_end', {
            stepId: thinkStepId,
            status: 'success',
            duration: dur,
            turnId: effectiveTurnId
          });
          thinkStepActive = false;
          lastThinkStepId = thinkStepId;
        }
      } else if (ev === 'tool_start') {
        const isSkill = data.tool === 'invoke_skill' || data.tool === 'load_skill';
        const skillId = isSkill ? (data.args?.skillId || data.args?.id || data.args?.name) : null;
        let toolDescription = data.description || '';
        if (isSkill && skillId) {
          const skillDef = getSkill(skillId);
          if (skillDef?.description) {
            toolDescription = skillDef.description;
          }
        }
        if (!toolDescription && data.tool) {
          const toolDef = getTool(data.tool);
          if (toolDef?.description) {
            toolDescription = toolDef.description;
          }
        }

        const signature = `${data.tool}:${JSON.stringify(data.args || {})}`;
        const previousActivity = toolActivityBySignature.get(signature);
        const attempt = previousActivity?.status === 'error' ? previousActivity.attempt + 1 : 1;
        const activityId = previousActivity?.status === 'error'
          ? previousActivity.activityId
          : `activity_${effectiveTurnId}_${handoffDepth}_${++toolStepSequence}`;
        activeToolStepId = `step_${isSkill ? 'skill' : 'tool'}_${toolStepSequence}_${Date.now()}`;
        activeToolActivity = { signature, activityId, attempt, description: toolDescription };

        if (thinkStepActive && thinkStepId) {
          const dur = thinkStartTime ? Number(((Date.now() - thinkStartTime) / 1000).toFixed(1)) : '0.6';
          emitEvent('step_end', { stepId: thinkStepId, status: 'success', duration: dur, turnId: effectiveTurnId });
          thinkStepActive = false;
          lastThinkStepId = thinkStepId;
        }
        // 一旦发生工具/技能调用，后续若再产生思考则开启新的思考节点
        thinkStepId = null;
        hasEmittedThinkForStep = false;

        emitEvent('step_start', {
          stepId: activeToolStepId,
          activityId,
          attempt,
          type: isSkill ? 'skill' : 'tool',
          name: isSkill ? (skillId || data.tool) : data.tool,
          title: isSkill ? `调用专业技能：${skillId || data.tool}` : `调用工具：${data.tool}`,
          description: toolDescription,
          inputs: isSkill ? (data.args?.params || data.args) : data.args,
          agentId: currentAgentId,
          agentName: agentMeta?.name || (currentAgentId === 'super-brain' ? 'Super Brain' : currentAgentId),
          agentRole: agentMeta?.title || agentMeta?.role || (currentAgentId === 'super-brain' ? '系统总控编排' : '执行专家'),
          agentAvatar: agentMeta?.avatar || (currentAgentId.includes('brain') ? '🧠' : '🤖'),
          stageId: `${effectiveTurnId}:${handoffDepth}:${currentAgentId}`,
          turnId: effectiveTurnId
        });
        emitEvent('step_log', {
          stepId: activeToolStepId,
          turnId: effectiveTurnId,
          chunk: isSkill
            ? `> 正在装配或调度专业技能: ${skillId || data.tool}...\n`
            : `> 正在调用底层系统能力: ${data.tool}...\n`
        });
      } else if (ev === 'tool_end') {
        if (activeToolStepId) {
          const isSkill = data.tool === 'invoke_skill' || data.tool === 'load_skill';
          const skillId = isSkill ? (data.args?.skillId || data.args?.id || data.args?.name) : null;

          emitEvent('step_log', {
            stepId: activeToolStepId,
            turnId: effectiveTurnId,
            chunk: `[OK] ${isSkill ? `技能 ${skillId || data.tool}` : `工具 ${data.tool}`} 执行完毕。\n`
          });
          emitEvent('step_end', {
            stepId: activeToolStepId,
            activityId: activeToolActivity?.activityId,
            attempt: activeToolActivity?.attempt,
            status: data.envelope?.success !== false ? 'success' : 'error',
            summary: data.envelope?.summary || '',
            verified: data.envelope?.verified,
            displayHint: data.envelope?.displayHint || data.envelope?.data?.displayHint || null,
            outputs: data.envelope?.data || data.envelope,
            description: activeToolActivity?.description || undefined,
            turnId: effectiveTurnId
          });
          if (activeToolActivity) {
            toolActivityBySignature.set(activeToolActivity.signature, {
              ...activeToolActivity,
              status: data.envelope?.success !== false ? 'success' : 'error'
            });
          }

          const envData = data.envelope?.data;
          const publishedArtifacts = [
            ...(Array.isArray(data.envelope?.artifacts) ? data.envelope.artifacts : []),
            ...(Array.isArray(envData?.artifacts) ? envData.artifacts : [])
          ];
          const seenArtifactIds = new Set();
          for (const artifact of publishedArtifacts) {
            if (!artifact?.id || seenArtifactIds.has(artifact.id)) continue;
            seenArtifactIds.add(artifact.id);
            emitEvent('artifact_publish', { artifact });
          }

          if (envData?.isDecisionRequest) {
            pendingDecision = envData;
            if (!delegatedBy) {
              emitEvent('decision_request', {
                decisionId: envData.decisionId,
                prompt: envData.prompt,
                options: envData.options
              });
            }
          }

          if (envData?.isHandoff) {
            pendingHandoff = envData;
          }

          activeToolStepId = null;
          activeToolActivity = null;
        }
      } else if (ev === 'text') {
        if (thinkStepActive && thinkStepId) {
          const dur = thinkStartTime ? Number(((Date.now() - thinkStartTime) / 1000).toFixed(1)) : '0.8';
          emitEvent('step_end', { stepId: thinkStepId, status: 'success', duration: dur, turnId: effectiveTurnId });
          thinkStepActive = false;
          lastThinkStepId = thinkStepId;
          hasEmittedThinkForStep = false;
        }
        if (delegatedBy) {
          // 子智能体在工作区独立沙盒内推进，其内部流式文本属于执行日志/推演记录，严禁向创作者主对话气泡泄漏
          emitEvent('step_log', {
            stepId: activeToolStepId || thinkStepId || lastThinkStepId || `subagent_log_${effectiveTurnId}_${currentAgentId}`,
            turnId: effectiveTurnId,
            chunk: data.delta
          });
        } else {
          emitEvent('text_delta', { delta: data.delta, turnId: effectiveTurnId, agentId: currentAgentId });
        }
      }
    };

    let resultEnvelope;
    if (currentAgentId) {
      resultEnvelope = await runAgentStream(
        currentAgentId,
        {
          messages: currentMessages,
          model: model || undefined,
          context: { projectId, threadId, project: activeProject, assets: attachedFiles, memoryText }
        },
        { onEvent: handleStreamEvent }
      );
    } else {
      const targetModel = model || 'auto';
      resultEnvelope = await callModelStream(
        {
          model: targetModel,
          messages: currentMessages,
          context: { projectId, threadId, project: activeProject, assets: attachedFiles, memoryText }
        },
        { onEvent: handleStreamEvent }
      );
    }

    finalEnvelope = resultEnvelope;

    // 持久化当前智能体的产出消息，并提取可能内嵌在正文中的 <think> 推演
    const rawReplyText = resultEnvelope?.data?.text || resultEnvelope?.summary || '';
    const rawReasoning = resultEnvelope?.data?.reasoning || '';
    const { text: cleanReplyText, reasoning: cleanReasoning } = extractAndCleanThinking(rawReplyText, rawReasoning);

    if (thinkStepActive && thinkStepId) {
      if (!hasEmittedThinkForStep && !cleanReasoning) {
        emitEvent('step_log', {
          stepId: thinkStepId,
          chunk: '已完成意图分析与路径推演。\n',
          turnId: effectiveTurnId
        });
      }
      const dur = thinkStartTime ? Number(((Date.now() - thinkStartTime) / 1000).toFixed(1)) : '1.0';
      emitEvent('step_end', {
        stepId: thinkStepId,
        status: 'success',
        duration: dur,
        thought: cleanReasoning || undefined,
        turnId: effectiveTurnId
      });
      thinkStepActive = false;
      lastThinkStepId = thinkStepId;
    } else if (cleanReasoning && lastThinkStepId) {
      emitEvent('step_end', {
        stepId: lastThinkStepId,
        status: 'success',
        thought: cleanReasoning,
        turnId: effectiveTurnId
      });
    }

    if (cleanReplyText || (resultEnvelope?.data?.toolExecutions?.length > 0)) {
      const fallbackContent = resultEnvelope?.summary && resultEnvelope.summary !== '模型空应答'
        ? resultEnvelope.summary
        : '已完成阶段性指令调度。';
      const assistantMsg = {
        role: 'assistant',
        content: cleanReplyText || fallbackContent,
        reasoning: cleanReasoning,
        reasoningDuration: resultEnvelope?.data?.reasoningDuration || null,
        agentId: currentAgentId || null,
        isMock: Boolean(resultEnvelope?.data?.isMock),
        toolExecutions: resultEnvelope?.data?.toolExecutions || [],
        envelope: resultEnvelope,
        visibility: (delegatedBy || pendingHandoff) ? 'internal' : 'user',
        turnId: effectiveTurnId,
        timestamp: Date.now()
      };
      await appendThreadMessages(projectId, threadId, assistantMsg);
    }

    // 分支 A: 触发了 HITL 人机决策挂起
    if (pendingDecision && delegatedBy && handoffDepth < maxHandoffDepth) {
      const parentId = delegatedBy;
      const parentMeta = await getAgent(parentId).catch(() => null);
      emitEvent('agent_handoff', {
        fromId: currentAgentId,
        fromName: agentMeta?.name || currentAgentId,
        toId: parentId,
        toName: parentMeta?.name || parentMeta?.title || parentId,
        reason: '子智能体提交了待裁决事项，由主脑汇总后决定是否需要用户介入'
      });
      currentAgentId = parentId;
      currentGoal = prompt;
      currentMessages = [
        ...outgoingMessages,
        {
          role: 'user',
          content: `【子智能体待裁决事项】\n问题：${pendingDecision.prompt || '需要进一步确认'}\n候选项：${JSON.stringify(pendingDecision.options || [])}\n请先结合整体任务判断能否自行裁决；只有确实需要创作者偏好或授权时，才向用户发起决策请求。`
        }
      ];
      delegatedBy = null;
      handoffDepth++;
      continue;
    }

    if (pendingDecision) {
      isWaitingDecision = true;
      await updateThread(projectId, threadId, {
        status: 'waiting_user',
        activeTurnId: null,
        activeTurnStartedAt: null,
        pendingDecision: {
          decisionId: pendingDecision.decisionId,
          prompt: pendingDecision.prompt,
          options: pendingDecision.options,
          agentId: currentAgentId,
          model: model || undefined
        }
      });
      break;
    }

    // 分支 B: 触发了多智能体交接 (Handoff)
    if (pendingHandoff && handoffDepth < maxHandoffDepth) {
      delegatedBy = currentAgentId;
      const targetId = pendingHandoff.targetAgentId;
      const targetMeta = await getAgent(targetId).catch(() => null);
      const targetName = targetMeta?.name || pendingHandoff.targetAgentName || targetId;

      emitEvent('agent_handoff', {
        fromId: currentAgentId,
        fromName: agentMeta?.name || currentAgentId,
        toId: targetId,
        toName: targetName,
        reason: pendingHandoff.reason || '多智能体任务接力推进'
      });

      currentAgentId = targetId;
      currentGoal = pendingHandoff.task;

      activeLeanPackage = pendingHandoff.leanPackage
        ? {
            ...pendingHandoff.leanPackage,
            project: {
              id: activeProject.id || projectId || 'default_project',
              title: activeProject.title || '未命名工程',
              workDir: activeProject.workDir || activeProject.projectDir || ''
            }
          }
        : createLeanPackage({
            task: pendingHandoff.task,
            mandate: pendingHandoff.mandate || pendingHandoff.task,
            targetAgentId: targetId,
            localAssets: attachedFiles,
            inputArtifacts: pendingHandoff.inputArtifacts || [],
            contextRefs: pendingHandoff.contextRefs || pendingHandoff.context,
            constraints: pendingHandoff.constraints,
            inheritedConstraints: pendingHandoff.inheritedConstraints || [],
            acceptanceCriteria: pendingHandoff.acceptanceCriteria || [],
            accessMode: pendingHandoff.accessMode || 'read_only',
            project: activeProject
          });

      const subagentBriefing = buildSubagentExecutionMessages(activeLeanPackage, targetMeta)[0].content;

      currentMessages = [
        {
          role: 'user',
          content: subagentBriefing
        }
      ];

      handoffDepth++;
      continue;
    }

    // 分支 C: 子智能体执行完毕，脱水回流
    if (delegatedBy && currentAgentId !== delegatedBy && handoffDepth < maxHandoffDepth) {
      const parentId = delegatedBy;
      const parentMeta = await getAgent(parentId).catch(() => null);
      const parentName = parentMeta?.name || '参谋总长';

      const currentLeanPkg = activeLeanPackage || {
        taskId: `task_${Date.now()}`,
        targetAgentId: currentAgentId
      };
      const dehydrated = dehydrateSubagentResult(resultEnvelope, currentLeanPkg);

      if (Array.isArray(dehydrated.artifacts) && dehydrated.artifacts.length > 0) {
        for (const art of dehydrated.artifacts) {
          emitEvent('artifact_publish', { artifact: art });
        }
      }

      const formattedFactCard = formatDehydratedFactCard(
        dehydrated,
        agentMeta?.name || currentAgentId
      );

      const dynamicSummary = dehydrated.summary ||
        resultEnvelope?.summary ||
        resultEnvelope?.data?.summary ||
        resultEnvelope?.data?.text ||
        '';

      emitEvent('agent_handoff', {
        fromId: currentAgentId,
        fromName: agentMeta?.name || currentAgentId,
        toId: parentId,
        toName: parentName,
        type: 'return',
        isReturn: true,
        reason: dynamicSummary || `${agentMeta?.name || currentAgentId} 协同执行完成`,
        summary: dynamicSummary
      });

      currentAgentId = parentId;
      currentGoal = prompt;
      currentMessages = [
        ...outgoingMessages,
        {
          role: 'user',
          content: `【专员执行结果已脱水返回】\n用户原始请求：${prompt}\n\n${formattedFactCard}\n\n【重要指令】专员已完成本轮执行并提供了全部客观事实数据。请直接基于以上事实整理结论并向用户交付，严禁无故重复调用 dispatch_agent 委派同一专员执行相同任务。`
        }
      ];

      delegatedBy = null;
      activeLeanPackage = null;
      handoffDepth++;
      continue;
    }

    break;
  }

  if (isWaitingDecision) {
    emitEvent('stream_done', {
      status: 'waiting_decision',
      summary: '任务已挂起，等待用户决策裁决'
    });
    return {
      status: 'waiting_decision',
      turnId: effectiveTurnId,
      finalEnvelope
    };
  }

  if (isAborted()) {
    await updateThread(projectId, threadId, {
      status: 'interrupted',
      activeTurnId: null,
      activeTurnStartedAt: null
    }).catch(() => {});
    return {
      status: 'aborted',
      turnId: effectiveTurnId,
      finalEnvelope
    };
  }

  let rawLastReply = finalEnvelope?.data?.text;
  if (!rawLastReply) {
    if (finalEnvelope?.data?.toolExecutions?.length > 0) {
      const lastTool = finalEnvelope.data.toolExecutions[finalEnvelope.data.toolExecutions.length - 1];
      rawLastReply = lastTool.envelope?.summary || `已完成相关工具调用（共 ${finalEnvelope.data.toolExecutions.length} 项）。`;
    } else if (finalEnvelope?.summary && finalEnvelope.summary !== '模型空应答') {
      rawLastReply = finalEnvelope.summary;
    } else {
      rawLastReply = '思考推演完成，请指示下一步操作。';
    }
  }
  const { text: cleanLastReply, reasoning: cleanLastReasoning } = extractAndCleanThinking(rawLastReply, finalEnvelope?.data?.reasoning || '');
  emitEvent('done', {
    success: finalEnvelope?.success !== false,
    reply: {
      role: 'assistant',
      content: cleanLastReply,
      reasoning: cleanLastReasoning
    },
    envelope: finalEnvelope
  });
  emitEvent('stream_done', {
    summary: '流式推理已完成',
    reply: { role: 'assistant', content: cleanLastReply, reasoning: cleanLastReasoning }
  });
  await updateThread(projectId, threadId, {
    status: 'completed',
    activeTurnId: null,
    activeTurnStartedAt: null,
    pendingDecision: null
  });

  // 触发轮次事实自动萃取与记忆闭环沉淀 (Auto Memory Convergence)
  try {
    await triggerAutoMemoryConvergence({
      projectId,
      threadId,
      prompt,
      reply: cleanLastReply,
      envelope: finalEnvelope,
      attachedFiles
    });
  } catch (memErr) {
    console.warn('[threadTurnRunner] Auto memory convergence failed silently:', memErr?.message);
  }

  return {
    status: 'completed',
    turnId: effectiveTurnId,
    reply: { role: 'assistant', content: cleanLastReply, reasoning: cleanLastReasoning },
    finalEnvelope
  };
}

