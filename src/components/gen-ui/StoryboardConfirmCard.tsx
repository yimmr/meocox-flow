import React, { useState } from 'react';
import { type StoryboardCardPayload, type StoryboardScene } from '@/types/director';
import {
  Film,
  CheckCircle2,
  SlidersHorizontal,
  Clock,
  Sparkles,
  Camera,
  Swords,
  AlertTriangle,
} from 'lucide-react';

interface StoryboardConfirmCardProps {
  card: StoryboardCardPayload;
  onResolve: (updated: StoryboardCardPayload) => void;
  onTriggerBattle?: (sceneId: string) => void;
}

export const StoryboardConfirmCard: React.FC<StoryboardConfirmCardProps> = ({
  card,
  onResolve,
  onTriggerBattle,
}) => {
  const [steeringText, setSteeringText] = useState(card.steering_notes || '');
  const [isEditing, setIsEditing] = useState(false);

  const isConfirmed = card.status === 'confirmed';

  const handleConfirmAll = () => {
    onResolve({
      ...card,
      status: 'confirmed',
      steering_notes: steeringText.trim() || undefined,
    });
    setIsEditing(false);
  };

  const handleToggleEdit = () => {
    setIsEditing(!isEditing);
  };

  return (
    <div className="w-full max-w-2xl my-2 rounded-xl border border-blue-500/30 bg-neutral-900/90 shadow-xl overflow-hidden text-neutral-200 select-text flex flex-col max-h-[480px]">
      {/* 卡片头部 */}
      <div className="px-3.5 py-2.5 bg-blue-950/40 border-b border-blue-500/20 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
            <Film className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-neutral-100">{card.title}</h3>
            <span className="text-[10px] text-neutral-400 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              <span>共 {card.scenes.length} 个分镜 · 预估成片 {card.total_duration_sec}s</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConfirmed ? (
            <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              <span>分镜已敲定</span>
            </span>
          ) : (
            <button
              onClick={handleToggleEdit}
              className={`p-1 rounded text-neutral-400 hover:text-neutral-200 transition-colors ${
                isEditing ? 'bg-neutral-800 text-blue-400' : ''
              }`}
              title="调整微调切轨"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 分镜列表展示区 (纵向滚动) */}
      <div className="p-3 overflow-y-auto space-y-2 flex-1 min-h-0 text-xs">
        {card.scenes.map((scene: StoryboardScene) => {
          const status = scene.status || 'Pending';
          const isBattle = status === 'BattleActive';
          const isApproved = status === 'Approved';
          const isRejected = status === 'Rejected';

          return (
            <div
              key={scene.id}
              className="p-2.5 rounded-lg border border-neutral-800 bg-neutral-950/60 hover:border-neutral-700/80 transition-all flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-blue-400">#{scene.scene_num}</span>
                  <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[10px]">
                    {scene.shot_type}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-neutral-800/80 text-neutral-400 text-[10px] flex items-center gap-1">
                    <Camera className="w-2.5 h-2.5" />
                    <span>{scene.camera_movement}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10px]">
                  <span className="font-mono text-neutral-400">{scene.duration_sec}s</span>

                  {/* 黑板状态徽标与竞技场入口 */}
                  {isApproved && (
                    <span className="flex items-center gap-0.5 text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                      <CheckCircle2 className="w-3 h-3" />
                      质检合格
                    </span>
                  )}
                  {isBattle && (
                    <span className="flex items-center gap-0.5 text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/30">
                      <Swords className="w-3 h-3" />
                      对决中
                    </span>
                  )}
                  {isRejected && (
                    <span className="flex items-center gap-0.5 text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-500/30">
                      <AlertTriangle className="w-3 h-3" />
                      需人工复审
                    </span>
                  )}

                  {onTriggerBattle && !isBattle && (
                    <button
                      onClick={() => onTriggerBattle(scene.id)}
                      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-colors"
                      title="开启 Battle Mode 变体竞技场盲测"
                    >
                      <Swords className="w-2.5 h-2.5" />
                      <span>对决</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 画面提示词 */}
              <p className="text-neutral-300 text-[11px] leading-relaxed line-clamp-2">
                {scene.prompt}
              </p>

              {/* 音频/台词线索 */}
              {scene.audio_cue && (
                <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                  <span className="text-neutral-500">音频指引:</span>
                  <span className="italic">{scene.audio_cue}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 动态切轨微调输入区域 */}
      {isEditing && !isConfirmed && (
        <div className="p-3 bg-neutral-950/90 border-t border-neutral-800 shrink-0">
          <label className="block text-[11px] font-medium text-blue-300 mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            <span>向编排引擎注入切轨指令 (TurnSteer)：</span>
          </label>
          <input
            type="text"
            value={steeringText}
            onChange={(e) => setSteeringText(e.target.value)}
            placeholder="例如：将第二镜视角改为极度俯瞰，整体光线调暗..."
            className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      )}

      {/* 卡片底部操作栏 */}
      {!isConfirmed && (
        <div className="px-3.5 py-2 bg-neutral-950/80 border-t border-neutral-800 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-neutral-500">
            按需微调后，确认分镜将由黑板并发驱动媒体管线
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleConfirmAll}
              className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 shadow transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>确认分镜编排</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
