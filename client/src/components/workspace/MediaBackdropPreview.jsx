import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Music,
  FileText
} from 'lucide-react';
import { apiUrl, apiFetch } from '@/lib/apiClient.js';

/**
 * 沉浸式多模态淡黑图层预览器 (MediaBackdropPreview)
 * 
 * 核心规范：
 * 1. 透明度遮罩：半透明暗黑遮罩 (bg-black/45 backdrop-blur-[3px])，底层界面隐约可见
 * 2. 宽度规范：内容宽度占视窗 50% (w-[50vw])
 * 3. 播放控制：严禁自动播放 (autoPlay={false})
 * 4. 按钮精简：移除顶部悬浮条和其它冗杂按钮，仅保留内容右上角圆形小 × 关闭按钮
 * 5. 信息下移：顶部信息移至媒体下方，底部快捷键提示移除，仅展示文件绝对路径
 * 6. 平滑淡出：点击遮罩或 Esc 时触发淡出过渡 (fade-out) 退出
 */
export default function MediaBackdropPreview({
  file,
  isOpen = false,
  onClose
}) {
  const backdropRef = useRef(null);
  const [textContent, setTextContent] = useState('');
  const [isLoadingText, setIsLoadingText] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // 平滑淡出关闭
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      if (onClose) onClose();
    }, 180);
  };

  // 监听 Esc 快捷键关闭 (支持平滑淡出)
  useEffect(() => {
    if (!isOpen) {
      setIsClosing(false);
      return;
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // 如果是文本类文件，按需异步拉取内容预览
  useEffect(() => {
    if (!isOpen || !file) {
      setTextContent('');
      return;
    }
    const isTextDoc = file.type === 'document' || file.type === 'text' || 
      ['.txt', '.md', '.json', '.js', '.ts', '.py', '.html', '.css', '.sh', '.yaml', '.yml', '.env'].includes(file.ext?.toLowerCase());

    if (isTextDoc && file.path) {
      let isCancelled = false;
      setIsLoadingText(true);
      apiFetch(`/api/assets/stream?path=${encodeURIComponent(file.path)}`)
        .then(async res => {
          if (res.ok && !isCancelled) {
            const txt = await res.text();
            setTextContent(txt);
          }
        })
        .catch(err => {
          console.warn('[MediaBackdropPreview] 文本读取异常:', err);
          if (!isCancelled) setTextContent('暂无法预览该文档内容');
        })
        .finally(() => {
          if (!isCancelled) setIsLoadingText(false);
        });
      return () => { isCancelled = true; };
    }
  }, [isOpen, file]);

  if (!isOpen || !file) return null;

  const streamUrl = apiUrl(`/api/assets/stream?path=${encodeURIComponent(file.path)}`);
  const isVideo = file.type === 'video';
  const isAudio = file.type === 'audio';
  const isImage = file.type === 'image';
  const isTextDoc = file.type === 'document' || file.type === 'text' || 
    ['.txt', '.md', '.json', '.js', '.ts', '.py', '.html', '.css', '.sh', '.yaml', '.yml'].includes(file.ext?.toLowerCase());

  // 点击背景遮罩层空白处淡出关闭
  const handleBackdropClick = (e) => {
    if (e.target === backdropRef.current) {
      handleClose();
    }
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-[100] bg-black/45 backdrop-blur-[3px] flex flex-col items-center justify-center p-4 transition-all duration-200 select-none overflow-hidden ${
        isClosing ? 'opacity-0 scale-98 pointer-events-none' : 'opacity-100 scale-100 animate-in fade-in'
      }`}
    >
      {/* ── 核心内容容器 (占屏幕宽 50%) ── */}
      <div 
        className="relative w-[50vw] max-w-[50vw] min-w-[320px] flex flex-col items-center animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮：置于内容右侧外部，保持与内容约 16px 间隙，绝对定位零占位绝不影响内容水平居中 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          className="absolute left-[calc(100%+16px)] top-0 z-30 w-8 h-8 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60 flex items-center justify-center shadow-xl backdrop-blur-md transition-all hover:scale-110 cursor-pointer"
          title="关闭预览 (Esc 或点击空白处)"
        >
          <X className="w-4 h-4 stroke-[2.2]" />
        </button>

        {/* 媒体展示主体卡片 (内容宽度占满 50vw，禁止自动播放) */}
        <div className="w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-[#0B0F17] flex items-center justify-center relative">
          {/* 1. 视频：禁止自动播放 */}
          {isVideo && (
            <video
              src={streamUrl}
              controls
              autoPlay={false}
              className="w-full max-h-[65vh] object-contain outline-none bg-black"
            />
          )}

          {/* 2. 图片：高清居中自适应 */}
          {isImage && (
            <img
              src={streamUrl}
              alt={file.name}
              className="w-full max-h-[65vh] object-contain bg-black/30"
            />
          )}

          {/* 3. 音频：禁止自动播放 */}
          {isAudio && (
            <div className="w-full p-6 flex flex-col items-center space-y-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-lg">
                <Music className="w-7 h-7" />
              </div>
              <div className="font-semibold text-slate-100 text-sm truncate max-w-sm">
                {file.name}
              </div>
              <audio
                src={streamUrl}
                controls
                autoPlay={false}
                className="w-full max-w-md filter invert hue-rotate-180 brightness-90"
              />
            </div>
          )}

          {/* 4. 文档/代码纯文本预览 */}
          {isTextDoc && (
            <div className="w-full max-h-[65vh] p-5 flex flex-col text-left">
              <div className="flex-1 overflow-y-auto text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap select-text pr-2">
                {isLoadingText ? (
                  <div className="py-12 text-center text-slate-500">正在读取文档内容...</div>
                ) : textContent ? (
                  textContent
                ) : (
                  <div className="py-12 text-center text-slate-500">（空文档）</div>
                )}
              </div>
            </div>
          )}

          {/* 5. 通用/未适配二进制文件 */}
          {!isVideo && !isImage && !isAudio && !isTextDoc && (
            <div className="w-full p-8 flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <FileText className="w-7 h-7" />
              </div>
              <div className="text-sm font-semibold text-slate-100">{file.name}</div>
              <p className="text-xs text-slate-400 max-w-xs">
                该素材已载入上下文，智能体可随时进行调用处理
              </p>
            </div>
          )}
        </div>

        {/* 底部信息：顶部信息移至下方，移除原提示文案，改为纯净文件路径 */}
        <div className="w-full text-center mt-2.5 px-2">
          <span 
            className="text-xs font-mono text-slate-400/90 select-text truncate block max-w-full drop-shadow-sm" 
            title={file.path}
          >
            {file.path}
          </span>
        </div>
      </div>
    </div>
  );
}
