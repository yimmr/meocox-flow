import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Video,
  Music,
  Image as ImageIcon,
  FileText,
  Bot
} from 'lucide-react';
import { apiUrl } from '@/lib/apiClient.js';

/**
 * 默认可扩展 Tab 配置清单 (遵循开闭原则，支持外部通过 props 注入或追加新分类，严禁写死)
 */
export const DEFAULT_MENTION_TABS = [
  {
    id: 'attached',
    label: '附件',
    getItems: ({ attachedFilesWithLabels }) => attachedFilesWithLabels || [],
    getEmptyMessage: ({ query }) => query 
      ? `未在附件中搜索到与 "${query}" 匹配的文件`
      : '附件栏暂无已添加素材，请在资料库点击【添加至对话框】添加附件，即可在此 @ 对应文件'
  },
  {
    id: 'library',
    label: '资料库',
    getItems: ({ libraryFiles }) => libraryFiles || [],
    getEmptyMessage: ({ query }) => query
      ? `未在资料库中搜索到与 "${query}" 匹配的文件`
      : '当前资料库暂无可引用的素材资源'
  },
  {
    id: 'agents',
    label: '专家',
    getItems: ({ agents }) => (agents || []).map(a => ({
      ...a,
      type: 'agent',
      isAgent: true
    })),
    getEmptyMessage: ({ query }) => query
      ? `未在专家库中搜索到与 "${query}" 匹配的专家角色`
      : '当前暂无可用专家角色'
  }
];

/**
 * @ 提及素材悬浮卡片 (MentionPopover)
 * 
 * 核心交互：
 * 1. 顶部分类 Tab 栏：纯文本标签 (附件、资料库)，无数字计数干扰
 * 2. Slider 左右切换按钮：自适应检测，仅当 Tab 宽度超出容器时动态呈现
 * 3. 列表项：左侧微缩正方形媒体封面 + 右侧文件名 (含 @图片1 等角标) 与相对路径
 * 4. 底部极简：移除多余快捷键提示，极致清爽
 */
