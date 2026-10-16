import React from 'react';
import MarkdownMessage from '@/components/stream/MarkdownMessage.jsx';
import StepDetailCompact from '@/components/stream/StepDetailCompact.jsx';
import { cleanThoughtText } from '@/lib/activityTimeline.js';

/**
 * 通用协同执行动作扩展注册中心 (Step/Action Renderer Registry)
 *
 * 设计契约：
 * - 99% 的常规智能体/技能/工具动作无需注册任何 UI 组件，完全由通用执行流通过
 *   Envelope (summary / inputs / outputs / logs / attempt) 自动渲染。
 * - 1% 的极端定制场景（如特殊实时矩阵、自定义可视化探针等），可通过
 *   registerStepRenderer(key, { renderInlineBadge, renderDetail }) 按需扩展，
 *   保持主时间线与业务零耦合。
 */
const stepRendererMap = new Map();

/**
 * 注册自定义步骤渲染器
 * @param {string|string[]} keyOrKeys - 工具名 (toolName)、技能ID (skillId) 或 displayHint.previewType
 * @param {object} definition
 * @param {(node: object) => React.ReactNode} [definition.renderInlineBadge] - 可选的行内扩展胶囊
 * @param {(node: object) => React.ReactNode} [definition.renderDetail] - 可选的展开详情自定义面板
 */
export function registerStepRenderer(keyOrKeys, definition) {
  const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
  for (const key of keys) {
    if (key && typeof key === 'string') {
      stepRendererMap.set(key.toLowerCase(), definition);
    }
  }
}

/**
 * 查询匹配当前步骤的扩展渲染器
 */
export function getStepRenderer(node) {
  if (!node) return null;
  const candidates = [
    node.displayHint?.renderer,
    node.name,
    node.displayHint?.previewType,
    node.type
  ].filter(Boolean);

  for (const key of candidates) {
    const normalized = String(key).toLowerCase();
    if (stepRendererMap.has(normalized)) {
      return stepRendererMap.get(normalized);
    }
  }
  return null;
}

/**
 * 内置通用扩展：当工具通过 displayHint.previewType = 'markdown' 声明时的详情渲染
 */
registerStepRenderer('markdown', {
  renderDetail(node) {
    const mdText = typeof node.outputs === 'string'
      ? node.outputs
      : (node.outputs?.markdown || node.outputs?.content || node.outputs?.text || node.outputs?.promptGuide || '');
    if (!mdText) return null;
    return (
      <div className="rounded-lg bg-slate-900/70 border border-white/[0.06] px-3 py-2 text-xs text-slate-200 max-h-60 overflow-y-auto">
        <MarkdownMessage>{mdText}</MarkdownMessage>
      </div>
    );
  }
});

/**
 * 通用兜底步骤详情渲染器 (Universal Fallback Step Detail Renderer)
 * 采用现代轻量防爆设计：
 * 1. 思考节点展开态：渲染沉浸式 Markdown 思维链
 * 2. 工具/技能展开态：采用 StepDetailCompact 呈现指标胶囊、紧凑入参、集合摘要及有界 JSON
 * 3. 彻底消除伪黑客终端与数十张冗余卡片
 */
export function renderUniversalStepDetail(node, { activeTab, onTabChange } = {}) {
  if (!node) return null;

  // 1. 思考节点展开态：渲染完整 Markdown 思维链
  if (node.itemType === 'thinking') {
    const rawThought = node.thought ||
      (Array.isArray(node.logs) ? node.logs.join('') : (typeof node.logs === 'string' ? node.logs : '')) ||
      '';
    const thoughtContent = cleanThoughtText(rawThought);
    return (
      <div className="relative text-xs text-slate-300 leading-relaxed pl-3 py-1 space-y-1 cursor-text select-text max-h-64 overflow-y-auto pr-1">
        <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-indigo-500/40" />
        {thoughtContent ? (
          <MarkdownMessage>{thoughtContent}</MarkdownMessage>
        ) : (
          <div className="text-slate-500 italic font-mono text-[11px]">
            {node.status === 'running' || node.isThinking
              ? '正在进行思维推演...'
              : '模型已完成意图分析并直接发起下一步调度'}
          </div>
        )}
      </div>
    );
  }

  // 2. 检查是否命中了注册表中的极端场景自定义详情渲染器
  const customRenderer = getStepRenderer(node);
  const customDetail = customRenderer?.renderDetail ? customRenderer.renderDetail(node) : null;
  const hasPreviousAttempts = Array.isArray(node.previousAttempts) && node.previousAttempts.length > 0;

  return (
    <div className="space-y-2">
      {customDetail}

      {hasPreviousAttempts && (
        <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/20 px-2.5 py-1.5 space-y-1">
          <div className="text-[10px] font-mono text-amber-300/90 font-semibold">
            自愈重试轨迹 (共 {node.previousAttempts.length} 次前序尝试)
          </div>
          <div className="space-y-1">
            {node.previousAttempts.map((att, idx) => (
              <div key={att.stepId || idx} className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                <span className="px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 text-[10px]">
                  Attempt #{att.attempt || idx + 1}
                </span>
                <span className="truncate">
                  {att.summary || (typeof att.outputs === 'string' ? att.outputs : '前序调用未通过校验，已自动修正参数重试')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!customDetail && (
        <StepDetailCompact 
          node={node} 
          activeTab={activeTab} 
          onTabChange={onTabChange} 
        />
      )}
    </div>
  );
}
