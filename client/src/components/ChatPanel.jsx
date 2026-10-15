import React, { useState, useRef, useEffect } from 'react';
import MarkdownMessage from './stream/MarkdownMessage.jsx';
import { 
  Send, Bot, User, Sparkles, Settings, 
  Cpu, Terminal, Activity, ArrowRight, CheckCircle2, Loader2, Zap, Layers, Film, Download, AlertCircle,
  ChevronDown, Check, ArrowUp, Plus, Sliders, Copy, Trash2, Paperclip, X, Music, Image as ImageIcon, FileText,
  RefreshCw, PanelLeftClose
} from 'lucide-react';
import { mediaUrl } from '@/lib/apiClient.js';
import ModelSelectDropdown from './common/ModelSelectDropdown.jsx';
import { formatAgentDisplayName } from '@/utils/agentUtils.js';

/**
 * 生图结果的可播放地址解析。
 * 后端 imageGenerator 同时返回 localPath（绝对磁盘路径）与 imageUrl
 * （形如 /output/images/x.png 的相对 URL）。桌面端 origin 为 tauri://localhost，
 * 相对 URL 会 404，因此优先用 localPath 走 /api/assets/stream 出口。
 */
function resolveImageSrc(img) {
  if (!img) return '';
  if (img.localPath) return mediaUrl(img.localPath);
  return img.imageUrl || img.url || '';
}

const AGENT_ORDER = [
  'super-brain',
  'director',
  'screenwriter',
  'visual-artist',
  'timeline-editor',
  'vision-scout',
  'org-architect'
];

