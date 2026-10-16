import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { GitBranch, ArrowRight, CheckCircle2, Loader2, Clock } from 'lucide-react';

export function ArchitectureFlowScene({ props = {} }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    title = '多智能体拓扑与确定性流水线',
    nodes = [
      { id: '1', label: 'Motion Director', role: '全片节奏与分镜规划', status: 'completed' },
      { id: '2', label: 'Code Engineer', role: 'Remotion 场景装配', status: 'active' },
      { id: '3', label: 'Reviewer & Healer', role: '编译反思自愈闭环', status: 'pending' },
      { id: '4', label: 'Remotion Kernel', role: '4K/60fps 确定性渲染', status: 'pending' }
    ]
  } = props;

  const headerOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill className="bg-[#06080D] flex flex-col items-center justify-center p-8 select-none font-sans">
      {/* 科技背景光晕 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.1)_0%,transparent_65%)] pointer-events-none" />

      <div className="w-full max-w-5xl space-y-8">
        {/* 头部标题 */}
        <div style={{ opacity: headerOpacity }} className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono font-medium">
            <GitBranch className="w-3.5 h-3.5" />
            <span>TOPOLOGY ORCHESTRATION</span>
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">{title}</h2>
        </div>

        {/* 流程拓扑节点网格 */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-4">
          {nodes.map((node, idx) => {
            const delay = 10 + idx * 8;
            const nodeScale = spring({
              frame: Math.max(0, frame - delay),
              fps,
              config: { damping: 14, mass: 0.6, stiffness: 120 }
            });
            const nodeOpacity = interpolate(frame, [delay, delay + 6], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp'
            });

            const isCompleted = node.status === 'completed';
            const isActive = node.status === 'active';
            const spinnerRotation = (frame * 6) % 360;

            return (
              <React.Fragment key={node.id || idx}>
                {/* 节点卡片 */}
                <div
                  style={{
                    transform: `scale(${nodeScale})`,
                    opacity: nodeOpacity
                  }}
                  className={`flex-1 min-w-[200px] p-5 rounded-2xl border shadow-xl ${
                    isActive
                      ? 'bg-sky-950/40 border-sky-400/80 shadow-sky-500/20 ring-1 ring-sky-400/50'
                      : isCompleted
                        ? 'bg-emerald-950/30 border-emerald-500/40 shadow-emerald-950/20'
                        : 'bg-[#090d16]/80 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono text-slate-500 font-semibold">
                      STEP 0{idx + 1}
                    </span>
                    {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                    {isActive && (
                      <Loader2
                        style={{ transform: `rotate(${spinnerRotation}deg)` }}
                        className="w-4 h-4 text-sky-400"
                      />
                    )}
                    {!isCompleted && !isActive && <Clock className="w-4 h-4 text-slate-600" />}
                  </div>

                  <h3 className="text-sm font-bold text-slate-100">{node.label}</h3>
                  <p className="text-xs text-slate-400 mt-1">{node.role}</p>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
                    <span
                      className={`px-2 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-sky-500/20 text-sky-300'
                          : isCompleted
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isActive ? '执行就绪' : isCompleted ? '已通过' : '待处理'}
                    </span>
                  </div>
                </div>

                {/* 箭头连接线 (最后一个节点之后不渲染) */}
                {idx < nodes.length - 1 && (
                  <div
                    style={{
                      opacity: interpolate(frame, [delay + 6, delay + 12], [0, 1], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp'
                      })
                    }}
                    className="hidden md:flex text-slate-600 shrink-0"
                  >
                    <ArrowRight className="w-5 h-5 text-sky-500/60" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}
