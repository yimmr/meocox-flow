import React, { useState, useRef, useEffect } from 'react';
import MarkdownMessage from './MarkdownMessage.jsx';
import ScrollFadeArea from './ScrollFadeArea.jsx';
import { 
  Copy, 
  Check, 
  LayoutList,
  Code2,
  ChevronRight
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip.jsx';
import { toast } from '@/components/ui/sonner.jsx';

/**
 * 基础标量值渲染器（文本、数字、布尔、简单标量数组）
 */
function ScalarValueRenderer({ value }) {
  if (value === null || value === undefined) {
    return <span className="text-slate-500 font-mono text-[11px] italic">-</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span className={`inline-flex px-1.5 py-0.2 rounded text-[10px] font-mono font-medium ${
        value 
          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25' 
          : 'bg-slate-800 text-slate-400 border border-slate-700/50'
      }`}>
        {String(value)}
      </span>
    );
  }

  if (typeof value === 'number') {
    return <span className="font-mono text-amber-300/90 text-xs">{value}</span>;
  }

  if (typeof value === 'string') {
    return <span className="text-slate-200 text-xs font-mono break-all leading-relaxed select-text">{value}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-slate-500 font-mono text-[11px] italic">空列表</span>;
    }
    return (
      <div className="flex flex-wrap items-center gap-1.5 py-0.5">
        {value.map((item, idx) => (
          <span 
            key={idx} 
            className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-slate-300 font-mono text-[11px] select-text"
          >
            {String(item ?? '-')}
          </span>
        ))}
      </div>
    );
  }

  return <span className="text-slate-200 text-xs select-text font-mono">{String(value)}</span>;
}

/**
 * 纵向流式参数节点 (Vertical Parameter Node)
 * 核心设计：
 * - 标量单行自然对齐 (key 在左固定列宽，value 在右自适应，去除冒号噪点)
 * - 复合对象/复杂数组纵向沉降展开至下一行，使用微底色圆角模块呈现，彻底杜绝无限向右挤压与生硬竖线
 * - 支持点击折叠/展开
 */
