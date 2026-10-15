import React, { useState, useEffect } from 'react';
import { 
  Video, 
  Settings, 
  FolderOpen, 
  FolderGit2,
  Edit2, 
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from '@/components/ui/tooltip.jsx';

export default function Header({ 
  currentProject = null,
  onBackToHome,
  onOpenSettings,
  onOpenGlobalLibrary,
  isGlobalLibraryActive = false,
  onUpdateProjectTitle
}) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  useEffect(() => {
    setTitleDraft(currentProject?.title || '');
  }, [currentProject?.title]);

  const handleCommitTitle = () => {
    if (titleDraft.trim() && titleDraft.trim() !== currentProject?.title) {
      if (onUpdateProjectTitle) onUpdateProjectTitle(titleDraft.trim());
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommitTitle();
    } else if (e.key === 'Escape') {
      setTitleDraft(currentProject?.title || '');
      setIsEditingTitle(false);
    }
  };

  return (
    <header className="h-14 border-b border-white/[0.06] bg-slate-950/40 backdrop-blur-2xl px-5 flex items-center justify-between z-20 select-none shrink-0">
      {/* Brand Logo & Minimal Path Breadcrumb Navigation */}
      <div className="flex items-center space-x-3">
        {/* Brand Anchor */}
        <button
          onClick={onBackToHome}
          className="flex items-center space-x-2.5 hover:opacity-90 transition group text-left cursor-pointer"
          title="Meocox Flow 首页"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-400 flex items-center justify-center text-white shadow-[0_0_16px_rgba(99,102,241,0.35)] border border-white/20">
            <Video className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-sm tracking-wide text-white group-hover:text-indigo-300 transition">
              Meocox Flow
            </span>
          </div>
        </button>

        {/* 仅在进入全局资料库或具体项目时，展示路径面包屑 */}
        {(isGlobalLibraryActive || currentProject) && (
          <div className="flex items-center space-x-2.5 text-xs">
            <span className="text-slate-600 font-mono text-xs">/</span>

            {isGlobalLibraryActive ? (
              <div className="flex items-center space-x-1.5 py-1 px-2.5 rounded-xl bg-indigo-500/15 text-indigo-300 font-medium text-xs border border-indigo-400/30 backdrop-blur-md">
                <FolderGit2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>全局资料库</span>
              </div>
            ) : currentProject ? (
              <div className="flex items-center space-x-1.5">
                {isEditingTitle ? (
                  <div className="flex items-center space-x-1">
                    <Input
                      type="text"
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onKeyDown={handleTitleKeyDown}
                      onBlur={handleCommitTitle}
                      autoFocus
                      className="h-7 w-[220px] bg-white/[0.06] border-indigo-500/50 rounded-lg px-2 text-xs text-white font-semibold focus:border-indigo-400 backdrop-blur-md"
                    />
                    <Button 
                      variant="ghost"
                      size="iconSm"
                      onClick={handleCommitTitle}
                      className="h-7 w-7 text-slate-400 hover:text-emerald-400 hover:bg-white/[0.06] rounded-lg"
                      title="保存标题"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div 
                    onClick={() => setIsEditingTitle(true)}
                    className="group/title flex items-center space-x-1.5 cursor-pointer py-1 px-2.5 rounded-xl hover:bg-white/[0.05] border border-transparent hover:border-white/10 transition"
                    title="点击修改项目标题"
                  >
                    <span className="font-semibold text-slate-200 max-w-[240px] truncate group-hover/title:text-indigo-300 transition">
                      {currentProject?.title || '未命名项目'}
                    </span>
                    <Edit2 className="w-3 h-3 text-slate-500 opacity-0 group-hover/title:opacity-100 transition" />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Header 右侧功能操作区 */}
      <div className="flex items-center space-x-2">
        {/* 全局资料库入口按钮 */}
        {onOpenGlobalLibrary && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenGlobalLibrary}
            className={`h-8 px-3 rounded-xl text-xs font-medium transition cursor-pointer border backdrop-blur-xl ${
              isGlobalLibraryActive
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40 shadow-[0_0_16px_rgba(99,102,241,0.25)]'
                : 'bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 hover:text-white border-white/10'
            }`}
            title="打开全局资料库 (浏览并管理多个本地绑定的媒体根目录)"
          >
            <FolderGit2 className={`w-3.5 h-3.5 mr-1.5 ${isGlobalLibraryActive ? 'text-indigo-300' : 'text-slate-400'}`} />
            <span>资料库</span>
          </Button>
        )}

        {/* Status indicator (微型平整单点脉冲呼吸绿灯) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center space-x-1.5 px-2.5 py-1 text-xs select-none cursor-default">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              <span className="text-[11px] font-medium text-slate-300">就绪</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-slate-900/90 border-slate-700 text-xs">
            本地推理引擎与服务就绪
          </TooltipContent>
        </Tooltip>

        {/* Settings Button: 全局设置中心 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="iconSm"
              onClick={() => onOpenSettings && onOpenSettings('models')}
              className="h-8 w-8 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-white/20 text-slate-400 hover:text-white backdrop-blur-md transition-all cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="bg-slate-900/90 border-slate-700 text-xs">
            全局设置中心
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
