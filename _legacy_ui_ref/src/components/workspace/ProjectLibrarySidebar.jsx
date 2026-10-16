import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Database,
  RotateCw,
  Settings,
  Search,
  Layers,
  Video,
  Music,
  Image as ImageIcon,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  X,
  HardDrive,
  ExternalLink,
  Loader2,
  Grid2X2,
  LayoutGrid,
  List,
  Copy,
  MessageSquarePlus,
  Download,
  Trash2,
  Sparkles
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog.jsx';
import { apiFetch, apiUrl } from '@/lib/apiClient.js';
import { openFolder } from '@/utils/nativeExplorer.js';
import { toast } from '@/components/ui/sonner.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from '@/components/ui/tooltip.jsx';
import AssetCard from '../library/AssetCard.jsx';
import JustifiedGallery from '../library/JustifiedGallery.jsx';
import VideoPlayerModal from '../VideoPlayerModal.jsx';

/**
 * VS Code 风格左侧主栏：当前项目绑定的素材与知识资源库 (Project Asset & Library Explorer)
 * 
 * 核心交互升级：
 * 1. 深度采用 shadcn/ui 核心组件 (Button, Input, Select, Tooltip, Badge)
 * 2. 标题规范化，移除括号内英文 ("资料库")
 * 3. 搜索框右侧无缝挂载资料库下拉选择器 (Select) 与单按钮大/中/列表网格循环切换
 * 4. 分类过滤升级为大尺寸纯图标按钮 (无多余文字干扰，Tooltip 显示统计)
 * 5. 全面支持卡片右上角快捷添加文件引用至对话框发给智能体
 */
