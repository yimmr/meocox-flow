import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Sparkles } from 'lucide-react';

export function KineticTypographyScene({ props = {} }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    hookText = '告别 AI 视频形变与图表幻觉',
    highlightWord = '确定性代码动效',
    caption = 'Remotion 60fps 原生驱动 · 像素级精准对齐 · 零模型计费成本',
    tags = ['Code-as-Video', 'Remotion', 'Zero-Hallucination', 'Multi-Agent']
  } = props;

  // 主标词弹入动画
  const mainScale = spring({
    frame,
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 140 }
  });

  const mainOpacity = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  // 副标题延迟入场
  const subOpacity = interpolate(frame, [15, 25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const subY = interpolate(frame, [15, 25], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  return (
    <AbsoluteFill className="bg-[#06080D] flex flex-col items-center justify-center p-8 select-none font-sans text-center">
      {/* 动态光晕与扫描线 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.18)_0%,transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(168,85,247,0.12)_0%,transparent_50%)] pointer-events-none" />

      <div className="w-full max-w-4xl space-y-6 relative z-10">
        {/* 顶部标签 */}
        <div
          style={{ opacity: mainOpacity }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-mono font-medium"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>REVOLUTIONARY CODE-AS-VIDEO</span>
        </div>

        {/* 核心 Hook 标语 */}
        <div
          style={{
            transform: `scale(${mainScale})`,
            opacity: mainOpacity
          }}
          className="space-y-3"
        >
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-tight">
            {hookText}
          </h1>
          <div className="text-3xl sm:text-4xl md:text-5xl font-black bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-400 bg-clip-text text-transparent">
            {highlightWord}
          </div>
        </div>

        {/* 阐述与字幕文案 */}
        <p
          style={{
            opacity: subOpacity,
            transform: `translateY(${subY}px)`
          }}
          className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto font-medium leading-relaxed"
        >
          {caption}
        </p>

        {/* 特性胶囊徽标 */}
        <div
          style={{ opacity: subOpacity }}
          className="flex flex-wrap items-center justify-center gap-2.5 pt-4"
        >
          {tags.map((tag, idx) => (
            <span
              key={idx}
              className="px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-xs text-sky-300 font-mono shadow-sm"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}
