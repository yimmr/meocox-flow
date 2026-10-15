import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Play,
  Check,
  Loader2,
  Maximize2
} from 'lucide-react';
import { toast } from '@/components/ui/sonner.jsx';
import { getArtifactTheme, renderArtifactCardContent } from '@/registry/artifactRegistry.jsx';

/**
 * 工业级流内多态自适应结果卡 (In-Stream Polymorphic Result Card)
 * 
 * 核心机制：
 * 1. 纯净容器外壳：负责流内卡片顶栏、折叠状态、通用动作分发与侧栏聚焦联动。
 * 2. 插件化渲染器（Artifact Registry）：多态内容区完全委托给注册表中心分发，
 *    业务能力可通过注册表独立扩展，无需侵入核心流组件代码。
 */
export default function ArtifactResultCard({
  artifact,
  onSelectArtifact,
  onExecuteAction
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!artifact) return null;

  const {
    id,
    type = 'cards',
    title = '交付产物',
    badge,
    data,
    actions = []
  } = artifact;

  // 从注册表解析当前产物主题与视觉规范
  const theme = getArtifactTheme(type, artifact);

  // 快捷动作调度
  const handleActionClick = async (action) => {
    if (action.type === 'copy') {
      const textToCopy = typeof action.payload === 'string'
        ? action.payload
        : JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success(action.successMessage || '已复制产物内容到剪贴板');
      setTimeout(() => setCopied(false), 2000);
      return;
    }

    if (onExecuteAction) {
      setActionLoadingId(action.id);
      try {
        await onExecuteAction(action, artifact);
      } finally {
        setActionLoadingId(null);
      }
    }
  };

  return (
    <div className={`rounded-2xl border transition-all duration-300 bg-gradient-to-b from-slate-900/90 via-slate-950 to-[#07090E] shadow-xl overflow-hidden ${theme.borderClass}`}>
      {/* ── 产物卡片顶栏 ── */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center shrink-0 shadow-inner">
            {theme.icon}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-100 truncate select-text cursor-text">
                {title}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${theme.tagClass}`}>
                {badge || theme.label}
              </span>
            </div>
          </div>
        </div>

        {/* 快捷操作与侧栏联动 */}
        <div className="flex items-center gap-1.5 ml-auto">
          {actions.map((act) => {
            const isLoading = actionLoadingId === act.id;
            return (
              <button
                key={act.id}
                onClick={() => handleActionClick(act)}
                disabled={isLoading}
                className={`py-1 px-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
                  act.variant === 'primary'
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500/50 shadow-sm shadow-indigo-600/30'
                    : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700/60'
                }`}
                title={act.description || act.label}
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : act.icon === 'copy' ? (
                  copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />
                ) : act.icon === 'download' ? (
                  <Download className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>{act.label}</span>
              </button>
            );
          })}

          {/* 侧栏深潜聚焦按钮 */}
          <button
            onClick={() => onSelectArtifact?.(id)}
            className="py-1 px-2.5 rounded-lg text-xs text-indigo-300 bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-500/30 transition-all flex items-center gap-1 cursor-pointer"
            title="在工作区侧边栏展开完整参数与深度编辑"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">侧栏聚焦</span>
          </button>

          {/* 折叠/展开流内预览 */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors cursor-pointer"
            title={isExpanded ? '收起流内预览' : '展开流内预览'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── 产物卡片多态内容区 (委托给注册表) ── */}
      {isExpanded && (
        <div className="p-4 bg-slate-950/40 border-t border-slate-900 select-text">
          {renderArtifactCardContent(artifact, onExecuteAction)}
        </div>
      )}
    </div>
  );
}
