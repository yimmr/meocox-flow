import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { BarChart3, TrendingUp } from 'lucide-react';

export function DataChartScene({ props = {} }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    title = '确定性渲染效能对比',
    subtitle = '代码驱动动效 vs 纯文生视频模型',
    data = [
      { label: '文字排版准确率', value: 100, compareValue: 32, unit: '%' },
      { label: '数据图表真实度', value: 100, compareValue: 18, unit: '%' },
      { label: '时序微调自由度', value: 100, compareValue: 12, unit: '%' },
      { label: '修改迭代耗时', value: 2, compareValue: 90, unit: 's' }
    ]
  } = props;

  const headerOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const headerY = interpolate(frame, [0, 10], [-20, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill className="bg-[#06080D] flex flex-col items-center justify-center p-8 select-none font-sans">
      {/* 科技背景环境光晕 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.1)_0%,transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.12)_0%,transparent_60%)] pointer-events-none" />

      <div className="w-full max-w-4xl space-y-6">
        {/* 标题区 */}
        <div
          style={{ opacity: headerOpacity, transform: `translateY(${headerY}px)` }}
          className="text-center space-y-2"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-mono font-medium">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>METRIC COMPARISON</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">{title}</h2>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>

        {/* 数据对比卡片列表 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((item, idx) => {
            const delay = 10 + idx * 6;
            const progress = spring({
              frame: Math.max(0, frame - delay),
              fps,
              config: { damping: 14, mass: 0.6, stiffness: 100 }
            });

            // 当前动态数值
            const currentValue = Math.round(
              interpolate(progress, [0, 1], [0, item.value], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp'
              })
            );

            const currentCompare = Math.round(
              interpolate(progress, [0, 1], [0, item.compareValue], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp'
              })
            );

            return (
              <div
                key={idx}
                style={{
                  opacity: interpolate(frame, [delay, delay + 8], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp'
                  }),
                  transform: `scale(${progress * 0.1 + 0.9})`
                }}
                className="p-5 rounded-2xl bg-[#090d16]/90 border border-slate-800/80 shadow-xl space-y-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">{item.label}</span>
                  <div className="flex items-center gap-1.5 text-emerald-400 font-mono font-bold text-sm">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>
                      {currentValue} {item.unit}
                    </span>
                  </div>
                </div>

                {/* 主方案条柱 (确定性动效) */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-sky-400 font-mono">
                    <span>Remotion (Code-as-Video)</span>
                    <span>
                      {currentValue} {item.unit}
                    </span>
                  </div>
                  <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      style={{ width: `${Math.min(100, (currentValue / 100) * 100)}%` }}
                      className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full shadow-sm shadow-emerald-500/50"
                    />
                  </div>
                </div>

                {/* 对比方案条柱 (传统扩散视频) */}
                <div className="space-y-1 opacity-70">
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>纯文生视频模型 (Sora/Runway)</span>
                    <span>
                      {currentCompare} {item.unit}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      style={{ width: `${Math.min(100, (currentCompare / 100) * 100)}%` }}
                      className="h-full bg-slate-600 rounded-full"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}
