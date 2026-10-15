import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, Globe, RotateCw, Download, Check, 
  Search, Layers, Sparkles, FolderDown, Video, Image as ImageIcon,
  ExternalLink, ChevronDown, Clock, Loader2, CheckSquare, Square,
  Link2, Volume2, VolumeX, Monitor, Compass, Zap, FolderGit2, Database
} from 'lucide-react';
import { isDesktopApp, openDesktopWebview } from '../utils/desktop.js';
import { toast } from '@/components/ui/sonner.jsx';
import FolderInput from '@/components/ui/FolderInput.jsx';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog.jsx';
import { apiFetch } from '@/lib/apiClient.js';

const STORAGE_KEY_HISTORY = 'meocoxflow_web_history';
const DEFAULT_PRESETS = [
  { name: '🎬 Mixkit 免商用视频 (推荐)', url: 'https://mixkit.co', badge: '原生浏览' },
  { name: '🌍 维基开放多媒体 (公有领域)', url: 'https://commons.wikimedia.org', badge: '原生浏览' },
  { name: '🖼️ Wallhaven 4K视觉画廊', url: 'https://wallhaven.cc', badge: '原生浏览' },
  { name: '🔍 必应每日趋势壁纸', url: 'https://cn.bing.com/images/trending', badge: '原生浏览' },
  { name: '📹 Videvo 免费资料视频', url: 'https://www.videvo.net', badge: '原生浏览' },
  { name: '🛡️ Pixabay (免版税超清资料)', url: 'https://pixabay.com', badge: '原生浏览' },
  { name: '🛡️ Pexels (高质量免版税图片)', url: 'https://www.pexels.com', badge: '原生浏览' }
];

/**
 * 统一网络素材卡片组件 (用于免版税库 Mode C 与 极速嗅探 Mode B)
 * 功能特性：
 * 1. 视频常驻静止首帧/海报，绝不卸载变成黑洞，悬停即时播放，移出平滑暂停
 * 2. 单卡片独立声音控制 (Volume2/VolumeX)，不影响其他卡片
 * 3. 实时存入状态指示 (存入素材库 / 流式保存中 / 已存入素材库 / 失败重试)
 * 4. 支持可选的多选复选框 (嗅探模式批量勾选)
 */
