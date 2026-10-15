import React, { useState } from 'react';
import { 
  FolderPlus, 
  Search, 
  Layers, 
  MessageSquare, 
  FolderGit2, 
  FolderOpen, 
  Trash2, 
  Clock, 
  ArrowUpRight, 
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from '@/components/ui/tooltip.jsx';

export default function ProjectGrid({
  projects = [],
  loading = false,
  onOpenProject,
  onOpenFolder,
  onDeleteProject,
  onOpenNewModal
}) {
  const [search, setSearch] = useState('');

  const filtered = projects.filter(p => {
    const term = search.toLowerCase();
    const titleMatch = (p.title || '').toLowerCase().includes(term);
    const descMatch = (p.description || '').toLowerCase().includes(term);
    const libMatch = (p.libraries || []).some(l => (l.name || '').toLowerCase().includes(term));
    return titleMatch || descMatch || libMatch;
  });

  const formatTime = (ts) => {
    if (!ts) return '刚刚';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  };

  return (
    <div className="relative flex-1 overflow-y-auto bg-[#080C14] text-slate-100 flex flex-col font-sans select-none overflow-x-hidden">
      {/* ─────────────────────────────────────────────────────────────
          平整平面光学漫反射底光：柔和、均匀分布，避免顶部高光集聚造成凸起感
         ───────────────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-60">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[400px] bg-indigo-500/6 rounded-full blur-[140px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[540px] h-[420px] bg-sky-500/5 rounded-full blur-[150px]" />
      </div>

      {/* 主界面内容区 */}
      <main className="relative z-10 max-w-7xl w-full mx-auto p-8 space-y-7 flex-1">
        {/* 工具栏：项目标题与右侧搜索/新建项目 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.06]">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>全部作品项目</span>
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-slate-400">
                {projects.length}
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              每个项目分配受管私有沙箱，支持多对话并行探索与多外部资料库只读挂载
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-64 sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索项目或资料库..."
                className="pl-9 pr-3 h-9 bg-white/[0.03] hover:bg-white/[0.06] focus:bg-white/[0.08] border-white/10 hover:border-white/20 focus:border-indigo-400/50 rounded-xl text-xs text-slate-100 placeholder:text-slate-400 backdrop-blur-xl transition-all shadow-none"
              />
            </div>

            <Button
              onClick={onOpenNewModal}
              className="h-9 px-4 rounded-xl text-xs font-semibold bg-indigo-600/90 hover:bg-indigo-500 border border-indigo-400/30 text-white shadow-[0_0_20px_rgba(99,102,241,0.25)] backdrop-blur-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>新建项目</span>
            </Button>
          </div>
        </div>

        {/* 网格平铺 Grid */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-500 text-xs gap-3">
            <div className="w-7 h-7 border-2 border-indigo-500/40 border-t-indigo-400 rounded-full animate-spin" />
            <span className="text-slate-400 font-medium">正在加载沙箱工作区...</span>
          </div>
        ) : filtered.length === 0 ? (
          /* 空状态 (平整磨砂虚线卡片) */
          <div className="py-20 rounded-2xl flex flex-col items-center justify-center text-center p-8 bg-white/[0.02] backdrop-blur-xl border border-dashed border-white/10">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 shadow-[0_0_24px_rgba(99,102,241,0.15)]">
              <FolderPlus className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">暂无项目空间</h3>
            <p className="text-xs text-slate-400 mt-1.5 max-w-sm leading-relaxed">
              立即新建一个项目，开始多对话分支推演、关联本地多源资料库并协同专业智能体。
            </p>
            <Button
              onClick={onOpenNewModal}
              className="mt-5 h-9 px-5 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 shadow-[0_0_20px_rgba(99,102,241,0.25)] backdrop-blur-xl transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>新建第一个项目</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((proj) => {
              const threadsCount = proj.threads?.length || 1;
              const libsCount = proj.libraries?.length || 0;

              return (
                <div
                  key={proj.id}
                  onClick={() => onOpenProject(proj.id)}
                  className="group relative flex flex-col justify-between rounded-2xl p-5 cursor-pointer transition-colors duration-200
                    bg-white/[0.025]
                    backdrop-blur-xl
                    border border-white/[0.07] hover:border-white/[0.18]
                    shadow-sm shadow-black/20"
                >
                  {/* Card Top: 标题、ID 胶囊与描述 */}
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <h3 className="text-sm font-semibold text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-1 tracking-tight">
                        {proj.title}
                      </h3>
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono border-white/10 bg-white/[0.04] text-slate-400 px-2 py-0.5 rounded-full shrink-0"
                      >
                        {proj.id.split('_').slice(0, 2).join('_')}
                      </Badge>
                    </div>

                    <p className="text-xs text-slate-400 line-clamp-2 min-h-[32px] leading-relaxed mb-4 font-light">
                      {proj.description || '暂无描述。点击进入工作区展开智能体协作'}
                    </p>

                    {/* 资料库预览小标签 (玻璃微胶囊) */}
                    {libsCount > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {proj.libraries.slice(0, 2).map((lib, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.04] border-white/10 text-[10px] text-slate-300 max-w-[140px] truncate backdrop-blur-md"
                          >
                            <FolderGit2 className="w-2.5 h-2.5 text-amber-400/90 shrink-0" />
                            <span className="truncate">{lib.name}</span>
                          </Badge>
                        ))}
                        {libsCount > 2 && (
                          <Badge
                            variant="outline"
                            className="text-[10px] text-slate-400 px-1.5 py-0.5 rounded-lg bg-white/[0.02] border-white/10"
                          >
                            +{libsCount - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Bottom: 指标数据与微透明玻璃操作按钮组 */}
                  <div className="pt-3.5 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
                    {/* 指标与时间 */}
                    <div className="flex items-center gap-3 text-[11px]">
                      <div className="flex items-center gap-1 text-slate-400" title="对话分支数">
                        <MessageSquare className="w-3 h-3 text-indigo-400" />
                        <span>{threadsCount}</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400" title="外挂资料库数">
                        <FolderGit2 className="w-3 h-3 text-amber-400" />
                        <span>{libsCount}</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-500" title="更新时间">
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(proj.updatedAt)}</span>
                      </div>
                    </div>

                    {/* 快捷操作区 (visionOS 半透胶囊按钮) */}
                    <div className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenFolder(proj);
                            }}
                            className="h-7 w-7 rounded-lg bg-white/[0.04] hover:bg-white/[0.12] border border-white/[0.06] hover:border-white/20 text-slate-400 hover:text-slate-100 transition-all cursor-pointer"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-slate-900/90 border-slate-700 text-xs">
                          在资源管理器中打开项目
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="iconSm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteProject(proj.id, proj.title);
                            }}
                            className="h-7 w-7 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 border border-white/[0.06] hover:border-rose-500/30 text-slate-400 hover:text-rose-400 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-slate-900/90 border-slate-700 text-xs text-rose-400">
                          删除项目
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="iconSm"
                            onClick={() => onOpenProject(proj.id)}
                            className="h-7 w-7 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-400/30 text-indigo-300 hover:text-white transition-all ml-0.5 cursor-pointer shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-slate-900/90 border-slate-700 text-xs">
                          进入工作区
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
