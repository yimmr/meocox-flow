import React, { useRef, useEffect } from 'react';
import { useStudioStore } from '@/stores/useStudioStore';
import { type DirectorMessage } from '@/types/director';
import { StoryboardConfirmCard } from '@/components/gen-ui/StoryboardConfirmCard';
import { StyleSelectorCard } from '@/components/gen-ui/StyleSelectorCard';
import { QuotaApprovalCard } from '@/components/gen-ui/QuotaApprovalCard';
import { CheckpointRecoveryCard } from '@/components/gen-ui/CheckpointRecoveryCard';
import { BattleCard } from '@/components/gen-ui/BattleCard';
import {
  Compass,
  Copy,
  Zap,
  Tag,
} from 'lucide-react';

export const TimelineFeed: React.FC = () => {
  const {
    messages,
    resolveCardAction,
    isGenerating,
    startBattleMode,
    resolveBattleWinner,
  } = useStudioStore();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const renderCard = (msg: DirectorMessage) => {
    if (!msg.card) return null;

    switch (msg.card.type) {
      case 'storyboard_confirm':
        return (
          <StoryboardConfirmCard
            card={msg.card}
            onResolve={(updated) => resolveCardAction(msg.id, updated)}
            onTriggerBattle={(sceneId) => startBattleMode(sceneId)}
          />
        );
      case 'style_selection':
        return (
          <StyleSelectorCard
            card={msg.card}
            onResolve={(updated) => resolveCardAction(msg.id, updated)}
          />
        );
      case 'quota_approval':
        return (
          <QuotaApprovalCard
            card={msg.card}
            onResolve={(updated) => resolveCardAction(msg.id, updated)}
          />
        );
      case 'checkpoint_restore':
        return (
          <CheckpointRecoveryCard
            card={msg.card}
            onResolve={(updated) => resolveCardAction(msg.id, updated)}
          />
        );
      case 'battle_arena':
        return (
          <BattleCard
            payload={msg.card}
            onSelectWinner={(sceneId, branchId) => {
              resolveBattleWinner(sceneId, branchId);
              if (msg.card && msg.card.type === 'battle_arena') {
                resolveCardAction(msg.id, {
                  ...msg.card,
                  winner_branch_id: branchId,
                  status: 'resolved',
                });
              }
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-5 select-text">
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        const isSteer = msg.is_turn_steer;
        const timeFormatted = new Date(msg.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });

        return (
          <div
            key={msg.id}
            className={`flex flex-col group ${isUser ? 'items-end' : 'items-start'}`}
          >
            {/* 消息发送者指示器 */}
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 mb-1 px-1">
              {isUser ? (
                <>
                  <span>{timeFormatted}</span>
                  <span className="font-medium text-neutral-400">
                    {isSteer ? '动态切轨控制 (TurnSteer)' : '人类导演'}
                  </span>
                  {isSteer && (
                    <span className="p-0.5 rounded bg-amber-500/20 text-amber-400">
                      <Zap className="w-2.5 h-2.5" />
                    </span>
                  )}
                </>
              ) : (
                <>
                  <div className="w-3.5 h-3.5 rounded bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
                    <Compass className="w-2.5 h-2.5" />
                  </div>
                  <span className="font-medium text-neutral-300">智能体黑板编排中枢</span>
                  <span>{timeFormatted}</span>
                </>
              )}
            </div>

            {/* 消息正文气泡 */}
            <div
              className={`relative max-w-2xl px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${
                isSteer
                  ? 'bg-amber-950/40 text-amber-200 border border-amber-500/40 shadow-lg'
                  : isUser
                  ? 'bg-blue-600 text-white rounded-br-sm shadow'
                  : 'bg-neutral-900 text-neutral-200 border border-neutral-800 rounded-bl-sm shadow'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {/* 附件资产句柄标记 */}
              {msg.attached_assets && msg.attached_assets.length > 0 && (
                <div className="mt-2 pt-2 border-t border-neutral-700/50 flex flex-wrap gap-1.5">
                  {msg.attached_assets.map((ast) => (
                    <span
                      key={ast.id}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-950/80 text-[10px] text-neutral-300 border border-neutral-700 font-mono"
                    >
                      <Tag className="w-2.5 h-2.5 text-blue-400" />
                      <span>{ast.id}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* 悬停快捷复制 */}
              <button
                onClick={() => handleCopyText(msg.content)}
                className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 p-1 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-neutral-200 transition-opacity"
                title="复制文本"
              >
                <Copy className="w-2.5 h-2.5" />
              </button>
            </div>

            {/* 内嵌声明式 A2UI 卡片 */}
            {msg.card && <div className="w-full mt-1">{renderCard(msg)}</div>}
          </div>
        );
      })}

      {/* 智能体生成中呼吸态 */}
      {isGenerating && (
        <div className="flex items-center gap-2 text-xs text-neutral-400 animate-pulse pl-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span>编排中枢正在调度并发 Workers 与知觉证伪者...</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
