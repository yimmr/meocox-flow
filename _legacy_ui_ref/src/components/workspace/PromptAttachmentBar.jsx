import React from 'react';
import {
  X,
  Video,
  Music,
  FileText,
  Play
} from 'lucide-react';
import { apiUrl } from '@/lib/apiClient.js';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip.jsx';

/**
 * 纯粹极简附件缩略图栏 (PromptAttachmentBar)
 * 
 * 严格按照参考图 1 & 3 结构重构：
 * 1. 彻底去除多余的文字、长条边框与繁杂标签，保持极致清爽
 * 2. 纯圆角正方形缩略图卡片 (w-14 h-14 rounded-xl)
 * 3. 悬浮/贴于右上角的极简圆形小 × 移除按钮
 * 4. 点击缩略图主体直接触发沉浸式全屏淡黑层预览
 */
export default function PromptAttachmentBar({
  files = [],
  onRemove,
  onPreview
}) {
  if (!files || files.length === 0) return null;

  // 底层自动标注序号 (如 图片1, 视频1, 音频1, 文件1)
  let imgCount = 0;
  let vidCount = 0;
  let audCount = 0;
  let docCount = 0;
  const labeledFiles = files.map((file) => {
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
    const finalLabel = (file.tag || file.numberedLabel || label).replace(/^@+/, '');
    return { ...file, numberedLabel: finalLabel };
  });

  return (
    <div className="flex items-center gap-2 overflow-x-auto select-none animate-in fade-in duration-150 py-0.5 scrollbar-thin">
      {labeledFiles.map((file) => {
        const isVideo = file.type === 'video';
        const isAudio = file.type === 'audio';
        const isImage = file.type === 'image';

        const streamUrl = apiUrl(`/api/assets/stream?path=${encodeURIComponent(file.path)}`);
        const thumbUrl = file.thumbnail ? apiUrl(file.thumbnail) : (isImage ? streamUrl : null);

        return (
          <div
            key={file.id || file.path}
            className="relative shrink-0 group"
          >
            {/* 正方形微缩卡片主体 */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  onClick={() => onPreview && onPreview(file)}
                  className="w-12 h-12 rounded-lg overflow-hidden bg-slate-900 border border-slate-700/60 shadow-sm cursor-pointer flex items-center justify-center hover:border-slate-500 transition-all hover:scale-[1.02] relative"
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : isVideo ? (
                    <div className="w-full h-full bg-gradient-to-br from-violet-950/80 to-slate-900 flex flex-col items-center justify-center gap-0.5 text-violet-400">
                      <Video className="w-4 h-4" />
                      <span className="text-[8px] font-mono opacity-80 uppercase">MP4</span>
                    </div>
                  ) : isAudio ? (
                    <div className="w-full h-full bg-gradient-to-br from-emerald-950/80 to-slate-900 flex flex-col items-center justify-center gap-0.5 text-emerald-400">
                      <Music className="w-4 h-4" />
                      <span className="text-[8px] font-mono opacity-80 uppercase">AUDIO</span>
                    </div>
                  ) : (
                    <div className="w-full h-full bg-slate-900 flex flex-col items-center justify-center gap-0.5 text-slate-400">
                      <FileText className="w-4 h-4 text-indigo-400" />
                      <span className="text-[8px] font-mono opacity-80 uppercase">{file.ext?.replace('.', '') || 'DOC'}</span>
                    </div>
                  )}

                  {/* 视频右上角轻量角标 */}
                  {isVideo && thumbUrl && (
                    <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                      <Play className="w-3 h-3 text-white/90 fill-white" />
                    </div>
                  )}

                  {/* 底层自动标注序号标签 (如 图片1, 视频1) */}
                  <div className="absolute bottom-0.5 left-0.5 px-1 py-0.2 rounded bg-black/80 backdrop-blur-xs text-[9px] font-mono text-slate-300 font-semibold leading-tight shadow border border-white/10 pointer-events-none">
                    {file.numberedLabel}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <span className="font-semibold text-slate-100">{file.name}</span>
                <span className="block text-[10px] text-indigo-300 font-mono mt-0.5">标注序号: {file.numberedLabel} · 点击全屏预览</span>
              </TooltipContent>
            </Tooltip>

            {/* 右上角圆形极简 × 移除按钮 (置于卡片内部右上角，不突起产生外边距) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onRemove) onRemove(file);
              }}
              className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-black/75 hover:bg-black text-slate-300 hover:text-white flex items-center justify-center shadow transition-all hover:scale-110 cursor-pointer z-10 border border-white/10"
              title="移除附件"
            >
              <X className="w-2.5 h-2.5 stroke-[2.5]" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
