import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  Sparkles, 
  Layers, 
  Eye, 
  Copy, 
  Check, 
  ChevronDown, 
  Brain,
  Wrench,
  Bot,
  CornerDownRight,
  Cpu,
  ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import HITLDecisionCard from './HITLDecisionCard.jsx';
import ArtifactResultCard from './ArtifactResultCard.jsx';
import SystemAlertCard from './SystemAlertCard.jsx';
import MarkdownMessage from './MarkdownMessage.jsx';
import { buildMicroWorkflowStages, cleanThoughtText } from '@/lib/activityTimeline.js';
import { 
  resolveActionDescriptor, 
  resolveActivityStatus, 
  cleanBusinessOutcome, 
  resolveToolDescription,
  ACTIVITY_TERMS 
} from '@/lib/activityResolver.js';
import { renderUniversalStepDetail } from '@/registry/stepRendererRegistry.jsx';
import MicroWorkflowItem from './MicroWorkflowItem.jsx';
import ScrollFadeArea from './ScrollFadeArea.jsx';


function AssistantMessageBubble({ item }) {
  let rawContent = typeof item.content === 'string' ? item.content : '';

  // 安全清洗可能残留的未解析思考标签
  const thinkRegex = /<(?:think|thinking|thought|reasoning)>[\s\S]*?<\/(?:think|thinking|thought|reasoning)>/gi;
  let displayContent = rawContent.replace(thinkRegex, '').trim();
  displayContent = displayContent.replace(/<(?:think|thinking|thought|reasoning)>[\s\S]*$/i, '').trim();

  // 若无正文，由工作区思考步承担状态指示，不渲染冗余空白节点
  if (!displayContent) {
    return null;
  }

  return (
    <div className="w-full group/assistant-message">
      <section className="w-full max-w-4xl mx-auto px-4 md:px-6 text-sm text-slate-100 leading-7 select-text">
        <MarkdownMessage className="text-slate-200 select-text cursor-text leading-7 prose prose-invert max-w-none">
          {displayContent}
        </MarkdownMessage>
        {/* 底部空白占位: 默认作为信息的间隔，使用方可按需在里面加按钮，hover 才显示 */}
        <div className="z-0 flex min-h-[46px] items-center justify-start select-none" />
      </section>
    </div>
  );
}

function UserMessageBubble({ item, onPreviewFile }) {
  const [copied, setCopied] = useState(false);
  const copyResetTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(copyResetTimerRef.current), []);

  const handleCopy = async () => {
    if (!item.content) return;
    try {
      await navigator.clipboard.writeText(item.content);
      setCopied(true);
      toast.success('已复制消息');
      clearTimeout(copyResetTimerRef.current);
      copyResetTimerRef.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('复制失败');
    }
  };

  return (
    <div className="w-full group/user-message">
      <section className="w-full max-w-4xl mx-auto px-4 md:px-6">
        <div className="flex justify-end">
          <div className="w-fit max-w-[82%] md:max-w-3xl bg-gradient-to-br from-indigo-500/15 via-slate-800/85 to-violet-500/10 border border-indigo-200/10 backdrop-blur-xl text-[#D7DAE2] rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-7 shadow-[0_8px_28px_rgba(4,8,20,0.26)] space-y-2 select-text cursor-text">
            {Array.isArray(item.attachedFiles) && item.attachedFiles.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pb-2 mb-1 border-b border-indigo-400/20">
                {item.attachedFiles.map((file) => (
                  <div
                    key={file.id || file.path}
                    onClick={() => onPreviewFile && onPreviewFile(file)}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-400/10 hover:bg-indigo-400/15 border border-indigo-200/10 text-[10px] font-mono cursor-pointer transition-colors"
                    title="点击预览此附件"
                  >
                    <span className="text-indigo-100/90 font-medium max-w-[160px] truncate">
                      {file.tag ? `@${file.tag} · ` : ''}{file.name}
                    </span>
                    <Eye className="w-2.5 h-2.5 text-indigo-200" />
                  </div>
                ))}
              </div>
            )}
            <MarkdownMessage>{item.content}</MarkdownMessage>
          </div>
        </div>

        {/* 底部空白占位: 默认作为信息的间隔，hover 时才显现操作按钮 */}
        <div className="z-0 flex min-h-[46px] items-center justify-end select-none">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 opacity-0 transition-opacity hover:text-slate-300 hover:bg-white/[0.06] group-hover/user-message:opacity-100 focus-visible:opacity-100 focus-visible:outline-none cursor-pointer"
            title={copied ? '已复制' : '复制消息'}
            aria-label={copied ? '已复制消息' : '复制消息'}
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </section>
    </div>
  );
}

