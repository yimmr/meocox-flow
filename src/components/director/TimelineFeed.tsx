import React, { useRef, useEffect } from 'react';
import { useStudioStore } from '@/stores/useStudioStore';
import { type DirectorMessage } from '@/types/director';
import { StoryboardConfirmCard } from '@/components/gen-ui/StoryboardConfirmCard';
import { StyleSelectorCard } from '@/components/gen-ui/StyleSelectorCard';
import { QuotaApprovalCard } from '@/components/gen-ui/QuotaApprovalCard';
import { CheckpointRecoveryCard } from '@/components/gen-ui/CheckpointRecoveryCard';
import {
  Compass,
  Copy,
  Zap,
  Tag,
} from 'lucide-react';

export const TimelineFeed: React.FC = () => {
  const { messages, resolveCardAction, isGenerating } = useStudioStore();
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
            className={`flex flex-col group/msg ${
              isUser ? 'items-end' : 'items-start'
            }`}
          >
            {/* 发送者信息与时间戳 */}
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 mb-1 px-1">
              {isUser ? (
                <>
                  {isSteer && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300 font-mono font-medium">
                      <Zap className="w-2.5 h-2.5 fill-current" />
                      <span>TurnSteer 纠偏</span>
                    </span>
                  )}
                  <span>导演 (You)</span>
                  <span>·</span>
                  <span>{timeFormatted}</span>
                </>
              ) : (
                <>
                  <div className="w-4 h-4 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                    <Compass className="w-2.5 h-2.5" />
                  </div>
                  <span className="font-medium text-neutral-300">Meocox Flow 导演总长</span>
                  <span>·</span>
                  <span>{timeFormatted}</span>
                </>
              )}
            </div>

            {/* 消息正文气泡 */}
            <div
              className={`relative max-w-2xl px-4 py-3 rounded-2xl text-xs leading-relaxed ${
                isUser
                  ? isSteer
                    ? 'bg-amber-950/40 border border-amber-500/30 text-amber-100 rounded-tr-sm shadow-md'
                    : 'bg-blue-950/40 border border-blue-500/30 text-neutral-100 rounded-tr-sm shadow-md'
                  : 'bg-neutral-900/80 border border-neutral-800 text-neutral-200 rounded-tl-sm shadow-sm'
              }`}
            >
              {/* 渲染引用资产标签 */}
              {msg.attached_assets && msg.attached_assets.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 mb-2 pb-1.5 border-b border-neutral-800">
                  {msg.attached_assets.map((ast) => (
                    <span
                      key={ast.id}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-800 text-[10px] text-neutral-300 font-mono"
                    >
                      <Tag className="w-2.5 h-2.5 text-blue-400" />
                      <span>{ast.name}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* 文本内容 */}
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {/* 悬浮复制工具按钮 */}
              <button
                onClick={() => handleCopyText(msg.content)}
                className="absolute right-2 top-2 p-1 rounded bg-neutral-900/80 text-neutral-500 hover:text-neutral-200 opacity-0 group-hover/msg:opacity-100 transition-opacity"
                title="复制文案"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>

            {/* 内嵌声明式 A2UI 卡片 (高度 <= 500px) */}
            {msg.card && <div className="w-full max-w-2xl mt-1">{renderCard(msg)}</div>}
          </div>
        );
      })}

      {/* 生成中状态指示 */}
      {isGenerating && (
        <div className="flex items-center gap-2 text-xs text-neutral-400 p-2 rounded-lg bg-neutral-900/40 border border-neutral-800 w-fit">
          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span>导演中枢正在推演镜头方案与核算算力预算...</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};
