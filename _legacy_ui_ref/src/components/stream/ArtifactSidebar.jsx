import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  ChevronRight, 
  Copy, 
  Download, 
  Play, 
  Loader2 
} from 'lucide-react';
import { toast } from '@/components/ui/sonner.jsx';
import { getArtifactIcon, renderArtifactSidebarContent } from '@/registry/artifactRegistry.jsx';

/**
 * VS Code 风格右侧辅助栏：任务交付产物与深度检视器 (Artifacts Sidebar)
 * 
 * 职责：
 * 1. 展现多智能体协作产出的各类成果物 (Artifacts)，支持多模态与多态自适应渲染；
 * 2. 动态挂载产物自带的操作按钮 (actions)，完全由产物元数据驱动；
 * 3. 内容渲染委托给 Artifact Registry 分发，实现业务解耦。
 */
export default function ArtifactSidebar({
  artifacts = [],
  width = 340,
  isOpen = true,
  onSelectArtifact,
  selectedArtifactId,
  onExecuteAction
}) {
  const [activePreviewArtifact, setActivePreviewArtifact] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  useEffect(() => {
    setActivePreviewArtifact(null);
  }, [selectedArtifactId]);

  if (!isOpen) return null;

  const validLocalPreview = activePreviewArtifact && artifacts.some(a => a.id === activePreviewArtifact.id)
    ? activePreviewArtifact
    : null;
  const currentPreview = validLocalPreview || artifacts.find(a => a.id === selectedArtifactId) || artifacts[0];

  // 通用动作执行调度器
  const handleTriggerAction = async (action, artifact) => {
    if (action.type === 'copy') {
      const textToCopy = typeof action.payload === 'string' 
        ? action.payload 
        : JSON.stringify(artifact.data, null, 2);
      navigator.clipboard.writeText(textToCopy);
      toast.success(action.successMessage || '已成功复制到剪贴板');
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
    <aside 
      style={{ width }}
      className="border-l border-slate-800/80 bg-slate-950/95 flex flex-col select-text shrink-0 h-full overflow-hidden transition-none"
    >
      {/* ── 顶栏：标题与操作群 (包含折叠按钮) ── */}
      <div className="h-10 px-3 border-b border-slate-800/80 flex items-center justify-between gap-2 bg-slate-900/40 shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="text-xs font-bold text-slate-200 tracking-wide truncate">
            交付产物
          </span>
          {artifacts.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 font-mono">
              {artifacts.length}
            </span>
          )}
        </div>
      </div>

      {/* ── 主体内容区 ── */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {artifacts.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center p-4 text-slate-500 space-y-1.5">
            <Layers className="w-8 h-8 text-slate-700 stroke-[1.5]" />
            <div className="text-xs font-medium text-slate-400">暂无产物</div>
            <p className="text-[11px] text-slate-500 leading-relaxed max-w-xs">
              智能体生成的阶段性成果将在此展示。
            </p>
          </div>
        ) : (
          <>
            {/* 产出物清单 */}
            <div className="space-y-1.5">
              <div className="text-[10px] text-slate-400 font-semibold px-1">
                产物清单
              </div>
              {artifacts.map((art) => {
                const isSelected = (currentPreview?.id === art.id);
                return (
                  <div
                    key={art.id}
                    onClick={() => {
                      setActivePreviewArtifact(art);
                      onSelectArtifact?.(art.id);
                    }}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'border-indigo-500/80 bg-indigo-950/40 text-slate-100 shadow-md shadow-indigo-950/30'
                        : 'border-slate-800/80 bg-slate-900/50 hover:bg-slate-900 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-lg bg-slate-800/80 shrink-0">
                        {getArtifactIcon(art.type, art)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{art.title}</div>
                        {art.badge && (
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">{art.badge}</div>
                        )}
                      </div>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${isSelected ? 'text-indigo-400 translate-x-0.5' : 'text-slate-600'}`} />
                  </div>
                );
              })}
            </div>

            {/* 选中的产出物即时详情卡 */}
            {currentPreview && (
              <div className="mt-4 border-t border-slate-800/80 pt-3 space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] text-indigo-400 font-semibold">
                    产物详情
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {currentPreview.type}
                  </span>
                </div>

                {/* 产物动态动作栏 */}
                {Array.isArray(currentPreview.actions) && currentPreview.actions.length > 0 && (
                  <div className="flex items-center gap-1.5 pb-1 flex-wrap select-none">
                    {currentPreview.actions.map((act) => {
                      const isLoading = actionLoadingId === act.id;
                      return (
                        <button
                          key={act.id}
                          onClick={() => handleTriggerAction(act, currentPreview)}
                          disabled={isLoading}
                          className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm border ${
                            act.variant === 'primary'
                              ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white border-indigo-500/50'
                              : 'bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-800'
                          }`}
                          title={act.description || act.label}
                        >
                          {isLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : act.icon === 'copy' ? (
                            <Copy className="w-3.5 h-3.5" />
                          ) : act.icon === 'download' ? (
                            <Download className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                          <span>{act.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* ── 委托给注册表进行详情展示 ── */}
                {renderArtifactSidebarContent(currentPreview, onExecuteAction)}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
