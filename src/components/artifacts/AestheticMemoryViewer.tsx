import React, { useEffect } from 'react';
import { useStudioStore } from '@/stores/useStudioStore';
import { BrainCircuit, Sparkles, Quote, RefreshCw } from 'lucide-react';

export const AestheticMemoryViewer: React.FC = () => {
  const {
    aestheticMemories,
    fetchAestheticMemories,
    distillAestheticMemory,
  } = useStudioStore();

  useEffect(() => {
    fetchAestheticMemories();
  }, [fetchAestheticMemories]);

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
          <BrainCircuit className="w-4 h-4 text-purple-400" />
          跨会话审美记忆 DNA
        </span>

        <button
          onClick={() => distillAestheticMemory()}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 transition-colors"
          title="从当前黑板交互提炼最新审美偏好"
        >
          <RefreshCw className="w-3 h-3" />
          <span>提炼新偏好</span>
        </button>
      </div>

      <p className="text-[11px] text-neutral-400 leading-relaxed bg-neutral-900/60 p-2.5 rounded border border-neutral-800">
        智能体自动从您的 StyleBible 拍板、TurnSteer 切轨纠偏与变体竞技场对决中沉淀声明式偏好，带 Citation 溯源并持久化至 SQLite WAL。
      </p>

      {aestheticMemories.length === 0 ? (
        <div className="p-6 text-center text-xs text-neutral-500">
          <Sparkles className="w-6 h-6 mx-auto mb-2 opacity-30 text-purple-400" />
          <p>尚未沉淀审美偏好</p>
          <p className="text-[10px] text-neutral-600 mt-1">在对话中微调风格或切轨，即可自动提炼</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {aestheticMemories.map((mem) => {
            const time = new Date(mem.created_at).toLocaleDateString([], {
              month: '2-digit',
              day: '2-digit',
            });

            return (
              <div
                key={mem.id}
                className="p-3 rounded-lg border border-neutral-800 bg-neutral-950/80 space-y-2 hover:border-neutral-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 text-[10px] font-mono border border-purple-500/30">
                    {mem.category}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-500 font-mono">
                      置信度: {(mem.confidence * 100).toFixed(0)}%
                    </span>
                    <span className="text-[10px] text-neutral-600">{time}</span>
                  </div>
                </div>

                <p className="text-[11px] text-neutral-200 font-medium leading-relaxed">
                  {mem.preference}
                </p>

                {/* Citation 溯源证据 */}
                <div className="pt-2 border-t border-neutral-900 flex items-start gap-1.5 text-[10px] text-neutral-400">
                  <Quote className="w-3 h-3 text-purple-400/60 shrink-0 mt-0.5" />
                  <span className="italic line-clamp-2">{mem.evidence}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
