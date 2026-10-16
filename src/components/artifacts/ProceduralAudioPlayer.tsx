import React, { useState, useRef } from 'react';
import { type AssetMetadata, type SoundEffectType } from '@/bindings';
import { getAssetUrl } from '@/lib/asset';
import {
  Music,
  Play,
  Pause,
  Wand2,
} from 'lucide-react';

interface ProceduralAudioPlayerProps {
  assets: AssetMetadata[];
  onGenerateSound: (type: SoundEffectType) => Promise<AssetMetadata | null>;
}

export const ProceduralAudioPlayer: React.FC<ProceduralAudioPlayerProps> = ({
  assets,
  onGenerateSound,
}) => {
  const audioAssets = assets.filter((a) => a.media_type === 'audio');
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeAudio = audioAssets.find((a) => a.id === currentPlayingId) || audioAssets[0] || null;

  const handlePlayToggle = (asset: AssetMetadata) => {
    if (!audioRef.current) return;

    if (currentPlayingId === asset.id && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const url = getAssetUrl(asset.local_path);
      audioRef.current.src = url;
      audioRef.current.play();
      setCurrentPlayingId(asset.id);
      setIsPlaying(true);
    }
  };

  const handleGenerate = async (type: SoundEffectType) => {
    setIsGenerating(true);
    const newAsset = await onGenerateSound(type);
    setIsGenerating(false);
    if (newAsset) {
      handlePlayToggle(newAsset);
    }
  };

  return (
    <div className="space-y-4 text-xs text-neutral-200">
      {/* 隐藏的 HTML5 播放器宿主 */}
      <audio
        ref={audioRef}
        onEnded={() => setIsPlaying(false)}
        onError={() => setIsPlaying(false)}
      />

      {/* 快捷合成工具箱 (GEM-02 原生 16-bit PCM) */}
      <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-950/20 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
            <Wand2 className="w-3.5 h-3.5" />
            <span>原生程序化免版税合成</span>
          </div>
          <span className="text-[10px] text-amber-500 font-mono">16-bit PCM / WAV</span>
        </div>
        <p className="text-[11px] text-neutral-400 leading-relaxed">
          采用纯数学正弦波与双二阶滤波算法在 Rust 后端即时合成，零版权风险。
        </p>
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <button
            onClick={() => handleGenerate('Whoosh')}
            disabled={isGenerating}
            className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-amber-500/30 text-amber-200 text-center font-medium transition-colors disabled:opacity-50 text-[11px]"
          >
            + Whoosh 转场
          </button>
          <button
            onClick={() => handleGenerate('Chime')}
            disabled={isGenerating}
            className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-amber-500/30 text-amber-200 text-center font-medium transition-colors disabled:opacity-50 text-[11px]"
          >
            + Chime 提示
          </button>
          <button
            onClick={() => handleGenerate('TechAmbient')}
            disabled={isGenerating}
            className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-amber-500/30 text-amber-200 text-center font-medium transition-colors disabled:opacity-50 text-[11px]"
          >
            + Lo-Fi BGM
          </button>
        </div>
      </div>

      {/* 当前播放器面板 */}
      {activeAudio && (
        <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-950/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Music className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-neutral-100 truncate text-xs" title={activeAudio.name}>
                  {activeAudio.name}
                </div>
                <div className="text-[10px] text-neutral-500 font-mono">
                  {activeAudio.id}
                </div>
              </div>
            </div>

            <button
              onClick={() => handlePlayToggle(activeAudio)}
              className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 text-neutral-950 flex items-center justify-center transition-colors shrink-0 shadow-md"
              title={isPlaying && currentPlayingId === activeAudio.id ? '暂停' : '播放'}
            >
              {isPlaying && currentPlayingId === activeAudio.id ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>
          </div>

          {/* 波形律动占位 */}
          <div className="h-6 flex items-center gap-1 px-1 bg-neutral-900 rounded border border-neutral-800">
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 rounded-full transition-all duration-200 ${
                  isPlaying && currentPlayingId === activeAudio.id
                    ? 'bg-amber-400'
                    : 'bg-neutral-700'
                }`}
                style={{
                  height: isPlaying && currentPlayingId === activeAudio.id
                    ? `${Math.max(20, (Math.sin(i * 0.7 + Date.now() * 0.005) * 0.5 + 0.5) * 100)}%`
                    : '30%',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 音频库清单 */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-semibold text-neutral-400 px-1">
          已登记音效与配乐 ({audioAssets.length})
        </span>

        {audioAssets.length === 0 ? (
          <div className="p-4 text-center text-neutral-600 text-xs">
            暂无音频素材，点击上方即刻生成免版税音效
          </div>
        ) : (
          audioAssets.map((audio) => {
            const isThisPlaying = isPlaying && currentPlayingId === audio.id;
            return (
              <div
                key={audio.id}
                onClick={() => handlePlayToggle(audio)}
                className={`p-2 rounded-lg border text-left cursor-pointer transition-colors flex items-center justify-between ${
                  isThisPlaying
                    ? 'border-amber-500/50 bg-amber-950/20 text-amber-200'
                    : 'border-neutral-850 bg-neutral-900/40 hover:bg-neutral-900 text-neutral-300'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <button className="text-neutral-400 hover:text-neutral-100">
                    {isThisPlaying ? (
                      <Pause className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <span className="truncate text-xs font-medium" title={audio.name}>
                    {audio.name}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-neutral-500 font-mono shrink-0">
                  {audio.duration_ms && (
                    <span>{(audio.duration_ms / 1000).toFixed(1)}s</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
