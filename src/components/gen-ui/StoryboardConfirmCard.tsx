import React, { useState } from 'react';
import { type StoryboardCardPayload, type StoryboardScene } from '@/types/director';
import {
  Film,
  CheckCircle2,
  SlidersHorizontal,
  Clock,
  Sparkles,
  Camera,
} from 'lucide-react';

interface StoryboardConfirmCardProps {
  card: StoryboardCardPayload;
  onResolve: (updated: StoryboardCardPayload) => void;
}

export const StoryboardConfirmCard: React.FC<StoryboardConfirmCardProps> = ({
  card,
  onResolve,
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
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/40 border border-blue-500/30 text-blue-300 font-mono">
              待导演审核
            </span>
          )}
        </div>
      </div>

      {/* 分镜内容列表区 (可滚动，严格遵守高度预算 <= 500px) */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
        {card.scenes.map((scene: StoryboardScene) => (
          <div
            key={scene.id}
            className="p-2.5 rounded-lg border border-neutral-800 bg-neutral-950/60 hover:border-neutral-700 transition-colors flex flex-col gap-1.5"
          >
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-blue-400">
                  镜头 #{String(scene.scene_num).padStart(2, '0')}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 font-medium text-[10px]">
                  {scene.shot_type}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 text-[10px] flex items-center gap-1">
                  <Camera className="w-2.5 h-2.5 text-neutral-500" />
                  <span>{scene.camera_movement}</span>
                </span>
              </div>
              <span className="text-neutral-500 font-mono text-[10px]">
                {scene.duration_sec}s
              </span>
            </div>

            <p className="text-neutral-300 text-xs leading-relaxed">
              {scene.prompt}
            </p>

            {scene.audio_cue && (
              <div className="text-[10px] text-amber-400/90 flex items-center gap-1 bg-amber-950/20 px-2 py-0.5 rounded border border-amber-500/20 w-fit">
                <Sparkles className="w-2.5 h-2.5" />
                <span>声效对齐：{scene.audio_cue}</span>
              </div>
            )}
          </div>
        ))}

        {/* 微调备注文案回显 */}
        {card.steering_notes && (
          <div className="p-2 rounded bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-400">
            <span className="text-blue-400 font-medium">导演微调意见：</span>
            <span>{card.steering_notes}</span>
          </div>
        )}

        {/* 编辑微调输入区 */}
        {isEditing && !isConfirmed && (
          <div className="p-2 rounded bg-neutral-950 border border-blue-500/30 space-y-1.5">
            <label className="text-[11px] text-neutral-300 font-medium block">
              输入分镜微调指令 (将作为前置设定注入)：
            </label>
            <input
              type="text"
              value={steeringText}
              onChange={(e) => setSteeringText(e.target.value)}
              placeholder="例如：将镜头 2 的眼部特写调整为双色霓虹反光，时长拉长到 5 秒..."
              className="w-full px-2.5 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}
      </div>

      {/* 底部决策操作区 */}
      <div className="px-3 py-2 bg-neutral-950 border-t border-neutral-800/80 flex items-center justify-between shrink-0">
        <span className="text-[11px] text-neutral-500">
          {isConfirmed ? '分镜已绑定状态机，可随时在右侧检视' : '确认后将启动 Diffusion / 神经渲染管线'}
        </span>

        <div className="flex items-center gap-2">
          {!isConfirmed ? (
            <>
              <button
                onClick={handleToggleEdit}
                className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
              >
                <SlidersHorizontal className="w-3 h-3 text-neutral-400" />
                <span>{isEditing ? '取消修改' : '微调分镜'}</span>
              </button>
              <button
                onClick={handleConfirmAll}
                className="flex items-center gap-1 text-[11px] px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-sm transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>拍板推进</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => onResolve({ ...card, status: 'pending' })}
              className="text-[11px] text-neutral-400 hover:text-neutral-200 underline transition-colors"
            >
              重新调整
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