export default function ChatPanel({ 
  messages = [], 
  onSendMessage, 
  onClearMessages,
  isStreaming,
  isConfigured,
  providers = [],
  activeProvider,
  activeModelId,
  onSelectActive,
  agents = [],
  activeAgentId,
  onSelectAgent,
  onRefreshAgents,
  onOpenSettings,
  onOpenProjectSettings,
  onNavigateTab,
  chatPrefill,
  assetReference,
  currentProject,
  onCollapse
}) {
  const [input, setInput] = useState('');
  const [referencedAssets, setReferencedAssets] = useState([]);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState(false);
  const [isRefreshingAgents, setIsRefreshingAgents] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState(null);

  const handleRefreshAgents = async (e) => {
    if (e) e.stopPropagation();
    if (!onRefreshAgents || isRefreshingAgents) return;
    setIsRefreshingAgents(true);
    try {
      await onRefreshAgents();
    } finally {
      setTimeout(() => setIsRefreshingAgents(false), 300);
    }
  };
  const modelDropdownRef = useRef(null);
  const agentDropdownRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const quickActionsRef = useRef(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const dragDistanceRef = useRef(0);

  const handleMouseDown = (e) => {
    if (!quickActionsRef.current) return;
    isDraggingRef.current = true;
    dragDistanceRef.current = 0;
    startXRef.current = e.pageX - quickActionsRef.current.offsetLeft;
    scrollLeftRef.current = quickActionsRef.current.scrollLeft;
  };

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current || !quickActionsRef.current) return;
    e.preventDefault();
    const x = e.pageX - quickActionsRef.current.offsetLeft;
    const walk = (x - startXRef.current);
    dragDistanceRef.current = Math.abs(walk);
    quickActionsRef.current.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false;
  };

  const handleWheelHorizontal = (e) => {
    if (!quickActionsRef.current) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      quickActionsRef.current.scrollLeft += e.deltaY;
    }
  };

  const handleCopyMessage = (msgId, content) => {
    if (!content) return;
    const textToCopy = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).catch(() => {
        fallbackCopyTextToClipboard(textToCopy);
      });
    } else {
      fallbackCopyTextToClipboard(textToCopy);
    }
    setCopiedMessageId(msgId);
    setTimeout(() => {
      setCopiedMessageId(null);
    }, 1800);
  };

  const fallbackCopyTextToClipboard = (text) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (err) {}
    document.body.removeChild(textArea);
  };

  const hasModels = Array.isArray(activeProvider?.models) && activeProvider.models.length > 0;
  const activeModelObj = activeProvider?.models?.find(m => m.id === activeModelId) || (hasModels ? activeProvider.models[0] : null);
  const currentAgent = (agents || []).find(a => a.id === activeAgentId) || agents?.[0] || { id: 'super-brain', name: 'Super Brain', title: '参谋总长' };

  useEffect(() => {
    function handleClickOutside(event) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target)) {
        setIsModelDropdownOpen(false);
      }
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(event.target)) {
        setIsAgentDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  useEffect(() => {
    if (chatPrefill) {
      setInput(chatPrefill);
      inputRef.current?.focus();
    }
  }, [chatPrefill]);

  // 监听外部素材库引用事件：以标签形式追加至引用素材列表，并自动聚焦输入框供用户打字输入指令
  useEffect(() => {
    if (assetReference && (assetReference.path || assetReference.name)) {
      setReferencedAssets(prev => {
        const key = assetReference.path || assetReference.name;
        const exists = prev.some(a => (a.path && a.path === assetReference.path) || a.name === assetReference.name);
        if (exists) return prev;
        return [...prev, assetReference];
      });
      inputRef.current?.focus();
    }
  }, [assetReference]);

  const handleInsertToInput = (textToInsert) => {
    setInput(textToInsert);
    inputRef.current?.focus();
  };

  const handleSend = (textToSend) => {
    const rawText = textToSend !== undefined ? textToSend : input;
    const trimmed = rawText.trim();
    if (!trimmed && referencedAssets.length === 0) return;
    if (isStreaming) return;
    if (!isConfigured) {
      onOpenSettings();
      return;
    }

    // 格式化指定素材引用上下文，让智能体 100% 精确获知文件与绝对路径
    let finalText = trimmed;
    if (referencedAssets.length > 0) {
      const assetsBlock = referencedAssets.map(a => 
        `- 文件名: 【${a.name}】\n  完整路径: ${a.path || a.relPath}\n  类型: ${a.type} (大小: ${a.sizeFormatted || '未知'})`
      ).join('\n');

      finalText = trimmed
        ? `${trimmed}\n\n【指定引用素材】\n${assetsBlock}`
        : `请帮我分析以下指定的素材：\n\n【指定引用素材】\n${assetsBlock}`;
    }

    onSendMessage(finalText, {
      referencedAssets: [...referencedAssets],
      rawUserText: trimmed
    });

    if (textToSend === undefined) {
      setInput('');
      setReferencedAssets([]);
      setSelectedAssetId(null);
    }
  };

  const handleKeyDown = (e) => {
    // 1. Enter 发送（Shift+Enter 换行）
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    // 2. 像删除文本一样删除引用标签：光标在最开头且按 Backspace
    if (e.key === 'Backspace') {
      const isAtStart = e.target.selectionStart === 0 && e.target.selectionEnd === 0;
      if (isAtStart && referencedAssets.length > 0) {
        e.preventDefault();
        if (selectedAssetId) {
          setReferencedAssets(prev => prev.filter(a => (a.path || a.name) !== selectedAssetId));
          setSelectedAssetId(null);
        } else {
          setReferencedAssets(prev => prev.slice(0, -1));
        }
        return;
      }
    }

    // 3. 按 Delete 键：光标在最开头且文本为空，或当前有选中标签
    if (e.key === 'Delete') {
      const isAtStart = e.target.selectionStart === 0 && e.target.selectionEnd === 0;
      if (referencedAssets.length > 0) {
        if (selectedAssetId) {
          e.preventDefault();
          setReferencedAssets(prev => prev.filter(a => (a.path || a.name) !== selectedAssetId));
          setSelectedAssetId(null);
          return;
        } else if (input.trim() === '' && isAtStart) {
          e.preventDefault();
          setReferencedAssets(prev => prev.slice(0, -1));
          return;
        }
      }
    }

    // 4. 用户正常输入文本时取消标签选中态
    if (selectedAssetId && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      setSelectedAssetId(null);
    }
  };

  // 渲染用户对话气泡内容：将引用的素材优雅展示为胶囊 Badge，并保留自然指令文本
  const renderUserBubbleContent = (msg) => {
    let mainText = msg.content || '';
    let assets = Array.isArray(msg.referencedAssets) ? msg.referencedAssets : [];

    // 智能提取文本中的引用素材结构（兼容从历史记录或持久化 JSON 中读取的消息）
    if (assets.length === 0 && mainText.includes('【指定引用素材】')) {
      const parts = mainText.split('【指定引用素材】');
      mainText = parts[0].trim();
      const assetLines = parts[1] || '';
      const fileMatches = [...assetLines.matchAll(/- 文件名:\s*【?([^】\n]+)】?[\s\S]*?完整路径:\s*([^\n]+)/g)];
      for (const match of fileMatches) {
        const fName = match[1].trim();
        assets.push({
          name: fName,
          path: match[2].trim(),
          type: fName.match(/\.(mp4|mov|webm|mkv|avi)$/i) ? 'video' : fName.match(/\.(mp3|wav|aac|flac)$/i) ? 'audio' : 'file'
        });
      }
    } else if (assets.length > 0 && mainText.includes('【指定引用素材】')) {
      mainText = mainText.split('【指定引用素材】')[0].trim();
    }

    return (
      <div className="space-y-1.5">
        {assets.length > 0 && (
          <div className="flex flex-wrap gap-1 pb-1.5 border-b border-white/20 mb-1">
            {assets.map((ast, i) => (
              <div
                key={i}
                title={`指定素材：${ast.name}\n完整物理路径：${ast.path || ast.relPath || ''}`}
                className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-black/30 text-white/95 text-[11px] font-medium border border-white/20 backdrop-blur-sm select-none"
              >
                <Paperclip className="w-2.5 h-2.5 text-cyan-300 shrink-0" />
                <span className="truncate max-w-[190px]">{ast.name}</span>
              </div>
            ))}
          </div>
        )}
        <div className="whitespace-pre-wrap">{mainText || '（已指定引用素材）'}</div>
      </div>
    );
  };

  const quickActions = [
    { label: '💡 推荐 3 个爆款剪辑选题', prompt: '请分析当前可做内容或行业爆款趋势，给我推荐 3 个不同风格维度的爆款剪辑选题方案。' },
    { label: '🎯 梳理素材剪辑思路与切入点', prompt: '我手头有一批录屏和视频素材，不知道可以怎么剪，请帮我梳理切入角度、叙事结构与亮点。' },
    { label: '🔥 拆解爆款视频黄金3秒钩子', prompt: '请帮我构思几个具有强反差和视觉吸引力的黄金3秒开头钩子文案。' },
    { label: '📝 优化视频口播文案与台词节奏', prompt: '请帮我构思一段通俗易懂、口语化且富有感染力的视频解说台词与文案脚本。' },
  ];

  return (
    <div className="h-full flex flex-col bg-dark-900">
      {/* 顶部极简状态栏：展示 Agent 就绪 / 思考状态，并提供清空对话与收起面板入口 */}
      <div className="h-9 px-3.5 border-b border-dark-800/80 bg-dark-850/40 backdrop-blur flex items-center justify-between shrink-0 select-none text-xs">
        <div className="flex items-center space-x-2 text-gray-400 min-w-0">
          <Bot className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
          <span className="font-medium text-gray-300 truncate">
            {formatAgentDisplayName(currentAgent) || 'AI 创作助手'}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-brand-500/10 text-brand-cyan border border-brand-500/20">
            对话助手
          </span>
        </div>

        {/* 右侧：清空对话、实时 Agent 运行状态指示，以及最右侧无边框无背景的收起按钮 */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={onClearMessages}
            disabled={messages.length === 0 || isStreaming}
            className="flex items-center space-x-1 text-gray-400 hover:text-red-400 disabled:opacity-30 disabled:pointer-events-none transition text-[11px] px-2 py-0.5 rounded hover:bg-dark-800/80"
            title="清空当前对话记录"
          >
            <Trash2 className="w-3 h-3" />
            <span>清空</span>
          </button>

          {isStreaming ? (
            <span className="flex items-center space-x-1.5 text-[11px] text-brand-cyan font-medium animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>思考分析中...</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1.5 text-[11px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>Agent 就绪</span>
            </span>
          )}

          {/* 收起按钮：默认在 Agent就绪右侧，无背景无边框 */}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="flex items-center justify-center p-1 bg-transparent border-0 text-gray-400 hover:text-white transition cursor-pointer group"
              title="收起对话面板 (Ctrl+B)"
            >
              <PanelLeftClose className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </button>
          )}
        </div>
      </div>
      {/* 资产目录未设置提示 */}
      {currentProject && !currentProject.assetDir && (
        <div className="mx-3 mt-3 mb-1 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-center justify-between text-xs text-amber-300 shrink-0 shadow-sm animate-fade-in">
          <div className="flex items-center space-x-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <p className="font-semibold text-amber-200">当前项目尚未设置素材库目录</p>
              <p className="text-[11px] text-amber-400/80">请先指定素材存放路径，AI 助手才能分析您的素材并规划分镜。</p>
            </div>
          </div>
          <button
            onClick={onOpenProjectSettings || onOpenSettings}
            className="ml-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-dark-950 font-semibold rounded-lg text-[11px] whitespace-nowrap transition active:scale-95 shadow"
          >
            设置素材库
          </button>
        </div>
      )}

      {/* Messages Scroll Area - 严格 overflow-y-auto overflow-x-hidden */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4">
        {/* 空状态展示：绝不渲染死消息 */}
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
            {!isConfigured ? (
              /* 未配置提供商状态 */
              <div className="max-w-xs bg-dark-800/80 border border-dark-700 p-6 rounded-2xl shadow-xl flex flex-col items-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Settings className="w-6 h-6 animate-pulse" />
                </div>
                <h4 className="font-bold text-sm text-white">请先配置模型提供商</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  检测到尚未配置可用端点或模型。请先填入你的 API Base URL、Key 与模型 ID 即可开始对话。
                </p>
                <button
                  onClick={onOpenSettings}
                  className="w-full py-2 px-3 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition shadow-lg shadow-brand-500/20"
                >
                  <span>前往配置模型</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              /* 已配置就绪的纯净引导状态 */
              <div className="max-w-sm flex flex-col items-center space-y-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg bg-gradient-to-tr from-brand-600 to-brand-cyan text-white shadow-brand-500/20">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">
                    {formatAgentDisplayName(currentAgent) || 'AI 创作助手'}
                  </h4>
                  <div className="flex items-center justify-center space-x-1 text-xs text-gray-400 mt-1">
                    <span>当前模型:</span>
                    <span className="font-mono text-brand-cyan bg-brand-500/10 px-1.5 py-0.5 rounded border border-brand-500/20">
                      {activeProvider?.name} / {activeModelId}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed text-center px-2">
                  支持自然语言创作探讨、爆款选题推演、剧本构思与素材创意分析。
                </p>
                <div className="flex flex-col w-full space-y-1.5 pt-2">
                  {quickActions.slice(0, 3).map((qa, i) => (
                    <button
                      key={i}
                      onClick={() => handleInsertToInput(qa.prompt)}
                      className="text-left text-xs bg-dark-800 hover:bg-dark-700/80 border border-dark-700 p-2.5 rounded-xl text-gray-300 hover:text-white transition flex items-center justify-between"
                      title="点击填入对话框"
                    >
                      <span>{qa.label}</span>
                      <ArrowRight className="w-3 h-3 text-gray-500" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 消息渲染列表 */}
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isTaskSummary = msg.role === 'task_summary';
          const isSystemNotice = msg.role === 'system_notice';
          const isAgentAction = msg.role === 'agent_action' || msg.role === 'action_event';

          // 0. Agent 工具调用自主执行卡片
          if (isAgentAction) {
            const isDone = msg.status === 'completed' || (!msg.status && msg.content && !msg.content.includes('调度底层'));
            const isExecuting = msg.status === 'executing';
            const isError = msg.status === 'error';

            return (
              <div 
                key={msg.id}
                className={`group my-3 mx-2 p-3.5 rounded-2xl border text-xs transition-all duration-300 ${
                  isExecuting
                    ? 'bg-dark-800/90 border-brand-500/50 shadow-lg shadow-brand-500/10 ring-1 ring-brand-500/20'
                    : isDone
                    ? 'bg-dark-800/90 border-dark-700/80 shadow-md'
                    : 'bg-dark-800/90 border-rose-500/30'
                }`}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-dark-700/70">
                  <div className="flex items-center space-x-2 text-brand-cyan font-bold">
                    <Zap className="w-4 h-4 text-brand-cyan" />
                    <span>{msg.title || '⚡ Agent 自主调度工具'}</span>
                  </div>
                  <div className="flex items-center space-x-1.5 font-mono text-[10px]">
                    {isExecuting && (
                      <span className="flex items-center space-x-1 text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>后台执行中...</span>
                      </span>
                    )}
                    {isDone && (
                      <span className="flex items-center space-x-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>执行完成{msg.elapsedSec ? ` · ${msg.elapsedSec}s` : ''}</span>
                      </span>
                    )}
                    {isError && (
                      <span className="text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-full">
                        执行失败
                      </span>
                    )}

                    {/* 纯图标复制按钮（hover 显示） */}
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-dark-750 hover:bg-dark-700 text-gray-400 hover:text-white border border-dark-650 ml-1"
                      title="复制内容"
                      aria-label="复制内容"
                    >
                      {copiedMessageId === msg.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                <p className="text-gray-300 leading-relaxed mb-2 font-sans">{msg.content}</p>

                {/* 真实生图结果图片预览 */}
                {msg.outputOverview && (() => {
                  const imgs = Array.isArray(msg.outputOverview.images) && msg.outputOverview.images.length > 0
                    ? msg.outputOverview.images
                    : (msg.outputOverview.image ? [msg.outputOverview.image] : []);
                  if (imgs.length === 0) return null;
                  return (
                    <div className="mb-2 space-y-2">
                      <div className="text-[11px] font-semibold text-brand-cyan flex items-center space-x-1">
                        <span>🎨 生图结果预览</span>
                        <span className="text-gray-500">({imgs.length} 张)</span>
                      </div>
                      <div className={`grid gap-2 ${imgs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {imgs.map((img, idx) => (
                          <div key={idx} className="rounded-lg overflow-hidden border border-dark-700 bg-dark-950/60 group/img relative">
                            <img
                              src={resolveImageSrc(img)}
                              alt={`生成图片 ${idx + 1}`}
                              className="w-full h-auto object-contain max-h-80 bg-black/40"
                              loading="lazy"
                            />
                            <div className="p-1.5 text-[9px] text-gray-400 font-mono flex items-center justify-between gap-1">
                              <span className="truncate">{img.filename || `image_${idx + 1}`}</span>
                              <a
                                href={resolveImageSrc(img)}
                                target="_blank"
                                rel="noreferrer"
                                download
                                className="shrink-0 text-brand-cyan hover:text-white underline"
                              >
                                下载
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* 任务输出概览指标卡 */}
                {msg.outputOverview && (
                  <div className="p-2.5 rounded-xl bg-dark-950/70 border border-dark-750 text-[11px] font-mono text-gray-300 space-y-1 mb-2">
                    {msg.outputOverview.count !== undefined && (
                      <div>已生成分镜: <span className="text-brand-cyan font-bold">{msg.outputOverview.count} 个镜头</span></div>
                    )}
                    {msg.outputOverview.draftPath && (
                      <div>剪映草稿目录: <span className="text-emerald-400 break-all">{msg.outputOverview.draftPath}</span></div>
                    )}
                    {msg.outputOverview.storyboard && (
                      <div>时间轴镜头: <span className="text-white">{msg.outputOverview.storyboard.length} 段已对齐</span></div>
                    )}
                    {msg.outputOverview.delegatedTo && (
                      <div>已调度智能体: <span className="text-amber-400 font-bold">{msg.outputOverview.targetAgentName || msg.outputOverview.delegatedTo}</span></div>
                    )}
                    {msg.outputOverview.isMcpTest && (
                      <div className="space-y-1.5 pt-1.5 border-t border-dark-750">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">测试目标:</span>
                          <span className="text-white font-bold">{msg.outputOverview.serverName} ({msg.outputOverview.task})</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">服务健康:</span>
                          <span className={msg.outputOverview.healthStatus === 'healthy' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                            {msg.outputOverview.healthStatus === 'healthy' ? '● 正常 (Healthy)' : '▲ 降级 (Degraded)'}
                          </span>
                        </div>
                        {msg.outputOverview.browserExists !== undefined && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">Chrome驱动:</span>
                            <span className={msg.outputOverview.browserExists ? 'text-emerald-400' : 'text-rose-400 font-bold'}>
                              {msg.outputOverview.browserExists ? '已就绪' : '未找到 Chrome.exe'}
                            </span>
                          </div>
                        )}
                        {msg.outputOverview.authStatus && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">会话授权:</span>
                            <span className={msg.outputOverview.authStatus === 'ready' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                              {msg.outputOverview.authStatus === 'ready' ? '已授权通过 (Ready)' : `需处理 (${msg.outputOverview.authStatus})`}
                            </span>
                          </div>
                        )}
                        {msg.outputOverview.canGenerateImage !== undefined && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-400">跑图能力:</span>
                            <span className={msg.outputOverview.canGenerateImage ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                              {msg.outputOverview.canGenerateImage ? '通道畅通 (Ready to Generate)' : '阻断未就绪 (Blocked)'}
                            </span>
                          </div>
                        )}
                        {msg.outputOverview.error && (
                          <div className="mt-1.5 p-2 rounded bg-rose-950/40 border border-rose-800/40 text-rose-300">
                            <div className="font-semibold text-rose-400">⚠️ 检测到异常:</div>
                            <div className="text-[10px] break-all">{msg.outputOverview.error}</div>
                          </div>
                        )}
                        {Array.isArray(msg.outputOverview.suggestions) && msg.outputOverview.suggestions.length > 0 && (
                          <div className="mt-1.5 p-2 rounded bg-amber-950/30 border border-amber-800/30 text-amber-200">
                            <div className="font-semibold text-amber-400">💡 排查与自愈建议:</div>
                            <ul className="list-disc list-inside space-y-0.5 text-[10px]">
                              {msg.outputOverview.suggestions.map((s, idx) => (
                                <li key={idx}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Google Flow 登录自愈快捷动作按钮 */}
                        {msg.outputOverview.serverName === 'google-flow' && msg.outputOverview.authStatus && msg.outputOverview.authStatus !== 'ready' && (
                          <div className="mt-2 pt-2 border-t border-dark-700/60 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => onSendMessage && onSendMessage('请执行 start_login 自动拉起 Google Flow 专用登录窗口')}
                              className="inline-flex items-center space-x-1 text-[11px] font-semibold text-amber-300 hover:text-white bg-amber-600/30 hover:bg-amber-600 px-2.5 py-1 rounded border border-amber-500/40 transition shadow-sm active:scale-95"
                            >
                              <span>🚀 自动拉起登录窗口</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onSendMessage && onSendMessage('我已在弹出的专用 Chrome 中登录 Google Flow 并关闭窗口，请一键确认登录检查点并恢复生图任务')}
                              className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-300 hover:text-white bg-emerald-600/30 hover:bg-emerald-600 px-2.5 py-1 rounded border border-emerald-500/40 transition shadow-sm active:scale-95"
                            >
                              <span>✅ 我已登录，确认并继续</span>
                            </button>
                          </div>
                        )}

                        {msg.outputOverview.serverName === 'google-flow' && msg.outputOverview.task === 'start_login' && (
                          <div className="mt-2 pt-2 border-t border-dark-700/60">
                            <button
                              type="button"
                              onClick={() => onSendMessage && onSendMessage('我已在弹出的专用 Chrome 中登录 Google Flow 并关闭窗口，请一键确认登录检查点并恢复生图任务')}
                              className="w-full inline-flex items-center justify-center space-x-1 text-[11px] font-semibold text-emerald-300 hover:text-white bg-emerald-600/30 hover:bg-emerald-600 px-3 py-1.5 rounded border border-emerald-500/40 transition shadow-sm active:scale-95"
                            >
                              <span>✅ 我已完成登录并关闭窗口，一键确认凭据并继续生图</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}


                {msg.targetTab && onNavigateTab && (
                  <button
                    onClick={() => onNavigateTab(msg.targetTab)}
                    className="inline-flex items-center space-x-1 text-brand-cyan hover:underline font-semibold text-xs pt-1"
                  >
                    <span>查看对应右侧面板</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          }

          // 1. 任务状态汇总卡片（专属 UI 样式，且标记 excludeFromContext: true）
          if (isTaskSummary) {
            return (
              <div 
                key={msg.id}
                className="group my-3 mx-2 p-3.5 rounded-2xl bg-dark-800/90 border border-brand-500/30 shadow-md text-xs text-gray-300 space-y-2"
              >
                <div className="flex items-center justify-between pb-2 border-b border-dark-700">
                  <div className="flex items-center space-x-1.5 text-brand-cyan font-bold">
                    <Activity className="w-3.5 h-3.5" />
                    <span>{msg.title || '任务状态汇报'}</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[10px] text-gray-500 font-mono bg-dark-900 px-2 py-0.5 rounded-full border border-dark-750">
                      任务状态汇报
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md bg-dark-750 hover:bg-dark-700 text-gray-400 hover:text-white border border-dark-650"
                      title="复制内容"
                      aria-label="复制内容"
                    >
                      {copiedMessageId === msg.id ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
                <p className="text-gray-200 leading-relaxed">{msg.content}</p>

                {/* 结构化产物概览 */}
                {msg.outputOverview && (
                  <div className="p-2.5 rounded-xl bg-dark-950/80 border border-dark-750 text-[11px] font-mono text-gray-300 space-y-1">
                    {msg.outputOverview.probedClips !== undefined && (
                      <div>已探针切片: <span className="text-white font-bold">{msg.outputOverview.probedClips} 个</span></div>
                    )}
                    {msg.outputOverview.totalDurationFormatted && (
                      <div>素材总时长: <span className="text-brand-cyan font-bold">{msg.outputOverview.totalDurationFormatted}</span></div>
                    )}
                    {msg.outputOverview.storyboardCount !== undefined && (
                      <div>规划分镜数: <span className="text-white font-bold">{msg.outputOverview.storyboardCount} 镜</span></div>
                    )}
                    {msg.outputOverview.draftPath && (
                      <div>剪映工程: <span className="text-emerald-400 break-all">{msg.outputOverview.draftPath}</span></div>
                    )}
                  </div>
                )}
              </div>
            );
          }

          // 2. 居中系统弱提示
          if (isSystemNotice) {
            return (
              <div key={msg.id} className="text-center my-2">
                <span className="text-[10px] bg-dark-800 text-gray-500 border border-dark-700 px-2.5 py-1 rounded-full font-mono">
                  {msg.content}
                </span>
              </div>
            );
          }

          // 3. 常规对话消息（User & Assistant）
          return (
            <div
              key={msg.id}
              className={`flex items-start space-x-3 group/msg ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              {!isUser && (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-brand-cyan flex items-center justify-center text-white shrink-0 shadow-md shadow-brand-500/20 mt-1">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`relative max-w-[92%] sm:max-w-[88%] w-fit rounded-2xl px-4 py-3 pr-9 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-gradient-to-br from-indigo-500/20 via-[#28334B] to-violet-500/15 border border-indigo-300/15 text-slate-200 rounded-tr-none shadow-md shadow-indigo-950/25'
                    : 'bg-dark-800 border border-dark-700 text-gray-200 rounded-tl-none'
                }`}
              >
                {/* 纯图标复制按钮（hover 显示） */}
                <button
                  type="button"
                  onClick={() => handleCopyMessage(msg.id, msg.content)}
                  className={`absolute top-2.5 right-2.5 p-1 rounded-md transition-all duration-150 opacity-0 group-hover/msg:opacity-100 ${
                    isUser
                      ? 'bg-brand-700/90 hover:bg-brand-800 text-white/80 hover:text-white border border-brand-500/40'
                      : 'bg-dark-750/90 hover:bg-dark-700 text-gray-400 hover:text-white border border-dark-650'
                  } shadow-sm`}
                  title="复制内容"
                  aria-label="复制内容"
                >
                  {copiedMessageId === msg.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>

                {!isUser ? (
                  <MarkdownMessage className="text-gray-200">{msg.content}</MarkdownMessage>
                ) : (
                  renderUserBubbleContent(msg)
                )}
              </div>

              {isUser && (
                <div className="w-8 h-8 rounded-lg bg-dark-700 flex items-center justify-center text-gray-300 shrink-0 mt-1 border border-dark-600">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {/* 思考中打字指示器 */}
        {isStreaming && (
          <div className="flex items-center space-x-2 text-xs text-brand-cyan animate-pulse">
            <Bot className="w-4 h-4" />
            <span>Agent 正在深度分析中...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 现代化 Agent 底部面板 (与信息流平级，苹果磨砂半透明质感，顶部带精致淡边缘线) */}
      <div className="shrink-0 w-full relative z-20 glass-panel-apple select-none">
        
        {/* 运行状态流光炫彩环绕边缘 (isStreaming 激活时流光绚烂流动) */}
        {isStreaming && (
          <div className="absolute top-0 left-0 right-0 h-[2px] animate-neon-flow z-40 pointer-events-none" />
        )}

        {/* Quick Action Chips (横排水平平滑滚动，支持鼠标横向拖拽与滚轮) */}
        {isConfigured && messages.length > 0 && (
          <div 
            ref={quickActionsRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onWheel={handleWheelHorizontal}
            className="px-3 pt-2 pb-1.5 flex items-center space-x-2 overflow-x-auto no-scrollbar cursor-grab active:cursor-grabbing select-none"
          >
            {quickActions.map((qa, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (dragDistanceRef.current < 5) {
                    handleInsertToInput(qa.prompt);
                  }
                }}
                disabled={isStreaming}
                className="text-[11px] whitespace-nowrap bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] hover:border-white/[0.16] text-gray-200 hover:text-white px-2.5 py-1 rounded-full transition disabled:opacity-50 shrink-0 shadow-sm backdrop-blur-md"
                title="点击填入对话框（可横向拖动）"
              >
                {qa.label}
              </button>
            ))}
          </div>
        )}

        {/* 快捷信息按钮和输入框直接加条线 (精致毛玻璃微光分割线) */}
        <div className={`w-full flex flex-col ${isConfigured && messages.length > 0 ? 'glass-divider' : ''}`}>
          
          {/* 引用素材标签条：以高颜值胶囊 Tag 形式展示，支持鼠标 X 移除或键盘 Backspace / Del 快速退格删除 */}
          {referencedAssets.length > 0 && (
            <div className="px-3.5 pt-2 pb-1.5 flex flex-wrap items-center gap-1.5 bg-dark-950/40 border-b border-dark-750/40 select-none">
              <div className="text-[10px] text-gray-400 font-mono flex items-center space-x-1 mr-1 shrink-0">
                <Paperclip className="w-3 h-3 text-brand-cyan" />
                <span>指定素材:</span>
              </div>
              {referencedAssets.map((asset) => {
                const isVideo = asset.type === 'video';
                const isAudio = asset.type === 'audio';
                const isImage = asset.type === 'image';
                const key = asset.path || asset.name;
                const isSelected = selectedAssetId === key;

                return (
                  <div
                    key={key}
                    onClick={() => setSelectedAssetId(isSelected ? null : key)}
                    title={`指定引用文件：${asset.name}\n完整物理路径：${asset.path || asset.relPath}\n格式类型：${asset.type} (${asset.sizeFormatted || '未知大小'})\n操作提示：点击 X 移除，或光标在输入框首位按 Backspace / Del 键删除`}
                    className={`group inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-lg text-[11px] font-medium transition cursor-pointer max-w-[260px] ${
                      isSelected
                        ? 'ring-2 ring-brand-cyan bg-brand-500/25 text-white'
                        : isVideo
                        ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400/60 hover:bg-cyan-500/15'
                        : isAudio
                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:border-amber-400/60 hover:bg-amber-500/15'
                        : isImage
                        ? 'bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:border-purple-400/60 hover:bg-purple-500/15'
                        : 'bg-dark-750 text-gray-300 border border-dark-650 hover:border-gray-500'
                    }`}
                  >
                    <span className="shrink-0">
                      {isVideo && <Film className="w-3 h-3 text-cyan-400" />}
                      {isAudio && <Music className="w-3 h-3 text-amber-400" />}
                      {isImage && <ImageIcon className="w-3 h-3 text-purple-400" />}
                      {!isVideo && !isAudio && !isImage && <FileText className="w-3 h-3 text-gray-400" />}
                    </span>

                    <span className="truncate max-w-[160px] sm:max-w-[200px]">
                      {asset.name}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReferencedAssets(prev => prev.filter(a => (a.path || a.name) !== key));
                        if (selectedAssetId === key) setSelectedAssetId(null);
                        inputRef.current?.focus();
                      }}
                      className="p-0.5 rounded-full hover:bg-white/20 text-gray-400 hover:text-white transition shrink-0 ml-0.5 cursor-pointer"
                      title="移除此素材引用"
                    >
                      <X className="w-2.5 h-2.5 stroke-[2.5]" />
                    </button>
                  </div>
                );
              })}

              <span className="text-[10px] text-gray-500 font-mono ml-auto hidden sm:inline-block">
                光标首位按 Del / Backspace 可删除
              </span>
            </div>
          )}

          {/* 上半部：无边框多行随心输入区 */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            disabled={!isConfigured}
            placeholder={
              !isConfigured 
                ? "请先配置模型提供商，即可开启创作对话..." 
                : referencedAssets.length > 0
                ? "已指定素材引用，请直接输入您对该素材的具体探讨或问题...（Enter 发送）"
                : "输入消息与 AI 助手对话，支持拖入或选择素材...（Shift+Enter 换行）"
            }
            rows={2}
            className="w-full bg-transparent px-4 pt-3 pb-1 text-xs text-gray-100 placeholder-gray-400 focus:outline-none resize-none transition disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
          />

          {/* 下半部：操作控制条（左侧干净清爽，右侧模型选择与发送） */}
          <div className="px-3 pb-2 pt-1 flex items-center justify-between gap-2 border-t border-dark-700/30">
            
            {/* 左侧提示：Agent 运行状态 */}
            <div className="flex items-center space-x-2 text-[11px] text-gray-500 font-mono">
              {isStreaming && (
                <span className="flex items-center space-x-1.5 text-cyan-400 font-medium animate-pulse text-[11px]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Agent 正在深度思考输出中...</span>
                </span>
              )}
            </div>

            {/* 右侧操作：智能体选择 + 模型切换 + 极简圆环发送按钮 */}
            <div className="flex items-center space-x-2 shrink-0">
              
              {/* 智能体选择器 */}
              {Array.isArray(agents) && agents.length > 0 && (
                <div className="relative" ref={agentDropdownRef}>
                  <button
                    type="button"
                    onClick={() => {
                      const nextOpen = !isAgentDropdownOpen;
                      setIsAgentDropdownOpen(nextOpen);
                      if (nextOpen) {
                        handleRefreshAgents();
                      }
                      setIsModelDropdownOpen(false);
                    }}
                    className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white px-2 py-1 rounded-lg hover:bg-dark-750/60 transition"
                    title="点击切换智能体"
                  >
                    <Bot className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
                    <span className="font-medium max-w-[140px] truncate">
                      {formatAgentDisplayName(currentAgent) || '选择智能体'}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isAgentDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isAgentDropdownOpen && (
                    <div className="absolute right-0 bottom-full mb-2 w-64 bg-dark-800 border border-dark-650 rounded-2xl shadow-2xl py-1 z-[100] animate-in fade-in slide-in-from-bottom-2 duration-150">
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-dark-700/60 flex items-center justify-between">
                        <span>选择智能体 ({agents.length})</span>
                        <button
                          type="button"
                          onClick={handleRefreshAgents}
                          className="p-1 text-gray-400 hover:text-white rounded hover:bg-dark-700 transition"
                          title="刷新智能体列表 (热读取本地 agents 目录)"
                        >
                          <RefreshCw className={`w-3 h-3 ${isRefreshingAgents ? 'animate-spin text-brand-cyan' : ''}`} />
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto py-1">
                        {[...(agents || [])].sort((a, b) => {
                          const indexA = AGENT_ORDER.indexOf(a.id);
                          const indexB = AGENT_ORDER.indexOf(b.id);
                          if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                          if (indexA !== -1) return -1;
                          if (indexB !== -1) return 1;
                          return (a.name || a.id).localeCompare(b.name || b.id, 'zh-CN');
                        }).map(ag => {
                          const isSelected = ag.id === currentAgent?.id;
                          const isCustom = Boolean(ag.custom);
                          return (
                            <button
                              key={ag.id}
                              type="button"
                              onClick={() => {
                                onSelectAgent && onSelectAgent(ag.id);
                                setIsAgentDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-dark-700/80 transition ${
                                isSelected ? 'bg-brand-500/10 text-brand-cyan font-semibold' : 'text-gray-300'
                              }`}
                            >
                              <div className="flex items-center space-x-1.5 truncate mr-2">
                                <Bot className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-brand-cyan' : isCustom ? 'text-amber-400' : 'text-gray-400'}`} />
                                <span className="truncate">{formatAgentDisplayName(ag)}</span>
                              </div>
                              <div className="flex items-center space-x-1 shrink-0">
                                {isCustom && (
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">自定义</span>
                                )}
                                {isSelected && <Check className="w-3.5 h-3.5 text-brand-cyan shrink-0 ml-1" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 沉浸式模型切换器 (统一通用复用组件，自下而上弹出) */}
              <ModelSelectDropdown
                value={activeModelId}
                onChange={(mId, pId) => onSelectActive && onSelectActive(pId, mId)}
                providers={providers}
                variant="compact"
                placement="top"
                align="right"
                onOpenSettings={onOpenSettings}
              />

              {/* 现代极简发送按钮 (完美融入深色暗夜工作舱主题) */}
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={(!input.trim() && referencedAssets.length === 0) || isStreaming || !isConfigured}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                  (input.trim() || referencedAssets.length > 0) && !isStreaming && isConfigured
                    ? 'bg-gradient-to-r from-brand-600 to-brand-cyan hover:opacity-95 text-white shadow-md shadow-brand-500/20 active:scale-90 cursor-pointer'
                    : 'bg-dark-750 text-gray-500 border border-dark-700/60 cursor-not-allowed'
                }`}
                title="发送对话 (Enter)"
              >
                <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
