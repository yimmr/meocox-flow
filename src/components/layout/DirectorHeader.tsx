import React from 'react';
import { useStudioStore } from '@/stores/useStudioStore';
import {
  Compass,
  ShieldCheck,
  Activity,
  BookmarkPlus,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
} from 'lucide-react';

export const DirectorHeader: React.FC = () => {
  const {
    daemonStatus,
    isLeftSidebarOpen,
    isRightSidebarOpen,
    toggleLeftSidebar,
    toggleRightSidebar,
    createCheckpoint,
    checkpoints,
  } = useStudioStore();

  const handleSaveSnapshot = async () => {
    const name = `手动导演快照 #${checkpoints.length + 1}`;
    await createCheckpoint(name, JSON.stringify({ saved_at: Date.now() }));
  };

  return (
    <header className="h-12 border-b border-neutral-800 bg-neutral-950/90 px-4 flex items-center justify-between shrink-0 select-none text-neutral-200 z-10 backdrop-blur-md">
      {/* 左侧：Logo、项目标题与侧栏开关 */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleLeftSidebar}
          className="p-1 rounded-md text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900 transition-colors"
          title={isLeftSidebarOpen ? '折叠左侧资产库 (Ctrl+B)' : '展开左侧资产库'}
        >
          {isLeftSidebarOpen ? (
            <PanelLeftClose className="w-4 h-4" />
          ) : (
            <PanelLeftOpen className="w-4 h-4 text-blue-400" />
          )}
        </button>

        <div className="h-4 w-px bg-neutral-800" />

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Compass className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-xs tracking-tight text-neutral-100">
            Meocox Flow
          </span>
          <span className="text-neutral-600 text-xs">/</span>
          <span className="text-xs text-neutral-300 font-medium">
            赛博纪元：深渊回响 (AIGC 导演编排)
          </span>
        </div>
      </div>

      {/* 中间：模式与快照指示 */}
      <div className="hidden md:flex items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-neutral-900 border border-neutral-700/80 text-neutral-300">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span>Codex 导演控制流</span>
        </span>
      </div>

      {/* 右侧：守护进程健康指示、时光机与右栏产物抽屉开关 */}
      <div className="flex items-center gap-2.5">
        {/* 后台伪守护进程状态徽章 */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 text-[11px]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-mono">Daemon Active</span>
          {daemonStatus && (
            <span className="text-[10px] text-emerald-500 font-mono">
              ({daemonStatus.uptime_seconds}s)
            </span>
          )}
        </div>

        {/* 渲染任务活动 */}
        {daemonStatus?.is_rendering && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-amber-300 text-[10px] animate-pulse">
            <Activity className="w-3 h-3 text-amber-400 animate-spin" />
            <span>渲染中</span>
          </div>
        )}

        {/* 保存时光机快照按钮 */}
        <button
          onClick={handleSaveSnapshot}
          className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-neutral-100 transition-colors"
          title="生成即时 SQLite WAL 检查点快照"
        >
          <BookmarkPlus className="w-3.5 h-3.5 text-blue-400" />
          <span>保存快照</span>
        </button>

        <div className="h-4 w-px bg-neutral-800" />

        {/* 产物抽屉切换 */}
        <button
          onClick={toggleRightSidebar}
          className="p-1 rounded-md text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900 transition-colors"
          title={isRightSidebarOpen ? '折叠右侧产物抽屉' : '展开右侧产物抽屉'}
        >
          {isRightSidebarOpen ? (
            <PanelRightClose className="w-4 h-4" />
          ) : (
            <PanelRightOpen className="w-4 h-4 text-purple-400" />
          )}
        </button>
      </div>
    </header>
  );
};
