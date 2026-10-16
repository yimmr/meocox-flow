import React from 'react';
import { useStudioStore } from '@/stores/useStudioStore';
import {
  Send,
  Sparkles,
  Zap,
} from 'lucide-react';

const QUICK_DEMANDS = [
  { id: 'qd_1', title: '推导赛博分镜', prompt: '请基于当前设定，推导下一幕中仿生人遭遇重型机甲阻击的 3 组分镜。' },
  { id: 'qd_2', title: '核算批量算力', prompt: '请评估渲染 4K 60fps 场景扩散重绘任务的算力预算。' },
  { id: 'qd_3', title: '合成免版税转场音', prompt: '请使用原生 PCM 合成一段 Whoosh 转场音效并登记至媒体库。' },
  { id: 'qd_4', title: '一键组装剪映草稿', prompt: '请将已有的分镜视频组装为剪映 Pro 工程草稿并输出时间轴。' },
];

export const TurnSteerInputBar: React.FC = () => {
  const {
    daemonStatus,
    turnSteerInput,
    setTurnSteerInput,
    sendMessage,
    dispatchTurnSteer,
    isGenerating,
  } = useStudioStore();

  const isRendering = Boolean(daemonStatus?.is_rendering || (daemonStatus?.active_tasks_count || 0) > 0 || isGenerating);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnSteerInput.trim()) return;

    if (isRendering) {
      // 处于后台渲染生成态 -> 触发 TurnSteer 无损动态切轨
      await dispatchTurnSteer(turnSteerInput.trim());
    } else {
      // 普通空闲态 -> 触发普通导演指令
      await sendMessage(turnSteerInput.trim());
      setTurnSteerInput('');
    }
  };

  const handleApplyQuickDemand = (prompt: string) => {
    setTurnSteerInput(prompt);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-4 pt-1 shrink-0 select-none">
      {/* 快捷需求标签气泡 (仅在空闲且无输入时展示) */}
      {!turnSteerInput && !isRendering && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2 px-1">
          <span className="text-[10px] text-neutral-500 flex items-center gap-1 mr-1">
            <Sparkles className="w-2.5 h-2.5 text-amber-400" />
            <span>推荐指令：</span>
          </span>
          {QUICK_DEMANDS.map((demand) => (
            <button
              key={demand.id}
              onClick={() => handleApplyQuickDemand(demand.prompt)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors flex items-center gap-1"
            >
              <span>{demand.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* 动态输入卡片容器 */}
      <form
        onSubmit={handleSubmit}
        className={`relative rounded-2xl border transition-all shadow-2xl p-2.5 flex flex-col gap-1.5 ${
          isRendering
            ? 'bg-neutral-950/90 border-amber-500/50 ring-2 ring-amber-500/10'
            : 'bg-neutral-950/90 border-neutral-800 hover:border-neutral-700 focus-within:border-blue-500/60'
        }`}
      >
        {/* 切轨指示条 (当处于渲染运行时自动凸显) */}
        {isRendering && (
          <div className="flex items-center justify-between px-1 text-[11px] text-amber-300 font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>TurnSteer 动态切轨模式激活</span>
            </div>
            <span className="text-[10px] text-amber-400/80 font-mono">
              发送指令将无损切入下一分镜（已生成分镜 100% 保全）
            </span>
          </div>
        )}

        <div className="relative flex items-center">
          <textarea
            value={turnSteerInput}
            onChange={(e) => setTurnSteerInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            rows={1}
            placeholder={
              isRendering
                ? '后台任务运行中... 直接输入纠偏指令（如：把后续分镜镜头调成手持摇晃与冷雨夜色调）'
                : '向导演中枢下达创作指令（Shift+Enter 换行，支持输入或点击左侧素材进行 @ 引用）...'
            }
            className="w-full pl-2 pr-12 py-1.5 text-xs bg-transparent text-neutral-100 placeholder-neutral-500 resize-none focus:outline-none min-h-[38px] max-h-32"
          />

          <button
            type="submit"
            disabled={!turnSteerInput.trim()}
            className={`absolute right-1.5 bottom-1.5 p-2 rounded-xl text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              isRendering
                ? 'bg-amber-600 hover:bg-amber-500 shadow-md shadow-amber-600/30'
                : 'bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/30'
            }`}
            title={isRendering ? '发送 TurnSteer 切轨控制帧' : '发送导演指令'}
          >
            {isRendering ? (
              <Zap className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        {/* 底部辅助标注 */}
        <div className="flex items-center justify-between px-1 pt-1 text-[10px] text-neutral-500 border-t border-neutral-900">
          <div className="flex items-center gap-2">
            <span>支持 Markdown</span>
            <span>·</span>
            <span>Handle-Only 句柄引用</span>
          </div>
          <span>按 Enter 发送</span>
        </div>
      </form>
    </div>
  );
};
