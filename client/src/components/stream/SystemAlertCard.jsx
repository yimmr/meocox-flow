import React from 'react';
import {
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  Info,
  CheckCircle2,
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import MarkdownMessage from './MarkdownMessage.jsx';

/**
 * 工业级系统诊断与干预警示卡 (System Alert & Diagnostic Card)
 * 
 * 适用于：
 * 1. 运行时安全护栏触发 (Guardrails / Content Policy)
 * 2. 算力/Token 阈值与降级重试 (Fallback / Retry Triggered)
 * 3. 智能体执行链路异常与自愈诊断 (Diagnostics & Self-healing Suggestion)
 */
export default function SystemAlertCard({ alert, onExecuteAction }) {
  if (!alert) return null;

  const {
    level = 'warning',
    title = '系统诊断提示',
    message,
    code,
    suggestion,
    actions = []
  } = alert;

  const getStyle = () => {
    switch (level) {
      case 'error':
        return {
          icon: <AlertCircle className="w-4 h-4 text-rose-400" />,
          border: 'border-rose-500/40 bg-rose-950/20 shadow-rose-950/20',
          badge: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
          badgeText: '异常熔断'
        };
      case 'guardrail':
        return {
          icon: <ShieldAlert className="w-4 h-4 text-purple-400" />,
          border: 'border-purple-500/40 bg-purple-950/20 shadow-purple-950/20',
          badge: 'bg-purple-950/60 text-purple-300 border-purple-800/60',
          badgeText: '安全护栏'
        };
      case 'success':
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
          border: 'border-emerald-500/40 bg-emerald-950/20 shadow-emerald-950/20',
          badge: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
          badgeText: '自愈就绪'
        };
      case 'info':
        return {
          icon: <Info className="w-4 h-4 text-sky-400" />,
          border: 'border-sky-500/40 bg-sky-950/20 shadow-sky-950/20',
          badge: 'bg-sky-950/60 text-sky-300 border-sky-800/60',
          badgeText: '链路通知'
        };
      case 'warning':
      default:
        return {
          icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
          border: 'border-amber-500/40 bg-amber-950/20 shadow-amber-950/20',
          badge: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
          badgeText: '诊断预警'
        };
    }
  };

  const style = getStyle();

  return (
    <div className={`rounded-2xl border p-4 shadow-lg backdrop-blur-md transition-all duration-300 ${style.border}`}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 shrink-0">
          {style.icon}
        </div>

        <div className="flex-1 min-w-0 space-y-1.5 select-text">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-xs text-slate-100">{title}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${style.badge}`}>
              {style.badgeText}
            </span>
            {code && (
              <span className="text-[10px] text-slate-500 font-mono">
                [{code}]
              </span>
            )}
          </div>

          {message && (
            <MarkdownMessage className="text-sm text-slate-300">
              {message}
            </MarkdownMessage>
          )}

          {suggestion && (
            <div className="mt-2 text-sm text-slate-400 bg-slate-900/60 border border-slate-800/80 rounded-lg p-2.5 flex items-start gap-2">
              <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
              <div className="min-w-0 leading-relaxed">
                <div className="text-slate-300 font-semibold mb-1">建议处置:</div>
                <MarkdownMessage className="text-slate-400">{suggestion}</MarkdownMessage>
              </div>
            </div>
          )}

          {actions.length > 0 && (
            <div className="pt-2 flex items-center gap-2 flex-wrap">
              {actions.map((act, i) => (
                <button
                  key={act.id || i}
                  onClick={() => onExecuteAction?.(act)}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span>{act.label}</span>
                  {act.type === 'link' && <ExternalLink className="w-3 h-3 text-slate-400" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