/** 属于协同执行流（Working）范畴的事件类型 */
const WORKING_ITEM_TYPES = new Set([
  'thinking', 
  'tool_execution', 
  'agent_activity', 
  'agent_execution', 
  'agent_handoff'
]);

/**
 * 渲染通用智能体头像/图标
 */
function renderAgentAvatar(avatar, fallbackIcon = null) {
  if (typeof avatar === 'string' && avatar.trim()) {
    return <span className="text-[11px] leading-none select-none">{avatar}</span>;
  }
  if (avatar && React.isValidElement(avatar)) {
    return avatar;
  }
  return fallbackIcon || <Bot className="w-3 h-3 text-indigo-400 shrink-0" />;
}

/**
 * Antigravity 风格思考推演微节点 (MicroThinkingStep)
 * - 顶栏：Thinking + 时间 + 紧邻箭头，默认背景透明，鼠标移入整行显现柔和背景色，点击展开/收起思考信息
 * - 信息块：复用通用 ScrollFadeArea (max-h-[148px])，悬停显现细滚动条，动态上下软边缘遮罩，流式追加时自动滚底
 */
function MicroThinkingStep({ step, isStageRunning }) {
  const stepIsRunning = isStageRunning && (step.status === 'running' || step.isThinking);
  const [isExpanded, setIsExpanded] = useState(() => Boolean(stepIsRunning));
  const prevRunningRef = useRef(Boolean(stepIsRunning));
  const [liveElapsedSec, setLiveElapsedSec] = useState(0);

  // 思考中自动展开观察推演，思考结束生成耗时后自动收起为 1 行摘要
  useEffect(() => {
    if (prevRunningRef.current !== Boolean(stepIsRunning)) {
      if (stepIsRunning) {
        setIsExpanded(true);
      } else {
        setIsExpanded(false);
      }
      prevRunningRef.current = Boolean(stepIsRunning);
    }
  }, [stepIsRunning]);

  const rawThought = step.thought ||
    (Array.isArray(step.logs) ? step.logs.join('') : (typeof step.logs === 'string' ? step.logs : '')) ||
    '';
  const thoughtContent = cleanThoughtText(rawThought);

  const fallbackStartRef = useRef(Date.now());

  // 运行态实时计时器（确保组件卸载或思考结束时自动清理，且基准时间不随 effect 重跑发生漂移）
  useEffect(() => {
    if (!stepIsRunning) return undefined;
    const baseMs = step.segmentStartTime || step.startTime || fallbackStartRef.current;
    const baseAccum = parseFloat(step.accumulatedDuration) || 0;
    const timerId = setInterval(() => {
      const sec = baseAccum + Math.max(0, (Date.now() - baseMs) / 1000);
      setLiveElapsedSec(sec);
    }, 300);
    return () => clearInterval(timerId);
  }, [stepIsRunning, step.segmentStartTime, step.startTime, step.accumulatedDuration]);

  const formatDurationLabel = (val) => {
    const num = parseFloat(val);
    if (!Number.isFinite(num) || num <= 0) return null;
    return num >= 10 ? `${Math.round(num)}s` : `${num.toFixed(1)}s`;
  };

  const hasThinkingContent = Boolean(thoughtContent && thoughtContent.trim());

  const runningDur = formatDurationLabel(liveElapsedSec || step.duration);
  const doneDur = formatDurationLabel(step.duration);
  const headerLabel = stepIsRunning
    ? (runningDur ? `思考中 ${runningDur}` : '思考中...')
    : (doneDur ? `已思考 ${doneDur}` : '已思考');

  // 主脑不显示标记，仅子智能体显示调用者标记
  const isHost = !step.agentId || step.agentId === 'super-brain' || step.agentId === 'host';
  const agentBadge = !isHost ? (step.agentName || step.agentId) : null;

  return (
    <MicroWorkflowItem
      icon={<Brain className="w-3 h-3 text-indigo-400 shrink-0" />}
      badgeClass="bg-indigo-500/12 text-indigo-300"
      agentBadge={agentBadge}
      title={headerLabel}
      isRunning={stepIsRunning && !hasThinkingContent}
      hasContent={hasThinkingContent}
      isExpanded={isExpanded}
      onToggle={setIsExpanded}
    >
      <ScrollFadeArea
        maxHeight="max-h-[148px]"
        autoScroll={stepIsRunning}
        className="text-xs leading-6 text-slate-300/90 select-text cursor-text pr-1"
      >
        <MarkdownMessage className="text-slate-300/90 text-xs leading-6 select-text cursor-text">
          {thoughtContent}
        </MarkdownMessage>
      </ScrollFadeArea>
    </MicroWorkflowItem>
  );
}

