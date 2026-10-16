import React, { useState } from 'react';
import { type CheckpointCardPayload } from '@/types/director';
import { History, RotateCcw, CheckCircle2, Bookmark, Clock } from 'lucide-react';

interface CheckpointRecoveryCardProps {
  card: CheckpointCardPayload;
  onResolve: (updated: CheckpointCardPayload) => void;
}

export const CheckpointRecoveryCard: React.FC<CheckpointRecoveryCardProps> = ({
  card,
  onResolve,
}) => {
  const [isRestored, setIsRestored] = useState(card.status === 'restored');

  const { checkpoint } = card;
  const timeFormatted = new Date(checkpoint.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const handleRestore = () => {
    setIsRestored(true);
    onResolve({
      ...card,
      status: 'restored',
    });
  };

  return (
    <div className="w-full max-w-2xl my-2 rounded-xl border border-blue-500/30 bg-neutral-900/90 shadow-xl overflow-hidden text-neutral-200 select-text flex flex-col max-h-[380px]">
      {/* 头部 */}
      <div className="px-3.5 py-2.5 bg-blue-950/40 border-b border-blue-500/20 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
            <History className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-neutral-100">
              非线性时间轴时光机 · 检查点快照
            </h3>
            <span className="text-[10px] text-neutral-400 font-mono">
              {checkpoint.checkpoint_id}
            </span>
          </div>
        </div>

        {isRestored ? (
          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>状态机已回滚</span>
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-900/40 border border-blue-500/30 text-blue-300 font-mono">
            <Clock className="w-2.5 h-2.5" />
            <span>{timeFormatted}</span>
          </span>
        )}
      </div>

      {/* 检查点详情 */}
      <div className="p-3 space-y-2 text-xs">
        <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800">
          <div className="flex items-center gap-1.5 text-neutral-300 font-medium mb-1">
            <Bookmark className="w-3.5 h-3.5 text-blue-400" />
            <span>{checkpoint.step_name}</span>
          </div>
          <p className="text-[11px] text-neutral-400 font-mono leading-relaxed line-clamp-2">
            {checkpoint.state_json}
          </p>
        </div>
      </div>

      {/* 底部回滚按钮 */}
      <div className="px-3 py-2 bg-neutral-950 border-t border-neutral-800/80 flex items-center justify-between shrink-0">
        <span className="text-[10px] text-neutral-500">
          基于 SQLite WAL 持久化无损时间轴，支持分叉与任意节点重探
        </span>

        {!isRestored ? (
          <button
            onClick={handleRestore}
            className="flex items-center gap-1 text-[11px] px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-sm transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            <span>回滚至此步</span>
          </button>
        ) : (
          <span className="text-[11px] text-emerald-400 font-medium">
            当前时光机已定位至此快照
          </span>
        )}
      </div>
    </div>
  );
};
