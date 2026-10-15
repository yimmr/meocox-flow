import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  FolderTree, Video, Music, Image as ImageIcon, FileText, 
  RefreshCw, MessageSquarePlus, Play, Pause,
  Search, File, FolderOpen, Globe,
  Sparkles, CheckCircle2, Loader2, X, Zap, Cpu, Clock, Wand2,
  Grid3x3, Grid2x2, LayoutGrid
} from 'lucide-react';
import VideoPlayerModal from './VideoPlayerModal';
import { toast } from '@/components/ui/sonner.jsx';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog.jsx';
import { apiUrl, apiFetch } from '@/lib/apiClient.js';
import { openFolder } from '@/utils/nativeExplorer.js';

// 统一走 apiClient：Web 端为相对路径（Vite proxy），桌面端为 localhost 绝对地址
const API_BASE = '/api';

// 网格大小维度预设
const GRID_CONFIGS = {
  small: {
    id: 'small',
    label: '小网格',
    shortLabel: '小',
    icon: Grid3x3,
    next: 'medium',
    nextLabel: '中网格',
    gridClass: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-2.5',
    titleSize: 'text-[11px]',
    padding: 'p-2'
  },
  medium: {
    id: 'medium',
    label: '中网格',
    shortLabel: '中',
    icon: LayoutGrid,
    next: 'large',
    nextLabel: '大网格',
    gridClass: 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3.5',
    titleSize: 'text-xs',
    padding: 'p-3'
  },
  large: {
    id: 'large',
    label: '大网格',
    shortLabel: '大',
    icon: Grid2x2,
    next: 'small',
    nextLabel: '小网格',
    gridClass: 'grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3 gap-4',
    titleSize: 'text-sm',
    padding: 'p-3.5'
  }
};

// 仿真自然声学能量波形序列（参考 meocox-cut）
const SOUND_BARS = [
  12, 22, 35, 52, 75, 92, 65, 45, 80, 98,
  100, 85, 56, 70, 90, 60, 42, 68, 88, 96,
  75, 52, 72, 90, 64, 44, 56, 80
];

// 快捷语义检索标签推荐
const QUICK_SEMANTIC_TAGS = [
  { label: '🔥 高能打斗', query: '高能打斗 BOSS战 技能冲击' },
  { label: '⭐ 黄金前3秒', query: '黄金前3秒 开场高能吸睛' },
  { label: '🎵 史诗BGM', query: '史诗震撼 BGM 背景音乐' },
  { label: '🌿 唯美空镜', query: '唯美风景 治愈空镜' },
  { label: '👤 角色立绘', query: '角色立绘 人物特写' },
  { label: '💥 动效打击', query: '卡点音效 技能释放 打击感' },
];

