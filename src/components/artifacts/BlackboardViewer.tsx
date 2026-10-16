import React from 'react';
import { useStudioStore } from '@/stores/useStudioStore';
import { LayoutDashboard, CheckCircle2, AlertTriangle, Swords, Palette } from 'lucide-react';
import { type StoryboardSceneNode } from '@/bindings';

export const BlackboardViewer: React.FC = () => {
  const { blackboardState } = useStudioStore();

  if (!blackboardState) {
    return (
      <div className="p-6 text-center text-xs text-neutral-500">
        <LayoutDashboard className="w-8 h-8 mx-auto mb-2 opacity-30 text-blue-400" />
        <p>中央黑板正在初始化...</p>
      </div>
    );
  }

  const { bible, scene_dag } = blackboardState;

  return (
    <div className="space-y-4 text-xs">
      {/* 视觉圣经 StyleBible 摘要 */}
      <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-900/60 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-blue-400" />
            视觉圣经 (Style Bible)
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">
            {bible.style.aspect_ratio}
          </span>
        </div>
        <p className="text-[11px] text-neutral-300 font-medium">{bible.style.name}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-500">调色板:</span>
          <div className="flex items-center gap-1">
            {bible.style.palette.map((color: string, i: number) => (
              <span
                key={i}
                className="w-3.5 h-3.5 rounded-full border border-neutral-700 shadow-sm"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
        <p className="text-[10px] text-neutral-400 leading-relaxed bg-neutral-950/80 p-2 rounded border border-neutral-800/80">
          <span className="text-neutral-500">光影设定: </span>
          {bible.style.lighting}
        </p>
      </div>

      {/* 分镜 DAG 节点拓扑列表 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-neutral-400 text-[11px]">
          <span className="font-medium text-neutral-200">分镜 DAG 流转拓扑</span>
          <span>{scene_dag.scenes.length} 个镜头节点</span>
        </div>

        {scene_dag.scenes.map((scene: StoryboardSceneNode) => {
          const isApproved = scene.status === 'Approved';
          const isBattle = scene.status === 'BattleActive';
          const isRejected = scene.status === 'Rejected';

          return (
            <div
              key={scene.id}
              className="p-2.5 rounded-lg border border-neutral-800 bg-neutral-950/80 space-y-1.5 hover:border-neutral-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-blue-400">#{scene.scene_num}</span>
                  <span className="text-[11px] text-neutral-200 font-medium">{scene.shot_type}</span>
                </div>
                <div className="flex items-center gap-1">
                  {isApproved && (
                    <span className="flex items-center gap-0.5 text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      Approved
                    </span>
                  )}
                  {isBattle && (
                    <span className="flex items-center gap-0.5 text-[10px] text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/30">
                      <Swords className="w-2.5 h-2.5" />
                      Battle
                    </span>
                  )}
                  {isRejected && (
                    <span className="flex items-center gap-0.5 text-[10px] text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-500/30">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Rejected
                    </span>
                  )}
                  {!isApproved && !isBattle && !isRejected && (
                    <span className="text-[10px] text-neutral-400 bg-neutral-900 px-1.5 py-0.5 rounded">
                      {scene.status}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-neutral-300 line-clamp-2 leading-relaxed">
                {scene.prompt}
              </p>

              <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-1 border-t border-neutral-900">
                <span>运镜: {scene.camera_movement}</span>
                <span>重试: {scene.retry_count}/3</span>
                <span className="font-mono">{scene.duration_sec}s</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