/**
 * 协同执行原子动作节点 (MicroStepRow)
 * 极致纯净单行展示，风格与“思考中”完全对齐：
 * - 纯配置驱动（通过 resolveActionDescriptor 获得图标、样式和语义标签）
 * - 耗时与状态指示紧随动作名展示在左侧（微标点/微勾 + 真实业务简述）
 * - 展开内容纯平铺排布，杜绝任何嵌套卡片、边框与胶囊
 */
function MicroStepRow({ step, isStageRunning }) {
  if (step.itemType === 'thinking') {
    return (
      <MicroThinkingStep
        step={step}
        isStageRunning={isStageRunning}
      />
    );
  }

  // 严格过滤非工具原子步骤（防御性防护，防止异常容器事件被误作为工具行渲染）
  if (step.itemType && step.itemType !== 'tool_execution') {
    return null;
  }

  // 严格提取真实动作标识，若无有效名称则安全过滤，杜绝使用占位字符
  const actionName = step.name || step.tool || step.title;
  if (!actionName) {
    return null;
  }

  const [isExpanded, setIsExpanded] = useState(false);

  const descriptor = resolveActionDescriptor(step.type);
  const ActionIcon = descriptor.Icon;
  const icon = <ActionIcon className={`w-3 h-3 ${descriptor.iconClass} shrink-0`} />;
  const badgeClass = descriptor.badgeClass;

  const stepIsRunning = isStageRunning && step.status === 'running';
  const isFailed = step.status === 'error' || step.status === 'failed';
  const isSuccess = step.status === 'success' || (!stepIsRunning && !isFailed && step.duration != null);
  const retryCount = step.retryCount || (step.attempt > 1 ? step.attempt - 1 : 0);

  const hasInputs = Boolean(step.inputs && Object.keys(step.inputs).length > 0);
  const hasOutputs = Boolean(!stepIsRunning && isSuccess && step.outputs !== null && step.outputs !== undefined);

  const hasContent = Boolean(
    hasInputs ||
    hasOutputs ||
    step.error ||
    (Array.isArray(step.logs) && step.logs.length > 0) ||
    (Array.isArray(step.previousAttempts) && step.previousAttempts.length > 0)
  );

  const toolDescription = resolveToolDescription(actionName, step.description);
  const enrichedStep = toolDescription ? { ...step, description: toolDescription } : step;

  // 主脑不显示标记，仅子智能体显示调用者标记
  const isHost = !step.agentId || step.agentId === 'super-brain' || step.agentId === 'host';
  const agentBadge = !isHost ? (step.agentName || step.agentId) : null;

  return (
    <MicroWorkflowItem
      icon={icon}
      badgeClass={badgeClass}
      agentBadge={agentBadge}
      title={actionName}
      duration={step.duration}
      isRunning={stepIsRunning}
      isFailed={isFailed}
      isSuccess={isSuccess}
      errorMessage={step.error?.message || (typeof step.error === 'string' ? step.error : null)}
      retryCount={retryCount}
      hasContent={hasContent}
      isExpanded={isExpanded}
      onToggle={setIsExpanded}
    >
      {renderUniversalStepDetail(enrichedStep)}
    </MicroWorkflowItem>
  );
}

/**
 * 一级交接桥节点 (MicroHandoffBridge)
 * 在主脑与子智能体之间表达控制权流转与核心转接动机，完全平铺排布
 */
