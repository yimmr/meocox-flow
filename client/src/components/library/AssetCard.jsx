import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Video,
  Music,
  Image as ImageIcon,
  FileText,
  Play,
  Pause,
  CirclePlay,
  Copy,
  Code,
  MoreVertical,
  Download,
  Trash2,
  Sparkles
} from 'lucide-react';
import { apiUrl } from '@/lib/apiClient.js';
import { toast } from '@/components/ui/sonner.jsx';

/**
 * 视频卡片定制圆形播放徽标 (基于 play-button.svg 内联矢量渲染，柔和半透白，不刺眼)
 */
function VideoPlayBadge({ className = '' }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform="translate(0, 512) scale(0.1, -0.1)" stroke="none">
        <path d="M2370 5113 c-371 -35 -653 -114 -961 -269 -225 -112 -431 -259 -621 -442 -226 -218 -386 -437 -524 -717 -126 -258 -203 -511 -246 -810 -17 -118 -17 -512 0 -630 42 -295 120 -553 242 -800 137 -280 272 -468 494 -691 221 -220 412 -357 681 -489 188 -92 309 -137 500 -185 500 -126 1002 -102 1490 71 149 53 407 182 540 271 365 243 667 578 866 963 181 348 271 694 286 1090 15 426 -73 832 -263 1214 -124 250 -263 447 -458 648 -216 224 -428 378 -711 518 -296 146 -572 225 -900 255 -102 9 -333 11 -415 3z m-298 -1501 c20 -9 372 -233 782 -497 627 -403 748 -485 762 -513 18 -38 12 -80 -16 -109 -23 -26 -1493 -971 -1538 -990 -46 -19 -97 -2 -123 41 -18 30 -19 62 -19 1014 0 1086 -3 1028 63 1057 41 18 45 18 89 -3z" />
      </g>
    </svg>
  );
}

/**
 * 仿真声学能量波形序列
 */
const SOUND_BARS = [
  16, 32, 50, 75, 95, 70, 48, 85, 100, 78,
  55, 82, 60, 42, 72, 92, 65, 45, 60, 80
];

/**
 * AssetCard - 全应用通用多态资产卡片组件
 * 
 * 视觉规范：
 * 1. 瀑布流 (Card Style - 'large' / 'medium')：
 *    - 无内边距无边框设计 (border-none, p-0)，媒体画面完全填满圆角卡片
 *    - 四类文件多态设计：
 *      a. 视频 (Video): 封面 + 左上角微缩播放标 + Hover 自动静音预览播放 + 点击弹窗全屏
 *      b. 图片 (Image): 画面无缝填满 + 底部渐变半透明标题覆盖
 *      c. 音频 (Audio): 声学能量波形 + 播放/暂停交互 + 音轨信息
 *      d. 文本/其他文件 (Document/Other): 文件图标 + 格式徽章 + 文件信息
 *    - 右上角胶囊动作群：
 *      * 最多显示 3 个按钮
 *      * 超过 3 个按钮时，第 3 个按钮转为 "3个点 (⋮)"，点击展开深色磨砂下拉菜单收折后续所有功能
 * 2. 列表视图 (List Style - 'list')：
 *    - 紧凑横向单行条目，左侧微缩缩略图，中间元数据，右侧操作群
 */
