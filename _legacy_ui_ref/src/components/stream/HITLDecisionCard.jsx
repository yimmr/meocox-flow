import React, { useState, useEffect } from 'react';
import { HelpCircle, Check, ArrowRight, Sparkles, CheckCircle2, ShieldAlert } from 'lucide-react';
import MarkdownMessage from './MarkdownMessage.jsx';

export default function HITLDecisionCard({ 
  decision, 
  onResolve, 
  onReopen,
  onDelegateToSuperBrain, 
  disabled = false 
}) {
  const {
    decisionId,
    prompt = '需要您的决策以继续推进：',
    options = [],
    status = 'pending',
    selectedOptionId = null,
    selectedLabel = null,
    steeringNotes: initialSteeringNotes = ''
  } = decision;

  const [selectedId, setSelectedId] = useState(
    selectedOptionId || options.find(o => o.isRecommended)?.id || options[0]?.id
  );
  const [steeringNotes, setSteeringNotes] = useState(initialSteeringNotes);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (selectedOptionId) {
      setSelectedId(selectedOptionId);
    }
  }, [selectedOptionId]);

  useEffect(() => {
    if (initialSteeringNotes !== undefined) {
      setSteeringNotes(initialSteeringNotes || '');
    }
  }, [initialSteeringNotes]);

  const isResolved = status === 'resolved' || Boolean(selectedOptionId);

  const handleConfirm = async () => {
    if (disabled || isResolved || !selectedId || submitting) return;
    setSubmitting(true);
    try {
      await onResolve?.(decisionId, selectedId, steeringNotes.trim());
    } finally {
      setSubmitting(false);
    }
  };

  // 1. 已决态卡片 (支持重新评估与微调展示)
  if (isResolved) {
    const chosenOption = options.find(o => o.id === (selectedOptionId || selectedId));
    const label = selectedLabel || chosenOption?.label || selectedOptionId;
    const finalNotes = initialSteeringNotes || steeringNotes;

    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 shadow-lg flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate-400 truncate">人机协同决策 · 已选定推进方向</div>
              <div className="text-sm font-bold text-emerald-300 truncate mt-0.5">{label}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onReopen && (
              <button
                type="button"
                onClick={() => onReopen(decisionId)}
                disabled={disabled}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-100 hover:bg-white/[0.08] border border-white/10 transition-colors cursor-pointer disabled:opacity-40"
                title="推翻当前决策并重新选择推进方案"
              >
                重新评估
              </button>
            )}
            <div className="text-xs text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 shrink-0">
              已裁决
            </div>
          </div>
        </div>

        {finalNotes && (
          <div className="pl-12 text-[11px] text-slate-300 font-sans border-l-2 border-emerald-500/40 ml-4 py-0.5">
            <span className="text-slate-400 font-medium mr-1.5">微调补充：</span>
            <span>{finalNotes}</span>
          </div>
        )}
      </div>
    );
  }

  // 2. 待决态卡片 (高亮聚焦交互视图)
  return (
    <div className="rounded-2xl border-2 border-amber-500/60 bg-gradient-to-b from-amber-950/20 via-slate-900 to-slate-950 p-5 shadow-2xl shadow-amber-500/10 space-y-4 animate-in fade-in zoom-in-95 duration-300">
      {/* 顶栏提示 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-amber-400 tracking-wide uppercase flex items-center gap-1.5">
              <span>人机协同挂起 (Human In The Loop)</span>
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            </div>
            <MarkdownMessage className="mt-1 text-[15px] font-semibold text-slate-100 select-text">{prompt}</MarkdownMessage>
          </div>
        </div>

        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
          等待您的决策
        </span>
      </div>

      {/* 选项矩阵 */}
      <div className="space-y-2.5 pt-1">
        {options.map((opt) => {
          const isSelected = selectedId === opt.id;

          return (
            <div
              key={opt.id}
              onClick={() => !disabled && setSelectedId(opt.id)}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-950/40 shadow-md shadow-indigo-950/50'
                  : 'border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                    isSelected ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-600 bg-slate-800'
                  }`}>
                    {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>

                  <span className={`text-xs font-bold ${isSelected ? 'text-indigo-200' : 'text-slate-200'}`}>
                    {opt.label}
                  </span>
                </div>

                {opt.isRecommended && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold shrink-0">
                    推荐方案
                  </span>
                )}
              </div>

              {opt.description && (
                <MarkdownMessage className="text-sm text-slate-400 mt-2 pl-6.5 select-text">
                  {opt.description}
                </MarkdownMessage>
              )}
            </div>
          );
        })}
      </div>

      {/* 创作者补充微调说明 (可选) */}
      <div className="pt-1">
        <div className="text-[11px] font-medium text-slate-300 mb-1.5 flex items-center justify-between">
          <span>补充微调说明 (可选)：</span>
          <span className="text-[10px] text-slate-500 font-mono">向智能体说明您在此方案下的细节要求</span>
        </div>
        <input
          type="text"
          value={steeringNotes}
          onChange={(e) => setSteeringNotes(e.target.value)}
          placeholder="例如：选择此方案，但请将前 5 秒声音适当提高，节奏稍微加快..."
          disabled={disabled || submitting}
          className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/80 hover:border-slate-600 focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/30 focus:outline-none text-xs text-slate-200 placeholder-slate-600 transition-all shadow-inner"
        />
      </div>

      {/* 确认执行与操作按钮 */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div>
          {onDelegateToSuperBrain && (
            <button
              type="button"
              onClick={() => onDelegateToSuperBrain?.(decision)}
              className="px-3 py-2 rounded-xl border border-indigo-500/30 bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-300 text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
              title="委托系统主脑分析优劣并代为决策"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>请主脑评估</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={disabled || submitting || !selectedId}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
        >
          <span>{submitting ? '正在应用决策...' : '确认以此方案推进'}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
