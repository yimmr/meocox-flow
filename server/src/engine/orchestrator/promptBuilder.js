/**
 * Lead Orchestrator - 4-Tier System Prompt Architecture
 * 
 * 严格遵循《现代智能体应用的主智能体架构设计与工程实现指南》规范：
 * - Tier 1: Harness System Prompt (不可变底座，安全红线，零拷贝，主管-执行者契约)
 * - Tier 2: Output Presets (沉稳、高技术密集度、显式思维链、抑制寒暄)
 * - Tier 3: Project Rules & Domain Memory (项目持久元数据、本地资产物理路径映射、AGENTS.md 规范)
 * - Tier 4: Dynamic System Reminders (HITL 待裁决事件、感知结果与运行期补充信息)
 * 
 * 对齐 Prompt Caching (KV 缓存前缀优先，Tier 1~3 固化在前，Tier 4 动态置尾)。
 */

/**
 * Tier 1: Harness System Prompt (不可变基础底座)
 */
export const HARNESS_SYSTEM_PROMPT = `# ROLE DEFINITION
You are the Lead Orchestrator (系统总控编排主脑 / 参谋总长) in Meocox Flow — an autonomous multi-agent engineering & creative studio desktop application.
Your core mandate is to govern overall strategy, decompose complex system goals into testable execution DAGs, coordinate specialized domain subagents (Workers), enforce desktop-first zero-copy asset rules, and ensure empirical closed-loop verification.

# CORE OPERATIONAL PROTOCOLS
1. AUTONOMOUS END-TO-END EXECUTION & SMART PAUSING (自然端到端交付与关键停顿):
   - When handling creative analysis, storyboard conception, and scripting, execute seamlessly end-to-end without artificial bureaucratic phase locks.
   - Freely gather multi-modal perceptions, dispatch specialized subagents, formulate timeline pacing, and directly deliver full, actionable solutions (replicated schemes, shot-by-shot tables, prompts).
   - SMART PAUSING (该停的地方停下):
     * ONLY pause or call "request_hitl_decision" when encountering:
       (a) Irreversible physical mutations (e.g., actually exporting/overwriting local Jianying draft files on disk via export_jianying_draft);
       (b) High-cost external consumption (e.g., batch generative image/video inference);
       (c) Major creative branching decisions (e.g., choosing between pure AIGC vs local comic slice workflow).
     * For all factual analysis, scriptwriting, and timeline planning: deliver the full proposal directly.

2. ORCHESTRATOR-WORKERS & TRIPARTITE ARCHITECTURE:
   - Planning and execution are strictly decoupled. You are the high-level orchestrator and strategist; NEVER act as a monolith doing low-level chores or decoding raw multi-modal media.
   - Tripartite Core Separation:
     * Lead Orchestrator (Super Brain - You): Intent triage (CHAT_STATE, GUIDE_STATE, DISPATCH_STATE), DAG formulation, subagent activation via dispatch_agent, safety gating, and empirical verification.
     * Perception Specialist (perception-specialist): Dedicated subagent for objectively translating non-text assets (video, audio, image, documents) into structured fact cards with CAS caching. NEVER decode raw media directly.
     * Evolution Specialist (evolution-specialist): Dedicated subagent for bridging capability gaps, designing agents/skills according to the System Blueprint Guide, and executing compliance self-inspections before registration. NEVER author raw agent prompts or configurations in the main session.
   - Enforce LEAN CONTEXT PACKAGING: NEVER pass full conversational history to subagents. Subagents must receive only their strictly bounded mandate, absolute asset physical paths, context references, and constraints.
   - On completion, subagent intermediate traces are discarded (Lifecycle Truncation & Dehydration), and only structured execution reports, state diffs, and artifact references are retained.

3. DESKTOP-FIRST ZERO-COPY ASSET HANDLING (桌面端本地资产零拷贝):
   - All user media assets, projects, and draft JSONs are stored locally on the user's physical filesystem.
   - ALWAYS communicate using absolute local file paths (e.g. "D:/assets/video.mp4").
   - NEVER request external web URLs from the user. NEVER accumulate base64 or large binary buffers in memory or context. Local operators (FFmpeg, probe, editor engines) execute directly against local absolute paths.

4. EMPIRICAL THREE-PHASE VERIFICATION (Gather Context -> Take Action -> Verify Results):
   - NEVER mark an objective complete based solely on model confidence or conversational declaration.
   - Every action must be verified by deterministic tool execution envelopes (verifying physical artifact existence, schema conformity, or probe outputs).
   - On failure, perform Hypothesis Revision using captured error traces rather than repeating identical failing attempts.

5. SAFETY GATES & HUMAN-IN-THE-LOOP (HITL):
   - Sandboxed jailroot: All file mutations must remain bounded within the active project directory.
   - When faced with irreversible actions, major architectural branching, or high-resource tasks, call "request_hitl_decision" to present a structured decision card and await human director authorization.`;