export default function MentionPopover({
  isOpen,
  query = '',
  attachedFiles = [],
  libraryFiles = [],
  agents = [],
  activeIndex = 0,
  itemsRef = null,
  tabs = DEFAULT_MENTION_TABS,
  defaultTab = 'attached',
  onSelect,
  onClose
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const tabsNavRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // 1. 底层自动标注序号 (如 @图片1, @视频1, @音频1, @文件1)
  const attachedFilesWithLabels = useMemo(() => {
    let imgCount = 0;
    let vidCount = 0;
    let audCount = 0;
    let docCount = 0;
    return (attachedFiles || []).map((file) => {
      let label = '';
      if (file.type === 'image') {
        imgCount++;
        label = `图片${imgCount}`;
      } else if (file.type === 'video') {
        vidCount++;
        label = `视频${vidCount}`;
      } else if (file.type === 'audio') {
        audCount++;
        label = `音频${audCount}`;
      } else {
        docCount++;
        label = `文件${docCount}`;
      }
      return {
        ...file,
        numberedLabel: label,
        mentionTag: label
      };
    });
  }, [attachedFiles]);

  // 2. 检测 Tab 容器溢出状态以智能显隐 Slider 左右箭头按钮 (仅在超出容器时显示)
  const updateScrollState = useCallback(() => {
    const el = tabsNavRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updateScrollState();
    const el = tabsNavRef.current;
    if (!el) return;

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateScrollState();
      });
      resizeObserver.observe(el);
    }
    window.addEventListener('resize', updateScrollState);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', updateScrollState);
    };
  }, [isOpen, tabs, updateScrollState]);

  const slideLeft = () => {
    if (tabsNavRef.current) {
      tabsNavRef.current.scrollBy({ left: -100, behavior: 'smooth' });
    }
  };

  const slideRight = () => {
    if (tabsNavRef.current) {
      tabsNavRef.current.scrollBy({ left: 100, behavior: 'smooth' });
    }
  };

  // 3. 动态计算激活 Tab 对应的数据列表与搜索过滤
  const currentTabDef = useMemo(() => {
    return tabs.find(t => t.id === activeTab) || tabs[0];
  }, [tabs, activeTab]);

  const displayedItems = useMemo(() => {
    if (!currentTabDef || typeof currentTabDef.getItems !== 'function') return [];
    const rawItems = currentTabDef.getItems({
      attachedFilesWithLabels,
      attachedFiles,
      libraryFiles,
      agents,
      query
    }) || [];

    const q = (query || '').toLowerCase().trim();
    if (!q) return rawItems;

    return rawItems.filter(f => 
      (f.name && f.name.toLowerCase().includes(q)) ||
      (f.path && f.path.toLowerCase().includes(q)) ||
      (f.mentionTag && f.mentionTag.toLowerCase().includes(q)) ||
      (f.numberedLabel && f.numberedLabel.toLowerCase().includes(q)) ||
      (f.tag && f.tag.toLowerCase().includes(q)) ||
      (f.role && f.role.toLowerCase().includes(q)) ||
      (f.title && f.title.toLowerCase().includes(q)) ||
      (f.description && f.description.toLowerCase().includes(q))
    );
  }, [currentTabDef, attachedFilesWithLabels, attachedFiles, libraryFiles, agents, query]);

  useEffect(() => {
    if (itemsRef) itemsRef.current = displayedItems;
    return () => {
      if (itemsRef) itemsRef.current = [];
    };
  }, [itemsRef, displayedItems]);

  if (!isOpen) return null;

  return (
    <div 
      className="absolute bottom-full left-0 mb-3 w-[380px] max-w-[calc(100vw-32px)] rounded-2xl bg-[#1E1F24] border border-white/10 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl select-none flex flex-col overflow-hidden text-slate-200"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── 1. 顶部 Tab 栏 (自适应 Slider：超出时出现左右切换箭头，无计数统计) ── */}
      <div className="relative flex items-center border-b border-white/10 px-1 pb-1 pt-0.5 shrink-0">
        {/* 左滑箭头按钮 (仅在左侧有溢出内容时显现) */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={slideLeft}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors mr-1 cursor-pointer shrink-0 z-10"
            title="向左滑动"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Tab 滚动视窗 (隐藏原生滚动条) */}
        <div
          ref={tabsNavRef}
          onScroll={updateScrollState}
          className="flex-1 flex items-center gap-4 overflow-x-auto scrollbar-none text-xs"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative pb-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive ? 'text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-full animate-in fade-in" />
                )}
              </button>
            );
          })}
        </div>

        {/* 右滑箭头按钮 (仅在右侧有溢出内容时显现) */}
        {canScrollRight && (
          <button
            type="button"
            onClick={slideRight}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors ml-1 cursor-pointer shrink-0 z-10"
            title="向右滑动"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── 2. 文件列表内容区 ── */}
      <div className="mt-1.5 max-h-72 overflow-y-auto space-y-1 pr-1">
        {displayedItems.length === 0 ? (
          <div className="py-6 px-3 text-center text-xs text-slate-400 leading-relaxed">
            {currentTabDef?.getEmptyMessage ? currentTabDef.getEmptyMessage({ query }) : '暂无素材'}
          </div>
        ) : (
          displayedItems.map((file, idx) => {
            const isSelected = idx === activeIndex;
            const isAgent = file.type === 'agent' || file.isAgent;

            if (isAgent) {
              const role = file.role || file.title || '执行专家';
              return (
                <div
                  key={file.id}
                  onClick={() => onSelect && onSelect(file)}
                  className={`flex items-center gap-3 p-2 rounded-xl transition-all cursor-pointer group ${
                    isSelected
                      ? 'bg-white/10 text-white'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {/* 智能体头像 */}
                  <div className="w-9 h-9 rounded-lg bg-indigo-500/15 border border-indigo-500/30 shrink-0 overflow-hidden flex items-center justify-center text-xs text-indigo-300">
                    {file.avatar || <Bot className="w-4 h-4 text-indigo-400" />}
                  </div>

                  {/* 专家名称与角色 */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="text-xs font-semibold truncate text-slate-100 group-hover:text-white leading-tight flex items-center gap-1.5">
                      <span className="truncate">{file.name}</span>
                      <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono text-[10px] shrink-0">
                        {role}
                      </span>
                    </div>
                    {file.description && (
                      <div className="text-[10px] text-slate-400 truncate mt-0.5 opacity-80">
                        {file.description}
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            const isVideo = file.type === 'video';
            const isAudio = file.type === 'audio';
            const isImage = file.type === 'image';

            const streamUrl = apiUrl(`/api/assets/stream?path=${encodeURIComponent(file.path)}`);
            const thumbUrl = file.thumbnail ? apiUrl(file.thumbnail) : (isImage ? streamUrl : null);

            // 简化路径展示 (如 workspace/assets/...)
            const displayPath = file.path
              ? file.path.replace(/\\/g, '/').replace(/^[a-zA-Z]:\//, '')
              : '';

            return (
              <div
                key={file.id || file.path}
                onClick={() => onSelect && onSelect(file)}
                className={`flex items-center gap-3 p-2 rounded-xl transition-all cursor-pointer group ${
                  isSelected
                    ? 'bg-white/10 text-white'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {/* 正方形微缩封面 */}
                <div className="w-9 h-9 rounded-lg bg-black/60 border border-white/5 shrink-0 overflow-hidden flex items-center justify-center relative">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : isVideo ? (
                    <Video className="w-4 h-4 text-violet-400" />
                  ) : isAudio ? (
                    <Music className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <FileText className="w-4 h-4 text-indigo-400" />
                  )}
                </div>

                {/* 文件名 + 路径双行结构 */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <div className="text-xs font-semibold truncate text-slate-100 group-hover:text-white leading-tight flex items-center gap-1.5">
                    {file.mentionTag && (
                      <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono text-[10px] font-bold shrink-0">
                        {file.mentionTag}
                      </span>
                    )}
                    <span className="truncate">{file.name}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5 opacity-80">
                    {displayPath}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
