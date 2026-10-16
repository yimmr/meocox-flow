import React, { useState } from 'react';
import { 
  FolderPlus, Video, Clock, MessageSquare, Trash2, ArrowRight, 
  Sparkles, Layers, Search, Filter, Play, CheckCircle2, ChevronRight, Settings, Cpu,
  FolderOpen, Folder
} from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog.jsx';

export function generateDefaultProjectTitle() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${mm}${dd}_${hh}${min} 剪辑`;
}

export default function ProjectHome({ 
  projects = [], 
  onSelectProject, 
  onCreateProject, 
  onDeleteProject,
  onOpenProjectFolder,
  activeProvider,
  activeModelId,
  onOpenSettings
}) {
  const confirm = useConfirm();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('全部');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // New Project Form
  const [newTitle, setNewTitle] = useState('');
  const [newGame, setNewGame] = useState('');
  const [newCategory, setNewCategory] = useState('攻略教学');
  const [newDir, setNewDir] = useState('');

  const categories = ['全部', '攻略教学', '高能混剪', '爆款复刻'];

  const filteredProjects = projects.filter(p => {
    const matchesCat = filterCategory === '全部' || p.category === filterCategory;
    const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.game.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleQuickCreate = () => {
    onCreateProject({
      title: generateDefaultProjectTitle(),
      game: '未分类游戏',
      category: '攻略教学'
    });
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    onCreateProject({
      title: newTitle.trim() || generateDefaultProjectTitle(),
      game: newGame.trim() || '未分类游戏',
      category: newCategory,
      ...(newDir.trim() ? { projectDir: newDir.trim() } : {})
    });
    setNewTitle('');
    setNewGame('');
    setNewDir('');
    setIsCreateModalOpen(false);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-2 py-0.5 rounded-full font-medium">已完成</span>;
      case 'cutting':
        return <span className="bg-brand-500/20 text-brand-cyan border border-brand-500/30 text-[10px] px-2 py-0.5 rounded-full font-medium">剪辑中</span>;
      default:
        return <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] px-2 py-0.5 rounded-full font-medium">策划中</span>;
    }
  };

  return (
    <div className="h-screen w-screen bg-dark-900 text-gray-100 flex flex-col overflow-hidden select-none">
      {/* Top Navbar */}
      <header className="h-16 border-b border-dark-700 bg-dark-900/90 backdrop-blur px-8 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-cyan flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
            <Video className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-base tracking-wide text-white">Meocox Flow</span>
              <span className="text-[10px] bg-brand-500/20 text-brand-cyan px-2 py-0.5 rounded border border-brand-500/30 font-medium">
                工作台主页
              </span>
            </div>
            <p className="text-xs text-gray-400">Meocox Flow 智能视频创作工作台</p>
          </div>
        </div>

        {/* 新建项目按钮 与 设置按钮 */}
        <div className="flex items-center space-x-3">
          <button
            onClick={handleQuickCreate}
            className="flex items-center space-x-1.5 bg-gradient-to-r from-brand-600 to-brand-cyan hover:opacity-95 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-lg shadow-brand-500/25 transition active:scale-95"
            title="一键直接新建项目（标题自动生成，进入后可在左上角随时修改）"
          >
            <FolderPlus className="w-4 h-4" />
            <span>新建视频项目</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="p-2 text-gray-400 hover:text-white hover:bg-dark-800 rounded-xl transition border border-dark-700"
            title="系统设置中心"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-8 py-8 max-w-7xl mx-auto w-full">
        {/* Banner / Overview Card */}
        <div className="relative rounded-2xl bg-gradient-to-r from-dark-800 via-dark-800/90 to-brand-900/20 border border-dark-700 p-6 mb-8 overflow-hidden">
          <div className="relative z-10 max-w-xl">
            <h2 className="text-xl font-bold text-white mb-2">每一期视频，都是一个独立的作品项目</h2>
            <p className="text-xs text-gray-400 leading-relaxed">
              每个项目拥有专属的 Agent 对话上下文、素材切片库、分镜排期与时间轴。
              在主页管理你的所有创作，点击任意卡片即可进入项目工作舱进行深入剪辑与讨论。
            </p>
          </div>
          <div className="absolute right-6 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none">
            <Video className="w-64 h-64 text-brand-cyan" />
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex items-center justify-between mb-6 gap-4">
          {/* Categories */}
          <div className="flex items-center space-x-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  filterCategory === cat
                    ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/20'
                    : 'bg-dark-800 text-gray-400 hover:text-white border border-dark-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Search box */}
          <div className="relative w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-gray-400" />
            <input 
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索项目标题或所属游戏..."
              className="w-full bg-dark-800 border border-dark-700 rounded-xl pl-9 pr-3 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-brand-500 transition"
            />
          </div>
        </div>

        {/* Projects Grid */}
        {filteredProjects.length === 0 ? (
          <div className="text-center py-16 bg-dark-800/40 rounded-2xl border border-dark-800 flex flex-col items-center justify-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-dark-700 flex items-center justify-center text-gray-400">
              <FolderPlus className="w-6 h-6" />
            </div>
            <p className="text-sm text-gray-400">暂无匹配的视频项目</p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="text-xs text-brand-cyan hover:underline flex items-center space-x-1"
            >
              <span>立即新建一期视频项目</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-5">
            {filteredProjects.map(proj => {
              const messageCount = (proj.messages || []).filter(m => m.role === 'user' || m.role === 'assistant').length;
              const formattedDate = new Date(proj.updatedAt || proj.createdAt).toLocaleDateString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div 
                  key={proj.id}
                  onClick={() => onSelectProject(proj.id)}
                  className="group bg-dark-800/80 hover:bg-dark-800 border border-dark-700 hover:border-brand-500/60 rounded-2xl p-5 flex flex-col justify-between cursor-pointer transition-all duration-200 hover:shadow-xl hover:shadow-brand-500/5 relative overflow-hidden"
                >
                  {/* Top: Game Tag & Status */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-mono bg-dark-900 text-brand-cyan px-2 py-0.5 rounded-md border border-dark-700">
                        🎮 {proj.game}
                      </span>
                      {getStatusBadge(proj.status)}
                    </div>

                    {/* Title */}
                    <h3 className="font-bold text-sm text-white group-hover:text-brand-cyan transition line-clamp-2 leading-snug mb-2">
                      {proj.title}
                    </h3>

                    {/* Category pill */}
                    <div className="flex items-center space-x-2 mb-3">
                      <span className="inline-block text-[10px] bg-dark-700/60 text-gray-300 px-2 py-0.5 rounded border border-dark-600/60">
                        #{proj.category}
                      </span>
                    </div>

                    {/* Project Directory Info */}
                    <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono bg-dark-900/60 px-2.5 py-1 rounded-lg mb-3 border border-dark-700/50">
                      <div className="flex items-center space-x-1.5 truncate max-w-[210px]" title={proj.projectDir || `data/projects/${proj.id}`}>
                        <Folder className="w-3 h-3 text-brand-cyan shrink-0" />
                        <span className="truncate">{proj.projectDir ? proj.projectDir.split(/[\\/]/).pop() : proj.id}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenProjectFolder) onOpenProjectFolder(proj.id);
                        }}
                        className="p-1 hover:text-brand-cyan hover:bg-dark-800 rounded transition text-gray-400 shrink-0"
                        title="在系统资源管理器中打开项目文件夹"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Bottom Metadata & Delete Action */}
                  <div className="pt-3 border-t border-dark-700/60 flex items-center justify-between text-xs text-gray-400">
                    <div className="flex items-center space-x-3 text-[11px]">
                      <span className="flex items-center space-x-1" title="历史对话轮次">
                        <MessageSquare className="w-3 h-3 text-gray-500" />
                        <span>{messageCount} 条讨论</span>
                      </span>
                      <span className="flex items-center space-x-1" title="最后更新时间">
                        <Clock className="w-3 h-3 text-gray-500" />
                        <span>{formattedDate}</span>
                      </span>
                    </div>

                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await confirm({
                          title: '删除项目',
                          description: `确定要删除项目《${proj.title}》吗？此操作不可撤销。`,
                          confirmText: '删除',
                          variant: 'destructive',
                        });
                        if (ok) {
                          onDeleteProject(proj.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-500 hover:text-red-400 hover:bg-dark-700 rounded-lg transition cursor-pointer"
                      title="删除项目"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md p-6">
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center space-x-2 text-sm">
                <FolderPlus className="w-4 h-4 text-brand-cyan" />
                <span>新建视频创作项目</span>
              </DialogTitle>
              <DialogDescription>
                创建全新的视频项目，初始化专属时间轴与剪辑工程。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-gray-300 block mb-1">
                  本期视频标题 / 主题 <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="例如：《黑神话：悟空》第一章无伤逃课打法"
                  className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="font-medium text-gray-300 block mb-1">所属游戏 / 内容源</label>
                <input
                  type="text"
                  value={newGame}
                  onChange={e => setNewGame(e.target.value)}
                  placeholder="例如：黑神话：悟空 / 艾尔登法环 / 原神"
                  className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="font-medium text-gray-300 block mb-1">视频分类与创作类型</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500"
                >
                  <option value="攻略教学">攻略教学（资料提取、技能拆解、分步通关）</option>
                  <option value="高能混剪">高能混剪（卡点节奏、视觉高光、大招合集）</option>
                  <option value="爆款复刻">爆款复刻（拆解对标视频黄金3秒与分镜结构）</option>
                </select>
              </div>

              <div>
                <label className="font-medium text-gray-300 block mb-1">项目存储与工作目录（可选）</label>
                <input
                  type="text"
                  value={newDir}
                  onChange={e => setNewDir(e.target.value)}
                  placeholder="留空则使用默认目录: data/projects/{id}"
                  className="w-full bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-brand-500 font-mono text-[11px]"
                />
                <span className="text-[10px] text-gray-500 block mt-1">
                  可绑定到外部高速剪辑 SSD 或专用素材盘，进入后也可以随时修改
                </span>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-xs text-gray-300 cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-xs font-semibold text-white shadow-md shadow-brand-500/20 cursor-pointer"
              >
                立即立项并进入
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