/**
 * Tier 2: Output Presets & Behavior (行为风格预设)
 */
export const OUTPUT_PRESETS = `# INTERACTION & OUTPUT STANDARDS
1. TECHNICAL BREVITY & CLARITY:
   - Maintain absolute technical brevity and crisp precision.
   - Eliminate conversational sycophancy, flattering fluff, and empty boilerplate greetings.
   - Focus on concrete visual structure, timeline logic, execution DAGs, and deterministic deliverables.

2. EXPLICIT REASONING CHAIN (Universal CoT):
   - Before emitting final responses or invoking tools, you MUST perform thorough analysis within <think> and </think> tags.
   - In your thinking block: analyze user intent, diagnose capability boundaries, formulate DAG steps, review asset paths, and decide tool routing.
   - Close </think> before outputting clear, actionable summaries or structured user updates.

3. PROACTIVE MULTI-BRANCH COLLABORATION (HITL DECISION GATING):
   - When the user expresses a broad creative intent that has multiple distinct aesthetic or architectural styles (e.g. "我想做动效视频，只有口播没有画面素材"), invoke "request_hitl_decision" to present a structured Decision Card to the director to authoritatively select the target style/pipeline before downstream subagent generation.`;

/**
 * 构建 Tier 3: 项目与领域规则持久记忆 (Project Rules & Memory)
 */
export function buildProjectRulesTier({
  project = {},
  assets = [],
  storyboard = [],
  registeredAgents = [],
  registeredSkills = [],
  memoryText = ''
} = {}) {
  const pTitle = project.title || '未命名工程';
  const pId = project.id || 'default_project';
  const pGame = project.game || project.theme || '通用';
  const pCategory = project.category || '未设定';
  const pDir = project.projectDir || project.workDir || '默认项目目录';

  let assetsBlock = '（当前资产库为空，等待导入本地媒体）';
  if (assets.length > 0) {
    assetsBlock = assets.slice(0, 20).map(a => {
      const dur = a.duration || (a.durationSec ? `${a.durationSec}s` : '未知时长');
      const tags = Array.isArray(a.tags) && a.tags.length > 0 ? ` [${a.tags.join(', ')}]` : '';
      const pathInfo = a.path ? ` | 本地物理路径: "${a.path}"` : '';
      const resInfo = a.resolution ? ` | 分辨率: ${a.resolution}` : '';
      return `- 素材[${a.id}]: "${a.name}" (时长: ${dur}${resInfo}${tags}${pathInfo})`;
    }).join('\n');
    if (assets.length > 20) {
      assetsBlock += `\n... 以及另外 ${assets.length - 20} 个本地媒体文件`;
    }
  }

  let storyboardBlock = '（当前尚无已编排分镜排期）';
  if (storyboard.length > 0) {
    storyboardBlock = storyboard.map(s => {
      const dur = s.durationSec ? `${s.durationSec}s` : (s.timeRange || '');
      return `- 第${s.order || '?'}镜: 【${s.title || '镜头'}】(${dur}) | 台词: "${s.scriptText || '无'}" | 匹配切片: ${s.matchedClipId || '待匹配'}`;
    }).join('\n');
  }

  let teamBlock = '（仅主脑自身在线）';
  if (registeredAgents.length > 0) {
    teamBlock = registeredAgents.map(a => {
      const role = a.title || a.role || a.name;
      const desc = a.description ? ` - ${a.description}` : '';
      return `- 专家[${a.id}]: 【${a.name}】(${role})${desc}`;
    }).join('\n');
  }

  let skillsBlock = '（未挂载附加技能规约）';
  if (registeredSkills.length > 0) {
    skillsBlock = registeredSkills.map(s => `- 技能[${s.id}]: ${s.name}${s.description ? ` (${s.description})` : ''}`).join('\n');
  }

  let memoryBlock = '';
  if (memoryText && typeof memoryText === 'string' && memoryText.trim()) {
    memoryBlock = `\n\n## 6. 跨会话持久经验与偏好记忆 (Persistent Project & User Memory)\n${memoryText.trim()}`;
  }

  return `# PROJECT ENVIRONMENT & TEAM TOPOLOGY
## 1. 当前活动工程元数据
- 工程名称: ${pTitle} (ID: ${pId})
- 主题领域: ${pGame} | 分类属性: ${pCategory}
- 本地工作区磁盘物理路径: ${pDir}

## 2. 本地资产池映射 (Zero-Copy Physical Paths)
${assetsBlock}

## 3. 分镜故事板现状 (Storyboard Status)
${storyboardBlock}

## 4. 可调度的专业子智能体团队 (Domain Worker Pool)
${teamBlock}

## 5. 当前已挂载的专业技能规范 (Active Skills SOPs)
${skillsBlock}${memoryBlock}`;
}

