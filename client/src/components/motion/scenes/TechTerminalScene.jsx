import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Terminal, CheckCircle2 } from 'lucide-react';

export function TechTerminalScene({ props = {} }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const {
    title = '核心执行逻辑',
    fileName = 'engine.orchestrator.ts',
    command = 'meocox run --deterministic',
    codeLines = [
      'const orchestrator = new LeadOrchestrator();',
      'const manifest = await orchestrator.synthesize();',
      'await renderRemotionBundle(manifest);'
    ],
    highlightLine = 2,
    output = '✔ [Success] 4K 动效渲染完成，耗时 1.84s'
  } = props;

  // 窗口弹入动画
  const windowScale = spring({
    frame,
    fps,
    config: { damping: 14, mass: 0.6, stiffness: 120 }
  });

  const windowOpacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });

  // 命令行打字机动画 (前 20 帧输入命令)
  const cmdLength = command.length;
  const typedCharCount = Math.floor(
    interpolate(frame, [10, 30], [0, cmdLength], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    })
  );
  const typedCommand = command.slice(0, typedCharCount);
  const cursorBlink = Math.floor(frame / 8) % 2 === 0;

  // 代码行渐显延迟
  const codeStartFrame = 35;
  const showCode = frame >= codeStartFrame;

  // 输出结果显示延迟
  const outputStartFrame = 55;
  const showOutput = frame >= outputStartFrame;
  const outputScale = spring({
    frame: Math.max(0, frame - outputStartFrame),
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 140 }
  });

  return (
    <AbsoluteFill className="bg-[#06080D] flex items-center justify-center p-8 select-none font-sans">
      {/* 科技背景点阵与环境光晕 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.12)_0%,transparent_70%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a15_1px,transparent_1px),linear-gradient(to_bottom,#0f172a15_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

      {/* 终端主窗口 */}
      <div
        style={{
          transform: `scale(${windowScale})`,
          opacity: windowOpacity
        }}
        className="w-full max-w-4xl rounded-2xl border border-sky-500/30 bg-[#090d16]/95 backdrop-blur-xl shadow-2xl shadow-sky-950/50 overflow-hidden flex flex-col"
      >
        {/* 标题栏 */}
        <div className="h-11 px-4 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            <span className="ml-3 text-xs font-mono text-slate-400 font-medium flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-sky-400" />
              {fileName}
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-500">{title}</div>
        </div>

        {/* 终端内容区 */}
        <div className="p-6 font-mono text-xs md:text-sm space-y-4">
          {/* CLI 命令执行行 */}
          <div className="flex items-center gap-2 text-slate-300">
            <span className="text-sky-400 font-bold">$</span>
            <span className="text-slate-100">{typedCommand}</span>
            {frame < codeStartFrame && cursorBlink && (
              <span className="w-2 h-4 bg-sky-400 inline-block align-middle" />
            )}
          </div>

          {/* 核心代码段落展示 */}
          {showCode && (
            <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1.5">
              {codeLines.map((line, idx) => {
                const isHighlight = idx + 1 === highlightLine;
                const lineDelay = codeStartFrame + idx * 4;
                const lineOpacity = interpolate(frame, [lineDelay, lineDelay + 6], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp'
                });

                return (
                  <div
                    key={idx}
                    style={{ opacity: lineOpacity }}
                    className={`flex items-center gap-4 px-2 py-0.5 rounded ${
                      isHighlight
                        ? 'bg-sky-500/15 border-l-2 border-sky-400 text-sky-200'
                        : 'text-slate-400'
                    }`}
                  >
                    <span className="w-5 text-right text-slate-600 text-xs select-none">
                      {idx + 1}
                    </span>
                    <span className="font-mono text-xs">{line}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* 执行产物反馈 */}
          {showOutput && (
            <div
              style={{ transform: `scale(${outputScale})` }}
              className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5 font-medium shadow-lg shadow-emerald-950/30"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{output}</span>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
}
