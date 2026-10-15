import React, { useEffect, useRef } from 'react';
import { 
  X, Video, FolderOpen, Copy
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog.jsx';
import { toast } from '@/components/ui/sonner.jsx';
import { openFolder } from '@/utils/nativeExplorer.js';

/**
 * 完整原生媒体播放器模态窗
 * 使用浏览器原生硬件加速 HTML5 播放器核心 (<video controls autoPlay>):
 * 1. 彻底规避自研播放器复杂的自绘进度条卡顿、脱节与内存占用
 * 2. 具备原生 60/120fps GPU 硬解渲染、原生全屏、原生画中画 (PiP) 与倍速调节
 * 3. 支持卡片 Hover 进度无缝继承与退出时间同步
 */
export default function VideoPlayerModal({ 
  file, 
  startTime = 0, 
  streamPath,
  onClose
}) {
  const videoRef = useRef(null);
  const currentTimeRef = useRef(startTime || 0);

  // 完整可播放地址由父组件经 apiClient 生成（桌面端需绝对地址）
  const streamUrl = streamPath || '';

  // 装载或元数据就绪时，跳转至指定起始时刻并起播
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const handleLoadedMetadata = () => {
      if (startTime > 0) {
        try {
          v.currentTime = startTime;
          currentTimeRef.current = startTime;
        } catch {}
      }
      v.play().catch(() => {});
    };

    const handleTimeUpdate = () => {
      if (v) {
        currentTimeRef.current = v.currentTime;
      }
    };

    if (v.readyState >= 1) {
      handleLoadedMetadata();
    } else {
      v.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
    }

    v.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      v.removeEventListener('loadedmetadata', handleLoadedMetadata);
      v.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [file.path, startTime]);

  const handleClose = () => {
    if (onClose) {
      onClose(currentTimeRef.current);
    }
  };

  const handleCopyPath = async (e) => {
    if (e) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(file.path);
      toast.success('已复制媒体路径至剪贴板', { description: file.path });
    } catch {
      toast.error('复制路径失败');
    }
  };

  const handleOpenFolder = async (e) => {
    if (e) e.stopPropagation();
    try {
      await openFolder(file.path);
    } catch (err) {
      toast.error('打开目录失败: ' + err.message);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent 
        showCloseButton={false}
        className="max-w-5xl w-[94vw] p-0 gap-0 overflow-hidden bg-dark-950/95 border-dark-700/80 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col"
      >
        <DialogTitle className="sr-only">原生播放器 - {file.name}</DialogTitle>
        <DialogDescription className="sr-only">原生硬件加速视频播放器完整预览</DialogDescription>

        {/* 顶部标题栏 */}
        <div className="px-5 py-3 border-b border-dark-800 flex items-center justify-between bg-dark-900/80 select-none shrink-0">
          <div className="flex items-center space-x-2.5 truncate max-w-[80%]">
            <div className="w-7 h-7 rounded-lg bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-cyan shrink-0">
              <Video className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <div className="flex items-center space-x-2">
                <span className="font-fluid-base font-semibold text-gray-100 truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="font-fluid-xs px-2 py-0.2 rounded-full bg-brand-950/80 border border-brand-500/30 text-brand-cyan font-mono shrink-0">
                  {file.ext.toUpperCase().replace('.', '')}
                </span>
                {file.sizeFormatted && (
                  <span className="font-fluid-xs font-mono text-gray-400 shrink-0">
                    {file.sizeFormatted}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            <button
              type="button"
              onClick={handleCopyPath}
              className="p-1.5 text-gray-400 hover:text-brand-cyan hover:bg-dark-800 rounded-lg transition cursor-pointer"
              title="复制文件路径"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleOpenFolder}
              className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-dark-800 rounded-lg transition cursor-pointer"
              title="在系统资源管理器中打开"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
            <div className="h-4 w-[1px] bg-dark-800 mx-1" />
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-dark-800 rounded-lg transition cursor-pointer"
              title="关闭播放器 (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 核心播放区域：采用浏览器原生硬件加速播放器 (controls, autoPlay, playsInline) */}
        <div className="relative w-full bg-black flex items-center justify-center min-h-[360px] max-h-[72vh] overflow-hidden">
          <video
            ref={videoRef}
            src={streamUrl}
            controls
            autoPlay
            playsInline
            preload="auto"
            className="w-full h-full max-h-[72vh] object-contain focus:outline-none"
          />
        </div>

        {/* 底部信息栏 */}
        <div className="px-5 py-2.5 bg-dark-900/80 border-t border-dark-800 flex items-center justify-between font-fluid-xs text-gray-400 shrink-0 select-none">
          <span className="font-mono text-gray-400 truncate max-w-[70%]" title={file.path}>
            {file.path}
          </span>
          <span className="text-gray-500 font-sans shrink-0">
            原生硬件加速 · 支持画中画 (PiP) 与倍速
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
