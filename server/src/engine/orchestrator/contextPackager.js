/**
 * Context Packager & Pruner (精炼上下文打包器与两阶段压缩)
 * 
 * 严格遵循《现代智能体应用的主智能体架构设计与工程实现指南》规范：
 * 1. Lean Context Packaging: 严禁将主脑全量交互历史盲目下传给子智能体，只提供与任务目标严格绑定的最小输入要素、物理路径与契约。
 * 2. Lifecycle Truncation & Dehydration (上下文脱水): 子智能体执行完毕后销毁底层海量中间 trace，仅提炼核心报告与产物引用回传主脑。
 * 3. Two-Stage Auto-Compaction:
 *    - Stage 1: Tool Output Pruning (历史工具大输出折叠修剪)
 *    - Stage 2: Semantic Condensation (超长会话核心事实摘要)
 */

/**
 * 1. 精炼上下文打包 (Lean Context Packaging)
 * 为子智能体生成最小、隔离的执行任务包
 */
const VALID_ACCESS_MODES = new Set(['read_only', 'isolated_write', 'exclusive_write']);

export function createLeanPackage({
  task,
  mandate,
  targetAgentId,
  localAssets = [],
  inputArtifacts = [],
  contextRefs = null,
  constraints = [],
  inheritedConstraints = [],
  acceptanceCriteria = [],
  accessMode = 'read_only',
  expectedOutputSchema = null,
  project = {},
  metadata = {}
} = {}) {
  const effectiveTask = (mandate || task || '').trim();
  if (!effectiveTask) {
    throw new Error('LeanContext: task 描述为必填项');
  }
  if (!targetAgentId || typeof targetAgentId !== 'string') {
    throw new Error('LeanContext: targetAgentId 为必填项');
  }

  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // 融合 contextRefs、inputArtifacts 与 localAssets
  let rawAssets = Array.isArray(localAssets) ? [...localAssets] : [];
  if (Array.isArray(inputArtifacts) && inputArtifacts.length > 0) {
    for (const art of inputArtifacts) {
      if (typeof art === 'string') {
        rawAssets.push({ path: art });
      } else if (art && typeof art === 'object') {
        rawAssets.push({
          id: art.id || art.artifactId || art.uriOrId,
          name: art.name || art.title || art.digestSummary,
          path: art.path || art.uriOrId || '',
          version: art.version || 1,
          refType: art.refType || 'local_path',
          digestSummary: art.digestSummary || ''
        });
      }
    }
  }
  if (contextRefs && typeof contextRefs === 'object') {
    if (Array.isArray(contextRefs.assets)) {
      rawAssets = rawAssets.concat(contextRefs.assets);
    }
    if (typeof contextRefs.assetPath === 'string' && contextRefs.assetPath) {
      rawAssets.push({ path: contextRefs.assetPath });
    }
  }

  // 仅提取本地资产的关键轻量元数据与真实绝对物理路径（零拷贝）
  const packagedAssets = rawAssets.map((a, idx) => {
    if (typeof a === 'string') {
      const filename = a.split(/[/\\]/).pop() || a;
      return {
        id: `asset_${idx + 1}`,
        name: filename,
        path: a,
        duration: 0,
        tags: [],
        resolution: ''
      };
    }
    const filename = a.name || a.filename || (a.path ? a.path.split(/[/\\]/).pop() : `asset_${idx + 1}`);
    return {
      id: a.id || a.filename || `asset_${idx + 1}`,
      name: filename,
      path: a.path || a.filePath || '',
      duration: a.duration || a.durationSec || 0,
      tags: Array.isArray(a.tags) ? a.tags : [],
      resolution: a.resolution || a.specs?.resolution || '',
      ...(a.version ? { version: a.version } : {}),
      ...(a.digestSummary ? { digestSummary: a.digestSummary } : {})
    };
  });

  // 合并显式约束与继承约束并去重，防止“上下文过度脱水”导致隐性偏好丢失
  const mergedConstraints = Array.from(new Set([
    ...(Array.isArray(inheritedConstraints) ? inheritedConstraints : []),
    ...(Array.isArray(constraints) ? constraints : [])
  ].filter(c => typeof c === 'string' && c.trim()).map(c => c.trim())));

  const normalizedCriteria = Array.isArray(acceptanceCriteria)
    ? acceptanceCriteria.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim())
    : [];

  const normalizedAccessMode = VALID_ACCESS_MODES.has(accessMode) ? accessMode : 'read_only';

  return {
    taskId,
    targetAgentId: targetAgentId.trim(),
    task: effectiveTask,
    mandate: effectiveTask,
    accessMode: normalizedAccessMode,
    contextRefs: contextRefs && typeof contextRefs === 'object' ? contextRefs : null,
    project: {
      id: project.id || 'default_project',
      title: project.title || '未命名工程',
      workDir: project.workDir || project.projectDir || ''
    },
    localAssets: packagedAssets,
    inputArtifacts: packagedAssets,
    constraints: mergedConstraints,
    inheritedConstraints: mergedConstraints,
    acceptanceCriteria: normalizedCriteria,
    expectedOutputSchema,
    metadata,
    createdAt: Date.now()
  };
}