function UnifiedMediaCard({
  item,
  isSelected,
  onToggleSelect,
  onSave,
  saveStatus,
  isSoundOn,
  onToggleSound,
  showSelectCheckbox = false
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isHoveredRef = useRef(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const videoRef = useRef(null);
  const synthRef = useRef(null);
  const playPromiseRef = useRef(null);

  // 严格强制更新 DOM 节点的 muted 与 volume 属性
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isSoundOn;
      if (isSoundOn) {
        videoRef.current.volume = 1.0;
      }
    }
    if (!isSoundOn) {
      stopAmbientAudio();
    }
  }, [isSoundOn]);

  // 组件卸载时彻底释放 WebAudio 上下文与振荡器节点，防止硬件音频句柄耗尽
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        try {
          (synthRef.current.nodes || []).forEach((n) => {
            try { n.stop(); } catch {}
          });
          if (synthRef.current.ctx && synthRef.current.ctx.state !== 'closed') {
            synthRef.current.ctx.close().catch(() => {});
          }
        } catch {}
        synthRef.current = null;
      }
    };
  }, []);

  // 电影级多层沉浸式声场合成器 (解决无原生音轨的 B-roll 空镜与实机视频在开启声音时依然静音的痛点)
  const playSynthesizedAmbient = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!synthRef.current) {
        synthRef.current = { ctx: new AudioCtx(), nodes: [], gain: null };
      }
      const { ctx } = synthRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      if (synthRef.current.nodes && synthRef.current.nodes.length > 0) return;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.28, ctx.currentTime + 0.15);
      masterGain.connect(ctx.destination);

      const activeNodes = [];

      // 1. 温暖的电影级环境和弦垫音 (A3 + E4 + C#5 温暖大三和弦垫底)
      const freqs = [220, 329.63, 554.37];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = idx === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(freq * 1.004, ctx.currentTime + 2.0);
        oscGain.gain.value = idx === 0 ? 0.35 : 0.20;
        osc.connect(oscGain);
        oscGain.connect(masterGain);
        osc.start();
        activeNodes.push(osc);
      });

      // 2. 模拟真实气流与开阔声场的微弱低频空气感
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.08;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, ctx.currentTime);
      noise.connect(filter);
      filter.connect(masterGain);
      noise.start();
      activeNodes.push(noise);

      synthRef.current.nodes = activeNodes;
      synthRef.current.gain = masterGain;
    } catch (e) {
      console.warn('Audio synthesis warning:', e);
    }
  };

  const stopAmbientAudio = () => {
    if (synthRef.current?.gain && synthRef.current?.ctx) {
      try {
        const { gain, ctx, nodes } = synthRef.current;
        gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        setTimeout(() => {
          if (nodes) {
            nodes.forEach(n => {
              try { n.stop(); } catch (err) {}
            });
          }
          if (synthRef.current) synthRef.current.nodes = [];
        }, 130);
      } catch (e) {
        if (synthRef.current) synthRef.current.nodes = [];
      }
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    isHoveredRef.current = true;
    if (videoRef.current) {
      videoRef.current.muted = !isSoundOn;
      if (isSoundOn) {
        videoRef.current.volume = 1.0;
      }
      try {
        const p = videoRef.current.play();
        playPromiseRef.current = p;
        if (p !== undefined && typeof p.catch === 'function') {
          p.catch((err) => {
            // AbortError 是用户快速移出触发 pause() 时的正常中断，安全忽略
            if (err?.name === 'AbortError') return;
            // 兜底：若因浏览器未交互禁止有声自动播放，退回静音播放
            if (isHoveredRef.current && videoRef.current && !videoRef.current.muted) {
              videoRef.current.muted = true;
              videoRef.current.play().catch(() => {});
            }
          });
        }
      } catch (e) {}
    }
    if (isSoundOn) {
      playSynthesizedAmbient();
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    isHoveredRef.current = false;
    if (videoRef.current) {
      if (playPromiseRef.current && typeof playPromiseRef.current.then === 'function') {
        playPromiseRef.current
          .then(() => {
            if (!isHoveredRef.current && videoRef.current) {
              try { videoRef.current.pause(); } catch {}
            }
          })
          .catch(() => {})
          .finally(() => {
            playPromiseRef.current = null;
          });
      }
      try {
        videoRef.current.pause();
      } catch {}
    }
    stopAmbientAudio();
  };

  const handleToggleSound = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const nextSound = !isSoundOn;
    if (videoRef.current) {
      videoRef.current.muted = !nextSound;
      if (nextSound) {
        videoRef.current.volume = 1.0;
      }
    }
    if (nextSound && isHovered) {
      playSynthesizedAmbient();
    } else {
      stopAmbientAudio();
    }
    if (onToggleSound) {
      onToggleSound(item.id || item.url, e);
    }
  };

  const isVideo = item.type === 'video' || /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(item.url || '');

  return (
    <div
      onClick={showSelectCheckbox ? onToggleSelect : undefined}
      className={`rounded-2xl border bg-dark-900 p-3 flex flex-col space-y-3 transition shadow-lg group select-none ${
        isSelected
          ? 'bg-brand-500/10 border-brand-500/60 ring-1 ring-brand-500/20'
          : 'border-dark-800 hover:border-dark-750'
      }`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 280px' }}
    >
      {/* 媒体预览窗口 (常驻渲染，悬停即播，移出即停，绝不出现黑屏，彻底杜绝任何彩色边框) */}
      <div
        className="relative w-full h-44 bg-dark-950 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer group/preview border-0 outline-none ring-0 focus:outline-none"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {isVideo ? (
          <>
            <video
              ref={videoRef}
              src={item.url}
              poster={item.poster || undefined}
              preload="metadata"
              playsInline
              loop
              muted={!isSoundOn}
              className="w-full h-full object-cover transition-transform duration-300 group-hover/preview:scale-105 border-0 outline-none ring-0 focus:outline-none focus:ring-0 shadow-none"
              onLoadedData={() => setVideoLoaded(true)}
            />

            {/* 当视频海报存在且视频数据尚未就绪时的封面底图 */}
            {!videoLoaded && item.poster && (
              <img
                src={item.poster}
                alt={item.title || item.name}
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                loading="lazy"
                decoding="async"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}

            {/* 单卡片独立声音控制纯图标按钮 (无背景，无边框，极简通透) */}
            <button
              type="button"
              onClick={handleToggleSound}
              className={`absolute top-2.5 right-2.5 z-20 p-1.5 transition-all cursor-pointer bg-transparent border-0 outline-none focus:outline-none ${
                isSoundOn
                  ? 'text-cyan-400 hover:text-cyan-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] scale-110'
                  : 'text-white/60 hover:text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]'
              }`}
              title={isSoundOn ? '单卡声音: 开 (点击仅静音此卡片)' : '单卡声音: 关 (点击仅为此卡片开声)'}
            >
              {isSoundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </>
        ) : (
          <img
            src={item.poster || item.url}
            alt={item.title || item.name}
            className="w-full h-full object-cover transition duration-300 group-hover/preview:scale-105"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250"><rect width="100%" height="100%" fill="%23111827"/><text x="50%" y="50%" fill="%2364748b" font-family="sans-serif" font-size="13" text-anchor="middle" dy=".3em">图片预览已失效</text></svg>';
            }}
          />
        )}

        {/* 顶部标签徽章 (类型与分辨率) */}
        <div className="absolute top-2.5 left-2.5 flex items-center space-x-1.5 z-10 pointer-events-none">
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
            isVideo ? 'bg-cyan-500/90 text-dark-950' : 'bg-amber-500/90 text-dark-950'
          }`}>
            {isVideo ? '🎥 视频' : '🖼️ 图片'}
          </span>
          {item.resolution && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/70 text-white backdrop-blur-sm">
              {item.resolution}
            </span>
          )}
        </div>

        {/* 底部时长徽标 */}
        {isVideo && item.duration && (
          <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded text-[10px] font-mono bg-black/80 text-white backdrop-blur-sm z-10 pointer-events-none">
            {item.duration}
          </span>
        )}

        {/* 多选勾选框 (嗅探模式使用) */}
        {showSelectCheckbox && (
          <div className="absolute bottom-2.5 left-2.5 z-20 text-white bg-black/70 p-1 rounded-md">
            {isSelected ? (
              <CheckSquare className="w-4 h-4 text-brand-cyan" />
            ) : (
              <Square className="w-4 h-4 text-gray-400" />
            )}
          </div>
        )}
      </div>

      {/* 底部信息与动作条 */}
      <div className="flex-1 flex flex-col justify-between space-y-2">
        <h4 className="text-xs font-semibold text-gray-200 line-clamp-1 leading-snug" title={item.title || item.name}>
          {item.title || item.name}
        </h4>

        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((t, tidx) => (
              <span key={tidx} className="text-[10px] px-1.5 py-0.5 rounded bg-dark-800 text-gray-400 font-mono">
                #{t}
              </span>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-dark-800 flex items-center justify-between">
          <span className="text-[11px] text-gray-500 font-mono truncate max-w-[120px]">
            {item.source || 'CC0 免版税'}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSave(item);
            }}
            disabled={saveStatus === 'downloading' || saveStatus === 'saved'}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shadow active:scale-95 ${
              saveStatus === 'saved'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : saveStatus === 'downloading'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : saveStatus === 'error'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/20'
            }`}
            title={saveStatus === 'saved' ? '已成功存入本地资料目录' : '保存至本地资料库'}
          >
            {saveStatus === 'saved' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>已存入资料库</span>
              </>
            ) : saveStatus === 'downloading' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>流式保存中...</span>
              </>
            ) : saveStatus === 'error' ? (
              <>
                <RotateCw className="w-3.5 h-3.5" />
                <span>重试保存</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>存入资料库</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WebMediaBrowserModal({ 
  isOpen, 
  onClose, 
  project,
  projectId,
  libraries: propLibraries,
  currentProject,
  onAssetSaved 
}) {
  // 模式切换: 'modeC' (免版权库) | 'modeB' (极速嗅探) | 'modeA' (桌面原生浏览/Web直连)
  const [activeMode, setActiveMode] = useState('modeC');

  // 历史 URL 与当前输入
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HISTORY) || localStorage.getItem('cutdirector_web_history');
      const list = saved ? JSON.parse(saved) : [];
      if (list.length > 0) return list;
      return ['https://mixkit.co'];
    } catch (e) {
      return ['https://mixkit.co'];
    }
  });

  const [currentUrl, setCurrentUrl] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HISTORY) || localStorage.getItem('cutdirector_web_history');
      const list = saved ? JSON.parse(saved) : [];
      if (list.length > 0 && list[0] !== 'https://pixabay.com') {
        return list[0];
      }
      return 'https://mixkit.co';
    } catch (e) {
      return 'https://mixkit.co';
    }
  });

  const [urlInput, setUrlInput] = useState(currentUrl);
  const [isHistoryDropdownOpen, setIsHistoryDropdownOpen] = useState(false);
  const historyDropdownRef = useRef(null);

  // 快捷媒体 URL 直存条
  const [isQuickDirectSaveOpen, setIsQuickDirectSaveOpen] = useState(false);
  const [directMediaUrl, setDirectMediaUrl] = useState('');
  const [directFilename, setDirectFilename] = useState('');
  const [isDirectSaving, setIsDirectSaving] = useState(false);
  const [directSaveMsg, setDirectSaveMsg] = useState(null);

  // Mode A: 嗅探到的媒体列表
  const [sniffedMedia, setSniffedMedia] = useState([]);

  // Mode B: 极速分析模式
  const [sniffingUrl, setSniffingUrl] = useState(currentUrl);
  const [batchResults, setBatchResults] = useState([]);
  const [isBatchSniffing, setIsBatchSniffing] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState(new Set());

  // Mode C: 免版权库
  const [stockQuery, setStockQuery] = useState('');
  const [stockType, setStockType] = useState('all'); // 'all' | 'video' | 'image'
  const [stockPage, setStockPage] = useState(1);
  const [stockItems, setStockItems] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockLoadingMore, setStockLoadingMore] = useState(false);
  const [hasMoreStock, setHasMoreStock] = useState(true);
  const [isSoundEnabled, setIsSoundEnabled] = useState(false); // 默认全局静音预览
  const [cardSoundOverrides, setCardSoundOverrides] = useState({}); // 单卡片独立声音覆盖映射
  const stockSentinelRef = useRef(null);
  const stockScrollContainerRef = useRef(null);

  // ── 目标保存目录选择状态 (优先项目绑定目录) ────────────────────────
  const [isDirPickerModalOpen, setIsDirPickerModalOpen] = useState(false);
  const [saveTargetItem, setSaveTargetItem] = useState(null);
  const [selectedSaveDir, setSelectedSaveDir] = useState('');
  const [customSaveDir, setCustomSaveDir] = useState('');
  const [isCustomDirActive, setIsCustomDirActive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [globalLibraries, setGlobalLibraries] = useState([]);
  const [projectLibraries, setProjectLibraries] = useState(propLibraries || []);

  const activeProject = project || currentProject;
  const activeProjectId = projectId || activeProject?.id;
  const projectAssetDir = activeProject?.assetDir || (activeProject?.path ? `${activeProject.path}/assets` : null);

  // 加载全局资料库与项目专属绑定资料库
  const loadLibraries = async () => {
    try {
      const res = await apiFetch('/api/libraries');
      if (res.ok) {
        const data = await res.json();
        setGlobalLibraries(data.libraries || []);
      }
    } catch (err) {
      console.warn('获取全局资料库失败:', err);
    }

    if (activeProjectId && (!propLibraries || propLibraries.length === 0)) {
      try {
        const pRes = await apiFetch(`/api/projects/${activeProjectId}/libraries`);
        if (pRes.ok) {
          const pData = await pRes.json();
          if (pData.libraries) setProjectLibraries(pData.libraries);
        }
      } catch (err) {
        console.warn('获取项目资料库失败:', err);
      }
    }
  };

  useEffect(() => {
    if (propLibraries && propLibraries.length > 0) {
      setProjectLibraries(propLibraries);
    }
  }, [propLibraries]);

  useEffect(() => {
    if (isOpen) {
      loadLibraries();
    }
  }, [isOpen, activeProjectId]);

  // 项目专属绑定的资料库列表 (过滤出有有效路径的)
  const projectBoundList = useMemo(() => {
    return (projectLibraries || []).filter(lib => Boolean(lib?.path));
  }, [projectLibraries]);

  // 全局资料库列表中未被项目绑定的其它目录
  const globalOtherList = useMemo(() => {
    const boundPaths = new Set(projectBoundList.map(l => l.path?.toLowerCase()));
    return (globalLibraries || []).filter(lib => lib.path && !boundPaths.has(lib.path.toLowerCase()));
  }, [globalLibraries, projectBoundList]);

  // 打开保存目录选择弹窗
  const openSaveDirModal = (itemOrItems) => {
    setSaveTargetItem(itemOrItems);

    let defaultDir = '';
    if (projectBoundList.length > 0) {
      defaultDir = projectBoundList[0].path;
    } else if (projectAssetDir) {
      defaultDir = projectAssetDir;
    } else if (globalLibraries.length > 0) {
      defaultDir = globalLibraries[0].path;
    }

    const lastSaved = localStorage.getItem('meocox_last_saved_dir');
    if (lastSaved) {
      const allKnown = [
        ...projectBoundList.map(l => l.path),
        projectAssetDir,
        ...globalLibraries.map(l => l.path)
      ].filter(Boolean);
      if (allKnown.includes(lastSaved)) {
        defaultDir = lastSaved;
      }
    }

    setSelectedSaveDir(defaultDir);
    setIsCustomDirActive(false);
    setIsDirPickerModalOpen(true);
  };

  // 判断指定卡片是否开声 (单卡覆盖优先，默认继承全局)
  const isCardSoundOn = (itemId) => {
    if (itemId in cardSoundOverrides) {
      return cardSoundOverrides[itemId];
    }
    return isSoundEnabled;
  };

  // 单卡片声音独立切换 (仅控制该卡片的视频)
  const toggleCardSound = (itemId, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setCardSoundOverrides(prev => {
      const current = (itemId in prev) ? prev[itemId] : isSoundEnabled;
      return { ...prev, [itemId]: !current };
    });
  };

  // 正在下载的状态映射: { [mediaUrl]: 'downloading' | 'saved' | 'error' }
  const [downloadStatus, setDownloadStatus] = useState({});

  // 自动持久化历史 URL
  const pushToHistory = (newUrl) => {
    if (!newUrl || !newUrl.startsWith('http')) return;
    setHistory(prev => {
      const filtered = prev.filter(u => u !== newUrl);
      const updated = [newUrl, ...filtered].slice(0, 20);
      try {
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  const handleNavigate = (target) => {
    let clean = (target || urlInput).trim();
    if (!clean) return;
    if (!/^https?:\/\//i.test(clean)) {
      clean = `https://${clean}`;
    }
    setUrlInput(clean);
    setCurrentUrl(clean);
    pushToHistory(clean);
    setIsHistoryDropdownOpen(false);

    // 桌面端环境：直接调用系统级 WebView2 唤起原生独立窗口
    if (isDesktopApp()) {
      openDesktopWebview(clean, `媒体浏览工作舱 - ${clean}`);
    } else {
      // 触发后端嗅探
      fetchServerSniff(clean);
    }
  };

  // 在系统默认外部浏览器或桌面原生 WebView2 打开当前网页
  const handleOpenExternal = async (urlToOpen) => {
    const target = urlToOpen || currentUrl;
    if (isDesktopApp()) {
      const opened = await openDesktopWebview(target, `媒体浏览工作舱 - ${target}`);
      if (opened) return;
    }
    try {
      await apiFetch('/api/proxy/open-external', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target })
      });
    } catch (e) {
      console.error('调用外部浏览器失败:', e);
    }
  };

  // 监听来自代理 iframe 内部与智能向导的 postMessage (仅在弹窗打开时挂载)
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleMessage = (event) => {
      if (!event.data) return;
      if (event.data.type === 'MEOCOXFLOW_SNIFFED_MEDIA' || event.data.type === 'CUTDIRECTOR_SNIFFED_MEDIA') {
        const items = event.data.items || [];
        if (items.length > 0) {
          setSniffedMedia(prev => {
            const seen = new Set(prev.map(i => i.url));
            const merged = [...prev];
            for (const item of items) {
              if (!seen.has(item.url)) {
                seen.add(item.url);
                merged.push(item);
              }
            }
            return merged;
          });
        }
      } else if (event.data.type === 'MEOCOXFLOW_SWITCH_MODE' || event.data.type === 'CUTDIRECTOR_SWITCH_MODE') {
        setActiveMode(event.data.mode || 'modeC');
        if (event.data.mode === 'modeC') {
          fetchStock(stockQuery);
        }
      } else if (event.data.type === 'MEOCOXFLOW_NAVIGATE' || event.data.type === 'CUTDIRECTOR_NAVIGATE') {
        if (event.data.url) {
          handleNavigate(event.data.url);
        }
      } else if (event.data.type === 'MEOCOXFLOW_OPEN_EXTERNAL' || event.data.type === 'CUTDIRECTOR_OPEN_EXTERNAL') {
        if (event.data.url) {
          handleOpenExternal(event.data.url);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen, stockQuery]);

  // 后端辅助深度嗅探
  const fetchServerSniff = async (url) => {
    try {
      const res = await apiFetch('/api/proxy/sniff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setSniffedMedia(prev => {
          const seen = new Set(prev.map(i => i.url));
          const merged = [...prev];
          for (const item of data.items) {
            if (!seen.has(item.url)) {
              seen.add(item.url);
              merged.push(item);
            }
          }
          return merged;
        });
      }
    } catch (e) {}
  };

  // 触发 Mode B 极速分析
  const handleRunBatchSniff = async () => {
    let clean = (sniffingUrl || urlInput).trim();
    if (!clean) return;
    if (!/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
    
    setIsBatchSniffing(true);
    setBatchResults([]);
    setSelectedBatchIds(new Set());
    pushToHistory(clean);

    try {
      const res = await apiFetch('/api/proxy/sniff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: clean })
      });
      const data = await res.json();
      if (data.success) {
        setBatchResults(data.items || []);
        // 默认全选
        const allIds = new Set((data.items || []).map(i => i.url));
        setSelectedBatchIds(allIds);
      }
    } catch (err) {
      console.error('极速嗅探失败:', err);
    } finally {
      setIsBatchSniffing(false);
    }
  };

  // 触发 Mode C 免版权库检索与分页拉取
  const fetchStock = async (query = stockQuery, type = stockType, page = 1) => {
    if (page === 1) {
      setStockLoading(true);
    } else {
      setStockLoadingMore(true);
    }

    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (type && type !== 'all') params.set('type', type);
      params.set('page', page);

      const res = await apiFetch(`/api/proxy/stock?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        const fetchedItems = data.items || [];
        if (page === 1) {
          setStockItems(fetchedItems);
        } else {
          setStockItems(prev => {
            const seen = new Set(prev.map(item => item.url));
            const newItems = fetchedItems.filter(item => !seen.has(item.url));
            return [...prev, ...newItems];
          });
        }
        setStockPage(page);
        // 如果后端返回的素材数量为 0 或者低于分页阈值，标记加载完毕
        setHasMoreStock(fetchedItems.length > 0);
      }
    } catch (err) {
      console.error('检索免版权库失败:', err);
    } finally {
      setStockLoading(false);
      setStockLoadingMore(false);
    }
  };

  const loadMoreStock = () => {
    if (stockLoading || stockLoadingMore || !hasMoreStock) return;
    fetchStock(stockQuery, stockType, stockPage + 1);
  };

  // 方案 C: 无限滚动加载监听器 (接近底部 250px 自动拉取下一页，直到没有)
  useEffect(() => {
    if (activeMode !== 'modeC' || !hasMoreStock) return;

    const sentinel = stockSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (entry && entry.isIntersecting) {
        if (!stockLoading && !stockLoadingMore && hasMoreStock) {
          fetchStock(stockQuery, stockType, stockPage + 1);
        }
      }
    }, {
      root: stockScrollContainerRef.current,
      rootMargin: '250px',
      threshold: 0.05
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeMode, hasMoreStock, stockLoading, stockLoadingMore, stockPage, stockQuery, stockType]);

  // 切换全局预览声音开关：直接开关所有视频，清除任何卡片的独立覆盖
  const toggleSound = (e) => {
    if (e) e.stopPropagation();
    setIsSoundEnabled(prev => {
      const next = !prev;
      setCardSoundOverrides({}); // 无论卡片之前有没有单独开关，全局开关一键统一步调
      return next;
    });
  };

  // 快捷键支持：按 M 键快速静音/恢复声音 (仅在弹窗打开时监听)
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'm' || e.key === 'M') {
        toggleSound();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // 初始化加载
  useEffect(() => {
    if (isOpen) {
      if (activeMode === 'modeC') {
        fetchStock(stockQuery, stockType, 1);
      } else if (activeMode === 'modeA') {
        handleNavigate(currentUrl);
      }
    }
  }, [isOpen, activeMode]);

  // 下载保存到本地资料库核心执行方法
  const executeSaveToAssetDir = async (mediaItem, targetDir) => {
    const mediaId = mediaItem.id || mediaItem.url;
    const mediaUrl = mediaItem.url;
    const downloadUrl = mediaItem.downloadUrl || mediaItem.url;

    if (downloadStatus[mediaId] === 'downloading' || downloadStatus[mediaId] === 'saved') {
      return;
    }

    setDownloadStatus(prev => ({ ...prev, [mediaId]: 'downloading' }));

    try {
      const activePId = projectId || project?.id || currentProject?.id || 'proj_1790427845711';
      const res = await apiFetch('/api/proxy/save-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activePId,
          targetDir,
          mediaUrl,
          downloadUrl,
          filename: mediaItem.name || mediaItem.title || 'web_media',
          mediaType: mediaItem.type || 'video'
        })
      });

      const data = await res.json();
      if (data.success) {
        setDownloadStatus(prev => ({ ...prev, [mediaId]: 'saved' }));
        toast.success(`资料「${data.filename || mediaItem.title || '网络资料'}」已成功保存至资料库！`, {
          description: data.savedPath
        });
        if (onAssetSaved) {
          onAssetSaved(data.asset);
        }
      } else {
        setDownloadStatus(prev => ({ ...prev, [mediaId]: 'error' }));
        toast.error(data.error || '保存资料失败，请检查网络后重试');
      }
    } catch (err) {
      console.error('保存资料异常:', err);
      setDownloadStatus(prev => ({ ...prev, [mediaId]: 'error' }));
      toast.error(`保存异常: ${err.message}`);
    }
  };

  // 点击卡片上的存入资料库按钮 (呼出目录选择)
  const handleSaveToAssetDir = (mediaItem) => {
    openSaveDirModal(mediaItem);
  };

  // 快捷直接粘贴 URL 存盘方法 (呼出目录选择)
  const handleQuickDirectSave = () => {
    const cleanUrl = directMediaUrl.trim();
    if (!cleanUrl) return;
    openSaveDirModal({
      isDirect: true,
      url: cleanUrl,
      name: directFilename.trim() || 'direct_network_asset'
    });
  };

  // 批量保存 (呼出目录选择)
  const handleBatchSaveSelected = () => {
    const toSave = batchResults.filter(item => selectedBatchIds.has(item.url));
    if (toSave.length === 0) return;
    openSaveDirModal(toSave);
  };

  // 确认在所选目录中执行存入
  const handleConfirmSaveToDir = async () => {
    if (!selectedSaveDir) {
      toast.error('请选择有效的保存目录');
      return;
    }

    localStorage.setItem('meocox_last_saved_dir', selectedSaveDir);

    // 如果只是在顶栏预设保存目录而无待存项目
    if (!saveTargetItem) {
      toast.success('已切换默认保存目录', { description: selectedSaveDir });
      setIsDirPickerModalOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      if (Array.isArray(saveTargetItem)) {
        for (const item of saveTargetItem) {
          await executeSaveToAssetDir(item, selectedSaveDir);
        }
      } else if (saveTargetItem?.isDirect) {
        const cleanUrl = saveTargetItem.url;
        const isVideo = /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(cleanUrl);
        const activePId = projectId || project?.id || currentProject?.id || 'proj_1790427845711';
        const res = await apiFetch('/api/proxy/save-asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: activePId,
            targetDir: selectedSaveDir,
            mediaUrl: cleanUrl,
            filename: saveTargetItem.name || 'direct_network_asset',
            mediaType: isVideo ? 'video' : 'image'
          })
        });

        const data = await res.json();
        if (data.success) {
          setDirectSaveMsg({ type: 'success', text: `成功存入资料库: ${data.filename}` });
          toast.success(`成功存入资料库: ${data.filename}`, { description: data.savedPath });
          setDirectMediaUrl('');
          setDirectFilename('');
          if (onAssetSaved) {
            onAssetSaved(data.asset);
          }
        } else {
          setDirectSaveMsg({ type: 'error', text: data.error || '保存失败' });
          toast.error(data.error || '保存失败');
        }
      } else if (saveTargetItem) {
        await executeSaveToAssetDir(saveTargetItem, selectedSaveDir);
      }

      setIsDirPickerModalOpen(false);
      setSaveTargetItem(null);
    } catch (err) {
      toast.error('保存失败: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-7xl h-[92vh] p-0 gap-0 overflow-hidden flex flex-col bg-dark-900 border-dark-700 rounded-2xl shadow-2xl text-gray-200">
        <DialogTitle className="sr-only">网络资料工作舱</DialogTitle>
        <DialogDescription className="sr-only">在线媒体嗅探、免版税资料检索与资料下载工作舱</DialogDescription>

        {/* 1. 顶部控制栏 (地址栏、模式切换、关闭) */}
        <div className="px-4 py-3 border-b border-dark-800 bg-dark-850/90 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          
          {/* 左侧：浏览器导航按键 + 地址栏 */}
          <div className="flex items-center space-x-2 w-full sm:w-auto flex-1 max-w-2xl">
            <div className="flex items-center space-x-1">
              <button 
                onClick={() => handleNavigate(currentUrl)} 
                className="p-1.5 text-gray-400 hover:text-white hover:bg-dark-750 rounded-lg transition"
                title="重新连接 / 嗅探网页"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button 
                onClick={() => handleOpenExternal(currentUrl)} 
                className="p-1.5 text-gray-400 hover:text-sky-300 hover:bg-dark-750 rounded-lg transition"
                title={isDesktopApp() ? "在系统原生 WebView2 独立窗口打开" : "在外部系统浏览器打开 (Chrome/Edge)"}
              >
                <ExternalLink className="w-4 h-4" />
              </button>
            </div>

            {/* URL 地址栏输入框 (带历史下拉) */}
            <div className="relative flex-1 flex items-center">
              <div className="w-full flex items-center bg-dark-950 border border-dark-750 focus-within:border-brand-500 rounded-xl px-3 py-1.5 text-xs text-gray-200 transition shadow-inner">
                <Globe className="w-3.5 h-3.5 text-brand-cyan mr-2 shrink-0" />
                <input 
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNavigate(urlInput)}
                  placeholder="输入网址或粘贴网页链接 (如: https://mixkit.co)..."
                  className="w-full bg-transparent outline-none text-xs text-white placeholder-gray-500"
                />
                
                {/* 历史记录按钮 */}
                <button
                  type="button"
                  onClick={() => setIsHistoryDropdownOpen(!isHistoryDropdownOpen)}
                  className="p-1 text-gray-400 hover:text-white hover:bg-dark-800 rounded transition ml-1 shrink-0"
                  title="历史访问网址与推荐"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 历史记录下拉弹窗 */}
              {isHistoryDropdownOpen && (
                <div 
                  ref={historyDropdownRef}
                  className="absolute left-0 right-0 top-full mt-1 bg-dark-800 border border-dark-700 rounded-xl shadow-2xl p-2 z-50 text-xs space-y-1 max-h-64 overflow-y-auto"
                >
                  <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-gray-400 border-b border-dark-700/60">
                    <span className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-brand-cyan" />
                      <span>历史记录与推荐站点</span>
                    </span>
                    <button 
                      onClick={() => {
                        localStorage.removeItem(STORAGE_KEY_HISTORY);
                        setHistory(['https://mixkit.co']);
                        setIsHistoryDropdownOpen(false);
                      }}
                      className="text-[10px] text-gray-500 hover:text-rose-400 transition"
                    >
                      清空历史
                    </button>
                  </div>

                  {history.map((hUrl, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleNavigate(hUrl)}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-dark-700 text-gray-300 hover:text-white truncate flex items-center justify-between group"
                    >
                      <span className="truncate">{hUrl}</span>
                      {idx === 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-brand-500/20 text-brand-cyan shrink-0 ml-2">
                          最新
                        </span>
                      )}
                    </button>
                  ))}

                  <div className="pt-1.5 border-t border-dark-700/60">
                    <div className="px-2 py-1 text-[10px] text-gray-400 font-semibold uppercase">
                      推荐精选资料站点
                    </div>
                    {DEFAULT_PRESETS.map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleNavigate(p.url)}
                        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-dark-700 text-gray-300 hover:text-brand-cyan flex items-center justify-between text-xs"
                      >
                        <span>{p.name}</span>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                            {p.badge}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => handleNavigate(urlInput)}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow transition shrink-0 active:scale-95"
            >
              前往
            </button>

            {/* 快速贴链入库开关 */}
            <button
              onClick={() => setIsQuickDirectSaveOpen(!isQuickDirectSaveOpen)}
              className={`p-1.5 rounded-xl border text-xs font-semibold transition shrink-0 ${
                isQuickDirectSaveOpen 
                  ? 'bg-teal-500/20 border-teal-500/40 text-teal-300' 
                  : 'bg-dark-800 border-dark-700 text-gray-400 hover:text-gray-200'
              }`}
              title="展开/收起【快捷媒体直链存盘】工具条"
            >
              <Link2 className="w-4 h-4" />
            </button>
          </div>

          {/* 中间/右侧：方案 A/B/C 切换器与关闭按钮 */}
          <div className="flex items-center space-x-3 shrink-0">
            
            {/* 目标资料目录指示器 (支持点击直接调出目录选择弹窗) */}
            <button
              type="button"
              onClick={() => openSaveDirModal(null)}
              className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 hover:border-cyan-500/50 text-[11px] text-gray-300 font-mono transition cursor-pointer"
              title={`当前保存目录: ${selectedSaveDir || currentProject?.assetDir || '未指定 (点击选择)'}`}
            >
              <FolderDown className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate max-w-[160px]">
                保存至: {selectedSaveDir ? selectedSaveDir.split(/[\\/]/).pop() : (currentProject?.assetDir ? currentProject.assetDir.split(/[\\/]/).pop() : '选择目录')}
              </span>
            </button>

            {/* 方案切换器：免版权库 / 极速嗅探 / 桌面原生浏览 */}
            <div className="flex items-center bg-dark-950 p-1 rounded-xl border border-dark-750 text-xs font-medium space-x-1">
              <button
                type="button"
                onClick={() => {
                  if (activeMode === 'modeC') return; // 当前模式点击直接无效，不刷新不读取
                  setActiveMode('modeC');
                  fetchStock(stockQuery);
                }}
                className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
                  activeMode === 'modeC'
                    ? 'bg-brand-600 text-white font-semibold shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                title="CC0 免版权 4K 视频与精选空镜库"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>免版税库</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activeMode === 'modeB') return; // 当前模式点击直接无效，不刷新不读取
                  setActiveMode('modeB');
                  setSniffingUrl(currentUrl);
                }}
                className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
                  activeMode === 'modeB'
                    ? 'bg-brand-600 text-white font-semibold shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                title="URL 极速批量提取与批量下载"
              >
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>极速嗅探</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (activeMode === 'modeA') return; // 当前模式点击直接无效，不刷新不读取
                  if (isDesktopApp()) {
                    openDesktopWebview(currentUrl, `媒体浏览工作舱 - ${currentUrl}`);
                  }
                  setActiveMode('modeA');
                }}
                className={`px-3 py-1.5 rounded-lg transition flex items-center space-x-1.5 ${
                  activeMode === 'modeA'
                    ? 'bg-brand-600 text-white font-semibold shadow'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                title={isDesktopApp() ? '系统原生独立 WebView2 窗口' : '外部浏览器直连访问'}
              >
                <Compass className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isDesktopApp() ? '原生浏览器' : '网页导航'}</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-dark-750 rounded-xl transition cursor-pointer"
              title="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. 快捷直接媒体链接入库条 (可展开/折叠) */}
        {isQuickDirectSaveOpen && (
          <div className="bg-dark-800/90 border-b border-dark-700/80 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center space-x-1.5 text-teal-400 shrink-0 font-medium">
              <Link2 className="w-3.5 h-3.5" />
              <span>快捷存盘:</span>
            </div>

            <div className="flex-1 flex items-center space-x-2 w-full">
              <input 
                type="text"
                value={directMediaUrl}
                onChange={e => setDirectMediaUrl(e.target.value)}
                placeholder="粘贴任何网络图片或视频直链 (如: https://.../image.jpg 或 video.mp4)..."
                className="flex-1 bg-dark-950 border border-dark-700 focus:border-teal-500 rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-500 outline-none"
              />
              <input 
                type="text"
                value={directFilename}
                onChange={e => setDirectFilename(e.target.value)}
                placeholder="自定义文件名 (可选)"
                className="w-36 bg-dark-950 border border-dark-700 focus:border-teal-500 rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-500 outline-none"
              />
              <button
                onClick={handleQuickDirectSave}
                disabled={isDirectSaving || !directMediaUrl.trim()}
                className="px-3 py-1 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow transition shrink-0 flex items-center space-x-1"
              >
                {isDirectSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                <span>存入资料库</span>
              </button>
            </div>

            {directSaveMsg && (
              <span className={`text-[11px] shrink-0 font-mono ${
                directSaveMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {directSaveMsg.text}
              </span>
            )}
          </div>
        )}

        {/* 3. 核心内容区域 (模式 A / B / C 视图) */}
        <div className="flex-1 flex overflow-hidden relative">

          {/* ========================================================================= */}
          {/* 模式 A：桌面端原生 WebView2 状态舱 / Web 端无内嵌直连指南 */}
          {/* ========================================================================= */}
          {activeMode === 'modeA' && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-dark-950 text-center space-y-6">
              <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-2xl">
                {isDesktopApp() ? (
                  <Monitor className="w-10 h-10 animate-pulse" />
                ) : (
                  <Compass className="w-10 h-10" />
                )}
              </div>

              <div className="max-w-lg space-y-2">
                <h3 className="text-lg font-bold text-white">
                  {isDesktopApp() ? '系统级 Edge WebView2 独立浏览工作舱' : 'Web 环境外部无缝直连'}
                </h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  {isDesktopApp()
                    ? '已彻底移除 iframe 框架与任何代理中转。点击下方按钮即可唤起 Windows 原生独立 WebView2 窗口，100% 还原系统真实 TLS 指纹，支持无阻碍登录抖音、快手及访问全部外网资料。'
                    : '已彻底移除 iframe 框架。在纯 Web 浏览器环境下，无跨域沙盒或 X-Frame-Options 阻断，点击可在外部系统浏览器直连访问并复制直链存盘。'}
                </p>
              </div>

              <div className="p-3 bg-dark-900 border border-dark-800 rounded-xl flex items-center space-x-3 text-xs font-mono text-gray-300 max-w-md w-full justify-between">
                <span className="truncate">{currentUrl}</span>
                <span className="px-2 py-0.5 rounded bg-brand-500/20 text-brand-cyan text-[10px] shrink-0">
                  {isDesktopApp() ? 'WebView2 原生' : '直连目标'}
                </span>
              </div>

              <div className="flex items-center space-x-3">
                {isDesktopApp() ? (
                  <button
                    onClick={() => openDesktopWebview(currentUrl, `媒体浏览工作舱 - ${currentUrl}`)}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/30 flex items-center space-x-2 transition active:scale-95"
                  >
                    <Monitor className="w-4 h-4" />
                    <span>唤起系统原生 WebView2 窗口</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleOpenExternal(currentUrl)}
                    className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-brand-600/30 flex items-center space-x-2 transition active:scale-95"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>在系统浏览器打开目标网站</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setActiveMode('modeB');
                    setSniffingUrl(currentUrl);
                  }}
                  className="px-4 py-2.5 bg-dark-850 hover:bg-dark-800 border border-dark-700 text-gray-300 hover:text-white rounded-xl text-xs font-semibold transition flex items-center space-x-2"
                >
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span>抓取该页面所有媒体</span>
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 模式 B：URL 极速批量提取与批量保存 */}
          {/* ========================================================================= */}
          {activeMode === 'modeB' && (
            <div className="flex-1 flex flex-col p-6 overflow-hidden bg-dark-950 space-y-4">
              
              {/* 顶部 URL 极速分析输入栏 */}
              <div className="bg-dark-900 border border-dark-750 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
                <div className="flex-1 flex items-center bg-dark-950 border border-dark-700 rounded-xl px-3 py-2 text-xs w-full">
                  <Layers className="w-4 h-4 text-brand-cyan mr-2 shrink-0" />
                  <input 
                    type="text"
                    value={sniffingUrl}
                    onChange={e => setSniffingUrl(e.target.value)}
                    placeholder="粘贴目标网页 URL 进行全页面高质量图片与视频批量解析..."
                    className="w-full bg-transparent outline-none text-xs text-white placeholder-gray-500"
                  />
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={handleRunBatchSniff}
                    disabled={isBatchSniffing}
                    className="px-4 py-2 bg-gradient-to-r from-brand-600 to-teal-600 hover:brightness-110 text-white rounded-xl text-xs font-semibold shadow-md flex items-center space-x-1.5 transition active:scale-95 disabled:opacity-50"
                  >
                    {isBatchSniffing ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>深度抓取解析中...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>开始极速解析</span>
                      </>
                    )}
                  </button>

                  {batchResults.length > 0 && (
                    <button
                      onClick={handleBatchSaveSelected}
                      disabled={selectedBatchIds.size === 0}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md flex items-center space-x-1.5 transition active:scale-95 disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>一键下载选中 ({selectedBatchIds.size}) 项至资料库</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 批量结果瀑布流展示 */}
              <div className="flex-1 overflow-y-auto">
                {batchResults.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 space-y-3">
                    <Layers className="w-12 h-12 text-dark-700" />
                    <p className="text-sm">输入上方网页 URL 并点击【开始极速解析】</p>
                    <p className="text-xs text-gray-600 max-w-md">
                      系统将绕过前端复杂交互，直接以高并发流式抓取该页面所有高清图、OpenGraph 主图与真实视频媒体切片。
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {batchResults.map((item, idx) => {
                      const isSelected = selectedBatchIds.has(item.url);
                      const status = downloadStatus[item.id || item.url];

                      return (
                        <UnifiedMediaCard
                          key={item.id || idx}
                          item={item}
                          isSelected={isSelected}
                          onToggleSelect={() => {
                            const next = new Set(selectedBatchIds);
                            if (next.has(item.url)) next.delete(item.url);
                            else next.add(item.url);
                            setSelectedBatchIds(next);
                          }}
                          onSave={handleSaveToAssetDir}
                          saveStatus={status}
                          isSoundOn={isCardSoundOn(item.id || item.url)}
                          onToggleSound={toggleCardSound}
                          showSelectCheckbox={true}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ========================================================================= */}
          {/* 模式 C：CC0 免版权 4K 视频与精选资料库 (聚合 Wallhaven, Wikimedia, Mixkit) */}
          {/* ========================================================================= */}
          {activeMode === 'modeC' && (
            <div className="flex-1 flex flex-col p-6 overflow-hidden bg-dark-950 space-y-4">
              
              {/* 搜索与分类预设 */}
              <div className="bg-dark-900 border border-dark-750 p-4 rounded-2xl flex flex-col space-y-3 shadow-lg">
                <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                  <div className="flex-1 flex items-center bg-dark-950 border border-dark-700 rounded-xl px-3 py-2 text-xs w-full">
                    <Search className="w-4 h-4 text-amber-400 mr-2 shrink-0" />
                    <input 
                      type="text"
                      value={stockQuery}
                      onChange={e => setStockQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && fetchStock(stockQuery, stockType, 1)}
                      placeholder="输入任意中英文关键词 (如: 海浪、暴风雨、粒子、光效、赛博朋克、深海、天空、宇宙)..."
                      className="w-full bg-transparent outline-none text-xs text-white placeholder-gray-500"
                    />
                    {stockQuery && (
                      <button 
                        onClick={() => {
                          setStockQuery('');
                          fetchStock('', stockType, 1);
                        }}
                        className="text-gray-500 hover:text-gray-300 ml-2"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* 媒体类型过滤 */}
                  <div className="flex items-center space-x-1.5 shrink-0 bg-dark-950 p-1 rounded-xl border border-dark-750">
                    <button
                      onClick={() => {
                        setStockType('all');
                        fetchStock(stockQuery, 'all', 1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        stockType === 'all'
                          ? 'bg-amber-600 text-white shadow'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      🌟 全部资料 ({stockItems.length})
                    </button>
                    <button
                      onClick={() => {
                        setStockType('video');
                        fetchStock(stockQuery, 'video', 1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 transition ${
                        stockType === 'video'
                          ? 'bg-amber-600 text-white shadow'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>4K 视频 ({stockItems.filter(i => i.type === 'video').length})</span>
                    </button>
                    <button
                      onClick={() => {
                        setStockType('image');
                        fetchStock(stockQuery, 'image', 1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 transition ${
                        stockType === 'image'
                          ? 'bg-amber-600 text-white shadow'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>超清视觉图 ({stockItems.filter(i => i.type === 'image').length})</span>
                    </button>
                  </div>

                  {/* 快捷全局声音开关：无背景纯图标按钮 */}
                  <button
                    onClick={toggleSound}
                    className="p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors shrink-0"
                    title={isSoundEnabled ? '全局声音: 开 (按 M 快速静音)' : '全局声音: 静音 [默认] (按 M 开启声音)'}
                  >
                    {isSoundEnabled ? (
                      <Volume2 className="w-4 h-4 text-amber-400 animate-pulse" />
                    ) : (
                      <VolumeX className="w-4 h-4 text-gray-400 hover:text-gray-200" />
                    )}
                  </button>

                  <button
                    onClick={() => fetchStock(stockQuery, stockType, 1)}
                    className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl text-xs font-semibold shadow transition shrink-0"
                  >
                    实时检索
                  </button>
                </div>

                {/* 快捷热门标签 */}
                <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-xs">
                  <span className="text-[11px] text-gray-400 font-medium shrink-0 flex items-center mr-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 mr-1" />
                    高频空镜与游戏灵感：
                  </span>
                  {[
                    '全部', '游戏实机', '电竞高能', '游戏特效', '虚幻引擎', '科幻机甲', '高光时刻', 
                    '动作格斗', '二次元', '海浪', '暴风雨', '粒子', '光效', '赛博朋克', '深海', '云海', '火焰', '星空'
                  ].map((tag, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        const q = tag === '全部' ? '' : tag;
                        setStockQuery(q);
                        fetchStock(q, stockType, 1);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs border transition shrink-0 ${
                        (stockQuery === tag || (tag === '全部' && !stockQuery))
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                          : 'bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border-dark-700'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                {/* 聚合源状态条 */}
                <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-dark-800">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>
                      🌐 <strong>多源实时聚合引擎</strong>：Mixkit 4K 原生剪辑视频库 + Wallhaven 4K 顶级视觉画廊 + Wikimedia Commons 维基全球开源媒体 + Unsplash 4K
                    </span>
                  </div>
                  <div className="text-gray-400 font-mono">
                    已加载 <strong>{stockItems.length}</strong> 件资料 · 第 {stockPage} 页
                  </div>
                </div>
              </div>

              {/* 素材卡片网格与无限滚动容器 */}
              <div 
                ref={stockScrollContainerRef}
                className="flex-1 overflow-y-auto pr-1"
              >
                {stockLoading ? (
                  <div className="h-64 flex flex-col items-center justify-center text-xs text-gray-400 space-y-3">
                    <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                    <span>正在并发联网检索 Wallhaven 4K、Wikimedia Commons 及 Mixkit 4K 媒体库...</span>
                  </div>
                ) : stockItems.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-gray-400 space-y-2">
                    <Layers className="w-8 h-8 text-gray-600" />
                    <p className="text-sm">未检索到匹配的资料</p>
                    <button 
                      onClick={() => { setStockQuery(''); fetchStock('', stockType, 1); }}
                      className="text-xs text-amber-400 hover:underline"
                    >
                      查看全部热门精选资料
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                      {stockItems.map((item) => {
                        const status = downloadStatus[item.id || item.url];

                        return (
                          <UnifiedMediaCard
                            key={item.id || item.url}
                            item={item}
                            onSave={handleSaveToAssetDir}
                            saveStatus={status}
                            isSoundOn={isCardSoundOn(item.id || item.url)}
                            onToggleSound={toggleCardSound}
                            showSelectCheckbox={false}
                          />
                        );
                      })}
                    </div>

                    {/* 底部自动无限加载触发器 (IntersectionObserver 观察目标) */}
                    <div ref={stockSentinelRef} className="flex flex-col items-center justify-center pt-4 pb-10 space-y-2">
                      {stockLoadingMore && (
                        <div className="flex items-center space-x-2 text-xs text-amber-400 font-semibold bg-dark-900 border border-amber-500/30 px-5 py-2.5 rounded-xl shadow-lg">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>正在自动拉取第 {stockPage + 1} 页免版权 4K 资料...</span>
                        </div>
                      )}

                      {!hasMoreStock && (
                        <div className="flex items-center space-x-2 text-xs text-gray-400 bg-dark-900/60 border border-dark-800 px-5 py-2.5 rounded-xl">
                          <Sparkles className="w-4 h-4 text-amber-400" />
                          <span>🎉 已加载全部相关免版权资料 (共 {stockItems.length} 个)</span>
                        </div>
                      )}

                      {hasMoreStock && !stockLoadingMore && (
                        <button
                          onClick={loadMoreStock}
                          className="text-[11px] text-gray-500 hover:text-gray-300 hover:underline transition"
                        >
                          向下滚动自动加载更多 · 或点击立即加载下一页 (第 {stockPage + 1} 页)
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>
      
        {/* ─────────────────────────────────────────────────────────────
            7. 目标保存目录选择弹窗 (项目优先、视觉突出、支持自选)
           ───────────────────────────────────────────────────────────── */}
        {isDirPickerModalOpen && (
          <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setIsDirPickerModalOpen(false)}
          >
            <div 
              className="w-full max-w-lg bg-[#0F172A] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 animate-in zoom-in-95 duration-150"
              onClick={e => e.stopPropagation()}
            >
              {/* 弹窗头部 */}
              <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
                    <FolderDown className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">选择资料保存目录</h3>
                    <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[320px]">
                      {Array.isArray(saveTargetItem) 
                        ? `批量保存 ${saveTargetItem.length} 项网络资料至本地`
                        : saveTargetItem
                        ? `保存「${saveTargetItem?.name || saveTargetItem?.title || '网络资料'}」至本地`
                        : '预设网络资料默认保存目录'
                      }
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDirPickerModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 目录列表选择区 */}
              <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* A. 项目专属绑定资料库 (高优先排序) */}
                {activeProjectId && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                      <span className="flex items-center gap-1.5 text-amber-400">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>项目绑定资料库 (优先存储)</span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono truncate max-w-[160px]">
                        项目: {activeProject?.title || activeProjectId}
                      </span>
                    </div>

                    {projectBoundList.length > 0 ? (
                      <div className="space-y-1.5">
                        {projectBoundList.map(lib => {
                          const isSelected = !isCustomDirActive && selectedSaveDir === lib.path;
                          return (
                            <div
                              key={lib.id || lib.path}
                              onClick={() => {
                                setSelectedSaveDir(lib.path);
                                setIsCustomDirActive(false);
                              }}
                              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                                isSelected
                                  ? 'bg-amber-500/10 border-amber-500/50 shadow-sm shadow-amber-500/10 text-white'
                                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <Database className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                  <span className="font-semibold text-xs text-slate-200">{lib.name}</span>
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-medium">
                                    项目已绑定
                                  </span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-500 truncate mt-1" title={lib.path}>
                                  {lib.path}
                                </div>
                              </div>
                              <div className="ml-3 shrink-0">
                                {isSelected ? (
                                  <div className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                                    <Check className="w-3 h-3 stroke-[3]" />
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 rounded-full border border-slate-700" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-xs text-slate-400">
                        当前项目未绑定外部资料库，已默认选用项目内部存储。
                      </div>
                    )}

                    {/* 项目专属 assets 目录 */}
                    {projectAssetDir && (
                      <div
                        onClick={() => {
                          setSelectedSaveDir(projectAssetDir);
                          setIsCustomDirActive(false);
                        }}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          !isCustomDirActive && selectedSaveDir === projectAssetDir
                            ? 'bg-amber-500/10 border-amber-500/50 text-white'
                            : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium text-slate-300">项目专属存储目录 (assets)</span>
                            <span className="text-[10px] text-slate-500">内置</span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 truncate mt-0.5" title={projectAssetDir}>
                            {projectAssetDir}
                          </div>
                        </div>
                        <div className="ml-3 shrink-0">
                          {!isCustomDirActive && selectedSaveDir === projectAssetDir ? (
                            <div className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-slate-700" />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* B. 全局资料库目录 */}
                {globalOtherList.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                      <FolderGit2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>全局资料库目录</span>
                    </div>
                    <div className="space-y-1.5">
                      {globalOtherList.map(lib => {
                        const isSelected = !isCustomDirActive && selectedSaveDir === lib.path;
                        return (
                          <div
                            key={lib.id || lib.path}
                            onClick={() => {
                              setSelectedSaveDir(lib.path);
                              setIsCustomDirActive(false);
                            }}
                            className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                              isSelected
                                ? 'bg-cyan-500/10 border-cyan-500/50 shadow-sm shadow-cyan-500/10 text-white'
                                : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs text-slate-200">{lib.name}</span>
                                <span className="px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px]">
                                  全局资料库
                                </span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 truncate mt-0.5" title={lib.path}>
                                {lib.path}
                              </div>
                            </div>
                            <div className="ml-3 shrink-0">
                              {isSelected ? (
                                <div className="w-4 h-4 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center font-bold">
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </div>
                              ) : (
                                <div className="w-4 h-4 rounded-full border border-slate-700" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* C. 自定义本地目录输入 */}
                <div className="space-y-2 pt-1 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold">自定义本地目录</span>
                    <span className="text-[10px] text-slate-500">支持点击右侧图标呼出系统选框</span>
                  </div>
                  <FolderInput
                    value={customSaveDir}
                    onChange={(val) => {
                      setCustomSaveDir(val);
                      setSelectedSaveDir(val);
                      setIsCustomDirActive(true);
                    }}
                    onFolderSelected={(path) => {
                      setCustomSaveDir(path);
                      setSelectedSaveDir(path);
                      setIsCustomDirActive(true);
                    }}
                    placeholder="输入或选择任意本地文件夹路径..."
                    dialogTitle="选择网络资料保存目录"
                  />
                </div>
              </div>

              {/* 弹窗底部确认栏 */}
              <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
                <div className="text-[11px] font-mono text-slate-400 truncate max-w-[280px]">
                  {selectedSaveDir ? (
                    <span>目标: <span className="text-slate-200 font-semibold">{selectedSaveDir}</span></span>
                  ) : (
                    <span className="text-amber-400">请选择保存目录</span>
                  )}
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsDirPickerModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs transition cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={!selectedSaveDir || isSaving}
                    onClick={handleConfirmSaveToDir}
                    className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-cyan-600/25 transition cursor-pointer"
                  >
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span>{isSaving ? '正在下载保存...' : saveTargetItem ? '确认存入' : '设为默认目录'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
