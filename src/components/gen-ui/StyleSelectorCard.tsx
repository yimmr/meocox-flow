import React, { useState } from 'react';
import { type StyleCardPayload, type StyleOption } from '@/types/director';
import { Palette, CheckCircle2, Check, Sparkles } from 'lucide-react';

interface StyleSelectorCardProps {
  card: StyleCardPayload;
  onResolve: (updated: StyleCardPayload) => void;
}

export const StyleSelectorCard: React.FC<StyleSelectorCardProps> = ({
  card,
  onResolve,
}) => {
  const [selectedId, setSelectedId] = useState<string>(
    card.selected_style_id || card.options[0]?.id || ''
  );

  const isConfirmed = card.status === 'confirmed';

  const handleConfirm = () => {
    onResolve({
      ...card,
      selected_style_id: selectedId,
      status: 'confirmed',
    });
  };

  const selectedOption = card.options.find((o) => o.id === (card.selected_style_id || selectedId));

  return (
    <div className="w-full max-w-2xl my-2 rounded-xl border border-purple-500/30 bg-neutral-900/90 shadow-xl overflow-hidden text-neutral-200 select-text flex flex-col max-h-[460px]">
      {/* 头部 */}
      <div className="px-3.5 py-2.5 bg-purple-950/40 border-b border-purple-500/20 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-purple-300">
            <Palette className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-neutral-100">{card.title}</h3>
            <span className="text-[10px] text-neutral-400">
              用于规范全局分镜的 Color Palette、Prompt 权重与 Lora 风格锚点
            </span>
          </div>
        </div>

        {isConfirmed ? (
          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>风格已选定</span>
          </span>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/40 border border-purple-500/30 text-purple-300 font-mono">
            4 项待选
          </span>
        )}
      </div>

      {/* 风格网格 (2x2 响应式，严格遵守高度预算 <= 500px) */}
      <div className="flex-1 overflow-y-auto p-3">
        {isConfirmed && selectedOption ? (
          <div className="p-3 rounded-lg border border-purple-500/40 bg-purple-950/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${selectedOption.accent_color} shrink-0`} />
              <div>
                <div className="text-xs font-bold text-neutral-100">{selectedOption.name}</div>
                <div className="text-[11px] text-neutral-400 mt-0.5">{selectedOption.description}</div>
              </div>
            </div>
            <button
              onClick={() => onResolve({ ...card, status: 'pending' })}
              className="text-[11px] text-purple-400 hover:text-purple-300 underline"
            >
              更换风格
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {card.options.map((option: StyleOption) => {
              const isSelected = selectedId === option.id;
              return (
                <div
                  key={option.id}
                  onClick={() => setSelectedId(option.id)}
                  className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'border-purple-500 bg-purple-950/30 shadow-md shadow-purple-500/10'
                      : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700 hover:bg-neutral-900'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-800 text-neutral-400 font-medium">
                      {option.badge}
                    </span>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-purple-500 bg-purple-600 text-white'
                          : 'border-neutral-700 bg-neutral-900'
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5" />}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-3.5 h-3.5 rounded-full bg-gradient-to-br ${option.accent_color}`} />
                      <span className="text-xs font-semibold text-neutral-100">
                        {option.name}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 line-clamp-2 leading-relaxed">
                      {option.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部确认操作 */}
      {!isConfirmed && (
        <div className="px-3 py-2 bg-neutral-950 border-t border-neutral-800/80 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-neutral-500 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>选定后将作为全剧统一视觉指南</span>
          </span>

          <button
            onClick={handleConfirm}
            className="flex items-center gap-1 text-[11px] px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium shadow-sm transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>锁定风格基调</span>
          </button>
        </div>
      )}
    </div>
  );
};