export default function AssetExplorer({ 
  projectId, 
  currentProject, 
  onAddToChat, 
  onAddAssetReference,
  onOpenProjectSettings,
  onOpenWebBrowser
}) {
  const [browseData, setBrowseData] = useState({ currentDir: '', currentDirs: [], subDirs: [], files: [], notConfigured: false });
  const [isLoading, setIsLoading] = useState(false);
  const [selectedType, setSelectedType] = useState('all'); // all | video | audio | image | document
  const [selectedSubDir, setSelectedSubDir] = useState('all'); // all | subdir_name
  const [selectedRootDir, setSelectedRootDir] = useState('all'); // all | dir_path
  const [searchQuery, setSearchQuery] = useState('');
  
  // Phase 2 智能语义搜素材状态
  const [searchMode, setSearchMode] = useState('semantic'); // 'semantic' | 'filename'
  const [semanticResults, setSemanticResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);

  // 内联播放状态（无弹窗）
  const [inlineAudioUrl, setInlineAudioUrl] = useState(null);
  const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
  const [perceptionModalData, setPerceptionModalData] = useState(null);
  const inlineAudioRef = useRef(null);

  // 网格大小切换状态 (small | medium | large)
  const [gridSize, setGridSize] = useState(() => {
    try {
      return localStorage.getItem('meocox_asset_grid_size') || 'medium';
    } catch {
      return 'medium';
    }
  });

  const currentGrid = GRID_CONFIGS[gridSize] || GRID_CONFIGS.medium;
  const GridIcon = currentGrid.icon;

  const cycleGridSize = () => {
    const nextSize = currentGrid.next;
    setGridSize(nextSize);
    try {
      localStorage.setItem('meocox_asset_grid_size', nextSize);
    } catch {}
  };

  // 视频完整播放器弹窗状态与无缝时间同步
  const [playingVideoModal, setPlayingVideoModal] = useState(null); // { file, startTime }
  const videoRefs = useRef({});
  const hoverTimesRef = useRef({});

  const handleOpenVideoPlayerModal = (file, startTime = 0) => {
    // 暂停对应卡片在底层的静音播放，避免多路解码争抢资源
    const cardEl = videoRefs.current[file.path] || document.getElementById(`asset-video-${file.path}`);
    if (cardEl) {
      try { cardEl.pause(); } catch {}
    }
    setPlayingVideoModal({ file, startTime: Number(startTime) || 0 });
  };

  const handleCloseVideoPlayerModal = (closedTime) => {
    if (playingVideoModal) {
      const syncTime = typeof closedTime === 'number' ? closedTime : (hoverTimesRef.current[playingVideoModal.file.path] || 0);
      const cardEl = videoRefs.current[playingVideoModal.file.path] || document.getElementById(`asset-video-${playingVideoModal.file.path}`);
      if (cardEl) {
        try { cardEl.currentTime = syncTime; } catch {}
      }
      hoverTimesRef.current[playingVideoModal.file.path] = syncTime;
    }
    setPlayingVideoModal(null);
  };

  const hasConfiguredAssetDir = Boolean(
    (currentProject?.assetDir && currentProject.assetDir.trim()) ||
    (Array.isArray(currentProject?.extraAssetDirs) && currentProject.extraAssetDirs.length > 0)
  );

  const fetchBrowseData = async () => {
    if (!hasConfiguredAssetDir) {
      setBrowseData({ currentDir: '', currentDirs: [], subDirs: [], files: [], notConfigured: true });
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/assets/browse?projectId=${projectId || currentProject?.id || ''}`);
      const data = await res.json();
      if (data.success) {
        setBrowseData({
          currentDir: data.currentDir,
          currentDirs: data.currentDirs || [],
          subDirs: data.subDirs || [],
          files: data.files || [],
          notConfigured: Boolean(data.notConfigured)
        });
      }
    } catch (e) {
      console.error('Failed to browse assets:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // SSE 实时感知状态流监听
  useEffect(() => {
    let evtSource = null;
    try {
      evtSource = new EventSource(apiUrl(`${API_BASE}/media/events`));
      evtSource.addEventListener('media:completed', (e) => {
        try {
          const data = JSON.parse(e.data);
          setBrowseData(prev => ({
            ...prev,
            files: prev.files.map(f => {
              if (f.mediaId === data.mediaId) {
                return { ...f, perceptionStatus: 'completed', perception: data.perception };
              }
              return f;
            })
          }));
        } catch {}
      });
      evtSource.addEventListener('media:started', (e) => {
        try {
          const data = JSON.parse(e.data);
          setBrowseData(prev => ({
            ...prev,
            files: prev.files.map(f => {
              if (f.mediaId === data.mediaId) {
                return { ...f, perceptionStatus: 'processing' };
              }
              return f;
            })
          }));
        } catch {}
      });
      evtSource.addEventListener('media:failed', (e) => {
        try {
          const data = JSON.parse(e.data);
          setBrowseData(prev => ({
            ...prev,
            files: prev.files.map(f => {
              if (f.mediaId === data.mediaId) {
                return { ...f, perceptionStatus: 'failed', perceptionError: data.error };
              }
              return f;
            })
          }));
        } catch {}
      });
    } catch (err) {
      console.warn('SSE connection failed:', err);
    }

    return () => {
      if (evtSource) {
        evtSource.close();
      }
    };
  }, []);

  useEffect(() => {
    fetchBrowseData();
    // 切换素材库时停止内联音频
    return () => {
      if (inlineAudioRef.current) {
        try { inlineAudioRef.current.pause(); } catch {}
      }
    };
  }, [projectId, currentProject?.assetDir, JSON.stringify(currentProject?.extraAssetDirs || [])]);

  // 语义搜素材防抖请求
  useEffect(() => {
    if (searchMode !== 'semantic' || !searchQuery.trim()) {
      setSemanticResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const typeParam = selectedType === 'all' ? 'all' : selectedType;
        const res = await apiFetch(`${API_BASE}/media/search?q=${encodeURIComponent(searchQuery.trim())}&mediaType=${typeParam}`);
        const data = await res.json();
        if (data.success && Array.isArray(data.results)) {
          setSemanticResults(data.results);
        } else {
          setSemanticResults([]);
        }
      } catch (err) {
        console.error('Semantic search failed:', err);
        setSemanticResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, searchMode, selectedType]);

  // 重建语义索引
  const handleReindex = async () => {
    setIsReindexing(true);
    try {
      const res = await apiFetch(`${API_BASE}/media/search/reindex`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success(`语义检索索引已更新，共索引 ${data.total || 0} 个素材！`);
      }
    } catch (err) {
      console.error('Reindex failed:', err);
      toast.error('重建语义索引失败');
    } finally {
      setIsReindexing(false);
    }
  };

  // 单个素材深度感知触发
  const handleAnalyzeFile = async (e, file) => {
    if (e && e.stopPropagation) e.stopPropagation();
    // 乐观更新为排队中
    setBrowseData(prev => ({
      ...prev,
      files: prev.files.map(f => f.path === file.path ? { ...f, perceptionStatus: 'queued' } : f)
    }));
    try {
      await apiFetch(`${API_BASE}/media/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePaths: [file.path],
          priority: 'high',
          mediaType: file.type
        })
      });
      toast.success(`已将「${file.name}」加入深度感知队列！`);
    } catch (err) {
      console.error('Trigger analyze failed:', err);
      toast.error('触发感知失败');
    }
  };

  // 批量深度感知触发
  const handleBatchAnalyze = async () => {
    const unanalyzedFiles = filteredFiles.filter(f => 
      ['video', 'image', 'audio'].includes(f.type) && 
      f.perceptionStatus !== 'completed' && 
      f.perceptionStatus !== 'processing'
    );
    if (unanalyzedFiles.length === 0) {
      toast.info('当前视图中所有素材均已完成感知！');
      return;
    }
    setIsBatchAnalyzing(true);
    setBrowseData(prev => ({
      ...prev,
      files: prev.files.map(f => 
        unanalyzedFiles.some(u => u.path === f.path) ? { ...f, perceptionStatus: 'queued' } : f
      )
    }));
    try {
      const res = await apiFetch(`${API_BASE}/media/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePaths: unanalyzedFiles.map(f => f.path),
          priority: 'normal'
        })
      });
      const data = await res.json();
      toast.success(`已将 ${data.queued || unanalyzedFiles.length} 个素材加入后台感知队列！`);
    } catch (err) {
      console.error('Batch analyze failed:', err);
      toast.error('批量感知触发失败');
    } finally {
      setIsBatchAnalyzing(false);
    }
  };

  // 查看深度感知详情
  const handleOpenPerceptionModal = async (e, file) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (file.perception) {
      setPerceptionModalData({ file, perception: file.perception });
      return;
    }
    if (file.mediaId) {
      setLoadingPerceptionId(file.mediaId);
      try {
        const res = await apiFetch(`${API_BASE}/media/perception/${file.mediaId}`);
        const data = await res.json();
        if (data.success && data.perception) {
          setPerceptionModalData({ file, perception: data.perception });
          // 回写缓存
          setBrowseData(prev => ({
            ...prev,
            files: prev.files.map(f => f.mediaId === file.mediaId ? { ...f, perception: data.perception } : f)
          }));
        }
      } catch (err) {
        console.error('Failed to load perception detail:', err);
      } finally {
        setLoadingPerceptionId(null);
      }
    }
  };

  // 打开原生资源管理器
  const handleOpenNativeFolder = async () => {
    const targetFolder = (selectedRootDir !== 'all' ? selectedRootDir : browseData.currentDir);
    if (!targetFolder) return;
    await openFolder(targetFolder);
  };

  // 一键引用素材至 Agent 对话框（以文件标签形式插入，由用户自主输入具体指令）
  const handleTriggerAddToChat = (e, file) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (onAddAssetReference) {
      onAddAssetReference(file);
    } else if (onAddToChat) {
      onAddToChat({ asset: file });
    }
    toast.success(`已将「${file.name}」引用至对话框！`);
  };

  // 内联音频试听切换（无弹窗）
  const togglePlayAudio = (e, file) => {
    e.stopPropagation();
    const fullUrl = apiUrl(`${API_BASE}/assets/stream?path=${encodeURIComponent(file.path)}`);
    if (inlineAudioUrl === fullUrl) {
      if (inlineAudioRef.current) {
        inlineAudioRef.current.pause();
      }
      setInlineAudioUrl(null);
    } else {
      if (inlineAudioRef.current) {
        inlineAudioRef.current.pause();
      }
      const audio = new Audio(fullUrl);
      inlineAudioRef.current = audio;
      audio.play().then(() => {
        setInlineAudioUrl(fullUrl);
      }).catch((err) => {
        console.error('音频播放失败', err);
        setInlineAudioUrl(null);
      });
      audio.onended = () => setInlineAudioUrl(null);
      audio.onerror = () => setInlineAudioUrl(null);
    }
  };

  // 筛选与智能排序文件
  const filteredFiles = useMemo(() => {
    const rawFiles = browseData.files || [];

    // 1. 语义智搜模式且有输入
    if (searchMode === 'semantic' && searchQuery.trim()) {
      if (semanticResults.length === 0 && !isSearching) {
        // 无语义匹配时降级为文件名模糊匹配
        return rawFiles.filter(f => {
          const matchesRootDir = selectedRootDir === 'all' || f.rootDir === selectedRootDir;
          const matchesType = selectedType === 'all' || f.type === selectedType;
          const matchesSubDir = selectedSubDir === 'all' || f.subDir === selectedSubDir;
          const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase());
          return matchesRootDir && matchesType && matchesSubDir && matchesSearch;
        });
      }

      // 构建检索映射
      const hitMap = new Map();
      semanticResults.forEach((hit, idx) => {
        if (hit.mediaId) hitMap.set(hit.mediaId, { ...hit, rank: idx });
        if (hit.originalPath) hitMap.set(hit.originalPath.toLowerCase(), { ...hit, rank: idx });
      });

      const matched = [];
      for (const f of rawFiles) {
        const matchesRootDir = selectedRootDir === 'all' || f.rootDir === selectedRootDir;
        const matchesType = selectedType === 'all' || f.type === selectedType;
        const matchesSubDir = selectedSubDir === 'all' || f.subDir === selectedSubDir;
        if (!matchesRootDir || !matchesType || !matchesSubDir) continue;

        const hit = (f.mediaId && hitMap.get(f.mediaId)) || (f.path && hitMap.get(f.path.toLowerCase()));
        if (hit) {
          matched.push({
            ...f,
            semanticHit: hit,
            semanticScore: hit.score,
            semanticScorePercent: hit.scorePercent,
            matchedTerms: hit.matchedTerms,
            highlights: hit.highlights,
            semanticSummary: hit.summary
          });
        } else if (f.name.toLowerCase().includes(searchQuery.toLowerCase())) {
          matched.push({
            ...f,
            semanticScore: 0.15,
            semanticScorePercent: 35,
            matchedTerms: [searchQuery.trim()]
          });
        }
      }

      // 按语义契合度排序
      matched.sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0));
      return matched;
    }

    // 2. 常规模式
    return rawFiles.filter(f => {
      const matchesRootDir = selectedRootDir === 'all' || f.rootDir === selectedRootDir;
      const matchesType = selectedType === 'all' || f.type === selectedType;
      const matchesSubDir = selectedSubDir === 'all' || f.subDir === selectedSubDir;
      const matchesSearch = !searchQuery.trim() || f.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesRootDir && matchesType && matchesSubDir && matchesSearch;
    });
  }, [browseData.files, selectedRootDir, selectedType, selectedSubDir, searchQuery, searchMode, semanticResults, isSearching]);

  // 如果未配置素材库目录，显示未配置向导卡片
  if (!hasConfiguredAssetDir || browseData.notConfigured) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-5 bg-dark-900 border-l border-dark-700 select-none">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/5">
          <FolderTree className="w-8 h-8" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h3 className="font-bold text-sm text-white">尚未设置项目素材库目录</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            项目必须手动指定本地素材存放路径（包含录屏、音效、图片或攻略资料）。设置后将在此自动进行多模态瀑布流浏览与 Agent 对话编排。
          </p>
        </div>
        <button
          onClick={onOpenProjectSettings}
          className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-brand-500/25 flex items-center space-x-2 transition active:scale-95"
        >
          <FolderOpen className="w-4 h-4" />
          <span>打开项目设置配置素材目录</span>
        </button>
      </div>
    );
  }

  // 统计各类文件数量与感知覆盖率
  const typeCounts = (browseData.files || []).reduce((acc, f) => {
    acc[f.type] = (acc[f.type] || 0) + 1;
    acc.all = (acc.all || 0) + 1;
    return acc;
  }, { all: 0, video: 0, audio: 0, image: 0, document: 0 });

  const mediaFiles = (browseData.files || []).filter(f => ['video', 'audio', 'image'].includes(f.type));
  const unanalyzedMediaCount = mediaFiles.filter(f => f.perceptionStatus !== 'completed' && f.perceptionStatus !== 'processing').length;
  const processingCount = mediaFiles.filter(f => f.perceptionStatus === 'processing' || f.perceptionStatus === 'queued').length;

  return (
    <div className="h-full flex flex-col bg-dark-950/60 border-l border-dark-700 select-none relative">
      {/* 1. 顶部工具栏 (不显示当前关联的目录路径，保持视觉纯粹) */}
      <div className="p-4 border-b border-dark-700/80 bg-dark-900/70 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            {/* 切换网格大小 (小中大) 纯图标按钮 */}
            <button
              type="button"
              onClick={cycleGridSize}
              className="p-2 bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-brand-cyan border border-dark-700/80 rounded-xl transition shadow-sm active:scale-95 cursor-pointer group"
              title={`网格大小: ${currentGrid.label} (点击切换为: ${currentGrid.nextLabel})`}
            >
              <GridIcon className="w-4 h-4 text-brand-cyan transition-transform group-hover:scale-110" />
            </button>

            <div className="w-8 h-8 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-cyan">
              <FolderTree className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                <span>项目素材库</span>
                <span className="text-xs font-mono text-gray-400 bg-dark-800 px-2 py-0.5 rounded-full border border-dark-700">
                  {browseData.files.length} 个素材
                </span>
              </h3>
              <p className="text-xs text-gray-400">
                多模态分类检索、卡片流预览与一键引入对话
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            {/* 批量多模态感知按钮 */}
            <button
              onClick={handleBatchAnalyze}
              disabled={isBatchAnalyzing || (unanalyzedMediaCount === 0 && processingCount === 0)}
              className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center space-x-1.5 transition border ${
                processingCount > 0
                  ? 'bg-amber-950/40 text-amber-300 border-amber-500/40 animate-pulse'
                  : unanalyzedMediaCount > 0
                  ? 'bg-brand-600/20 hover:bg-brand-600 text-brand-cyan hover:text-white border-brand-500/40 shadow-sm cursor-pointer'
                  : 'bg-dark-800 text-gray-500 border-dark-700 cursor-default'
              }`}
              title="一键将素材加入多模态深度感知队列（零拷贝CAS存储，跨项目零耗时复用）"
            >
              {processingCount > 0 || isBatchAnalyzing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-brand-cyan" />
              )}
              <span>
                {processingCount > 0
                  ? `感知中 (${processingCount})`
                  : isBatchAnalyzing
                  ? '提交中...'
                  : unanalyzedMediaCount > 0
                  ? `批量感知 (${unanalyzedMediaCount})`
                  : '全量已感知 ✓'}
              </span>
            </button>

            {onOpenWebBrowser && (
              <button
                onClick={onOpenWebBrowser}
                className="px-2.5 py-1.5 bg-gradient-to-r from-teal-500/10 to-brand-500/10 hover:from-teal-600 hover:to-brand-600 border border-teal-500/40 text-teal-300 hover:text-white rounded-lg text-xs flex items-center space-x-1.5 transition active:scale-95 shadow-sm"
                title="在线查找网络图片与视频资料（内嵌浏览、极速抓取、免版权库）"
              >
                <Globe className="w-3.5 h-3.5 text-teal-400" />
                <span>查找网络资料</span>
              </button>
            )}

            <button
              onClick={handleOpenNativeFolder}
              className="px-2.5 py-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-lg text-gray-300 hover:text-white text-xs flex items-center space-x-1.5 transition"
              title="在系统资源管理器中打开此文件夹"
            >
              <FolderOpen className="w-3.5 h-3.5 text-brand-cyan" />
              <span>打开目录</span>
            </button>
            <button
              onClick={fetchBrowseData}
              disabled={isLoading}
              className="p-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-lg text-gray-300 hover:text-white transition"
              title="刷新目录"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-brand-cyan' : ''}`} />
            </button>
          </div>
        </div>

        {/* 智能检索搜索栏与模式切换 */}
        <div className="flex flex-col space-y-2">
          <div className="relative flex items-center">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
              {isSearching ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-cyan" />
              ) : searchMode === 'semantic' ? (
                <Sparkles className="w-3.5 h-3.5 text-brand-cyan" />
              ) : (
                <Search className="w-3.5 h-3.5 text-gray-500" />
              )}
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchMode === 'semantic' ? "智能语义搜素材 (例如: 黄金前3秒/高能打斗/治愈唯美/135bpm)..." : "搜索素材文件名..."}
              className="w-full bg-dark-800 border border-dark-700 rounded-xl pl-9 pr-28 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-brand-500 transition"
            />

            {/* 右侧操作按钮群：清除按钮 + 模式切换 */}
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center space-x-1">
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-dark-700 transition cursor-pointer"
                  title="清空搜索"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              {/* 检索模式切换 */}
              <button
                type="button"
                onClick={() => setSearchMode(prev => prev === 'semantic' ? 'filename' : 'semantic')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition flex items-center space-x-1 cursor-pointer border-0 ring-0 outline-none ${
                  searchMode === 'semantic'
                    ? 'bg-brand-600 hover:bg-brand-500 text-white'
                    : 'bg-dark-700 hover:bg-dark-600 text-gray-300 hover:text-white'
                }`}
                title={searchMode === 'semantic' ? '当前: 语义智搜模式 (点击切换为文件名匹配)' : '当前: 文件名匹配模式 (点击切换为语义智搜)'}
              >
                {searchMode === 'semantic' ? (
                  <>
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>语义智搜</span>
                  </>
                ) : (
                  <>
                    <Search className="w-2.5 h-2.5" />
                    <span>文件名</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 快捷语义寻素材推荐标签与索引状态 */}
          <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5 text-[11px] no-scrollbar">
            <span className="text-gray-400 font-medium shrink-0 flex items-center space-x-1 text-[10px]">
              <Wand2 className="w-3 h-3 text-brand-cyan" />
              <span>速搜:</span>
            </span>
            {QUICK_SEMANTIC_TAGS.map((t, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setSearchMode('semantic');
                  setSearchQuery(t.query);
                }}
                className={`px-2 py-0.5 rounded-full whitespace-nowrap transition text-[11px] cursor-pointer border-0 ring-0 ${
                  searchQuery === t.query && searchMode === 'semantic'
                    ? 'bg-brand-600/25 text-brand-cyan font-medium'
                    : 'bg-dark-800/80 hover:bg-dark-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}

            {/* 重建检索索引按钮 */}
            <button
              type="button"
              onClick={handleReindex}
              disabled={isReindexing}
              className="px-2 py-0.5 rounded-full bg-dark-800 hover:bg-dark-700 text-gray-400 hover:text-gray-200 text-[10px] flex items-center space-x-1 shrink-0 ml-auto transition cursor-pointer border-0 ring-0"
              title="扫描 CAS 库并刷新零拷贝向量语义索引"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${isReindexing ? 'animate-spin text-brand-cyan' : ''}`} />
              <span>{isReindexing ? '重建中...' : '刷新索引'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Type Filter Tabs */}
      <div className="px-4 py-2 border-b border-dark-700/60 bg-dark-900/50 flex items-center space-x-1.5 overflow-x-auto text-xs">
        {[
          { id: 'all', label: '全部', count: typeCounts.all || 0 },
          { id: 'video', label: '视频 🎬', count: typeCounts.video || 0 },
          { id: 'audio', label: '音频 🎵', count: typeCounts.audio || 0 },
          { id: 'image', label: '图片 🖼️', count: typeCounts.image || 0 },
          { id: 'document', label: '资料 📄', count: typeCounts.document || 0 },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setSelectedType(t.id)}
            className={`px-2.5 py-1 rounded-lg transition font-medium whitespace-nowrap flex items-center space-x-1.5 ${
              selectedType === t.id
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200 hover:bg-dark-800'
            }`}
          >
            <span>{t.label}</span>
            <span className={`text-[10px] px-1 py-0.2 rounded-full ${
              selectedType === t.id ? 'bg-black/30 text-white' : 'bg-dark-800 text-gray-500'
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* 2.5 Mount Directory Filter Chips (when multiple directories are mounted) */}
      {browseData.currentDirs && browseData.currentDirs.length > 1 && (
        <div className="px-4 py-1.5 border-b border-dark-800 bg-dark-900/60 flex items-center space-x-2 overflow-x-auto text-[11px]">
          <span className="text-gray-400 font-medium shrink-0 flex items-center space-x-1">
            <FolderTree className="w-3.5 h-3.5 text-teal-400" />
            <span>挂载目录:</span>
          </span>
          <button
            onClick={() => setSelectedRootDir('all')}
            className={`px-2 py-0.5 rounded transition ${
              selectedRootDir === 'all'
                ? 'bg-teal-900/80 text-teal-200 font-semibold border border-teal-700/80'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            全部 ({browseData.currentDirs.length})
          </button>
          {browseData.currentDirs.map(cd => (
            <button
              key={cd.path}
              onClick={() => setSelectedRootDir(cd.path)}
              className={`px-2 py-0.5 rounded transition flex items-center space-x-1 whitespace-nowrap ${
                selectedRootDir === cd.path
                  ? 'bg-teal-950 text-teal-300 border border-teal-600 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-dark-800'
              }`}
              title={cd.path}
            >
              <span>📂 {cd.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 3. Subdirectory Filter Chips (if any exist) */}
      {browseData.subDirs && browseData.subDirs.length > 0 && (
        <div className="px-4 py-1.5 border-b border-dark-800 bg-dark-950/40 flex items-center space-x-2 overflow-x-auto text-[11px]">
          <span className="text-gray-500 shrink-0">子目录:</span>
          <button
            onClick={() => setSelectedSubDir('all')}
            className={`px-2 py-0.5 rounded transition ${
              selectedSubDir === 'all'
                ? 'bg-dark-700 text-white font-semibold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            全部
          </button>
          {browseData.subDirs.map(sd => (
            <button
              key={sd}
              onClick={() => setSelectedSubDir(sd)}
              className={`px-2 py-0.5 rounded transition flex items-center space-x-1 whitespace-nowrap ${
                selectedSubDir === sd
                  ? 'bg-brand-950 text-brand-cyan border border-brand-800 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-dark-800'
              }`}
            >
              <span>📁 {sd}</span>
            </button>
          ))}
        </div>
      )}

      {/* 4. 瀑布流内容展示区 (响应式网格/瀑布流排布，纯内联预览，绝不弹窗) */}
      <div className="flex-1 overflow-y-auto p-4">
        {filteredFiles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
              searchQuery.trim() && searchMode === 'semantic'
                ? 'bg-brand-950/60 border border-brand-500/30 text-brand-cyan shadow-lg shadow-brand-500/10'
                : 'bg-dark-800 text-gray-500'
            }`}>
              {searchQuery.trim() && searchMode === 'semantic' ? (
                <Sparkles className="w-6 h-6" />
              ) : (
                <FolderOpen className="w-6 h-6" />
              )}
            </div>
            <h4 className="text-sm font-semibold text-gray-300">
              {searchQuery.trim()
                ? `未找到与「${searchQuery}」${searchMode === 'semantic' ? '语义契合' : '匹配'}的素材`
                : '未找到匹配的素材文件'}
            </h4>
            <p className="text-xs text-gray-500 max-w-sm">
              {searchQuery.trim() && searchMode === 'semantic'
                ? '可尝试更换语义描述（如“高能BOSS战”、“128bpm快节奏”），或先对素材进行【批量感知】以生成深度视觉与声学标签。'
                : '当前目录暂无对应类型文件，可在系统资源管理器中将录屏、音频或攻略资料复制到素材目录。'}
            </p>
            {searchQuery.trim() && (
              <div className="flex items-center space-x-2 pt-2">
                {searchMode === 'semantic' && (
                  <button
                    type="button"
                    onClick={() => setSearchMode('filename')}
                    className="px-3 py-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-xl text-xs text-gray-300 hover:text-white transition cursor-pointer"
                  >
                    切换为文件名匹配
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-3 py-1.5 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-xl text-xs text-gray-300 hover:text-white transition cursor-pointer"
                >
                  清空搜索
                </button>
                <button
                  type="button"
                  onClick={handleReindex}
                  disabled={isReindexing}
                  className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center space-x-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isReindexing ? 'animate-spin' : ''}`} />
                  <span>重建语义索引</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={currentGrid.gridClass}>
            {filteredFiles.map((file, idx) => {
              const isVideo = file.type === 'video';
              const isAudio = file.type === 'audio';
              const isImage = file.type === 'image';
              const isDocument = file.type === 'document';
              const isInlineAudioPlaying = inlineAudioUrl === apiUrl(`${API_BASE}/assets/stream?path=${encodeURIComponent(file.path)}`);
              const streamUrl = apiUrl(`${API_BASE}/assets/stream?path=${encodeURIComponent(file.path)}`);
              const thumbUrl = file.thumbnail || apiUrl(`${API_BASE}/assets/thumbnail?path=${encodeURIComponent(file.path)}`);

              return (
                <div
                  key={file.path || idx}
                  className="mb-1 group relative rounded-2xl bg-dark-900/90 border border-dark-700/80 hover:border-brand-500/50 shadow-md transition-colors duration-150 overflow-hidden flex flex-col"
                >
                  {/* ========================================================= */}
                  {/* 1. 视频卡片：封面 + Hover 自动播放 + 鼠标移出自动暂停 + 点击弹窗完整播放 */}
                  {/* ========================================================= */}
                  {isVideo && (
                    <div 
                      className="relative w-full overflow-hidden bg-black aspect-video flex items-center justify-center cursor-pointer group/video"
                      onMouseEnter={() => {
                        const el = videoRefs.current[file.path] || document.getElementById(`asset-video-${file.path}`);
                        if (el) {
                          try {
                            const p = el.play();
                            if (p && typeof p.catch === 'function') {
                              p.catch((err) => {
                                if (err?.name === 'AbortError') return;
                              });
                            }
                          } catch {}
                        }
                      }}
                      onMouseLeave={() => {
                        const el = videoRefs.current[file.path] || document.getElementById(`asset-video-${file.path}`);
                        if (el) {
                          try {
                            el.pause();
                          } catch {}
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const el = videoRefs.current[file.path] || document.getElementById(`asset-video-${file.path}`);
                        const startTime = el ? el.currentTime : (hoverTimesRef.current[file.path] || 0);
                        handleOpenVideoPlayerModal(file, startTime);
                      }}
                    >
                      <video
                        ref={(el) => {
                          if (el) videoRefs.current[file.path] = el;
                        }}
                        id={`asset-video-${file.path}`}
                        src={`${streamUrl}#t=0.5`}
                        poster={thumbUrl}
                        preload="metadata"
                        muted
                        loop
                        playsInline
                        onTimeUpdate={(e) => {
                          hoverTimesRef.current[file.path] = e.target.currentTime;
                        }}
                        className="w-full h-full object-cover pointer-events-none"
                        title="点击弹窗完整播放 (已记忆播放进度)"
                      />

                      {/* 左上角胶囊徽标与感知状态 */}
                      <div className="absolute top-2.5 left-2.5 flex items-center space-x-1.5 z-20">
                            <div className="rounded-full bg-black/70 backdrop-blur-md border border-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/90 shadow flex items-center space-x-1 pointer-events-none">
                              <Video className="w-3 h-3 text-brand-cyan" />
                              <span>{file.ext.toUpperCase().replace('.', '')}</span>
                            </div>

                            {file.perceptionStatus === 'completed' ? (
                              <button
                                type="button"
                                onClick={(e) => handleOpenPerceptionModal(e, file)}
                                className="px-2 py-0.5 rounded-full bg-emerald-950/85 hover:bg-emerald-900 border border-emerald-500/50 text-[10px] font-medium text-emerald-300 flex items-center space-x-1 backdrop-blur-md shadow transition cursor-pointer"
                                title="点击查看深度感知分析详情 (CAS零拷贝存储)"
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                <span>已感知</span>
                              </button>
                            ) : file.perceptionStatus === 'processing' ? (
                              <div className="px-2 py-0.5 rounded-full bg-cyan-950/85 border border-cyan-500/50 text-[10px] font-medium text-cyan-300 flex items-center space-x-1 backdrop-blur-md animate-pulse">
                                <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                                <span>感知中</span>
                              </div>
                            ) : file.perceptionStatus === 'queued' ? (
                              <div className="px-2 py-0.5 rounded-full bg-dark-900/85 border border-dark-600 text-[10px] font-medium text-gray-400 flex items-center space-x-1 backdrop-blur-md">
                                <Clock className="w-3 h-3 text-gray-400" />
                                <span>排队中</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => handleAnalyzeFile(e, file)}
                                className="px-2 py-0.5 rounded-full bg-brand-950/80 hover:bg-brand-600 border border-brand-500/40 text-[10px] font-medium text-brand-cyan hover:text-white flex items-center space-x-1 backdrop-blur-md transition shadow cursor-pointer"
                                title="点击触发 Vision Scout 深度感知"
                              >
                                <Sparkles className="w-3 h-3 text-brand-cyan" />
                                <span>感知</span>
                              </button>
                            )}

                            {file.semanticScorePercent && (
                              <div className="px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 text-[10px] font-bold text-white flex items-center space-x-1 shadow-lg ring-1 ring-white/20 animate-fade-in pointer-events-none">
                                <Sparkles className="w-3 h-3 text-yellow-300" />
                                <span>{file.semanticScorePercent}% 契合</span>
                              </div>
                            )}
                          </div>

                      {/* 右上角浮岛操作栏 (Hover 浮现，一键引用至对话) */}
                      <div className="absolute top-2.5 right-2.5 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="flex items-center space-x-1 rounded-full bg-black/75 backdrop-blur-md border border-white/15 p-1 shadow-2xl text-white">
                          <button
                            type="button"
                            onClick={(e) => handleTriggerAddToChat(e, file)}
                            className="px-2.5 py-1 text-xs font-medium text-brand-cyan hover:text-white hover:bg-brand-600 rounded-full transition flex items-center space-x-1 cursor-pointer"
                            title="将此视频引用到 Agent 对话框（插入素材标签）"
                          >
                            <MessageSquarePlus className="w-3.5 h-3.5" />
                            <span>引用</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================= */}
                  {/* 2. 音频卡片：仿真动态声波波形 + 内联试听按钮 (参考 meocox-cut) */}
                  {/* ========================================================= */}
                  {isAudio && (
                    <div className="relative w-full p-4 bg-gradient-to-br from-dark-900 via-dark-850 to-dark-950 flex flex-col justify-between min-h-[160px]">
                      {/* 顶栏：左侧格式大小与感知状态，右侧引用操作 */}
                      <div className="flex items-center justify-between z-10">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                          <span className="text-xs font-semibold text-brand-cyan flex items-center space-x-1">
                            <Music className="w-3.5 h-3.5 text-brand-cyan" />
                            <span>{file.ext.toUpperCase().replace('.', '')}</span>
                          </span>
                          <span className="text-gray-600">·</span>
                          <span className="text-xs font-mono text-gray-400">
                            {file.sizeFormatted}
                          </span>
                          {file.perceptionStatus === 'completed' ? (
                            <button
                              type="button"
                              onClick={(e) => handleOpenPerceptionModal(e, file)}
                              className="px-1.5 py-0.2 rounded-full bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 text-[10px] text-emerald-300 flex items-center space-x-0.5 ml-1 transition cursor-pointer"
                              title="点击查看音频感知报告"
                            >
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                              <span>已感知</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleAnalyzeFile(e, file)}
                              className="px-1.5 py-0.2 rounded-full bg-brand-950/80 hover:bg-brand-600 border border-brand-500/40 text-[10px] text-brand-cyan hover:text-white flex items-center space-x-0.5 ml-1 transition cursor-pointer"
                              title="点击触发音频感知"
                            >
                              <Sparkles className="w-2.5 h-2.5" />
                              <span>感知</span>
                            </button>
                          )}
                          {file.semanticScorePercent && (
                            <span className="px-1.5 py-0.2 rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 text-[10px] font-bold text-white flex items-center space-x-1 shadow-sm ml-1 pointer-events-none">
                              <Sparkles className="w-2.5 h-2.5 text-yellow-300 shrink-0" />
                              <span>{file.semanticScorePercent}% 契合</span>
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => handleTriggerAddToChat(e, file)}
                          className="px-2 py-0.5 text-xs text-brand-cyan hover:text-white hover:bg-brand-600 rounded-md transition flex items-center space-x-1 border border-brand-500/30 cursor-pointer"
                          title="将此音频引用到 Agent 对话框（插入素材标签）"
                        >
                          <MessageSquarePlus className="w-3 h-3" />
                          <span>引用</span>
                        </button>
                      </div>

                      {/* 中间核心：左侧微型播放圆钮 + 右侧平滑能量声波 */}
                      <div className="my-3 flex items-center space-x-3 z-10">
                        <button
                          type="button"
                          onClick={(e) => togglePlayAudio(e, file)}
                          title={isInlineAudioPlaying ? '暂停' : '试听'}
                          className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-white shadow-md transition-all active:scale-95 cursor-pointer ${
                            isInlineAudioPlaying
                              ? 'bg-gradient-to-r from-amber-500 to-orange-500 ring-4 ring-amber-500/20 shadow-orange-500/30'
                              : 'bg-gradient-to-r from-teal-500 to-cyan-600 hover:brightness-110 shadow-cyan-500/20'
                          }`}
                        >
                          {isInlineAudioPlaying ? (
                            <Pause className="w-4 h-4 fill-white" />
                          ) : (
                            <Play className="w-4 h-4 fill-white ml-0.5" />
                          )}
                        </button>

                        {/* 自然能量平滑声波谱 */}
                        <div className="flex-1 flex items-center justify-between gap-[2px] h-9 px-2.5 py-1 bg-dark-950/70 rounded-xl border border-dark-800 overflow-hidden">
                          {SOUND_BARS.map((h, i) => (
                            <div
                              key={i}
                              className={`w-[2.5px] rounded-full transition-all duration-200 ${
                                isInlineAudioPlaying
                                   ? 'bg-gradient-to-t from-teal-400 to-cyan-300 shadow-[0_0_6px_rgba(20,184,166,0.6)] animate-pulse'
                                  : 'bg-gray-600/70 group-hover:bg-cyan-500/50'
                              }`}
                              style={{
                                height: isInlineAudioPlaying
                                  ? `${Math.max(18, h * (i % 2 === 0 ? 1 : 0.8))}%`
                                  : `${Math.max(14, h * 0.5)}%`
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================= */}
                  {/* 3. 图片卡片：原比例全铺 + 自然瀑布流 */}
                  {/* ========================================================= */}
                  {isImage && (
                    <div className="relative w-full overflow-hidden bg-dark-950">
                      <img
                        src={streamUrl}
                        alt={file.name}
                        loading="lazy"
                        className="w-full h-auto block object-cover"
                      />

                      {/* 左上角徽标与感知 */}
                      <div className="absolute top-2.5 left-2.5 flex items-center space-x-1.5 z-20">
                        <div className="rounded-full bg-black/60 backdrop-blur-md border border-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/90 shadow flex items-center space-x-1 pointer-events-none">
                          <ImageIcon className="w-3 h-3 text-emerald-400" />
                          <span>{file.ext.toUpperCase().replace('.', '')}</span>
                        </div>
                        {file.perceptionStatus === 'completed' ? (
                          <button
                            type="button"
                            onClick={(e) => handleOpenPerceptionModal(e, file)}
                            className="px-1.5 py-0.5 rounded-full bg-emerald-950/85 hover:bg-emerald-900 border border-emerald-500/50 text-[10px] font-medium text-emerald-300 flex items-center space-x-0.5 backdrop-blur-md shadow transition cursor-pointer"
                            title="查看图片感知详情"
                          >
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                            <span>已感知</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleAnalyzeFile(e, file)}
                            className="px-1.5 py-0.5 rounded-full bg-brand-950/80 hover:bg-brand-600 border border-brand-500/40 text-[10px] font-medium text-brand-cyan hover:text-white flex items-center space-x-0.5 backdrop-blur-md transition shadow cursor-pointer"
                            title="点击触发图片感知"
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>感知</span>
                          </button>
                        )}
                        {file.semanticScorePercent && (
                          <div className="px-1.5 py-0.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 text-[10px] font-bold text-white flex items-center space-x-1 backdrop-blur-md shadow-md pointer-events-none">
                            <Sparkles className="w-2.5 h-2.5 text-yellow-300 shrink-0" />
                            <span>{file.semanticScorePercent}% 契合</span>
                          </div>
                        )}
                      </div>

                      {/* 右上角浮岛操作栏 */}
                      <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button
                          type="button"
                          onClick={(e) => handleTriggerAddToChat(e, file)}
                          className="px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-xs font-medium text-brand-cyan hover:text-white hover:bg-brand-600 transition flex items-center space-x-1 shadow-2xl cursor-pointer"
                          title="将此图片引用到 Agent 对话框（插入素材标签）"
                        >
                          <MessageSquarePlus className="w-3.5 h-3.5" />
                          <span>引用</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ========================================================= */}
                  {/* 4. 文档资料卡片：清爽暗黑卡片 */}
                  {/* ========================================================= */}
                  {isDocument && (
                    <div className="p-4 bg-gradient-to-br from-dark-900 to-dark-850 flex flex-col justify-between min-h-[130px]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          <FileText className="w-4 h-4 text-amber-400" />
                          <span className="text-xs font-semibold text-amber-300">
                            文档 · {file.ext.toUpperCase().replace('.', '')}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleTriggerAddToChat(e, file)}
                          className="px-2 py-0.5 text-xs text-amber-300 hover:text-white hover:bg-amber-600 rounded-md transition flex items-center space-x-1 border border-amber-500/30 cursor-pointer"
                          title="将此文档引用到 Agent 对话框（插入素材标签）"
                        >
                          <MessageSquarePlus className="w-3.5 h-3.5" />
                          <span>引用</span>
                        </button>
                      </div>
                      <div className="my-2 p-2 rounded-lg bg-dark-950/60 border border-dark-800 text-[11px] font-mono text-gray-400 line-clamp-2">
                        {file.relPath}
                      </div>
                    </div>
                  )}

                  {/* 底部信息栏（文件名、大小、子目录与感知标签预览） */}
                  <div className={`${currentGrid.padding} border-t border-dark-800/80 bg-dark-900/90 flex flex-col space-y-1`}>
                    <div 
                      onClick={(e) => {
                        if (isVideo) {
                          e.stopPropagation();
                          const vEl = videoRefs.current[file.path] || document.getElementById(`asset-video-${file.path}`);
                          const startTime = vEl ? vEl.currentTime : (hoverTimesRef.current[file.path] || 0);
                          handleOpenVideoPlayerModal(file, startTime);
                        }
                      }}
                      className={`font-semibold text-gray-200 group-hover:text-brand-cyan transition truncate tracking-tight ${
                        isVideo ? 'cursor-pointer hover:underline' : ''
                      } ${currentGrid.titleSize}`}
                      title={isVideo ? `点击弹窗播放: ${file.name}` : file.name}
                    >
                      {file.name}
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400 font-mono">
                      <span>{file.sizeFormatted}</span>
                      <div className="flex items-center space-x-1 truncate max-w-[160px]">
                        {browseData.currentDirs && browseData.currentDirs.length > 1 && file.rootLabel && (
                          <span 
                            className="text-[10px] text-teal-300 bg-teal-950/80 px-1.5 py-0.2 rounded border border-teal-800/60 truncate"
                            title={`挂载目录: ${file.rootDir}`}
                          >
                            📂 {file.rootLabel}
                          </span>
                        )}
                        {file.subDir && file.subDir !== '.' && (
                          <span className="text-[11px] text-gray-400 bg-dark-800 px-1.5 py-0.5 rounded border border-dark-700/60 truncate max-w-[100px]">
                            📁 {file.subDir}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* 语义检索命中高亮或感知标签预览 */}
                    {file.semanticScorePercent ? (
                      <div className="pt-1.5 flex flex-col space-y-1">
                        <div className="flex items-center space-x-1.5 overflow-hidden flex-wrap gap-y-1">
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 flex items-center space-x-1 shrink-0">
                            <Sparkles className="w-2.5 h-2.5 text-yellow-400 shrink-0" />
                            <span>{file.semanticScorePercent}% 契合</span>
                          </span>
                          {file.matchedTerms && file.matchedTerms.slice(0, 3).map((term, tIdx) => (
                            <span key={tIdx} className="text-[10px] px-1 py-0.2 rounded bg-brand-950/80 text-brand-cyan border border-brand-800/60 font-medium truncate max-w-[80px]">
                              {term}
                            </span>
                          ))}
                        </div>
                        {file.highlights && file.highlights[0] && (
                          <p className="text-[11px] text-gray-300 line-clamp-1 bg-dark-950/70 px-1.5 py-0.5 rounded border border-dark-800/80 text-left" title={file.highlights[0]}>
                            ⚡ {file.highlights[0]}
                          </p>
                        )}
                      </div>
                    ) : file.perception ? (
                      <div className="pt-1 flex items-center space-x-1 overflow-hidden">
                        <span 
                          onClick={(e) => handleOpenPerceptionModal(e, file)}
                          className="text-[10px] text-brand-cyan bg-brand-950/60 hover:bg-brand-900 px-1.5 py-0.5 rounded border border-brand-800/60 truncate cursor-pointer transition flex items-center space-x-1"
                          title="点击展开完整感知报告"
                        >
                          <Cpu className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">
                            {file.perception?.video?.gameOrScene || file.perception?.audio?.tags?.[0] || file.perception?.image?.caption || '已完成感知'}
                          </span>
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4.5 完整视频播放器弹窗 (内置全功能播放控件，继承 Hover 进度无缝播放) */}
      {playingVideoModal && (
        <VideoPlayerModal
          file={playingVideoModal.file}
          startTime={playingVideoModal.startTime}
          streamPath={apiUrl(`${API_BASE}/assets/stream?path=${encodeURIComponent(playingVideoModal.file.path)}`)}
          onClose={handleCloseVideoPlayerModal}
          onAddToChat={onAddToChat ? (file) => {
            onAddToChat(file);
            toast.success(`已引入「${file.name}」到 Agent 对话`);
          } : null}
        />
      )}

      {/* 5. 深度感知多模态分析报告详情弹窗 (CAS零拷贝持久化) */}
      <Dialog open={!!perceptionModalData} onOpenChange={(open) => !open && setPerceptionModalData(null)}>
        <DialogContent showCloseButton={false} className="max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col bg-dark-900 border-dark-700 rounded-2xl shadow-2xl">
          {perceptionModalData && (
            <>
              {/* Header */}
              <div className="p-4 border-b border-dark-700/80 bg-dark-950/60 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-cyan">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <DialogTitle className="font-semibold text-sm text-white flex items-center space-x-2">
                      <span className="truncate max-w-md">{perceptionModalData.file?.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
                        CAS: {perceptionModalData.perception?.mediaId || perceptionModalData.file?.mediaId || 'mfp_synced'}
                      </span>
                    </DialogTitle>
                    <DialogDescription className="text-[11px] text-gray-400">
                      多模态工业级感知报告 · 全局 CAS 零拷贝存储
                    </DialogDescription>
                  </div>
                </div>
                <button
                  onClick={() => setPerceptionModalData(null)}
                  className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-dark-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* CAS Shared Architecture Banner */}
              <div className="p-2.5 bg-brand-950/30 border border-brand-500/30 rounded-xl flex items-center space-x-2 text-brand-cyan text-[11px]">
                <Cpu className="w-4 h-4 shrink-0" />
                <span>
                  <strong>CAS 内容寻址已就绪：</strong>所有项目均可零耗时引用该媒体感知结果，完全避免重复分析且不污染源文件目录。
                </span>
              </div>

              {/* Video Perception Detail */}
              {perceptionModalData.perception?.video && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-dark-800/80 p-3 rounded-xl border border-dark-700/80 space-y-1">
                      <div className="text-gray-400 font-medium">识别主题 / 场景</div>
                      <div className="text-gray-100 font-semibold text-sm">
                        {perceptionModalData.perception.video.gameOrScene}
                      </div>
                    </div>
                    <div className="bg-dark-800/80 p-3 rounded-xl border border-dark-700/80 space-y-1">
                      <div className="text-gray-400 font-medium">主体角色 / 生物</div>
                      <div className="text-gray-200">
                        {perceptionModalData.perception.video.charactersAndCreatures}
                      </div>
                    </div>
                  </div>

                  <div className="bg-dark-800/80 p-3 rounded-xl border border-dark-700/80 space-y-1.5">
                    <div className="text-gray-400 font-medium">核心视觉事件与动作</div>
                    <div className="text-gray-200 leading-relaxed">
                      {perceptionModalData.perception.video.visualActions}
                    </div>
                  </div>

                  {/* Editorial Advice */}
                  {perceptionModalData.perception.editorialAdvice && (
                    <div className="p-3 bg-gradient-to-r from-amber-950/30 to-brand-950/30 border border-amber-500/30 rounded-xl space-y-1.5">
                      <div className="text-amber-400 font-semibold flex items-center space-x-1.5">
                        <Zap className="w-3.5 h-3.5" />
                        <span>AI 编导建议</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-300">
                        <div>
                          <span className="text-gray-400">黄金钩子潜力：</span>
                          <span className="text-amber-300 font-medium">
                            {perceptionModalData.perception.editorialAdvice.hookPotential}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">推荐剪辑策略：</span>
                          <span>{perceptionModalData.perception.editorialAdvice.cutStrategy}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Keyframes preview */}
                  {perceptionModalData.perception.video.keyframes && perceptionModalData.perception.video.keyframes.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-gray-400 font-medium">关键帧抽样 ({perceptionModalData.perception.video.keyframes.length})</div>
                      <div className="grid grid-cols-3 gap-2">
                        {perceptionModalData.perception.video.keyframes.map((kf, i) => (
                          <div key={i} className="relative rounded-lg overflow-hidden border border-dark-700 bg-black aspect-video group">
                            <img 
                              src={apiUrl(`${API_BASE}/assets/stream?path=${encodeURIComponent(kf.filePath)}`)}
                              alt={`Keyframe ${kf.timestampFormatted}`}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-mono text-white">
                              {kf.timestampFormatted}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Audio Perception Detail */}
              {perceptionModalData.perception?.audio && (
                <div className="space-y-3 bg-dark-800/80 p-4 rounded-xl border border-dark-700">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-gray-400">节奏 BPM：</span>
                      <span className="text-brand-cyan font-bold font-mono ml-1">{perceptionModalData.perception.audio.bpm}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">语音占比：</span>
                      <span className="text-gray-200 font-mono ml-1">{((perceptionModalData.perception.audio.speechRatio || 0) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(perceptionModalData.perception.audio.tags || []).map(t => (
                      <span key={t} className="px-2 py-0.5 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-300 text-[10px]">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Image Perception Detail */}
              {perceptionModalData.perception?.image && (
                <div className="space-y-3 bg-dark-800/80 p-4 rounded-xl border border-dark-700">
                  <div className="text-gray-200">{perceptionModalData.perception.image.caption}</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(perceptionModalData.perception.image.tags || []).map(t => (
                      <span key={t} className="px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-[10px]">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-dark-700/80 bg-dark-950/80 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const p = perceptionModalData.perception;
                  const summary = p.video 
                    ? `【素材深度感知洞察】素材名：${perceptionModalData.file.name}\n- 场景：${p.video.gameOrScene}\n- 动作：${p.video.visualActions}\n- 编导建议：${p.editorialAdvice?.hookPotential || '高能镜头'}\n请结合此特征编排进分镜中。`
                    : `【素材感知洞察】素材名：${perceptionModalData.file.name}\n类型：${p.mediaType}\n请将此素材规划入片。`;
                  if (onAddAssetReference) onAddAssetReference(perceptionModalData.file);
                  if (onAddToChat) onAddToChat(summary);
                  setPerceptionModalData(null);
                  toast.success('已将深度感知报告与素材引用至对话框！');
                }}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shadow-lg shadow-brand-500/20 active:scale-95 cursor-pointer"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>引用洞察至编导对话</span>
              </button>

              <button
                type="button"
                onClick={() => setPerceptionModalData(null)}
                className="px-4 py-2 bg-dark-800 hover:bg-dark-700 text-gray-300 rounded-xl text-xs font-medium transition cursor-pointer"
              >
                关闭
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
    </div>
  );
}