export default function ProjectLibrarySidebar({
  project,
  libraries = [],
  width = 260,
  onOpenProjectSettings,
  onRefresh,
  onAddToChat,
  onFilesLoaded,
  refreshTrigger
}) {
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLibId, setSelectedLibId] = useState('all'); // 'all' | libraryId
  const [selectedType, setSelectedType] = useState('all'); // 'all' | 'video' | 'audio' | 'image' | 'document'
  const [searchQuery, setSearchQuery] = useState('');

  // 视图模式循环切换：'large' (大网格) -> 'medium' (中网格) -> 'list' (列表)
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('meocox_project_lib_view_mode') || 'list';
    } catch {
      return 'list';
    }
  });

  const cycleViewMode = () => {
    setViewMode(prev => {
      let next = 'medium';
      if (prev === 'large') next = 'medium';
      else if (prev === 'medium') next = 'list';
      else next = 'large';
      try {
        localStorage.setItem('meocox_project_lib_view_mode', next);
      } catch {}
      return next;
    });
  };

  // 媒体播放状态
  const [playingVideoFile, setPlayingVideoFile] = useState(null);
  const [inlineAudioUrl, setInlineAudioUrl] = useState(null);
  const inlineAudioRef = useRef(null);

  // 文件删除二次确认状态
  const [fileToDelete, setFileToDelete] = useState(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);

  // 确认永久删除文件
  const handleConfirmDeleteFile = async () => {
    if (!fileToDelete?.path) return;
    setIsDeletingFile(true);
    try {
      const res = await apiFetch(`/api/assets/file?path=${encodeURIComponent(fileToDelete.path)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || '删除失败');
      }
      toast.success(`已成功从磁盘删除「${fileToDelete.name}」`);
      setFiles(prev => prev.filter(f => f.path !== fileToDelete.path));
      setFileToDelete(null);
    } catch (err) {
      toast.error('删除文件失败: ' + err.message);
    } finally {
      setIsDeletingFile(false);
    }
  };

  // 卸载时暂停音频
  useEffect(() => {
    return () => {
      if (inlineAudioRef.current) {
        try { inlineAudioRef.current.pause(); } catch {}
      }
    };
  }, []);

  // 扫描项目绑定的资产目录与外部资料库文件
  const loadFiles = async () => {
    if (!project?.id) return;
    setIsLoading(true);
    try {
      let endpoint = `/api/assets/browse?projectId=${encodeURIComponent(project.id)}`;
      if (selectedLibId !== 'all') {
        const cur = libraries.find(l => l.id === selectedLibId);
        if (cur?.path) {
          endpoint = `/api/assets/browse?dir=${encodeURIComponent(cur.path)}`;
        }
      }

      const res = await apiFetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        const loaded = json.files || [];
        setFiles(loaded);
        if (onFilesLoaded) onFilesLoaded(loaded);
      }
    } catch (err) {
      console.error('[ProjectLibrarySidebar] 读取素材文件异常:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [project?.id, selectedLibId, libraries.length, refreshTrigger]);

  // 音频内联播放切换
  const handleToggleAudio = (file) => {
    const streamUrl = apiUrl(`/api/assets/stream?path=${encodeURIComponent(file.path)}`);
    if (inlineAudioUrl === streamUrl) {
      if (inlineAudioRef.current) inlineAudioRef.current.pause();
      setInlineAudioUrl(null);
    } else {
      if (inlineAudioRef.current) inlineAudioRef.current.pause();
      const audio = new Audio(streamUrl);
      inlineAudioRef.current = audio;
      audio.play().then(() => setInlineAudioUrl(streamUrl)).catch(() => setInlineAudioUrl(null));
      audio.onended = () => setInlineAudioUrl(null);
      audio.onerror = () => setInlineAudioUrl(null);
    }
  };

  // 资源多维过滤计算
  const filteredFiles = useMemo(() => {
    return files.filter(f => {
      if (selectedType !== 'all') {
        if (selectedType === 'document') {
          if (!['document', 'text', 'other'].includes(f.type) && !['.txt', '.md', '.json', '.docx', '.pdf'].includes(f.ext?.toLowerCase())) {
            return false;
          }
        } else if (f.type !== selectedType) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = f.name?.toLowerCase().includes(q);
        const matchExt = f.ext?.toLowerCase().includes(q);
        const matchDir = f.rootLabel?.toLowerCase().includes(q);
        if (!matchName && !matchExt && !matchDir) return false;
      }
      return true;
    });
  }, [files, selectedType, searchQuery]);

  // 各分类数量统计
  const typeCounts = useMemo(() => {
    const c = { all: files.length, video: 0, audio: 0, image: 0, document: 0 };
    for (const f of files) {
      if (f.type === 'video') c.video++;
      else if (f.type === 'audio') c.audio++;
      else if (f.type === 'image') c.image++;
      else c.document++;
    }
    return c;
  }, [files]);

  // 视图模式切换按钮图标与提示文字 (三种切换：大卡、中卡、列表)
  const viewModeMeta = useMemo(() => {
    if (viewMode === 'large') {
      return {
        icon: Grid2X2,
        label: '大卡',
        nextLabel: '点击切换为中卡'
      };
    }
    if (viewMode === 'medium') {
      return {
        icon: LayoutGrid,
        label: '中卡',
        nextLabel: '点击切换为列表'
      };
    }
    return {
      icon: List,
      label: '列表',
      nextLabel: '点击切换为大卡'
    };
  }, [viewMode]);

  const ViewModeIcon = viewModeMeta.icon;

  // 卡片操作动作清单 (最多展示 3 个，超出部分收进 ⋮ 更多菜单)
  // 项目资料库包含：“引用到对话框”、“复制路径”、“下载原文件”、“感知内容”（项目专属）及二次确认“删除文件”
  const getItemActions = (_itemFile) => {
    const acts = [];
    if (onAddToChat) {
      acts.push({
        id: 'add-to-chat',
        label: '引用到对话框',
        title: '引用到对话框附件',
        icon: MessageSquarePlus,
        onClick: (f) => onAddToChat(f)
      });
    }
    acts.push({
      id: 'copy-path',
      label: '复制路径',
      title: '复制绝对路径',
      icon: Copy,
      onClick: async (f) => {
        try {
          await navigator.clipboard.writeText(f.path);
          toast.success('已复制绝对路径至剪贴板');
        } catch {
          toast.error('复制路径失败');
        }
      }
    });
    acts.push({
      id: 'download-file',
      label: '下载文件',
      title: '下载原文件',
      icon: Download,
      onClick: (f) => {
        const a = document.createElement('a');
        a.href = apiUrl(`/api/assets/stream?path=${encodeURIComponent(f.path)}`);
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success(`正在下载「${f.name}」`);
      }
    });
    // 项目内资料库独有选项：感知内容
    acts.push({
      id: 'perceive-content',
      label: '感知内容',
      title: '提取与分析内容特征',
      icon: Sparkles,
      onClick: (f) => {
        toast.info(`已加入感知队列: ${f.name}`);
      }
    });
    // 删除文件（带二次确认）
    acts.push({
      id: 'delete-file',
      label: '删除文件',
      title: '从磁盘中永久删除',
      icon: Trash2,
      danger: true,
      onClick: (f) => {
        setFileToDelete(f);
      }
    });
    return acts;
  };

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        style={{ width }}
        className="border-r border-slate-800/80 bg-slate-950/95 flex flex-col select-text shrink-0 h-full overflow-hidden transition-none"
      >
        {/* ── 1. 顶栏：标题 (已去除英文括号)、统计徽章与设置工具 ── */}
        <div className="h-10 px-3 border-b border-slate-800/80 flex items-center justify-between gap-1 bg-slate-900/40 shrink-0 select-none">
          <div className="flex items-center gap-2 min-w-0">
            <Database className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-xs font-bold text-slate-200 tracking-wide truncate">
              资料库
            </span>
            {files.length > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4 font-mono text-slate-400">
                {filteredFiles.length}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {/* 刷新按钮 (使用 shadcn/ui Button) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={() => {
                    loadFiles();
                    if (onRefresh) onRefresh();
                  }}
                  disabled={isLoading}
                  className="h-7 w-7 text-slate-400 hover:text-slate-200"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>重新扫描资料库</TooltipContent>
            </Tooltip>

            {/* 项目设置 (使用 shadcn/ui Button) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="iconSm"
                  onClick={onOpenProjectSettings}
                  className="h-7 w-7 text-slate-400 hover:text-indigo-300"
                >
                  <Settings className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>项目设置 (挂载/解绑资料库)</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ── 2. 工具栏：检索框 + 资料库下拉 (放在搜索框右侧) + 视图网格切换按钮 ── */}
        {libraries.length > 0 && (
          <div className="p-2 border-b border-slate-800/60 bg-slate-950/60 space-y-1.5 shrink-0 select-none">
            {/* 搜索框与右侧下拉及网格按钮排布在同一行 */}
            <div className="flex items-center gap-1.5">
              {/* 搜索框 (shadcn Input) */}
              <div className="relative flex-1 min-w-0">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                <Input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索资料..."
                  className="h-7 pl-6 pr-5 text-[11px] bg-slate-900 border-slate-800"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* 🌟 用户指定：资料库下拉放在搜索框右侧 (shadcn Select) */}
              {libraries.length > 0 && (
                <div className="w-[88px] shrink-0">
                  <Select
                    value={selectedLibId}
                    onValueChange={(val) => setSelectedLibId(val)}
                  >
                    <SelectTrigger className="h-7 px-2 text-[10px] font-mono bg-slate-900 border-slate-800">
                      <SelectValue placeholder="全部资料库" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部资料库</SelectItem>
                      {libraries.map(lib => (
                        <SelectItem key={lib.id} value={lib.id}>
                          {lib.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* 🌟 用户指定：单个切换按钮 (大网格 -> 中网格 -> 列表 循环，动态图标) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    onClick={cycleViewMode}
                    className="h-7 w-7 shrink-0 text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 border border-slate-800/60"
                  >
                    <ViewModeIcon className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <span>{viewModeMeta.label} ({viewModeMeta.nextLabel})</span>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* ── 3. 🌟 用户指定：类型用大一些的大纯图标按钮，移除文本 ── */}
            <div className="flex items-center justify-between bg-slate-900/80 p-0.5 rounded-lg border border-slate-800/80">
              {[
                { id: 'all', icon: Layers, label: '全部', count: typeCounts.all },
                { id: 'video', icon: Video, label: '视频', count: typeCounts.video },
                { id: 'audio', icon: Music, label: '音频', count: typeCounts.audio },
                { id: 'image', icon: ImageIcon, label: '图片', count: typeCounts.image },
                { id: 'document', icon: FileText, label: '文本/文档', count: typeCounts.document }
              ].map(tab => {
                const Icon = tab.icon;
                const isActive = selectedType === tab.id;
                return (
                  <Tooltip key={tab.id}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isActive ? 'secondary' : 'ghost'}
                        onClick={() => setSelectedType(tab.id)}
                        className={`h-7 flex-1 p-0 transition-all cursor-pointer ${
                          isActive
                            ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60'
                            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
                        }`}
                      >
                        {/* 大尺寸纯图标 (w-4 h-4，移除多余文字) */}
                        <Icon className="w-4 h-4 stroke-[1.8]" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <span>{tab.label} ({tab.count})</span>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 4. 核心资源内容区 (自适应 3 种网格形态) ── */}
        <div className="flex-1 overflow-y-auto p-2 select-text">
          {libraries.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-slate-800/80 text-center space-y-2 my-3 bg-slate-900/20">
              <Folder className="w-7 h-7 text-slate-600 mx-auto stroke-[1.5]" />
              <div className="text-xs text-slate-400 font-medium">未绑定资料库</div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                关联本地目录，为智能体提供参考文件。
              </p>
              <Button
                size="sm"
                onClick={onOpenProjectSettings}
                className="gap-1.5 mx-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>绑定资料库</span>
              </Button>
            </div>
          ) : isLoading ? (
            <div className="h-40 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
              <span>正在扫描资料库...</span>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-slate-500 text-xs gap-1.5">
              <FolderOpen className="w-6 h-6 text-slate-600" />
              <span>未找到匹配文件</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-[11px] text-indigo-400 hover:underline cursor-pointer"
                >
                  清空搜索词
                </button>
              )}
            </div>
          ) : viewMode === 'list' ? (
            /* 列表模式：紧凑纵向单行排列 */
            <div className="flex flex-col gap-2.5">
              {filteredFiles.map((file, idx) => (
                <AssetCard
                  key={file.path || idx}
                  file={file}
                  viewMode="list"
                  isPlayingAudio={inlineAudioUrl === apiUrl(`/api/assets/stream?path=${encodeURIComponent(file.path)}`)}
                  onToggleAudio={handleToggleAudio}
                  onPlayVideo={(f) => setPlayingVideoFile(f)}
                  isLastInRow={true}
                  onDeleteFile={(f) => setFileToDelete(f)}
                  actions={getItemActions(file)}
                />
              ))}
            </div>
          ) : (
            /* 自适应瀑布流模式 (大卡/中卡)：无内边距无边框全景卡片，宽度由比例自适应，空间自动占满 */
            <JustifiedGallery
              items={filteredFiles}
              targetRowHeight={viewMode === 'large' ? 160 : 105}
              gap={viewMode === 'large' ? 12 : 9}
              renderItem={(file, { onReportRatio, isLastInRow }) => (
                <AssetCard
                  file={file}
                  viewMode={viewMode}
                  isPlayingAudio={inlineAudioUrl === apiUrl(`/api/assets/stream?path=${encodeURIComponent(file.path)}`)}
                  onToggleAudio={handleToggleAudio}
                  onPlayVideo={(f) => setPlayingVideoFile(f)}
                  onReportRatio={onReportRatio}
                  isLastInRow={isLastInRow}
                  onDeleteFile={(f) => setFileToDelete(f)}
                  actions={getItemActions(file)}
                />
              )}
            />
          )}
        </div>

        {/* ── 5. 底栏：项目目录 ── */}
        <div className="p-2.5 border-t border-slate-800/80 bg-slate-900/40 text-[11px] space-y-1 shrink-0">
          <div className="flex items-center justify-between text-slate-400">
            <div className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[10px] font-semibold text-slate-400">项目目录</span>
            </div>
            {project?.path && (
              <button
                onClick={() => openFolder(project.path)}
                className="p-0.5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                title="在系统文件管理器中打开项目本地目录"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="text-[10px] font-mono text-slate-500 truncate" title={project?.path || '系统默认工作区'}>
            {project?.path || '系统默认工作区'}
          </div>
        </div>

        {/* ── 6. 视频播放器弹窗 ── */}
        {playingVideoFile && (
          <VideoPlayerModal
            file={playingVideoFile}
            streamPath={apiUrl(`/api/assets/stream?path=${encodeURIComponent(playingVideoFile.path)}`)}
            onClose={() => setPlayingVideoFile(null)}
          />
        )}

        {/* ── 7. 删除文件二次确认模态弹窗 ── */}
        <AlertDialog open={Boolean(fileToDelete)} onOpenChange={(open) => !open && setFileToDelete(null)}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-rose-400">
                <Trash2 className="w-5 h-5 text-rose-400" />
                永久删除文件确认
              </AlertDialogTitle>
              <AlertDialogDescription className="text-slate-300 text-sm leading-relaxed pt-2">
                您确定要从本地磁盘中永久删除文件 <span className="font-semibold text-white">「{fileToDelete?.name}」</span> 吗？
                <br />
                <span className="text-xs text-rose-400/90 mt-1 block">
                  ⚠️ 此操作将直接删除该源文件，无法撤销，请谨慎操作。
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel
                disabled={isDeletingFile}
                className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
              >
                取消
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleConfirmDeleteFile();
                }}
                disabled={isDeletingFile}
                className="bg-rose-600 hover:bg-rose-500 text-white font-medium"
              >
                {isDeletingFile ? '正在删除...' : '确认永久删除'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </aside>
    </TooltipProvider>
  );
}