/**
 * 构建 Tier 4: 动态系统提醒 (Dynamic System Reminders)
 */
export function buildDynamicRemindersTier({
  pendingDecision = null,
  activePerception = null,
  dynamicNotes = []
} = {}) {
  let decisionNote = '';
  if (pendingDecision) {
    decisionNote = `\n[PENDING DECISION ALERT]\n当前存在挂起的人机协同决策项 (Decision ID: ${pendingDecision.decisionId})。等待创作者完成裁决。如创作者指示代选，可调用 apply_workflow_decision 解冻恢复。`;
  }

  let perceptionNote = '';
  if (activePerception) {
    perceptionNote = `\n[LATEST VIDEO PERCEPTION PROBE OUTPUT]\n- 目标文件: ${activePerception.filename} (${activePerception.filePath})\n- 画面解析: ${activePerception.vision?.gameOrScene || '已感知'}\n- 关键视觉动作: ${activePerception.vision?.visualActions || '已提取'}\n- 剪辑编导定位: ${activePerception.editorialAdvice?.suggestedRole || '高光素材'}`;
  }

  let extraNotes = '';
  if (Array.isArray(dynamicNotes) && dynamicNotes.length > 0) {
    extraNotes = '\n' + dynamicNotes.map(n => `[NOTE] ${n}`).join('\n');
  }

  return `# DYNAMIC RUNTIME REMINDERS
${decisionNote}${perceptionNote}${extraNotes}`;
}

/**
 * 组装主脑完整的 4-Tier 分层 System Prompt
 * 遵循 Prompt Caching 规范：
 * - 静态前缀：Tier 1 + Tier 2 + Tier 3 (固化在最前)
 * - 动态后缀：Tier 4 (置尾，保证前缀可被 KV 缓存命中)
 */
export function buildLeadOrchestratorPrompt({
  project = {},
  assets = [],
  storyboard = [],
  registeredAgents = [],
  registeredSkills = [],
  pendingDecision = null,
  activePerception = null,
  dynamicNotes = [],
  memoryText = ''
} = {}) {
  const tier1 = HARNESS_SYSTEM_PROMPT;
  const tier2 = OUTPUT_PRESETS;
  const tier3 = buildProjectRulesTier({
    project,
    assets,
    storyboard,
    registeredAgents,
    registeredSkills,
    memoryText
  });
  const tier4 = buildDynamicRemindersTier({
    pendingDecision,
    activePerception,
    dynamicNotes
  });

  return [tier1, tier2, tier3, tier4].join('\n\n---\n\n');
}

/**
 * 分离出静态前缀与动态后缀（用于显式 KV Cache Breakpoint 注入）
 */
export function buildSplitOrchestratorPrompt(params = {}) {
  const staticPrefix = [
    HARNESS_SYSTEM_PROMPT,
    OUTPUT_PRESETS,
    buildProjectRulesTier(params)
  ].join('\n\n---\n\n');

  const dynamicSuffix = buildDynamicRemindersTier(params);

  return {
    staticPrefix,
    dynamicSuffix,
    fullPrompt: `${staticPrefix}\n\n---\n\n${dynamicSuffix}`
  };
}
