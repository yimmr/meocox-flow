import React, { useState, useRef, useMemo } from 'react';
import { Player } from '@remotion/player';
import { MotionComposition } from './MotionComposition.jsx';
import { Copy, Check, Film, Code2, ExternalLink, Video, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function MotionPlayerPreview({ manifest, onDirectRender = null, onExportJianying = null }) {
  const playerRef = useRef(null);
  const [activeTab, setActiveTab] = useState('scenes'); // 'scenes' | 'props'
  const [copied, setCopied] = useState(false);
  const [activeSceneIdx, setActiveSceneIdx] = useState(0);
  const [renderingMp4, setRenderingMp4] = useState(false);

  // 保证默认合法数据
  const safeManifest = useMemo(() => {
    if (!manifest) {
      return {
        name: '代码动效解说示例',
        fps: 30,
        width: 1920,
        height: 1080,
        totalFrames: 150,
        scenes: []
      };
    }
    return manifest;
  }, [manifest]);

  const { scenes = [], fps = 30, totalFrames = 150, width = 1920, height = 1080 } = safeManifest;
  const currentDurationSec = (totalFrames / fps).toFixed(1);

  // 快捷跳转至特定分镜
  const handleJumpToScene = (idx) => {
    setActiveSceneIdx(idx);
    const targetScene = scenes[idx];
    if (targetScene && playerRef.current) {
      playerRef.current.seekTo(targetScene.startFrame || 0);
      playerRef.current.play();
    }
  };

  const handleCopyManifest = () => {
    navigator.clipboard.writeText(JSON.stringify(safeManifest, null, 2));
    setCopied(true);
    toast.success('已复制 Remotion 动效工程清单与参数');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTriggerDirectRender = async () => {
    if (onDirectRender) {
      setRenderingMp4(true);
      try {
        await onDirectRender(safeManifest);
      } finally {
        setRenderingMp4(false);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* 头部元数据栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/90 border border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <span>{safeManifest.name || '确定性代码动效工程'}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-950 text-sky-400 border border-sky-800/60">
                Remotion 60fps
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              {scenes.length} 幕场景 · 总时值 {currentDurationSec}s · {width}x{height} @ {fps}fps
            </div>
          </div>
        </div>

        {/* 顶部操作快捷按钮 */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCopyManifest}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700/60 transition-all cursor-pointer"
            title="复制工程 JSON 清单"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '已复制' : '复制参数'}</span>
          </button>

          {onDirectRender && (
            <button
              onClick={handleTriggerDirectRender}
              disabled={renderingMp4}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold shadow-md shadow-emerald-950 transition-all cursor-pointer disabled:opacity-60"
            >
              {renderingMp4 ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Video className="w-3.5 h-3.5" />
              )}
              <span>{renderingMp4 ? '正在硬件压制...' : '直接渲染导出 MP4'}</span>
            </button>
          )}

          {onExportJianying && (
            <button
              onClick={() => onExportJianying(safeManifest)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700/60 transition-all cursor-pointer"
              title="可选：导出剪映草稿"
            >
              <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
              <span>剪映草稿</span>
            </button>
          )}
        </div>
      </div>

      {/* Remotion 实时交互播放器容器 */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-[#06080D] shadow-2xl aspect-video max-h-[460px] flex items-center justify-center group">
        <Player
          ref={playerRef}
          component={MotionComposition}
          inputProps={{ manifest: safeManifest }}
          durationInFrames={Math.max(1, totalFrames)}
          fps={fps}
          compositionWidth={width}
          compositionHeight={height}
          style={{
            width: '100%',
            height: '100%'
          }}
          controls
          loop
          autoPlay={false}
        />
      </div>

      {/* 底部交互面板：分镜切幕标签 & Props 查看器 */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('scenes')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'scenes'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              分镜场景时间轴 ({scenes.length})
            </button>
            <button
              onClick={() => setActiveTab('props')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'props'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Props 结构树
            </button>
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            100% 确定性渲染 · 零画面幻觉
          </div>
        </div>

        {activeTab === 'scenes' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
            {scenes.map((scene, idx) => {
              const isSelected = activeSceneIdx === idx;
              return (
                <div
                  key={scene.id || idx}
                  onClick={() => handleJumpToScene(idx)}
                  className={`p-3 rounded-xl border text-xs space-y-1.5 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-sky-950/40 border-sky-500/60 ring-1 ring-sky-500/40'
                      : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <span className="text-sky-400 font-mono">#{idx + 1}</span>
                      <span>{scene.title || `场景 ${idx + 1}`}</span>
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-sky-300">
                      {scene.componentType}
                    </span>
                  </div>
                  {scene.scriptText && (
                    <p className="text-[11px] text-slate-400 line-clamp-1">{scene.scriptText}</p>
                  )}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-800/50">
                    <span>
                      从第 {scene.startFrame} 帧起 ({((scene.startFrame || 0) / fps).toFixed(1)}s)
                    </span>
                    <span>时长: {((scene.durationInFrames || 0) / fps).toFixed(1)}s</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <pre className="p-3.5 rounded-xl bg-[#06080D] border border-slate-800 text-[11px] font-mono text-sky-300/90 overflow-x-auto max-h-56 leading-relaxed select-text">
            {JSON.stringify(safeManifest.scenes?.[activeSceneIdx]?.props || safeManifest, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