export default function AssetCard({
  file,
  viewMode = 'medium', // 'large' | 'medium' | 'list'
  isPlayingAudio = false,
  onToggleAudio,
  onPlayVideo,
  onCopyPath,
  onReportRatio,
  onDeleteFile,
  isLastInRow = false,
  renderActions,
  actions,
  className = ''
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [shouldAlignLeft, setShouldAlignLeft] = useState(false);
  const menuRef = useRef(null);
  const toggleBtnRef = useRef(null);
  const videoRef = useRef(null);

  // 动态获取最近约束容器的右侧边界坐标 (画廊容器、侧边栏 aside、main、或 overflow 滚动容器)
  const getContainerRight = (btn) => {
    let maxRight = window.innerWidth - 12;

    // 1. 优先检测是否在瀑布流画廊容器内 (data-gallery-container="true")
    const galleryContainer = btn.closest?.('[data-gallery-container="true"]');
    if (galleryContainer) {
      const rect = galleryContainer.getBoundingClientRect();
      if (rect.right > 0) {
        maxRight = Math.min(maxRight, rect.right - 8);
      }
    }

    // 2. 检测最近的侧边栏/主容器或滚动容器 (如 aside, main, flex-1 overflow-y-auto)
    let parent = btn.parentElement;
    while (parent && parent !== document.body) {
      if (parent.tagName === 'ASIDE' || parent.tagName === 'MAIN') {
        const rect = parent.getBoundingClientRect();
        if (rect.right > 0) {
          maxRight = Math.min(maxRight, rect.right - 8);
        }
      }
      const style = window.getComputedStyle(parent);
      if (
        ['auto', 'hidden', 'scroll'].includes(style.overflowX) ||
        ['auto', 'hidden', 'scroll'].includes(style.overflowY)
      ) {
        const rect = parent.getBoundingClientRect();
        // 避免误判单卡或内部极小容器，仅取实际有约束力的外层布局容器 (宽度 > 260px)
        if (rect.right > 0 && rect.width > 260) {
          maxRight = Math.min(maxRight, rect.right - 8);
        }
      }
      parent = parent.parentElement;
    }

    return maxRight;
  };

  // 展开方向计算：默认向右展开 (left-0)；仅当容器右侧剩余空间不足以容纳菜单时，才翻转为向左展开 (right-0)
  const updateMenuAlignment = useCallback(() => {
    if (!toggleBtnRef.current) return;
    const btnRect = toggleBtnRef.current.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ? menuRef.current.offsetWidth + 6 : 185;
    const containerRight = getContainerRight(toggleBtnRef.current);

    // 默认向右展开：以按钮左边缘为基准向右展开 (left-0)，菜单最右侧边缘位于 btnRect.left + menuWidth
    // 当且仅当右侧剩余空间不足 (超出容器右边界) 时，翻转向左展开 (right-0)
    if (btnRect.left + menuWidth > containerRight) {
      setShouldAlignLeft(true);
    } else {
      setShouldAlignLeft(false);
    }
  }, []);

  const handleToggleMenu = (e) => {
    if (e) e.stopPropagation();
    if (!isMenuOpen) {
      updateMenuAlignment();
      setIsMenuOpen(true);
    } else {
      setIsMenuOpen(false);
    }
  };

  useEffect(() => {
    if (!isMenuOpen) return;
    updateMenuAlignment();
    const handleUpdate = () => updateMenuAlignment();
    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);
    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [isMenuOpen, updateMenuAlignment]);

  const streamUrl = file?.path ? apiUrl(`/api/assets/stream?path=${encodeURIComponent(file.path)}`) : '';
  const thumbUrl = file?.thumbnail ? apiUrl(file.thumbnail) : (file?.type === 'image' ? streamUrl : null);
  const isVideo = Boolean(file?.type === 'video');
  const isAudio = Boolean(file?.type === 'audio');
  const isImage = Boolean(file?.type === 'image');
  const isDocumentOrOther = !isVideo && !isAudio && !isImage;
  const isLarge = viewMode === 'large';

  // 点击外部收起下拉菜单 (排除触发按钮自身的点击，让按钮自身 onClick 正常交替展开与收起)
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        toggleBtnRef.current &&
        !toggleBtnRef.current.contains(e.target)
      ) {
        setIsMenuOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  // 控制视频 hover 预览播放与进度重置
  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    if (isHovered) {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } else {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setVideoProgress(0);
    }
  }, [isHovered, isVideo]);

  if (!file) return null;

  // 默认动作群定义 (可扩展：复制路径、下载、删除文件等)
  const defaultActions = [
    {
      id: 'copy-path',
      label: '复制路径',
      title: '复制绝对路径',
      icon: Copy,
      onClick: async (f, e) => {
        if (e) e.stopPropagation();
        if (onCopyPath) {
          onCopyPath(f);
          return;
        }
        try {
          await navigator.clipboard.writeText(f.path);
          toast.success('已复制绝对路径至剪贴板');
        } catch {
          toast.error('复制路径失败');
        }
      }
    },
    {
      id: 'download-file',
      label: '下载文件',
      title: '下载原文件',
      icon: Download,
      onClick: (f, e) => {
        if (e) e.stopPropagation();
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
        if (onDeleteFile) {
          onDeleteFile(f);
        } else {
          if (window.confirm(`确定要从磁盘中永久删除文件「${f.name}」吗？此操作无法撤销。`)) {
            fetch(apiUrl(`/api/assets/file?path=${encodeURIComponent(f.path)}`), { method: 'DELETE' })
              .then(res => res.json())
              .then(data => {
                if (data.error) throw new Error(data.error);
                toast.success(`已删除「${f.name}」`);
              })
              .catch(err => toast.error('删除失败: ' + err.message));
          }
        }
      }
    }
  ];

  const resolvedActions = Array.isArray(actions) && actions.length > 0 ? actions : defaultActions;

  // 上报真实媒体宽高比
  const handleMediaLoaded = (e) => {
    if (!onReportRatio) return;
    const { naturalWidth, naturalHeight, videoWidth, videoHeight } = e.target;
    const w = naturalWidth || videoWidth;
    const h = naturalHeight || videoHeight;
    if (w && h) {
      onReportRatio(file.path, w / h);
    }
  };

  const getFormatIcon = () => {
    if (isVideo) return <Video className="w-5 h-5 text-blue-400" />;
    if (isAudio) return <Music className="w-5 h-5 text-amber-400" />;
    if (isImage) return <ImageIcon className="w-5 h-5 text-emerald-400" />;
    if (['.json', '.js', '.py', '.ts', '.sh'].includes(file.ext?.toLowerCase())) {
      return <Code className="w-5 h-5 text-cyan-400" />;
    }
    return <FileText className="w-5 h-5 text-slate-400" />;
  };

  // 渲染右上角操作按钮群 (区分媒体卡片扁平拟态玻璃 vs 音频/文本淡淡纯图标，支持自适应方向与尺寸)
  const renderActionCapsule = (isSubtle = false) => {
    if (typeof renderActions === 'function') {
      return renderActions({ file, viewMode });
    }

    const hasOverflow = resolvedActions.length > 3;
    const directActions = hasOverflow ? resolvedActions.slice(0, 2) : resolvedActions.slice(0, 3);
    const overflowActions = hasOverflow ? resolvedActions.slice(2) : [];
    const iconSizeClass = isLarge ? 'w-3.5 h-3.5' : 'w-3 h-3';

    // A. 文本和音频卡片：直接在右上角显示淡淡的无背景纯图标按钮组，间隔加宽，hover单个按钮时取消变淡
    if (isSubtle) {
      return (
        <div className={`relative flex items-center ${isLarge ? 'gap-2.5' : 'gap-2'} bg-transparent border-0 shadow-none`}>
          {directActions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.id || act.label}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  act.onClick(file, e);
                }}
                className="p-1 rounded-md text-slate-400 opacity-60 hover:opacity-100 hover:text-slate-100 hover:bg-white/10 transition-all cursor-pointer flex items-center justify-center border-0 border-transparent"
                title={act.title || act.label}
              >
                {Icon && <Icon className={iconSizeClass} />}
              </button>
            );
          })}

          {hasOverflow && (
            <div className="relative">
              <button
                ref={toggleBtnRef}
                type="button"
                onClick={handleToggleMenu}
                className={`p-1 rounded-md text-slate-400 opacity-60 hover:opacity-100 hover:text-slate-100 hover:bg-white/10 transition-all cursor-pointer flex items-center justify-center border-0 border-transparent ${
                  isMenuOpen ? 'opacity-100 text-white bg-white/10' : ''
                }`}
                title="更多操作"
              >
                <MoreVertical className={iconSizeClass} />
              </button>

              {isMenuOpen && (
                <div
                  ref={menuRef}
                  className={`absolute top-full mt-1.5 z-50 glass-surface glass-dark rounded-[14px] p-1.5 min-w-[172px] space-y-0.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${
                    shouldAlignLeft ? 'right-0' : 'left-0'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {overflowActions.map((act) => {
                    const Icon = act.icon;
                    return (
                      <button
                        key={act.id || act.label}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsMenuOpen(false);
                          act.onClick(file, e);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left cursor-pointer group ${
                          act.danger
                            ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/15'
                            : 'text-slate-200 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {Icon && (
                          <Icon
                            className={`w-4 h-4 shrink-0 transition-colors ${
                              act.danger
                                ? 'text-rose-400 group-hover:text-rose-300'
                                : 'text-slate-400 group-hover:text-white'
                            }`}
                          />
                        )}
                        <span className="truncate">{act.label || act.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // B. 视频和图片卡片：扁平微透拟态玻璃，12px方形圆角，无凸起，彻底移除白边，Hover 才显现
    return (
      <div
        className={`absolute top-2.5 right-2.5 z-20 flex items-center glass-surface glass-light rounded-[12px] !border-none !border-transparent ${
          isLarge ? 'p-1 gap-1' : 'p-0.5 gap-0.5'
        } transition-opacity duration-200 ${
          isMenuOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto'
        }`}
        style={{ border: 'none', outline: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 常驻直出按钮 (最多 2-3 个) */}
        {directActions.map((act) => {
          const Icon = act.icon;
          return (
            <button
              key={act.id || act.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                act.onClick(file, e);
              }}
              className={`${
                isLarge ? 'p-1' : 'p-0.5'
              } rounded-lg border-0 border-transparent text-slate-800 hover:text-black hover:bg-black/10 transition-colors cursor-pointer flex items-center justify-center`}
              title={act.title || act.label}
            >
              {Icon && <Icon className={iconSizeClass} />}
            </button>
          );
        })}

        {/* 超过 3 个按钮时：第 3 个按钮转为“3个点 (⋮)”展开下拉菜单 */}
        {hasOverflow && (
          <div className="relative">
            <button
              ref={toggleBtnRef}
              type="button"
              onClick={handleToggleMenu}
              className={`${
                isLarge ? 'p-1' : 'p-0.5'
              } rounded-lg border-0 border-transparent text-slate-800 hover:text-black hover:bg-black/10 transition-colors cursor-pointer flex items-center justify-center ${
                isMenuOpen ? 'bg-black/15 text-black' : ''
              }`}
              title="更多操作"
            >
              <MoreVertical className={iconSizeClass} />
            </button>

            {/* 展开的下拉浮层菜单 (高对比度深色磨砂，默认向右展开，横向最后一个卡片向左展开) */}
            {isMenuOpen && (
              <div
                ref={menuRef}
                className={`absolute top-full mt-1.5 z-50 glass-surface glass-dark rounded-[14px] p-1.5 min-w-[172px] space-y-0.5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${
                  shouldAlignLeft ? 'right-0' : 'left-0'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                {overflowActions.map((act) => {
                  const Icon = act.icon;
                  return (
                    <button
                      key={act.id || act.label}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        act.onClick(file, e);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left cursor-pointer group ${
                        act.danger
                          ? 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/15'
                          : 'text-slate-200 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {Icon && (
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            act.danger
                              ? 'text-rose-400 group-hover:text-rose-300'
                              : 'text-slate-400 group-hover:text-white'
                          }`}
                        />
                      )}
                      <span className="truncate">{act.label || act.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // =========================================================================
  // 1. 列表模式 (viewMode === 'list')
  // =========================================================================
  if (viewMode === 'list') {
    return (
      <div
        className={`group relative p-2 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700/80 transition-all text-xs flex items-center gap-2.5 shadow-sm ${className}`}
        title={`${file.name}\n路径: ${file.path}`}
      >
        {/* 左侧微缩媒体预览器 (36x36 固定尺寸) */}
        <div 
          className="w-9 h-9 rounded-lg bg-slate-950 border border-slate-800 shrink-0 overflow-hidden flex items-center justify-center relative cursor-pointer select-none group/thumb"
          onClick={(e) => {
            if (isVideo && onPlayVideo) {
              e.stopPropagation();
              onPlayVideo(file);
            } else if (isAudio && onToggleAudio) {
              e.stopPropagation();
              onToggleAudio(file);
            }
          }}
        >
          {isImage && thumbUrl ? (
            <img
              src={thumbUrl}
              alt={file.name}
              loading="lazy"
              className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform duration-200"
            />
          ) : isVideo ? (
            <>
              {thumbUrl && <img src={thumbUrl} alt={file.name} loading="lazy" className="w-full h-full object-cover" />}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover/thumb:bg-black/60 transition-colors">
                <Play className="w-3.5 h-3.5 text-white fill-white ml-0.5" />
              </div>
            </>
          ) : isAudio ? (
            <div className={`w-full h-full flex items-center justify-center transition-colors ${isPlayingAudio ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-900 text-slate-400 group-hover/thumb:text-amber-400'}`}>
              {isPlayingAudio ? <Pause className="w-3.5 h-3.5 fill-amber-300" /> : <Play className="w-3.5 h-3.5 fill-slate-400 group-hover/thumb:fill-amber-400 ml-0.5" />}
            </div>
          ) : (
            <div className="w-full h-full bg-slate-900 flex items-center justify-center">
              {getFormatIcon()}
            </div>
          )}
        </div>

        {/* 中间信息区 */}
        <div className="flex-1 min-w-0 space-y-0.5 select-text">
          <div className="font-medium text-slate-200 group-hover:text-slate-100 truncate text-xs leading-tight">
            {file.name}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
            <span className="uppercase font-semibold text-slate-400">
              {file.ext ? file.ext.replace('.', '') : 'FILE'}
            </span>
            <span>·</span>
            <span>{file.sizeFormatted || '0 B'}</span>
            {file.rootLabel && (
              <>
                <span>·</span>
                <span className="truncate max-w-[80px] text-slate-400" title={file.rootLabel}>
                  {file.rootLabel}
                </span>
              </>
            )}
          </div>
        </div>

        {/* 右侧动作群 */}
        <div className="flex items-center gap-1 shrink-0 select-none">
          {resolvedActions.slice(0, 3).map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.id || act.label}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  act.onClick(file, e);
                }}
                className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
                title={act.title || act.label}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. 瀑布流卡片模式 ('large' | 'medium') - 无内边距无边框全景卡片
  // =========================================================================

  // A. 视频卡片 (Hover 自动静音预览播放 + 左上角微缩播放标 + 点击全屏播放)
  if (isVideo) {
    return (
      <div
        className={`group relative w-full h-full rounded-2xl select-none shadow-sm cursor-pointer transition-transform duration-200 hover:shadow-lg ${
          isMenuOpen ? 'z-50' : 'hover:z-30'
        } ${className}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(e) => {
          if (onPlayVideo) {
            e.stopPropagation();
            onPlayVideo(file);
          }
        }}
      >
        {/* 内层视窗：负责承载视频、图片与渐变遮罩，严格贴合圆角并进行溢出隐藏 */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none bg-slate-950">
          {thumbUrl && (
            <img
              src={thumbUrl}
              alt={file.name}
              loading="lazy"
              onLoad={handleMediaLoaded}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                isHovered ? 'opacity-0' : 'opacity-100'
              }`}
            />
          )}

          {/* Hover 时静音循环预览播放的视频 */}
          <video
            ref={videoRef}
            src={streamUrl}
            muted
            loop
            playsInline
            preload="none"
            onLoadedMetadata={handleMediaLoaded}
            onTimeUpdate={(e) => {
              const v = e.target;
              if (v.duration && v.duration > 0) {
                setVideoProgress((v.currentTime / v.duration) * 100);
              }
            }}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              isHovered ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* 底部渐变半透明信息覆盖层 (Hover 时展现：播放器图标 + 标题 + 进度条) */}
          <div className="absolute inset-x-0 bottom-0 z-10 pt-8 pb-2 px-2.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="flex items-center gap-1.5">
              <CirclePlay className="w-3.5 h-3.5 text-white shrink-0" />
              <span className="text-xs font-medium text-white truncate drop-shadow-sm leading-tight select-text">
                {file.name}
              </span>
            </div>
            {/* 视频实时播放进度条 */}
            <div className="w-full h-[2px] bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-75"
                style={{ width: `${videoProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* 左上角微缩播放标识 (使用 play.svg 内联矢量，柔和白色不刺眼，自适应尺寸) */}
        <div className="absolute top-2.5 left-2.5 z-10 pointer-events-none drop-shadow-md">
          <VideoPlayBadge className={`${isLarge ? 'w-5 h-5' : 'w-4 h-4'} text-white/80 transition-all`} />
        </div>

        {/* 右上角统一扁平拟态玻璃操作栏 (菜单展开时永不被外层剪裁) */}
        {renderActionCapsule(false)}
      </div>
    );
  }

  // B. 图片卡片 (全景无边框画面填充)
  if (isImage) {
    return (
      <div
        className={`group relative w-full h-full rounded-2xl select-none shadow-sm cursor-pointer transition-transform duration-200 hover:shadow-lg ${
          isMenuOpen ? 'z-50' : 'hover:z-30'
        } ${className}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(e) => {
          defaultActions[0].onClick(file, e);
        }}
      >
        {/* 内层媒体视窗：严格按 rounded-2xl 溢出裁剪 */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none bg-slate-950">
          <img
            src={thumbUrl || streamUrl}
            alt={file.name}
            loading="lazy"
            onLoad={handleMediaLoaded}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />

          {/* 底部渐变半透明信息覆盖层 (Hover 才显示) */}
          <div className="absolute inset-x-0 bottom-0 z-10 pt-8 pb-2 px-2.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <ImageIcon className="w-3.5 h-3.5 text-white/80 shrink-0" />
            <span className="text-xs font-medium text-white truncate drop-shadow-sm leading-tight select-text">
              {file.name}
            </span>
          </div>
        </div>

        {/* 右上角统一扁平拟态玻璃操作栏 (Hover 才显示) */}
        {renderActionCapsule(false)}
      </div>
    );
  }

  // C. 音频卡片 (独立雅致声学卡片：波形能量条 + 播放控制)
  if (isAudio) {
    return (
      <div
        className={`group relative w-full h-full rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800/80 p-3 flex flex-col justify-between shadow-sm transition-all hover:border-slate-700 ${
          isMenuOpen ? 'z-50' : 'hover:z-30'
        } ${className}`}
      >
        {/* 顶部：音频标签与右侧淡淡纯图标按钮组 (Hover 单个按钮取消变淡) */}
        <div className="flex items-center justify-between select-none">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Music className="w-3 h-3" />
            </div>
            <span className="text-[10px] font-mono font-bold text-amber-400 uppercase">
              {file.ext ? file.ext.replace('.', '') : 'AUDIO'}
            </span>
            <span className="text-[10px] font-mono text-slate-500">· {file.sizeFormatted}</span>
          </div>

          {/* 右上角直接显示淡淡的无背景纯图标按钮组 */}
          {renderActionCapsule(true)}
        </div>

        {/* 中部：声学能量波形 + 播放控制器 */}
        <div className="flex items-center gap-2.5 my-auto py-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleAudio) onToggleAudio(file);
            }}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 shadow-md transition-all cursor-pointer ${
              isPlayingAudio
                ? 'bg-amber-500 ring-4 ring-amber-500/20 scale-105'
                : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {isPlayingAudio ? (
              <Pause className="w-3.5 h-3.5 fill-white" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
            )}
          </button>

          {/* 仿真声学律动波形 */}
          <div className="flex-1 flex items-center gap-[3px] h-7 px-2 bg-slate-950/80 rounded-xl border border-slate-800/80 overflow-hidden">
            {SOUND_BARS.slice(0, isLarge ? 20 : 12).map((h, i) => (
              <div
                key={i}
                className={`w-1 rounded-full transition-all duration-150 ${
                  isPlayingAudio ? 'bg-amber-400 animate-pulse' : 'bg-slate-700'
                }`}
                style={{
                  height: `${isPlayingAudio ? Math.max(25, (h * (i % 2 === 0 ? 1 : 0.7))) : 30}%`
                }}
              />
            ))}
          </div>
        </div>

        {/* 底部：音频文件名 */}
        <div className="font-medium text-xs text-slate-200 truncate select-text" title={file.name}>
          {file.name}
        </div>
      </div>
    );
  }

  // D. 文本与其它文件卡片 (独立卡片结构)
  return (
    <div
      className={`group relative w-full h-full rounded-2xl bg-slate-900/90 border border-slate-800/80 p-3 flex flex-col justify-between shadow-sm transition-all hover:border-slate-700 ${
        isMenuOpen ? 'z-50' : 'hover:z-30'
      } ${className}`}
    >
      {/* 顶部：文件类别与右侧淡淡纯图标按钮组 (Hover 单个按钮取消变淡) */}
      <div className="flex items-center justify-between select-none">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-md bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
            {getFormatIcon()}
          </div>
          <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase">
            {file.ext ? file.ext.replace('.', '') : 'DOC'}
          </span>
          <span className="text-[10px] font-mono text-slate-500">· {file.sizeFormatted}</span>
        </div>

        {/* 右上角直接显示淡淡的无背景纯图标按钮组 */}
        {renderActionCapsule(true)}
      </div>

      {/* 中部：文件图标展示 */}
      <div className="flex items-center justify-center my-auto py-2">
        <div className="w-12 h-12 rounded-xl bg-slate-950/80 border border-slate-800/80 flex flex-col items-center justify-center text-slate-400 gap-0.5">
          {getFormatIcon()}
          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase">
            {file.ext ? file.ext.replace('.', '') : 'FILE'}
          </span>
        </div>
      </div>

      {/* 底部：文件名 */}
      <div className="font-medium text-xs text-slate-200 truncate select-text" title={file.name}>
        {file.name}
      </div>
    </div>
  );
}
