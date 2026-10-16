import React, { useState, useEffect, useRef, useMemo, Suspense, lazy } from 'react';
import {
  FolderGit2,
  FolderPlus,
  FolderOpen,
  Trash2,
  RefreshCw,
  Search,
  Video,
  Music,
  Image as ImageIcon,
  FileText,
  LayoutGrid,
  Grid2x2,
  List,
  Play,
  Pause,
  ShieldCheck,
  Check,
  Plus,
  X,
  Copy,
  Layers,
  Globe,
  Download,
  Sparkles
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog.jsx';
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
import { toast } from '@/components/ui/sonner.jsx';
import FolderInput from '@/components/ui/FolderInput.jsx';
import VideoPlayerModal from '../VideoPlayerModal.jsx';
import AssetCard from './AssetCard.jsx';
import JustifiedGallery from './JustifiedGallery.jsx';
import { apiFetch, apiUrl } from '@/lib/apiClient.js';
import { openFolder } from '@/utils/nativeExplorer.js';

const WebMediaBrowserModal = lazy(() => import('../WebMediaBrowserModal.jsx'));

export default function GlobalLibraryPage({ onOpenSettings }) {
  // 1. 资料库多根目录列表
  const [libraries, setLibraries] = useState([]);
  const [selectedLibId, setSelectedLibId] = useState('all'); // 'all' | libraryId
  const [isLoadingLibs, setIsLoadingLibs] = useState(false);

  // 2. 媒体资产扫描数据
  const [browseData, setBrowseData] = useState({ currentDirs: [], subDirs: [], files: [], notConfigured: false });
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [selectedType, setSelectedType] = useState('all'); // all | video | audio | image | document
  const [selectedSubDir, setSelectedSubDir] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 3. 模态窗口状态
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newLibPath, setNewLibPath] = useState('');
  const [newLibName, setNewLibName] = useState('');
  const [isAddingLib, setIsAddingLib] = useState(false);

  // 4. 网络素材库模态窗口状态
  const [isWebBrowserOpen, setIsWebBrowserOpen] = useState(false);

  // 5. 视频/音频试听播放状态
  const [playingVideoModal, setPlayingVideoModal] = useState(null); // { file, startTime, streamPath }
  const [inlineAudioUrl, setInlineAudioUrl] = useState(null);
  const inlineAudioRef = useRef(null);

  // 6. 文件删除二次确认状态
  const [fileToDelete, setFileToDelete] = useState(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);

  // 6. 视图模式切换状态：大卡 ('large') | 中卡 ('medium') | 列表 ('list')
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('meocox_global_lib_view_mode') || 'medium';
    } catch {
      return 'medium';
    }
  });

  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('meocox_global_lib_view_mode', mode);
    } catch {}
  };

  // 获取所有全局绑定的资料库
  const fetchLibraries = async () => {
    setIsLoadingLibs(true);
    try {
      const res = await apiFetch('/api/libraries');
      if (res.ok) {
        const data = await res.json();
        setLibraries(data.libraries || []);
      }
    } catch (err) {
      console.error('Failed to fetch global libraries:', err);
    } finally {
      setIsLoadingLibs(false);
    }
  };

  // 扫描素材文件
  const fetchBrowseData = async () => {
    setIsLoadingFiles(true);
    try {
      let url = '/api/assets/browse?global=true';
      if (selectedLibId !== 'all') {
        const currentLib = libraries.find(l => l.id === selectedLibId);
        if (currentLib?.path) {
          url = `/api/assets/browse?dir=${encodeURIComponent(currentLib.path)}`;
        }
      }
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setBrowseData({
          currentDirs: data.currentDirs || [],
          subDirs: data.subDirs || [],
          files: data.files || [],
          notConfigured: Boolean(data.notConfigured)
        });
      }
    } catch (err) {
      console.error('Failed to browse global assets:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    fetchLibraries();
  }, []);

  useEffect(() => {
    fetchBrowseData();
    return () => {
      if (inlineAudioRef.current) {
        try { inlineAudioRef.current.pause(); } catch {}
      }
    };
  }, [selectedLibId, libraries.length]);

  // 添加新资料库
  const handleAddLibrary = async (e) => {
    if (e) e.preventDefault();
    if (!newLibPath.trim()) {
      toast.error('请先选择或输入本地目录路径');
      return;
    }

    setIsAddingLib(true);
    try {
      const finalName = newLibName.trim() || newLibPath.trim().split(/[\\/]/).filter(Boolean).pop() || '素材库';
      const res = await apiFetch('/api/libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: finalName,
          path: newLibPath.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '添加资料库失败');

      toast.success(`资料库【${finalName}】绑定成功！`);
      setNewLibPath('');
      setNewLibName('');
      setIsAddModalOpen(false);
      await fetchLibraries();
      if (data.library?.id) {
        setSelectedLibId(data.library.id);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsAddingLib(false);
    }
  };

  // 解除绑定资料库
  const handleRemoveLibrary = async (lib, e) => {
    if (e) e.stopPropagation();
    if (!confirm(`确定解除资料库【${lib.name}】与全局的绑定吗？\n\n（仅解除全局索引引用，您的本地原始文件完好无损，绝不会被删除）`)) {
      return;
    }

    try {
      const res = await apiFetch(`/api/libraries/${lib.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`已解绑资料库【${lib.name}】`);
        if (selectedLibId === lib.id) {
          setSelectedLibId('all');
        }
        await fetchLibraries();
      } else {
        toast.error('解绑失败');
      }
    } catch (err) {
      toast.error('操作异常: ' + err.message);
    }
  };

  // 在系统文件资源管理器中打开指定目录或文件所在目录
  const handleOpenFolder = async (dirOrFilePath, e) => {
    if (e) e.stopPropagation();
    try {
      await openFolder(dirOrFilePath);
    } catch (err) {
      toast.error('打开目录失败: ' + err.message);
    }
  };

  // 复制文件绝对路径
  const handleCopyPath = async (filePath, e) => {
    if (e) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(filePath);
      toast.success('已复制素材路径至剪贴板', { description: filePath });
    } catch {
      toast.error('复制路径失败');
    }
  };

  // 音频内联试听切换
  const togglePlayAudio = (fileOrEvent, maybeFile) => {
    const file = maybeFile || (fileOrEvent && fileOrEvent.path ? fileOrEvent : null);
    if (!file?.path) return;
    const fullUrl = apiUrl(`/api/assets/stream?path=${encodeURIComponent(file.path)}`);
    if (inlineAudioUrl === fullUrl) {
      if (inlineAudioRef.current) inlineAudioRef.current.pause();
      setInlineAudioUrl(null);
    } else {
      if (inlineAudioRef.current) inlineAudioRef.current.pause();
      const audio = new Audio(fullUrl);
      inlineAudioRef.current = audio;
      audio.play().then(() => setInlineAudioUrl(fullUrl)).catch(() => setInlineAudioUrl(null));
      audio.onended = () => setInlineAudioUrl(null);
      audio.onerror = () => setInlineAudioUrl(null);
    }
  };

  // 视频全屏/弹窗播放
  const handleOpenVideoPlayerModal = (file, startTime = 0) => {
    if (!file?.path) return;
    const streamUrl = apiUrl(`/api/assets/stream?path=${encodeURIComponent(file.path)}`);
    setPlayingVideoModal({
      file,
      startTime: Number(startTime) || 0,
      streamPath: streamUrl
    });
  };

  const handleCloseVideoPlayerModal = () => {
    setPlayingVideoModal(null);
  };

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
      setBrowseData(prev => ({
        ...prev,
        files: (prev.files || []).filter(f => f.path !== fileToDelete.path)
      }));
      setFileToDelete(null);
    } catch (err) {
      toast.error('删除文件失败: ' + err.message);
    } finally {
      setIsDeletingFile(false);
    }
  };

  // 卡片操作动作清单 (最多展示 3 个，超出部分收进 ⋮ 更多菜单)
  // 全局资料库不包含“感知内容”与“定位目录”，支持复制路径、下载与二次确认删除
  const getItemActions = (itemFile) => {
    return [
      {
        id: 'copy-path',
        label: '复制路径',
        title: '复制绝对路径',
        icon: Copy,
        onClick: (f, e) => handleCopyPath(f.path, e)
      },
      {
        id: 'download-file',
        label: '下载文件',
        title: '下载原文件',
        icon: Download,
        onClick: (f, e) => {
          if (e) e.stopPropagation();
          const streamUrl = apiUrl(`/api/assets/stream?path=${encodeURIComponent(f.path)}`);
          const a = document.createElement('a');
          a.href = streamUrl;
          a.download = f.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast.success(`正在下载「${f.name}」`);
        }
      },
      {
        id: 'delete-file',
        label: '删除文件',
        title: '从磁盘中永久删除',
        icon: Trash2,
        danger: true,
        onClick: (f, e) => {
          if (e) e.stopPropagation();
          setFileToDelete(f);
        }
      }
    ];
  };

  // 过滤素材
  const filteredFiles = useMemo(() => {
    let list = browseData.files || [];
    if (selectedType !== 'all') {
      list = list.filter(f => f.type === selectedType);
    }
    if (selectedSubDir !== 'all') {
      list = list.filter(f => f.subDir === selectedSubDir);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q) || (f.rootLabel && f.rootLabel.toLowerCase().includes(q)));
    }
    return list;
  }, [browseData.files, selectedType, selectedSubDir, searchQuery]);

  // 统计指标
  const stats = useMemo(() => {
    const all = browseData.files || [];
    return {
      total: all.length,
      video: all.filter(f => f.type === 'video').length,
      audio: all.filter(f => f.type === 'audio').length,
      image: all.filter(f => f.type === 'image').length,
      document: all.filter(f => f.type === 'document').length
    };
  }, [browseData.files]);

  const activeLib = libraries.find(l => l.id === selectedLibId);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B0F17] overflow-hidden select-none font-sans">
      {/* ─────────────────────────────────────────────────────────────
          1. 顶部操作栏：全局资料库标识 + 网络素材库 + 刷新 + 绑定新目录 + 根目录切换
         ───────────────────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-dark-700 bg-dark-900/90 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-cyan shadow-sm shadow-brand-500/10">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-fluid-title font-bold text-white tracking-wide">全局资料库</h2>
                <span className="font-fluid-xs px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-cyan border border-brand-500/30 font-semibold">
                  已绑定 {libraries.length} 个根目录
                </span>
              </div>
              <p className="font-fluid-sm text-gray-400 mt-0.5">
                统一汇聚各磁盘独立素材根目录；全局支持自由切换浏览，项目可按需挂载
              </p>
            </div>
          </div>

          {/* 右侧动作按钮组 (还原系统经典品牌色与网络资料库入口) */}
          <div className="flex items-center space-x-2">
            {/* 🌟 网络资料库入口 */}
            <button
              onClick={() => setIsWebBrowserOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-750 text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 hover:border-cyan-500/60 font-fluid-sm font-medium flex items-center space-x-1.5 transition cursor-pointer shadow-sm shadow-cyan-500/10"
              title="打开网络资料库 (Mixkit, 维基, Wallhaven, 必应壁纸, 免费商用 4K 资料嗅探)"
            >
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>网络资料库</span>
            </button>

            {/* 刷新 */}
            <button
              onClick={() => { fetchLibraries(); fetchBrowseData(); }}
              disabled={isLoadingFiles}
              className="px-2.5 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700 font-fluid-sm flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50"
              title="刷新资料库与文件扫描"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin text-brand-cyan' : ''}`} />
              <span>刷新</span>
            </button>

            {/* 绑定新目录 */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-fluid-sm font-semibold flex items-center space-x-1.5 shadow-sm shadow-brand-500/25 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>绑定新目录</span>
            </button>
          </div>
        </div>

        {/* 根目录切换胶囊栏 */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
          {/* 全部目录选项 */}
          <button
            onClick={() => setSelectedLibId('all')}
            className={`px-3 py-1.5 rounded-xl font-fluid-sm font-medium shrink-0 transition flex items-center space-x-1.5 cursor-pointer border ${
              selectedLibId === 'all'
                ? 'bg-brand-500/20 text-brand-cyan border-brand-500/50 shadow-sm shadow-brand-500/10'
                : 'bg-dark-950/70 text-gray-400 hover:text-gray-200 border-dark-800 hover:border-dark-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>全部资料库</span>
            <span className="font-fluid-xs ml-1 px-1.5 py-0.2 rounded-full bg-dark-800 border border-dark-700 text-gray-300">
              {stats.total}
            </span>
          </button>

          {/* 各绑定的具体目录胶囊 */}
          {libraries.map((lib) => {
            const isSelected = selectedLibId === lib.id;
            return (
              <div
                key={lib.id}
                onClick={() => setSelectedLibId(lib.id)}
                className={`group px-3 py-1.5 rounded-xl font-fluid-sm font-medium shrink-0 transition flex items-center space-x-2 cursor-pointer border ${
                  isSelected
                    ? 'bg-brand-500/20 text-brand-cyan border-brand-500/50 shadow-sm shadow-brand-500/10'
                    : 'bg-dark-950/70 text-gray-400 hover:text-gray-200 border-dark-800 hover:border-dark-700'
                }`}
              >
                <FolderGit2 className={`w-3.5 h-3.5 ${isSelected ? 'text-brand-cyan' : 'text-gray-500 group-hover:text-brand-cyan'}`} />
                <span className="max-w-[140px] truncate" title={lib.name}>{lib.name}</span>

                {/* 快捷图标：打开文件夹 & 解除绑定 */}
                <div className="flex items-center space-x-1 pl-1 opacity-60 group-hover:opacity-100 transition">
                  <button
                    type="button"
                    onClick={(e) => handleOpenFolder(lib.path, e)}
                    className="p-0.5 hover:text-emerald-400 text-gray-400 transition cursor-pointer"
                    title={`在文件资源管理器中打开: ${lib.path}`}
                  >
                    <FolderOpen className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveLibrary(lib, e)}
                    className="p-0.5 hover:text-rose-400 text-gray-400 transition cursor-pointer"
                    title="解除绑定（保留本地文件）"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}

          {/* 快捷添加目录按钮 */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-2.5 py-1.5 rounded-xl font-fluid-sm font-medium shrink-0 text-gray-400 hover:text-brand-cyan bg-dark-950/40 hover:bg-dark-900 border border-dashed border-dark-750 hover:border-brand-500/40 transition flex items-center space-x-1 cursor-pointer"
            title="绑定新的外部素材根目录"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>添加目录</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. 工具栏：类型筛选 + 子目录过滤 + 搜索 + 网格调节 + 路径信息
         ───────────────────────────────────────────────────────────── */}
      <div className="px-5 py-2 bg-dark-950/60 border-b border-dark-800 flex items-center justify-between gap-3 font-fluid-sm shrink-0">
        <div className="flex items-center space-x-2">
          {/* 类型筛选 */}
          <div className="flex items-center bg-dark-900 p-0.5 rounded-lg border border-dark-800">
            {[
              { id: 'all', label: '全部', count: stats.total },
              { id: 'video', label: '视频', count: stats.video, icon: Video },
              { id: 'audio', label: '音频', count: stats.audio, icon: Music },
              { id: 'image', label: '图片', count: stats.image, icon: ImageIcon },
              { id: 'document', label: '文档', count: stats.document, icon: FileText }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedType(t.id)}
                className={`px-2.5 py-1 rounded-md font-fluid-xs font-medium transition cursor-pointer flex items-center space-x-1 ${
                  selectedType === t.id
                    ? 'bg-brand-500/20 text-brand-cyan border border-brand-500/40 shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 border border-transparent'
                }`}
              >
                {t.icon && <t.icon className="w-3 h-3" />}
                <span>{t.label}</span>
                <span className="text-gray-500">({t.count})</span>
              </button>
            ))}
          </div>

          {/* 子目录过滤 */}
          {browseData.subDirs.length > 0 && (
            <select
              value={selectedSubDir}
              onChange={(e) => setSelectedSubDir(e.target.value)}
              className="bg-dark-900 border border-dark-800 text-gray-300 rounded-lg px-2.5 py-1 font-fluid-xs focus:outline-none focus:border-brand-500"
            >
              <option value="all">所有子文件夹 ({browseData.subDirs.length})</option>
              {browseData.subDirs.map(sd => (
                <option key={sd} value={sd}>{sd}</option>
              ))}
            </select>
          )}
        </div>

        {/* 右侧：搜索 + 网格模式 + 本地路径 */}
        <div className="flex items-center space-x-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索素材文件名..."
              className="bg-dark-900 border border-dark-800 text-gray-200 placeholder-gray-500 pl-8 pr-3 py-1 font-fluid-xs rounded-lg focus:outline-none focus:border-brand-500 w-44"
            />
          </div>

          {/* 视图模式切换：大卡、中卡、列表 */}
          <div className="flex items-center bg-dark-900 p-0.5 rounded-lg border border-dark-800">
            {[
              { id: 'large', icon: Grid2x2, title: '大卡' },
              { id: 'medium', icon: LayoutGrid, title: '中卡' },
              { id: 'list', icon: List, title: '列表' }
            ].map(g => (
              <button
                key={g.id}
                onClick={() => handleSetViewMode(g.id)}
                className={`p-1 rounded transition cursor-pointer ${
                  viewMode === g.id ? 'bg-dark-800 text-brand-cyan' : 'text-gray-500 hover:text-gray-300'
                }`}
                title={g.title}
              >
                <g.icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          {/* 当前选定目录绝对路径提示 */}
          {activeLib && (
            <button
              onClick={() => handleOpenFolder(activeLib.path)}
              className="font-fluid-xs text-gray-400 hover:text-brand-cyan flex items-center space-x-1 max-w-[200px] truncate"
              title={`点击打开本地目录: ${activeLib.path}`}
            >
              <FolderOpen className="w-3 h-3 text-brand-cyan shrink-0" />
              <span className="truncate font-mono">{activeLib.path}</span>
            </button>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. 主媒体网格浏览区 (还原卡片 Hover 自动静音预览、浮岛工具栏、波形)
         ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5">
        {/* 空状态 A: 尚未绑定任何资料库 */}
        {libraries.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-cyan mb-4 shadow-xl shadow-brand-500/10">
              <FolderGit2 className="w-8 h-8" />
            </div>
            <h3 className="font-fluid-title font-bold text-white mb-2">尚未绑定全局资料库</h3>
            <p className="font-fluid-base text-gray-400 leading-relaxed mb-6">
              全局资料库支持绑定多个外部根目录（如 B-Roll、剧情切片、背景音效等）。
              项目既可以直接选用全局目录，也可以将项目专属素材同步入库。
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-fluid-sm font-semibold flex items-center space-x-2 shadow-lg shadow-brand-500/30 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>绑定第一个本地素材目录</span>
            </button>
          </div>
        ) : filteredFiles.length === 0 ? (
          /* 空状态 B: 当前筛选下无文件 */
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 font-fluid-base py-20 space-y-2">
            <FolderOpen className="w-8 h-8 text-gray-600" />
            <span>{isLoadingFiles ? '正在扫描媒体资产...' : '当前分类或目录下未找到媒体素材'}</span>
          </div>
        ) : viewMode === 'list' ? (
          /* 列表模式：紧凑纵向排列 */
          <div className="flex flex-col gap-3">
            {filteredFiles.map((file, idx) => (
              <AssetCard
                key={file.path || idx}
                file={file}
                viewMode="list"
                isPlayingAudio={inlineAudioUrl === apiUrl(`/api/assets/stream?path=${encodeURIComponent(file.path)}`)}
                onToggleAudio={togglePlayAudio}
                onPlayVideo={(f) => handleOpenVideoPlayerModal(f)}
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
            targetRowHeight={viewMode === 'large' ? 220 : 140}
            gap={viewMode === 'large' ? 15 : 12}
            renderItem={(file, { onReportRatio, isLastInRow }) => (
              <AssetCard
                file={file}
                viewMode={viewMode}
                isPlayingAudio={inlineAudioUrl === apiUrl(`/api/assets/stream?path=${encodeURIComponent(file.path)}`)}
                onToggleAudio={togglePlayAudio}
                onPlayVideo={(f) => handleOpenVideoPlayerModal(f)}
                onReportRatio={onReportRatio}
                isLastInRow={isLastInRow}
                onDeleteFile={(f) => setFileToDelete(f)}
                actions={getItemActions(file)}
              />
            )}
          />
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. 绑定新根目录模态窗口 (恢复品牌蓝紫主色与流体字)
         ───────────────────────────────────────────────────────────── */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-md p-0 gap-0 overflow-hidden flex flex-col bg-[#0F172A] border-slate-700/80 rounded-2xl shadow-2xl"
        >
          <DialogTitle className="sr-only">绑定全局资料库目录</DialogTitle>
          <DialogDescription className="sr-only">绑定本地素材根目录到全局资料库</DialogDescription>

          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/70">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-cyan">
                <FolderPlus className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-fluid-title font-bold text-slate-100">绑定素材根目录</h3>
                <p className="font-fluid-sm text-slate-400 mt-0.5">
                  添加本地常用视频、音频或图片素材根目录
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleAddLibrary} className="p-5 space-y-4 font-fluid-sm">
            <div>
              <label className="block font-medium text-slate-300 mb-1.5">
                本地目录路径 <span className="text-rose-400">*</span>
              </label>
              <FolderInput
                value={newLibPath}
                onChange={setNewLibPath}
                onFolderSelected={(path) => {
                  if (!newLibName.trim()) {
                    const autoName = path.split(/[\\/]/).filter(Boolean).pop() || '素材库';
                    setNewLibName(autoName);
                  }
                }}
                placeholder="例如：D:\Assets\B-Roll"
                dialogTitle="选择本地资料库目录"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1.5">
                资料库别名 <span className="text-slate-500">(留空默认文件夹名)</span>
              </label>
              <input
                type="text"
                value={newLibName}
                onChange={(e) => setNewLibName(e.target.value)}
                placeholder="例如：B-Roll实拍镜头包"
                className="w-full px-3.5 py-2 bg-slate-950/90 border border-slate-700/80 rounded-xl font-fluid-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 font-fluid-xs text-slate-400 flex items-start space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                系统采用严格只读挂载规范，绝对不会修改、删除或污染您磁盘中的任何原始文件。
              </span>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isAddingLib || !newLibPath.trim()}
                className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white font-semibold transition flex items-center space-x-1.5 shadow-md shadow-brand-500/25 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAddingLib ? '正在绑定...' : '确认绑定'}</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          5. 视频播放器弹窗 (支持时间轴无缝记忆与还原)
         ───────────────────────────────────────────────────────────── */}
      {playingVideoModal && (
        <VideoPlayerModal
          file={playingVideoModal.file}
          startTime={playingVideoModal.startTime}
          streamPath={playingVideoModal.streamPath}
          onClose={(closedTime) => handleCloseVideoPlayerModal(closedTime)}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          6. 网络资料库模态窗口 (支持 Mixkit, Wallhaven, 维基, 嗅探直存)
         ───────────────────────────────────────────────────────────── */}
      {isWebBrowserOpen && (
        <Suspense fallback={null}>
          <WebMediaBrowserModal
            isOpen={isWebBrowserOpen}
            onClose={() => setIsWebBrowserOpen(false)}
            onAssetSaved={() => {
              fetchBrowseData();
            }}
          />
        </Suspense>
      )}

      {/* ─────────────────────────────────────────────────────────────
          7. 删除文件二次确认模态弹窗
         ───────────────────────────────────────────────────────────── */}
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
    </div>
  );
}