function MicroHandoffBridge({ handoff }) {
  if (!handoff) return null;

  const fromName = handoff.fromName || 'Super Brain';
  const toName = handoff.toName || '协同智能体';
  const isReturn = handoff.isReturn || handoff.type === 'return' || toName === 'Super Brain' || toName === '参谋总长';

  // 提取纯净文本：委托动机 或 交付结果
  const rawText = handoff.summary ||
    handoff.reason ||
    handoff.dispatchStep?.inputs?.reason ||
    handoff.dispatchStep?.inputs?.mandate ||
    handoff.dispatchStep?.inputs?.task ||
    handoff.goal ||
    '';
  const cleanText = String(rawText)
    .replace(/^·\s*/, '')
    .replace(/^(?:转接动机|委派动机|交付结论|交付成果|任务说明)[:：]\s*/, '')
    .replace(/^子智能体已完成委派任务[，,]\s*/, '')
    .replace(/脱水回流主脑收敛\s*/, '')
    .trim();

  // 若为收敛/交付，清洗后如果无实质内容，则展示自然的交付成果说明，绝不显示死数据
  const displaySummary = cleanText || (isReturn ? '协同执行完成，已交付结构化事实成果' : '');

  return (
    <div className="w-full py-0.5 select-text group/handoff">
      <div className="w-full min-h-[28px] px-2 py-1 rounded-lg flex items-center gap-2 text-xs select-none hover:bg-white/[0.02] transition-colors">
        <span
          className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
            isReturn
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-fuchsia-500/15 text-fuchsia-300'
          }`}
        >
          {isReturn ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <CornerDownRight className="w-3 h-3" />
          )}
        </span>

        <span
          className={`text-xs font-medium tracking-tight shrink-0 ${
            isReturn ? 'text-emerald-300' : 'text-fuchsia-300'
          }`}
        >
          {isReturn ? '成果交付' : '委派交接'}
        </span>

        {/* 流向指示：Super Brain ➔ 视觉感知专员 */}
        <div className="flex items-center gap-1 min-w-0 text-slate-300">
          <span className="text-xs font-semibold text-slate-300 truncate max-w-[120px] sm:max-w-[160px]">
            {fromName}
          </span>
          <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
          <span className="text-xs font-semibold text-slate-100 truncate max-w-[140px] sm:max-w-[200px]">
            {toName}
          </span>
        </div>
      </div>

      {/* 委派显示【转接动机】，收敛交付显示【交付成果】 */}
      {displaySummary && (
        <div className="pl-9 pr-2 pb-0.5 text-[11px] text-slate-400 leading-relaxed truncate">
          <span className="text-slate-500 font-medium">{isReturn ? '交付成果：' : '转接动机：'}</span>
          <span className="text-slate-300/90">{displaySummary}</span>
        </div>
      )}
    </div>
  );
}

/**
 * 通用左轴协同执行流容器 (WorkingArea / Left-Spine Agent Working Area)
 * - 默认以主脑 (Host Agent) 为宿主环境，主脑动作直接平铺在一级主干上，不额外嵌套多余的主脑层
 * - 当且仅当委派子智能体时，渲染交接桥与子智能体复合阶段组，并在顶栏展示委派子智能体缩略链
 */
function WorkingArea({
  items = [],
  currentAgent = null,
  isProcessing,
  isCurrentWorkArea,
  taskStatus,
  hasDeliveredDialogue = false
}) {
  const scrollContainerRef = useRef(null);
  const userScrolledUpRef = useRef(false);

  const hasFailure = (isCurrentWorkArea && taskStatus === 'failed') ||
    items.some((item) => item.status === 'error' || item.status === 'failed');

  const isRunning = Boolean(isCurrentWorkArea) && !hasFailure && !hasDeliveredDialogue && (
    taskStatus === 'running' ||
    isProcessing ||
    items.some((item) => item.status === 'running' || item.isThinking)
  );

  const waitingDecision = (isCurrentWorkArea && taskStatus === 'waiting_user') ||
    items.some((item) => item.status === 'waiting_decision');

  // 生命周期阶段判定：
  // 1. executing: 正在执行思考与工具调用，尚未进入正式对话输出（展开方便查看过程）
  // 2. failed: 执行发生错误中断（自动展开方便创作者排查故障日志，绝不自作主张折叠隐藏错误）
  // 3. delivered: 任务已完全完成，或已进入输出到对话阶段（自动收起，聚焦对话结果）
  const isExecuting = isRunning && !hasDeliveredDialogue;
  const isCompletedOrDelivered = !hasFailure && (hasDeliveredDialogue || (!isRunning && !waitingDecision));
  const currentPhase = hasFailure ? 'failed' : (isExecuting ? 'executing' : (isCompletedOrDelivered ? 'delivered' : 'other'));

  // 初始折叠状态：执行阶段或失败阶段默认展开，已交付或已完成阶段默认收拢
  const [isOpen, setIsOpen] = useState(() => isExecuting || hasFailure);
  const prevPhaseRef = useRef(currentPhase);

  // 监听生命周期阶段跃迁：
  // 执行时自动展开，发生异常时保持展开，完全完成或输出到对话阶段时自动收起；同一阶段内保留用户手动展开/收起状态
  useEffect(() => {
    if (prevPhaseRef.current !== currentPhase) {
      if (currentPhase === 'executing' || currentPhase === 'failed') {
        setIsOpen(true);
      } else if (currentPhase === 'delivered') {
        setIsOpen(false);
      }
      prevPhaseRef.current = currentPhase;
    }
  }, [currentPhase]);

  const { entries, breadcrumbs } = useMemo(
    () => buildMicroWorkflowStages(items, currentAgent),
    [items, currentAgent]
  );

  const handleInternalScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    userScrolledUpRef.current = scrollHeight - scrollTop - clientHeight > 50;
  };

  useEffect(() => {
    if (isRunning && !userScrolledUpRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [items, isRunning]);

  if (!items || items.length === 0) return null;

  const totalDurationNum = items.reduce((sum, item) => sum + (parseFloat(item.duration) || 0), 0);
  const totalDuration = totalDurationNum > 0 ? totalDurationNum.toFixed(1) : null;

  const statusKey = isRunning
    ? 'running'
    : waitingDecision
      ? 'waiting_decision'
      : hasFailure
        ? 'failed'
        : 'completed';
  const status = resolveActivityStatus(statusKey);

  return (
    <div className="w-full select-none">
      <div className="w-full rounded-2xl border border-black/50 bg-slate-950/65 shadow-[inset_0_2px_8px_rgba(0,0,0,0.7),inset_0_1px_3px_rgba(0,0,0,0.85)] backdrop-blur-xl transition-all duration-200 overflow-hidden">
        {/* ── 协同执行顶栏：左侧指标 + 中间委派子智能体缩略链 (仅存在子智能体时展示) + 右侧状态与折叠 ── */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-xs text-slate-300 cursor-pointer select-none transition-colors ${
            isOpen ? 'border-b border-white/[0.04] bg-white/[0.015]' : 'hover:bg-white/[0.02]'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <div className="w-5 h-5 rounded-md bg-indigo-500/12 flex items-center justify-center shrink-0">
              <Cpu className="w-3 h-3 text-indigo-400" />
            </div>
            <span className="font-semibold text-slate-200 shrink-0">{ACTIVITY_TERMS.workingAreaTitle}</span>
            {totalDuration && (
              <span className="text-[10px] text-slate-500 font-mono shrink-0">
                ({totalDuration}s)
              </span>
            )}

            {/* 委派子智能体拓扑缩略链 (仅在发生子智能体协作时显示，不再冗余显示主脑自身) */}
            {breadcrumbs.length > 0 && (
              <div className="hidden sm:flex items-center gap-1 ml-1 pl-2 border-l border-white/[0.06] min-w-0 overflow-hidden">
                {breadcrumbs.map((bc, bIdx) => (
                  <React.Fragment key={bc.id}>
                    {bIdx > 0 && (
                      <ArrowRight className="w-2.5 h-2.5 text-slate-600 shrink-0" />
                    )}
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] truncate max-w-[120px] ${
                        bc.status === 'running' && isCurrentWorkArea
                          ? 'bg-indigo-500/15 text-indigo-200 font-medium'
                          : 'bg-white/[0.03] text-slate-400'
                      }`}
                    >
                      {renderAgentAvatar(bc.agentAvatar)}
                      <span className="truncate">{bc.agentName}</span>
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className={`inline-flex items-center gap-1.5 text-[10px] ${status.textClass}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dotClass}`} />
              {status.label}
            </span>

            <div className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors pl-2 border-l border-white/[0.06]">
              <span>{isOpen ? ACTIVITY_TERMS.collapse : ACTIVITY_TERMS.expand}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </div>

        {/* ── 工作区主体：左轴协同执行流 (Left-Spine Agent Working Area) ── */}
        {isOpen && (
          <div
            ref={scrollContainerRef}
            onScroll={handleInternalScroll}
            className="px-1.5 py-2 select-text max-h-[min(56vh,460px)] overflow-y-auto overscroll-y-auto [scrollbar-gutter:stable] scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20 scrollbar-track-transparent transition-colors"
          >
            <div className="w-full space-y-0.5">
              {entries.map((entry, idx) => {
                if (entry.kind === 'step') {
                  return (
                    <MicroStepRow
                      key={entry.id}
                      step={entry.step}
                      isStageRunning={isRunning}
                    />
                  );
                }
                if (entry.kind === 'handoff') {
                  return (
                    <MicroHandoffBridge
                      key={entry.id}
                      handoff={entry}
                    />
                  );
                }
                if (entry.kind === 'stage') {
                  const prevEntry = entries[idx - 1];
                  const alreadyRenderedHandoff = prevEntry?.kind === 'handoff' &&
                    (prevEntry.id === entry.handoff?.id || prevEntry.toName === entry.agentName);

                  return (
                    <React.Fragment key={entry.id}>
                      {entry.handoff && !alreadyRenderedHandoff && (
                        <MicroHandoffBridge
                          key={`handoff_${entry.id}`}
                          handoff={entry.handoff}
                        />
                      )}
                      {entry.steps.map((subStep, sIdx) => (
                        <MicroStepRow
                          key={subStep.id || `${entry.id}_step_${sIdx}`}
                          step={{
                            ...subStep,
                            agentId: subStep.agentId || entry.agentId,
                            agentName: subStep.agentName || entry.agentName,
                            agentAvatar: subStep.agentAvatar || entry.agentAvatar
                          }}
                          isStageRunning={isRunning}
                        />
                      ))}
                    </React.Fragment>
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 回合响应层分发渲染器 (Response Tier Renderer)
 * 渲染穿透到执行流外部的产物卡片、HITL 决策卡以及助手总结
 */
function ResponseTierItem({
  item,
  isProcessing,
  onResolveDecision,
  onReopenDecision,
  onDelegateToSuperBrain,
  onSelectArtifact,
  onExecuteAction
}) {
  switch (item.itemType) {
    case 'artifact_result':
    case 'artifact_notification':
      if (item.artifact?.displayMode === 'pill') {
        return (
          <div key={item.id} className="w-full">
            <section className="w-full max-w-4xl mx-auto px-4 md:px-6 flex flex-col items-center">
              <button
                onClick={() => onSelectArtifact?.(item.artifact.id)}
                className="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] text-indigo-300 text-xs flex items-center gap-2 transition-all shadow-sm cursor-pointer group backdrop-blur-xl"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
                <span>已向工作区侧栏推入产物：</span>
                <span className="font-bold text-white underline underline-offset-2">
                  {item.artifact.title}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">➔ 点击在侧栏聚焦</span>
              </button>
              <div className="z-0 flex min-h-[46px] items-center justify-start select-none w-full" />
            </section>
          </div>
        );
      }
      return (
        <div key={item.id} className="w-full">
          <section className="w-full max-w-4xl mx-auto px-4 md:px-6">
            <ArtifactResultCard
              artifact={item.artifact}
              onSelectArtifact={onSelectArtifact}
              onExecuteAction={onExecuteAction}
            />
            <div className="z-0 flex min-h-[46px] items-center justify-start select-none" />
          </section>
        </div>
      );

    case 'decision_request':
      return (
        <div key={item.id} className="w-full">
          <section className="w-full max-w-4xl mx-auto px-4 md:px-6">
            <HITLDecisionCard 
              decision={item} 
              onResolve={onResolveDecision}
              onReopen={onReopenDecision}
              onDelegateToSuperBrain={onDelegateToSuperBrain}
              disabled={isProcessing}
            />
            <div className="z-0 flex min-h-[46px] items-center justify-start select-none" />
          </section>
        </div>
      );

    case 'summary_text':
      return (
        <AssistantMessageBubble
          key={item.id}
          item={item}
          isProcessing={isProcessing}
        />
      );

    case 'system_alert':
    case 'diagnostic':
      return (
        <div key={item.id} className="w-full">
          <section className="w-full max-w-4xl mx-auto px-4 md:px-6">
            <SystemAlertCard
              alert={item}
              onExecuteAction={onExecuteAction}
            />
            <div className="z-0 flex min-h-[46px] items-center justify-start select-none" />
          </section>
        </div>
      );

    default:
      // 开放业务扩展：支持特定内容类型定制的 UI 组件（普通文本 + 专属业务组件）
      if (typeof item.render === 'function') {
        return (
          <div key={item.id || item.turnId} className="w-full">
            <section className="w-full max-w-4xl mx-auto px-4 md:px-6">
              {item.render({ item, isProcessing, onExecuteAction })}
              <div className="z-0 flex min-h-[46px] items-center justify-start select-none" />
            </section>
          </div>
        );
      }
      return null;
  }
}

/**
 * 规范化回合工作区步骤列表：
 * - 按时序将 agent_activity 的角色身份与委派目标 (goal) 注入同一阶段的后续步骤；
 * - 若某个刚启动的子智能体仅发出了 agent_activity 尚未发出首个 step_start，将其原地转换为该智能体的初始思考步，保持多阶段时序完整。
 */
function normalizeTurnWorkingItems(items) {
  if (!items || items.length === 0) return [];

  const working = items.map((it) => ({ ...it }));
  const result = [];
  for (let i = 0; i < working.length; i++) {
    const item = working[i];
    if (item.itemType !== 'agent_activity') {
      result.push(item);
      continue;
    }

    // 查找后续紧邻且尚未跨越下一个 handoff 的步骤是否已有该智能体的具体节点
    let mergedIntoSubsequent = false;
    for (let j = i + 1; j < working.length; j++) {
      const next = working[j];
      if (next.itemType === 'agent_handoff' || next.itemType === 'agent_activity') break;
      if (!next.agentId || next.agentId === item.agentId) {
        working[j] = {
          ...next,
          agentId: item.agentId || next.agentId,
          agentName: item.agentName || next.agentName,
          agentRole: item.agentRole || next.agentRole,
          agentAvatar: item.agentAvatar || next.agentAvatar,
          stageId: item.stageId || next.stageId || item.activityId,
          trigger: next.trigger || item.goal || null
        };
        mergedIntoSubsequent = true;
      }
    }

    if (!mergedIntoSubsequent) {
      result.push({
        ...item,
        itemType: 'thinking',
        isThinking: item.status === 'running',
        status: item.status || 'running',
        stageId: item.stageId || item.activityId,
        title: item.agentName ? `${item.agentName} 思考推演` : '深度思考推演',
        thought: item.thought || '',
        latestThought: item.goal ? `响应任务: ${item.goal}` : '正在深度推演意图与执行路径...'
      });
    }
  }

  return result;
}

/**
 * 将扁平的事件流根据「回合 (Turn)」边界严格拆分：
 * 每一个 Turn 结构包含：
 * - userMessage: 用户输入
 * - workingItems: 协同执行流步骤 (思考、工具、子智能体等内部细节，且已消除冗余)
 * - responseItems: 回合响应交付 (阶段产物、决策卡、助手总结)
 */
function partitionIntoTurns(feedItems) {
  const turns = [];
  let currentTurn = {
    id: 'turn_initial',
    userMessage: null,
    workingItems: [],
    responseItems: []
  };

  const pushFinalizedTurn = (turnObj) => {
    turns.push({
      ...turnObj,
      workingItems: normalizeTurnWorkingItems(turnObj.workingItems)
    });
  };

  for (const item of feedItems) {
    if (item.itemType === 'user_message') {
      if (currentTurn.userMessage || currentTurn.workingItems.length > 0 || currentTurn.responseItems.length > 0) {
        pushFinalizedTurn(currentTurn);
      }
      currentTurn = {
        id: item.turnId || (item.id ? `turn_${item.id}` : `turn_user_${turns.length}`),
        userMessage: item,
        workingItems: [],
        responseItems: []
      };
      continue;
    }

    if (currentTurn.id === 'turn_initial' && item.turnId) {
      currentTurn.id = item.turnId;
    }

    // 过滤掉 host agent 的纯占位 activity，绝不产生空节点
    if (item.itemType === 'agent_activity' && (item.visibility === 'user' || item.agentId === 'super-brain')) {
      continue;
    }

    if (WORKING_ITEM_TYPES.has(item.itemType)) {
      currentTurn.workingItems.push(item);
    } else {
      currentTurn.responseItems.push(item);
    }
  }

  if (currentTurn.userMessage || currentTurn.workingItems.length > 0 || currentTurn.responseItems.length > 0) {
    pushFinalizedTurn(currentTurn);
  }

  // 保证历史回合、已有对话交付或存在异常警报的回合彻底收口，绝不在已输出对话的回合残留运行态标记
  const lastIndex = turns.length - 1;
  return turns.map((turn, idx) => {
    const isHistoricalTurn = idx < lastIndex;
    const hasDeliveredDialogue = turn.responseItems.some(
      (it) => it.itemType === 'summary_text' && (
        typeof it.content === 'string' ? it.content.trim().length > 0 : Boolean(it.content)
      )
    );
    const hasError = turn.responseItems.some((it) => it.itemType === 'system_alert' || it.itemType === 'diagnostic' || it.status === 'error' || it.status === 'failed') ||
      turn.workingItems.some((it) => it.status === 'error' || it.status === 'failed');

    if (!isHistoricalTurn && !hasError && !hasDeliveredDialogue) {
      return turn;
    }

    const sanitizedWorkingItems = turn.workingItems.map((item) => {
      if (item.status === 'running' || item.isThinking) {
        return {
          ...item,
          isThinking: false,
          status: hasError ? 'error' : 'success'
        };
      }
      return item;
    });

    return {
      ...turn,
      workingItems: sanitizedWorkingItems
    };
  });
}

export default function TimelineFeed({
  feedItems = [],
  currentAgent = null,
  onResolveDecision,
  onReopenDecision,
  onDelegateToSuperBrain,
  onSelectArtifact,
  onExecuteAction,
  onPreviewFile,
  isProcessing = false,
  taskStatus = null
}) {
  const containerRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 100;
  };

  useEffect(() => {
    if (shouldAutoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [feedItems, isProcessing]);

  // 对扁平事件向回合模型的聚合进行记忆化，杜绝多余重算
  const turns = useMemo(() => partitionIntoTurns(feedItems), [feedItems]);
  const latestTurnIndex = turns.length - 1;

  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto w-full select-text"
    >
      {/* 对话框顶部空白占位 */}
      <div className="w-full h-4 md:h-6 select-none shrink-0" aria-hidden="true" />

      {turns.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[260px] text-center px-4 py-16 max-w-md mx-auto space-y-3 select-none">
          <div className="w-9 h-9 rounded-xl bg-slate-900/80 border border-white/[0.08] flex items-center justify-center text-slate-400 shadow-sm">
            <Sparkles className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-300">当前任务准备就绪</p>
            <p className="text-[11px] text-slate-500">在底部输入创作指令，或通过 @ 引用资料库素材发起协同编排</p>
          </div>
        </div>
      ) : turns.map((turn, turnIndex) => {
        const isLatestTurn = turnIndex === latestTurnIndex;
        const hasDeliveredDialogue = turn.responseItems.some(
          (it) => it.itemType === 'summary_text' && (
            typeof it.content === 'string' ? it.content.trim().length > 0 : Boolean(it.content)
          )
        );
        const isTurnProcessing = isProcessing && isLatestTurn;
        const isWorkingProcessing = isTurnProcessing && !hasDeliveredDialogue;

        return (
          <div key={turn.id} className="w-full">
            {/* 1. 创作者输入层 (User Message) */}
            {turn.userMessage && (
              <UserMessageBubble item={turn.userMessage} onPreviewFile={onPreviewFile} />
            )}

            {/* 2. 工作区 (Working Area: 智能体协同执行流) */}
            {turn.workingItems.length > 0 ? (
              <div className="w-full">
                <section className="w-full max-w-4xl mx-auto px-4 md:px-6">
                  <WorkingArea
                    items={turn.workingItems}
                    currentAgent={currentAgent}
                    isCurrentWorkArea={isLatestTurn}
                    isProcessing={isWorkingProcessing}
                    taskStatus={taskStatus}
                    hasDeliveredDialogue={hasDeliveredDialogue}
                  />
                  {/* 底部空白占位: 复用标准空白槽保持全局一致间隔 */}
                  <div className="z-0 flex min-h-[46px] items-center justify-start select-none" />
                </section>
              </div>
            ) : isTurnProcessing && turn.responseItems.length === 0 ? (
              /* 指令刚下达智能体，等待首个事件流响应 */
              <div className="w-full">
                <section className="w-full max-w-4xl mx-auto px-4 md:px-6">
                  <div className="w-full px-3.5 py-2 rounded-xl border border-white/[0.08] bg-slate-950/50 backdrop-blur-md text-xs text-slate-400 flex items-center gap-2 select-none shadow-sm">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse shrink-0" />
                    <span className="font-medium text-slate-300">{currentAgent?.name || 'Super Brain'}</span>
                    <span className="text-slate-500">正在响应中...</span>
                  </div>
                  {/* 底部空白占位: 复用标准空白槽保持全局一致间隔 */}
                  <div className="z-0 flex min-h-[46px] items-center justify-start select-none" />
                </section>
              </div>
            ) : null}

            {/* 3. 回合响应交付层 (Response Tier: 阶段产物、决策卡、助手总结) */}
            {turn.responseItems.map((item) => (
              <ResponseTierItem
                key={item.id}
                item={item}
                isProcessing={isTurnProcessing}
                onResolveDecision={onResolveDecision}
                onReopenDecision={onReopenDecision}
                onDelegateToSuperBrain={onDelegateToSuperBrain}
                onSelectArtifact={onSelectArtifact}
                onExecuteAction={onExecuteAction}
              />
            ))}
          </div>
        );
      })}

      {/* 对话流底部预留呼吸空间，避免最新消息被贴底截断 */}
      <div className="w-full h-8 select-none shrink-0" aria-hidden="true" />
    </div>
  );
}