function ParameterNode({ label, value, depth = 0 }) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);

  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  const isArray = Array.isArray(value);
  const isComplexArray = isArray && value.some((v) => v !== null && typeof v === 'object');
  const isComplex = isObject || isComplexArray;

  // 1. 简单标量或基础数组：单行紧凑对齐呈现
  if (!isComplex) {
    return (
      <div className="flex items-baseline gap-3 py-1 px-1.5 -mx-1.5 rounded-md hover:bg-white/[0.02] transition-colors leading-relaxed">
        {label && (
          <span 
            className="font-mono text-[11px] text-slate-400 font-medium shrink-0 w-24 sm:w-28 truncate select-text" 
          >
            {label}
          </span>
        )}
        <div className="min-w-0 flex-1 select-text">
          <ScalarValueRenderer value={value} />
        </div>
      </div>
    );
  }

  // 2. 复合对象或对象数组：上下纵向排布，子级另起一行占据完整可用宽度
  const entries = isObject 
    ? Object.entries(value).filter(([k]) => !k.startsWith('_'))
    : value.map((item, idx) => [`#${idx + 1}`, item]);

  const countTag = isObject 
    ? `${entries.length} 属性` 
    : `${value.length} 项`;

  return (
    <div className="py-0.5 select-text">
      {/* 复合父级标题行：点击可展开/收起 */}
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className="inline-flex items-center gap-1.5 py-1 px-1.5 -ml-1.5 rounded-md text-xs cursor-pointer select-none transition-colors hover:bg-white/[0.04] text-slate-300 hover:text-white"
      >
        <ChevronRight className={`w-3.5 h-3.5 transition-transform duration-150 shrink-0 text-slate-500 ${isExpanded ? 'rotate-90 text-indigo-400' : ''}`} />
        {label && (
          <span className="font-mono text-[11px] font-medium text-indigo-300/90 select-text">
            {label}
          </span>
        )}
        <span className="text-[10px] text-slate-400 font-mono bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.2 rounded-full">
          {countTag}
        </span>
      </div>

      {/* 子属性区域：微底色圆角模块 (避免生硬竖线与多层厚重边框) */}
      {isExpanded && (
        <div className={`mt-1 mb-1.5 rounded-lg p-2.5 space-y-0.5 transition-all ${
          depth % 2 === 0 
            ? 'bg-white/[0.015] border border-white/[0.04]' 
            : 'bg-black/20 border border-white/[0.03]'
        }`}>
          {entries.length > 0 ? (
            entries.map(([childKey, childVal]) => (
              <ParameterNode 
                key={childKey} 
                label={childKey} 
                value={childVal} 
                depth={depth + 1} 
              />
            ))
          ) : (
            <div className="text-[11px] text-slate-500 italic py-0.5 font-mono">空对象</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 纵向流式参数检视器 (Vertical Tree Inspector)
 */
function VerticalInspector({ data }) {
  if (!data || typeof data !== 'object') {
    return <div className="text-slate-300 break-all select-text py-1 font-mono text-xs">{String(data ?? '')}</div>;
  }

  const entries = Array.isArray(data)
    ? data.map((item, idx) => [`[${idx}]`, item])
    : Object.entries(data).filter(([k]) => !k.startsWith('_'));

  if (entries.length === 0) {
    return <div className="text-slate-500 italic text-[11px] py-1 font-mono">暂无参数数据</div>;
  }

  return (
    <div className="space-y-0.5 text-xs">
      {entries.map(([key, val]) => (
        <ParameterNode key={key} label={key} value={val} depth={0} />
      ))}
    </div>
  );
}

/**
 * 步骤展开平铺检视器 (StepDetailCompact)
 * 极致平铺，内容区左侧集成 [入参] / [出参] Segmented Tab 切换，右侧提供 [列表 / 原始 JSON] 与复制纯图标
 */
export default function StepDetailCompact({ 
  node, 
  activeTab: controlledActiveTab, 
  onTabChange: controlledOnTabChange,
  maxHeight = 'max-h-[300px]'
}) {
  const contentScrollRef = useRef(null);
  const inputs = node?.inputs;
  const outputs = node?.outputs;
  const isFailed = node?.status === 'error' || node?.status === 'failed';
  const isSuccess = node?.status === 'success' || (node?.status !== 'running' && !isFailed && node?.duration != null);
  const hasOutputs = Boolean(node?.status !== 'running' && isSuccess && outputs !== null && outputs !== undefined);

  // 内部维护 Tab 状态，支持父级受控或自受控（完成出参时默认激活出参，否则默认入参）
  const isControlled = controlledActiveTab !== undefined && typeof controlledOnTabChange === 'function';
  const [internalTab, setInternalTab] = useState(() => (hasOutputs ? 'outputs' : 'inputs'));
  const activeTab = isControlled ? controlledActiveTab : internalTab;

  const handleTabSwitch = (nextTab, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setInternalTab(nextTab);
    if (controlledOnTabChange) controlledOnTabChange(nextTab);
  };

  const [viewMode, setViewMode] = useState('readable'); // 'readable' (纵向可读参数表) | 'raw' (原始 JSON 代码)
  const [copied, setCopied] = useState(false);

  // 切换 Tab 或视图模式时，独立内容滚动区自动平滑复位至顶部
  useEffect(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
      contentScrollRef.current.scrollLeft = 0;
    }
  }, [activeTab, viewMode]);

  // 契约化错误提取
  const rawError = node?.error || (isFailed ? (node?.summary || node?.outSummary || '调用执行异常') : null);
  const errorMessage = typeof rawError === 'object' && rawError !== null
    ? (rawError.message || rawError.code || JSON.stringify(rawError))
    : (rawError ? String(rawError) : null);

  // 当前激活的数据集
  const currentData = activeTab === 'outputs' ? outputs : inputs;
  const currentPayloadString = currentData !== null && currentData !== undefined
    ? (typeof currentData === 'string' ? currentData : JSON.stringify(currentData, null, 2))
    : '';

  // 契约化资产交付物 (仅出参时展示)
  const artifacts = activeTab === 'outputs' && Array.isArray(outputs?.artifacts) 
    ? outputs.artifacts 
    : [];

  const handleCopy = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!currentPayloadString) return;
    navigator.clipboard.writeText(currentPayloadString);
    setCopied(true);
    toast.success(activeTab === 'outputs' ? '已复制出参完整 JSON' : '已复制入参完整 JSON');
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-1.5 py-0.5 text-xs text-slate-300 leading-relaxed min-w-0">
      {node?.description && (
        <div className="text-[11px] text-slate-400 leading-relaxed pb-0.5 select-text">
          {node.description}
        </div>
      )}

      {/* ── 第一行：左侧 [入参] / [出参] Tab 与底部分隔线融为一体，右侧纯图标操作区 (无背景、无边框) ── */}
      <div className="flex items-center justify-between border-b border-white/[0.08] mb-2 select-none h-7">
        {/* 左侧：与底部分隔线融为一体的 Tab 切换 (无计数) */}
        <div className="flex items-center h-full gap-5">
          <button
            type="button"
            onClick={(e) => handleTabSwitch('inputs', e)}
            className={`relative h-full flex items-center text-xs font-medium cursor-pointer transition-colors ${
              activeTab === 'inputs'
                ? 'text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>入参</span>
            {activeTab === 'inputs' && (
              <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-indigo-500 rounded-full" />
            )}
          </button>

          {hasOutputs && (
            <button
              type="button"
              onClick={(e) => handleTabSwitch('outputs', e)}
              className={`relative h-full flex items-center text-xs font-medium cursor-pointer transition-colors ${
                activeTab === 'outputs'
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>出参</span>
              {activeTab === 'outputs' && (
                <span className="absolute left-0 right-0 -bottom-[1px] h-[2px] bg-indigo-500 rounded-full" />
              )}
            </button>
          )}
        </div>

        {/* 右侧：纯图标控制组 (无背景、无边框，激活状态线条变色) */}
        <div className="flex items-center gap-2 h-full">
          {/* 模式切换：纵向参数列表 (LayoutList) */}
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMode('readable');
                }}
                className={`p-1 transition-colors cursor-pointer ${
                  viewMode === 'readable'
                    ? 'text-indigo-400 hover:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                aria-label="参数列表"
              >
                <LayoutList className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">参数列表 (可读布局)</TooltipContent>
          </Tooltip>

          {/* 模式切换：原始代码 (Code2) */}
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMode('raw');
                }}
                className={`p-1 transition-colors cursor-pointer ${
                  viewMode === 'raw'
                    ? 'text-indigo-400 hover:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                aria-label="原始 JSON 代码"
              >
                <Code2 className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">原始 JSON 代码</TooltipContent>
          </Tooltip>

          {/* 纯图标复制按钮 */}
          <Tooltip delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleCopy}
                className="p-1 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                aria-label="复制完整 JSON"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{copied ? '已复制' : '复制完整 JSON'}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* ── 独立滚动 Tab 内容区 (固定 Tab 头置顶，具备动态上下软边缘淡出文本效果与自动水平/垂直滚动) ── */}
      <ScrollFadeArea
        forwardRef={contentScrollRef}
        maxHeight={maxHeight}
        fadeMask={true}
        className="pr-1"
      >
        {/* ── 异常报错提示 ── */}
        {isFailed && activeTab === 'outputs' && errorMessage && (
          <div className="text-rose-400 font-mono text-xs break-all leading-relaxed py-1 px-2 rounded bg-rose-500/10 border border-rose-500/20 mb-1.5">
            {errorMessage}
          </div>
        )}

        {/* ── 交付资产清单 (出参且有资产时展示) ── */}
        {artifacts.length > 0 && viewMode === 'readable' && (
          <div className="space-y-0.5 text-xs pb-1 mb-1 border-b border-white/[0.04]">
            <div className="text-[11px] text-slate-500 font-medium">交付资产:</div>
            <div className="space-y-0.5 pl-2 text-[11px] font-mono text-slate-400">
              {artifacts.map((art, idx) => (
                <div key={art.id || art.path || idx} className="break-all leading-relaxed">
                  <span className="text-indigo-400 font-medium">{art.title || art.name || `资产 #${idx + 1}`}</span>
                  {art.path && <span className="text-slate-500 ml-1.5 font-normal">({art.path})</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 内容渲染区 ── */}
        {viewMode === 'readable' ? (
          currentData !== null && currentData !== undefined ? (
            typeof currentData === 'string' ? (
              <div className="text-xs leading-relaxed text-slate-200 select-text py-0.5">
                <MarkdownMessage>{currentData}</MarkdownMessage>
              </div>
            ) : (
              <div className="py-0.5 select-text">
                <VerticalInspector data={currentData} />
              </div>
            )
          ) : (
            <div className="py-2 text-[11px] text-slate-500 italic font-mono">
              暂无数据
            </div>
          )
        ) : (
          <pre className="font-mono text-xs leading-relaxed text-slate-300/90 whitespace-pre select-text py-1">
            {currentPayloadString || '// 暂无数据'}
          </pre>
        )}
      </ScrollFadeArea>
    </div>
  );
}
