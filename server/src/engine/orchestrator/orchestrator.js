/**
 * Lead Orchestrator Core (主智能体编排控制器)
 * 
 * 严格遵循《现代智能体应用的主智能体架构设计与工程实现指南》：
 * 1. 编排范式：主管-执行者模式 (Orchestrator-Workers) + 动态工作流 (Dynamic Workflows)。
 * 2. 职责边界：主脑负责战略推演、DAG 任务分解、子智能体调度与结果收敛；绝不直接当单体巨石。
 * 3. 双模工作流：Plan Mode (只读规划门禁) vs Act Mode (经确认后原子化执行与验证)。
 * 4. 精炼派发与脱水：Lean Context Packaging 下发子任务，执行完毕后截断生命周期并脱水。
 * 5. 三相回路：Gather Context -> Take Action -> Verify Results 客观闭环核验。
 * 6. 硬性熔断与 HITL：硬性轮次上限 (Hard Limits) 防空转，人机协同决策卡片挂起。
 */

import { buildLeadOrchestratorPrompt } from './promptBuilder.js';
import {
  createLeanPackage,
  buildSubagentExecutionMessages,
  dehydrateSubagentResult,
  pruneToolOutputs,
  condenseConversationHistory,
  compactSessionMessages
} from './contextPackager.js';
import { createEnvelope } from '../tool/envelope.js';
import fsSync from 'node:fs';

export class LeadOrchestrator {
  constructor({
    agentLoader = null,
    toolRegistry = null,
    skillLoader = null,
    callModelFn = null,
    callModelStreamFn = null,
    runAgentFn = null,
    maxIterations = 10
  } = {}) {
    this.agentLoader = agentLoader;
    this.toolRegistry = toolRegistry;
    this.skillLoader = skillLoader;
    this.callModelFn = callModelFn;
    this.callModelStreamFn = callModelStreamFn;
    this.runAgentFn = runAgentFn;
    this.maxIterations = maxIterations;
  }

  /**
   * 客观闭环验收 (Empirical Verification)
   * 检查工具生成的物理产物或状态，严禁仅凭模型自信判定完成
   */
  async verifyResult(toolName, resultEnvelope) {
    if (!resultEnvelope || resultEnvelope.success === false) {
      return {
        verified: false,
        reason: resultEnvelope?.summary || '工具执行返回失败信封'
      };
    }

    const data = resultEnvelope.data || {};

    // 1. 剪映草稿工程注入验收：必须在物理磁盘上真实存在
    if (toolName === 'export_jianying_draft') {
      const draftPath = data.draftPath || data.jianyingDraftDir || data.outputDirectory;
      if (!draftPath || typeof draftPath !== 'string') {
        return { verified: false, reason: '未返回草稿工程物理路径' };
      }
      try {
        if (!fsSync.existsSync(draftPath)) {
          return { verified: false, reason: `草稿工程磁盘物理路径不存在: ${draftPath}` };
        }
      } catch (err) {
        return { verified: false, reason: `物理路径校验异常: ${err.message}` };
      }
      return { verified: true, artifact: draftPath };
    }

    // 2. 分镜时间轴验收：必须包含合法非空的镜号与时长
    if (toolName === 'update_storyboard') {
      const storyboard = data.storyboard || data.items || [];
      if (!Array.isArray(storyboard) || storyboard.length === 0) {
        return { verified: false, reason: '分镜表为空或结构不合法' };
      }
      return { verified: true, itemsCount: storyboard.length };
    }

    // 默认工具信封成功即视为通过
    return { verified: true };
  }

  /**
   * 主管-执行者：派发子任务给专职子智能体 (Lean Context Packaging)
   */
  async dispatchSubagentTask({
    targetAgentId,
    task,
    mandate,
    contextRefs,
    constraints = [],
    inheritedConstraints = [],
    acceptanceCriteria = [],
    accessMode = 'read_only',
    localAssets = [],
    inputArtifacts = [],
    expectedOutputSchema = null,
    project = {},
    context = {}
  }) {
    if (!this.agentLoader) {
      throw new Error('Orchestrator 未配置 AgentLoader');
    }

    const effectiveTargetId = targetAgentId?.trim();
    const targetAgent = this.agentLoader.getAgent(effectiveTargetId);
    if (!targetAgent) {
      return createEnvelope({
        success: false,
        summary: `委派失败: 未找到目标子智能体 "${targetAgentId}"`,
        error: { code: 'SUBAGENT_NOT_FOUND', message: `Target subagent "${targetAgentId}" does not exist` }
      });
    }

    // 1. 打包精炼上下文 (不带主脑的历史噪音，但显式携带继承约束与验收断言)
    const leanPackage = createLeanPackage({
      task,
      mandate,
      targetAgentId: effectiveTargetId,
      localAssets,
      inputArtifacts,
      contextRefs,
      constraints,
      inheritedConstraints,
      acceptanceCriteria,
      accessMode,
      expectedOutputSchema,
      project
    });

    // 2. 构造隔离的子会话消息序列
    const subMessages = buildSubagentExecutionMessages(leanPackage, targetAgent);

    // 3. 在隔离沙箱中调度子智能体
    try {
      let rawResult;
      if (this.runAgentFn) {
        rawResult = await this.runAgentFn(targetAgentId, {
          messages: subMessages,
          context: {
            ...context,
            projectId: project.id,
            isSubagentExecution: true,
            leanPackageId: leanPackage.taskId,
            accessMode: leanPackage.accessMode
          }
        });
      } else {
        throw new Error('Orchestrator 未配置 runAgentFn 执行句柄');
      }

      // 4. 上下文脱水与收敛 (销毁底层巨量 trace，仅保留结构化报告)
      const dehydratedReport = dehydrateSubagentResult(rawResult, leanPackage);

      return createEnvelope({
        success: dehydratedReport.success,
        summary: `专职智能体【${targetAgent.name}】已完成委派任务: ${dehydratedReport.summary}`,
        data: dehydratedReport
      });
    } catch (err) {
      return createEnvelope({
        success: false,
        summary: `子智能体【${targetAgent.name}】执行发生异常: ${err.message}`,
        error: { code: 'SUBAGENT_EXECUTION_ERROR', message: err.message }
      });
    }
  }

  /**
   * 构建主脑的完整 4-Tier 提示词 (具备两阶段上下文压缩治理)
   */
  buildPrompt({
    project = {},
    assets = [],
    storyboard = [],
    pendingDecision = null,
    activePerception = null,
    dynamicNotes = [],
    memoryText = ''
  } = {}) {
    const registeredAgents = this.agentLoader ? this.agentLoader.getAllAgents() : [];
    const registeredSkills = this.skillLoader ? this.skillLoader.getManifests?.() || [] : [];

    return buildLeadOrchestratorPrompt({
      project,
      assets,
      storyboard,
      registeredAgents,
      registeredSkills,
      pendingDecision,
      activePerception,
      dynamicNotes,
      memoryText
    });
  }

  /**
   * 治理并修剪对话历史 (支持缓存友好的高水位批量压缩模式)
   */
  prepareMessages(rawMessages = [], { cacheAware = false, ...options } = {}) {
    if (cacheAware) {
      return compactSessionMessages(rawMessages, options);
    }

    // Stage 1: 工具大输出修剪折叠
    const pruned = pruneToolOutputs(rawMessages, {
      maxOutputLength: 500,
      keepRecentToolCount: 2,
      ...options
    });

    // Stage 2: 超长历史语义状态压缩
    const condensed = condenseConversationHistory(pruned, {
      maxThreshold: 24,
      preserveRecentCount: 8,
      ...options
    });

    return condensed;
  }
}