/**
 * 将精炼上下文转换为目标子智能体隔离执行的消息序列
 */
export function buildSubagentExecutionMessages(leanPackage, targetAgent) {
  let assetsSection = '';
  if (leanPackage.localAssets.length > 0) {
    assetsSection = `\n【输入本地真实资产清单 (操作系统绝对物理路径)】:\n` +
      leanPackage.localAssets.map(a =>
        `- 素材[${a.id}]: "${a.name}" | 物理路径: "${a.path}"${a.duration ? ` | 时长: ${a.duration}` : ''}${a.digestSummary ? ` | 摘要: ${a.digestSummary}` : ''}`
      ).join('\n');
  }

  let contextRefsSection = '';
  if (leanPackage.contextRefs && typeof leanPackage.contextRefs === 'object') {
    const refsEntries = Object.entries(leanPackage.contextRefs)
      .filter(([k]) => k !== 'assets' && k !== 'assetPath');
    if (refsEntries.length > 0) {
      contextRefsSection = `\n【前序产物引用与凭证 (Context References)】:\n` +
        refsEntries.map(([k, v]) => `- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n');
    }
  }

  let constraintsSection = '';
  if (Array.isArray(leanPackage.constraints) && leanPackage.constraints.length > 0) {
    constraintsSection = `\n【执行约束与业务红线 (Inherited Constraints)】:\n` +
      leanPackage.constraints.map(c => `- ${c}`).join('\n');
  }

  let criteriaSection = '';
  if (Array.isArray(leanPackage.acceptanceCriteria) && leanPackage.acceptanceCriteria.length > 0) {
    criteriaSection = `\n【客观验收断言 (Acceptance Criteria)】:\n` +
      leanPackage.acceptanceCriteria.map(c => `- [ ] ${c}`).join('\n');
  }

  let schemaSection = '';
  if (leanPackage.expectedOutputSchema) {
    schemaSection = `\n【期望输出结构契约】:\n请以规范的结构或调用工具输出结果，契约规范:\n${JSON.stringify(leanPackage.expectedOutputSchema, null, 2)}`;
  }

  const accessLine = leanPackage.accessMode ? `\n- 工作区并发模式: ${leanPackage.accessMode}` : '';

  const userBriefing = `【超级主脑委派任务书 (Task Briefing)】
- 任务标识: ${leanPackage.taskId}
- 核心目标: ${leanPackage.task}
- 工程上下文: ${leanPackage.project.title} (ID: ${leanPackage.project.id})${accessLine}${assetsSection}${contextRefsSection}${constraintsSection}${criteriaSection}${schemaSection}

请专注、干练地完成上述具体任务。`;

  return [
    {
      role: 'user',
      content: userBriefing
    }
  ];
}

/**
 * 2. 子智能体结果脱水与收敛 (Context Dehydration)
 * 剔除子智能体执行中的巨量冗余 Trace、逐步推导标签与原始日志，
 * 仅提炼结构化结论、产物引用与状态差异回传主脑
 */
export function dehydrateSubagentResult(rawResult, leanPackage) {
  const isEnvelope = rawResult && typeof rawResult === 'object' && ('success' in rawResult || 'envelope' in rawResult);
  const success = isEnvelope ? (rawResult.success !== false && rawResult.envelope?.success !== false) : Boolean(rawResult);

  let summary = '';
  let artifacts = [];
  let stateDiff = {};
  let structuredFact = null;

  if (rawResult) {
    const data = rawResult.data || rawResult.result || rawResult;
    summary = rawResult.summary || data?.summary || data?.text || data?.message || '子任务已执行完成';

    // 提取可能的产物引用 (如导出的剪映草稿、生成的分镜列表、新生成的素材)
    if (data?.draftPath || data?.jianyingDraftDir) {
      artifacts.push({
        type: 'jianying_draft',
        path: data.draftPath || data.jianyingDraftDir,
        title: data.draftName || '剪映草稿工程'
      });
    }
    if (Array.isArray(data?.storyboard)) {
      artifacts.push({
        type: 'storyboard',
        itemsCount: data.storyboard.length,
        summary: `生成了 ${data.storyboard.length} 镜分镜时间轴`
      });
      stateDiff.storyboard = data.storyboard;
    }
    if (data?.artifacts && Array.isArray(data.artifacts)) {
      artifacts.push(...data.artifacts);
    }
    if (data?.analysis) {
      stateDiff.analysis = {
        filename: data.analysis.filename,
        scene: data.analysis.vision?.gameOrScene || '已感知'
      };
    }

    // 提取核心事实数据 (如感知卡片中的 scenes / specs / visualFeatures / analysis，保留事实契约，排除海量原始日志)
    if (data) {
      if (data.analysis) {
        structuredFact = {
          specs: data.analysis.specs,
          vision: data.analysis.vision,
          editorialAdvice: data.analysis.editorialAdvice
        };
      } else if (data.scenes || data.specs || data.visualFeatures) {
        structuredFact = {
          specs: data.specs,
          scenes: data.scenes,
          visualFeatures: data.visualFeatures,
          visualTags: data.visualTags
        };
      }
    }

    // 从工具执行记录中自动汇聚产物与结构化事实 (如 facts, highlights, scenes, specs)
    if (Array.isArray(data?.toolExecutions)) {
      for (const te of data.toolExecutions) {
        const env = te.envelope;
        if (!env) continue;
        if (Array.isArray(env.artifacts)) {
          artifacts.push(...env.artifacts);
        }
        const envData = env.data;
        if (!envData) continue;
        if (Array.isArray(envData.artifacts)) {
          artifacts.push(...envData.artifacts);
        }
        if (envData.facts || envData.highlights || envData.scenes || envData.specs || envData.analysis) {
          if (!structuredFact) structuredFact = {};
          if (Array.isArray(envData.facts)) structuredFact.facts = envData.facts;
          if (Array.isArray(envData.highlights)) structuredFact.highlights = envData.highlights;
          if (Array.isArray(envData.scenes)) structuredFact.scenes = envData.scenes;
          if (envData.specs) structuredFact.specs = envData.specs;
          if (envData.analysis) structuredFact.analysis = envData.analysis;
        }
      }
    }
  }

  // 产物去重 (按 id 或 path)
  const seenArtifactKeys = new Set();
  const dedupedArtifacts = [];
  for (const art of artifacts) {
    if (!art) continue;
    const key = art.id || art.path || JSON.stringify(art);
    if (!seenArtifactKeys.has(key)) {
      seenArtifactKeys.add(key);
      dedupedArtifacts.push(art);
    }
  }

  // 清洗可能残留在 summary 中的思考标签
  summary = summary.replace(/<(?:think|thinking|thought)>[\s\S]*?<\/(?:think|thinking|thought)>/gi, '').trim();
  if (summary.length > 500) {
    summary = summary.slice(0, 500) + '... (已脱水截断)';
  }

  return {
    success,
    taskId: leanPackage?.taskId || `task_${Date.now()}`,
    agentId: leanPackage?.targetAgentId || 'unknown_worker',
    summary: summary || '任务执行完毕，无文本摘要。',
    artifacts: dedupedArtifacts,
    stateDiff,
    factCard: structuredFact,
    error: success ? null : (rawResult?.error || rawResult?.message || '执行受挫')
  };
}

/**
 * 格式化脱水交付卡片文本 (供回流主脑上下文时注入)
 */
export function formatDehydratedFactCard(dehydrated, agentName = '专职智能体') {
  if (!dehydrated) return '【子任务已执行完成】';
  let card = `【${agentName}（${dehydrated.agentId}）交付结果】:\n${dehydrated.summary}`;

  if (dehydrated.factCard) {
    const fc = dehydrated.factCard;
    if (Array.isArray(fc.facts) && fc.facts.length > 0) {
      card += `\n\n【关键业务事实清单】:\n` +
        fc.facts.map((f, i) => `- [${i + 1}] ${typeof f === 'string' ? f : JSON.stringify(f)}`).join('\n');
    }
    if (Array.isArray(fc.highlights) && fc.highlights.length > 0) {
      card += `\n\n【重点提炼】:\n` +
        fc.highlights.map((h, i) => `- [${i + 1}] ${typeof h === 'string' ? h : JSON.stringify(h)}`).join('\n');
    }
    if (Array.isArray(fc.scenes) && fc.scenes.length > 0) {
      card += `\n\n【结构化切片清单 (${fc.scenes.length} 项)】:\n` +
        fc.scenes.map(s => `- [${s.timeRange || s.order || '#'}] ${s.description || '切片条目'}${s.shotType ? ` (类型: ${s.shotType})` : ''}`).join('\n');
    }
    if (fc.specs && typeof fc.specs === 'object') {
      const specDetails = Object.entries(fc.specs).map(([k, v]) => `${k}: ${v}`).join(' | ');
      card += `\n【规格参数】: ${specDetails}`;
    }
    if (fc.vision && typeof fc.vision === 'object') {
      card += `\n【画面视觉特征】: ${fc.vision.gameOrScene || ''} ${fc.vision.visualActions ? `| 动作: ${fc.vision.visualActions}` : ''}`;
    }
  }

  if (Array.isArray(dehydrated.artifacts) && dehydrated.artifacts.length > 0) {
    card += `\n\n【已生成/更新产物引用】:\n` +
      dehydrated.artifacts.map(a => `- 产物[${a.type || 'artifact'}]: ${a.title || a.name || a.path || a.id}`).join('\n');
  }

  return card;
}

/**
 * 3. 工具输出自动修剪 (Two-Stage Compaction · Stage 1: Tool Output Pruning)
 * 遍历会话历史，将较旧的或体积极大的工具输出（如数万字 JSON、大量帧探测输出、日志流）
 * 折叠为单行哈希信封，保全上下文空间
 */
export function pruneToolOutputs(messages = [], {
  maxOutputLength = 500,
  keepRecentToolCount = 2
} = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  // 1. 倒序统计 tool 消息索引
  const toolIndices = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'tool' || (m.role === 'assistant' && Array.isArray(m.toolExecutions) && m.toolExecutions.length > 0)) {
      toolIndices.push(i);
    }
  }

  // 保留最近 keepRecentToolCount 次工具调用不折叠
  const protectedIndices = new Set(toolIndices.slice(0, keepRecentToolCount));

  return messages.map((m, idx) => {
    // 保护近期工具输出
    if (protectedIndices.has(idx)) {
      return m;
    }

    // 针对 role: 'tool' 消息进行修剪
    if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > maxOutputLength) {
      let shortSummary = '结构化数据产物';
      try {
        const parsed = JSON.parse(m.content);
        shortSummary = parsed.summary || parsed.message || (parsed.success ? '执行成功' : '执行失败');
        if (parsed.data?.filename) shortSummary += ` (${parsed.data.filename})`;
      } catch {}

      return {
        ...m,
        content: JSON.stringify({
          _pruned: true,
          status: 'folded',
          summary: `[Tool Output Folded]: ${shortSummary}`,
          originalBytes: m.content.length
        })
      };
    }

    // 针对 assistant 消息中的附带 toolExecutions 内部信封进行修剪
    if (m.role === 'assistant' && Array.isArray(m.toolExecutions) && m.toolExecutions.length > 0) {
      const prunedExecutions = m.toolExecutions.map(te => {
        const rawJson = JSON.stringify(te.envelope || {});
        if (rawJson.length > maxOutputLength) {
          return {
            ...te,
            envelope: {
              _pruned: true,
              success: te.envelope?.success !== false,
              summary: te.envelope?.summary || `[Pruned Output for ${te.tool}]`,
              originalBytes: rawJson.length
            }
          };
        }
        return te;
      });

      return {
        ...m,
        toolExecutions: prunedExecutions
      };
    }

    return m;
  });
}

/**
 * 4. 语义摘要压缩 (Two-Stage Compaction · Stage 2: Semantic Condensation)
 * 当对话消息轮次过多时，提炼早期对话历史为单条精炼的背景状态快照
 */
export function condenseConversationHistory(messages = [], {
  maxThreshold = 24,
  preserveRecentCount = 8
} = {}) {
  if (!Array.isArray(messages) || messages.length <= maxThreshold) {
    return messages;
  }

  let cutoff = Math.max(0, messages.length - preserveRecentCount);
  while (cutoff > 0 && messages[cutoff]?.role === 'tool') {
    cutoff--;
  }
  const earlyMessages = messages.slice(0, cutoff);
  const recentMessages = messages.slice(cutoff);

  // 提炼早期对话中的关键目标与用户指令
  const userDirectives = [];
  const agentConclusions = [];

  for (const m of earlyMessages) {
    if (m.role === 'user' && typeof m.content === 'string') {
      const clean = m.content.replace(/【思考规约】[\s\S]*$/gi, '').trim();
      if (clean && clean.length > 5) {
        userDirectives.push(clean.slice(0, 100));
      }
    } else if (m.role === 'assistant' && typeof m.content === 'string') {
      const clean = m.content.replace(/<(?:think|thinking)>[\s\S]*?<\/(?:think|thinking)>/gi, '').trim();
      if (clean && clean.length > 10) {
        agentConclusions.push(clean.slice(0, 100));
      }
    }
  }

  const condensedContent = `[SYSTEM SUMMARY OF PREVIOUS TURNS]
- 历史核心指令与需求: ${userDirectives.slice(-4).join('；') || '泛对话与素材探讨'}
- 阶段性协商结论: ${agentConclusions.slice(-3).join('；') || '已完成初步推演'}
(注: 早期 ${earlyMessages.length} 轮琐碎对话已完成语义压缩折叠，上下文已释放)`;

  return [
    {
      role: 'system',
      content: condensedContent,
      timestamp: Date.now(),
      _condensed: true
    },
    ...recentMessages
  ];
}

/**
 * 5. 缓存友好的高水位批量压缩守卫 (Cache-Aware Batch Compaction)
 * 解决逐轮修剪破坏 KV Cache 前缀的悖论：
 * - 水位低于阈值时：100% 保持历史消息序列不变 (Append-only)，确保前缀缓存持续命中
 * - 触及高水位时：一次性批量执行 Stage 1 (工具折叠) + Stage 2 (语义摘要)，重建缓存锚点
 */
export function shouldTriggerBatchCompaction(messages = [], {
  watermarkChars = 24000,
  watermarkMessageCount = 24
} = {}) {
  if (!Array.isArray(messages) || messages.length === 0) return false;
  if (messages.length > watermarkMessageCount) return true;

  let totalChars = 0;
  for (const m of messages) {
    if (typeof m?.content === 'string') {
      totalChars += m.content.length;
    }
    if (Array.isArray(m?.toolExecutions) && m.toolExecutions.length > 0) {
      totalChars += JSON.stringify(m.toolExecutions).length;
    }
    if (totalChars >= watermarkChars) return true;
  }
  return false;
}

export function compactSessionMessages(messages = [], {
  watermarkChars = 24000,
  watermarkMessageCount = 24,
  maxOutputLength = 500,
  keepRecentToolCount = 2,
  preserveRecentCount = 8
} = {}) {
  if (!shouldTriggerBatchCompaction(messages, { watermarkChars, watermarkMessageCount })) {
    return messages;
  }

  const pruned = pruneToolOutputs(messages, { maxOutputLength, keepRecentToolCount });
  return condenseConversationHistory(pruned, {
    maxThreshold: watermarkMessageCount,
    preserveRecentCount
  });
}
