import React, { useState } from 'react';
import { ChevronDown, RotateCcw, AlertCircle, Check } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip.jsx';
import ScrollFadeArea from './ScrollFadeArea.jsx';

/**
 * 通用协同执行原子动作节点基准框架组件 (MicroWorkflowItem)
 * 
 * 核心基准基础设定：
 * 1. 外层 Item Wrapper：统一 Item 之间的垂直间隔 (py-0.5)，不自设随意 margin。
 * 2. 统一 Head 区域：
 *    - 左侧紧凑排布：[图标] [标题 (Hover工具描述Tooltip)] [入参/出参操作胶囊按钮]
 *    - 右侧轻量对齐 (ml-auto)：[耗时] [自愈重试角标] [轻量状态 (运行态/失败/成功微标)] [折叠箭头]
 *    - 移除中间冗余的业务简述概览，聚焦于参数检视与紧凑状态呈现
 * 3. 统一内容区域：
 *    - 内置一致性左右内边距 (pl-9 pr-2，与标题文本起始线绝对对齐)
 *    - 支持通用限高与滚动遮罩 (ScrollFadeArea)
 */
export default function MicroWorkflowItem({
  icon,
  badgeClass = 'bg-white/[0.06] text-slate-300',
  agentBadge = null,
  title,
  titleTooltip = null,
  actions = null,
  duration = null,
  isRunning = false,
  isFailed = false,
  isSuccess = false,
  errorMessage = null,
  retryCount = 0,
  hasContent = false,
  defaultExpanded = false,
  isExpanded: controlledExpanded,
  onToggle,
  contentClassName = '',
  maxHeight = null,
  children
}) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const handleToggle = () => {
    if (!hasContent) return;
    const nextState = !isExpanded;
    if (controlledExpanded === undefined) {
      setInternalExpanded(nextState);
    }
    if (onToggle) {
      onToggle(nextState);
    }
  };

  const showContent = hasContent && isExpanded;

  return (
    <div className="w-full py-0.5 select-text group/item">
      {/* ── 统一 Head 区域：左侧 [图标 + 标题 + 操作按钮] ；右侧 ml-auto [耗时 + 重试 + 状态 + 箭头] ── */}
      <div
        onClick={handleToggle}
        className={`w-full min-h-[28px] px-2 py-1 rounded-lg flex items-center gap-2 select-none transition-colors ${
          hasContent
            ? 'cursor-pointer hover:bg-white/[0.04]'
            : 'cursor-default'
        }`}
      >
        {/* 统一图标锚点 */}
        <span
          className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all ${badgeClass} ${
            isRunning ? 'animate-pulse ring-1 ring-cyan-400/50 shadow-[0_0_8px_rgba(34,211,238,0.35)]' : ''
          }`}
        >
          {icon}
        </span>

        {/* 调用智能体标记 (仅子智能体显示，主脑不显示) */}
        {agentBadge && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 shrink-0 select-none max-w-[120px] truncate">
            {agentBadge}
          </span>
        )}

        {/* 统一标题字号与粗细 */}
        <span className="text-xs font-medium tracking-tight text-slate-300 truncate max-w-[200px]">
          {title}
        </span>

        {/* 标题右侧入参/出参操作胶囊按钮插槽 */}
        {actions && (
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}

        {/* ── 靠右侧轻量信息集群：[耗时] [重试角标] [轻量状态] [折叠箭头] ── */}
        <div className="ml-auto flex items-center gap-2 text-xs font-mono shrink-0">
          {/* 统一耗时 */}
          {duration && (
            <span className="text-[11px] text-slate-400 font-normal tracking-tight">
              {duration}s
            </span>
          )}

          {/* 自愈重试角标 */}
          {retryCount > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 text-[10px]">
              <RotateCcw className="w-2.5 h-2.5" />
              <span>#{retryCount + 1}</span>
            </span>
          )}

          {/* 状态指示：运行中呼吸点 / 失败指示 / 成功微标 */}
          {isRunning && (
            <span className="flex items-center gap-1 text-[11px] text-cyan-400 font-sans font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="hidden sm:inline text-[10px]">运行中</span>
            </span>
          )}

          {isFailed && (
            <Tooltip delayDuration={150}>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/15 border border-rose-500/30 text-[10px] text-rose-300 font-sans font-medium cursor-help">
                  <AlertCircle className="w-3 h-3 text-rose-400" />
                  <span>失败</span>
                </span>
              </TooltipTrigger>
              {errorMessage && (
                <TooltipContent side="top" className="max-w-sm text-xs text-rose-200 bg-slate-950 border-rose-900/50">
                  {errorMessage}
                </TooltipContent>
              )}
            </Tooltip>
          )}

          {!isRunning && !isFailed && isSuccess && (
            <span className="inline-flex items-center text-emerald-400">
              <Check className="w-3.5 h-3.5" />
            </span>
          )}

          {/* 统一箭头：仅在有实际内容时展示 */}
          {hasContent && (
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-500 group-hover/item:text-slate-300 transition-transform duration-200 ml-0.5 ${
                isExpanded ? '' : '-rotate-90'
              }`}
            />
          )}
        </div>
      </div>

      {/* ── 统一内容区域：标准一致性左右内边距 (与标题文本起始线绝对对齐 pl-9 pr-2)，完全平铺 ── */}
      {showContent && (
        <div className={`pl-9 pr-2 pt-0.5 pb-1 text-xs text-slate-300 select-text min-w-0 ${contentClassName}`}>
          {maxHeight ? (
            <ScrollFadeArea maxHeight={maxHeight} fadeMask={false} className="pr-1">
              {children}
            </ScrollFadeArea>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}
