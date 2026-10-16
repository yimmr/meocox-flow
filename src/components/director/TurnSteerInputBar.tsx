import React from 'react';
import { useStudioStore } from '@/stores/useStudioStore';
import {
  Send,
  Sparkles,
  Zap,
} from 'lucide-react';

const QUICK_DEMANDS = [
  { id: 'qd_1', title: '推导分镜 DAG', prompt: '请基于当前赛博雨夜设定，拆解第 01 幕的 3 组分镜 DAG 并同步黑板。' },
  { id: 'qd_2', title: '开启竞技场盲测', prompt: '请为第 01 幕分镜 #2 派生双分支并启动 Battle Mode 盲测对决。' },
  { id: 'qd_3', title: '合成 PCM 氛围音效', prompt: '请使用纯数学原生 PCM 合成一段 Lo-Fi 科技背景音效并登记至媒体库。' },
  { id: 'qd_4', title: '组装剪映 Pro 草稿', prompt: '请将已通过证伪质检的分镜组装为剪映 Pro 工程草稿并输出时间轴。' },
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

      {/* 动态切轨运行状态提示栏 */}
      {isRendering && (
        <div className="flex items-center justify-between text-[11px] px-2 py-1 mb-1.5 rounded-md bg-amber-950/40 border border-amber-500/30 text-amber-300 font-mono">
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>后台媒体管线运行中 · 当前输入将作为 TurnSteer 控制帧注入，无损切轨</span>
          </span>
          <span className="text-[10px] text-amber-400/80">保全前序分镜: ON</span>
        </div>
      )}

      {/* 主输入胶囊栏 */}
      <form
        onSubmit={handleSubmit}
        className={`relative flex items-center rounded-2xl border transition-all ${
          isRendering
            ? 'border-amber-500/60 bg-amber-950/20 shadow-[0_0_20px_rgba(245,158,11,0.15)] focus-within:border-amber-400'
            : 'border-neutral-800 bg-neutral-900/90 shadow-xl focus-within:border-blue-500/80'
        }`}
      >
        <div className="pl-3.5 pr-2 py-2 text-neutral-500">
          {isRendering ? (
            <Zap className="w-4 h-4 text-amber-400" />
          ) : (
            <Sparkles className="w-4 h-4 text-blue-400" />
          )}
        </div>

        <input
          type="text"
          value={turnSteerInput}
          onChange={(e) => setTurnSteerInput(e.target.value)}
          placeholder={
            isRendering
              ? '【运行态切轨】输入指令中途纠偏（如：“将第二镜视角改为仰拍，光线调暗”），已完成镜头保全...'
              : '向导演中枢下达指令（如：“围绕废弃立交桥推导赛博分镜”，“开启 Battle Mode 盲测”）...'
          }
          className="flex-1 bg-transparent py-3 pr-3 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none select-text"
        />

        <div className="pr-2">
          <button
            type="submit"
            disabled={!turnSteerInput.trim()}
            className={`p-2 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              isRendering
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow'
            }`}
            title={isRendering ? '注入 TurnSteer 切轨控制帧' : '发送导演指令'}
          >
            {isRendering ? (
              <Zap className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
