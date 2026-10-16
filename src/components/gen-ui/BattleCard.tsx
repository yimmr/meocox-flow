import React, { useState } from 'react';
import { Swords, CheckCircle2, Eye, Sparkles, Award } from 'lucide-react';
import { type BattleCardPayload } from '@/types/director';

interface BattleCardProps {
  payload: BattleCardPayload;
  onSelectWinner: (sceneId: string, branchId: string) => void;
}

/**
 * 变体竞技场对决卡片 (BattleCard - A2UI)
 * 高度严格限制在 500px 预算内，支持双分支并排盲测对比与胜出拍板回写
 */
export const BattleCard: React.FC<BattleCardProps> = ({ payload, onSelectWinner }) => {
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    payload.winner_branch_id || null
  );
  const [isBlindTest, setIsBlindTest] = useState<boolean>(true);

  const handlePickWinner = (branchId: string) => {
    setSelectedBranchId(branchId);
    onSelectWinner(payload.scene_id, branchId);
  };

  const isResolved = payload.status === 'resolved' || !!payload.winner_branch_id;

  return (
    <div className="w-full max-w-xl mx-auto my-3 bg-slate-900/90 border border-amber-500/30 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden text-slate-100 max-h-[490px] flex flex-col">
      {/* 头部：竞技场状态与盲测切换 */}
      <div className="px-4 py-3 bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 border-b border-amber-500/20 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-500/20 rounded-lg text-amber-400 border border-amber-500/30">
            <Swords className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-100">
                分镜 #{payload.scene_num} 审美变体竞技场
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                Battle Mode
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate max-w-xs">{payload.prompt}</p>
          </div>
        </div>

        <button
          onClick={() => setIsBlindTest(!isBlindTest)}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          title="切换盲测模式"
        >
          <Eye className="w-3 h-3 text-amber-400" />
          <span>{isBlindTest ? '盲测中' : '明细展开'}</span>
        </button>
      </div>

      {/* 核心内容区：双分支并排呈现 (可纵向滚动) */}
      <div className="p-4 grid grid-cols-2 gap-3 overflow-y-auto flex-1 min-h-0">
        {payload.branches.map((branch, index) => {
          const isWinner = selectedBranchId === branch.branch_id || branch.is_winner;
          const letter = index === 0 ? 'A' : 'B';

          return (
            <div
              key={branch.branch_id}
              className={`flex flex-col justify-between p-3 rounded-lg border transition-all ${
                isWinner
                  ? 'bg-amber-500/10 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                  : 'bg-slate-800/60 border-slate-700/80 hover:border-slate-600'
              }`}
            >
              <div>
                {/* 分支标题 */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-amber-300 font-mono">
                    方案 {letter}
                  </span>
                  {isWinner && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                      <Award className="w-3 h-3" />
                      胜出拍板
                    </span>
                  )}
                </div>

                {/* 方案标签与描述 */}
                <h4 className="text-xs font-medium text-slate-200 line-clamp-2 mb-2">
                  {isBlindTest ? `美学候选方案 ${letter}` : branch.label}
                </h4>

                {/* 媒体资产预览代理 */}
                <div className="relative aspect-video rounded bg-slate-950 border border-slate-700/50 flex items-center justify-center overflow-hidden mb-2">
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-900/40 to-slate-950/80 flex flex-col items-center justify-center p-2 text-center">
                    <Sparkles className="w-5 h-5 text-amber-400/70 mb-1" />
                    <span className="text-[10px] font-mono text-slate-400">
                      {branch.asset_id}
                    </span>
                  </div>
                </div>

                {/* 盲测关闭时显示的变体提示词 */}
                {!isBlindTest && (
                  <p className="text-[10px] text-slate-400 line-clamp-3 bg-slate-950/60 p-1.5 rounded font-mono border border-slate-800 mb-2">
                    {branch.prompt_variant}
                  </p>
                )}
              </div>

              {/* 拍板按键 */}
              <button
                disabled={isResolved}
                onClick={() => handlePickWinner(branch.branch_id)}
                className={`w-full py-1.5 px-2 rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-all mt-2 ${
                  isWinner
                    ? 'bg-amber-500 text-slate-950 font-semibold cursor-default'
                    : isResolved
                    ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                    : 'bg-slate-800 hover:bg-amber-500/20 text-slate-200 hover:text-amber-300 border border-slate-600 hover:border-amber-500/50'
                }`}
              >
                {isWinner ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    已采纳此方案
                  </>
                ) : (
                  <>选择此分支拍板</>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* 底部提示栏 */}
      <div className="px-4 py-2 bg-slate-950/70 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between shrink-0">
        <span className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-400" />
          胜出分支参数将原子回写至黑板 StyleBible 与分镜时间轴
        </span>
        <span className="font-mono text-slate-500 text-[10px]">MaxRetries: 3</span>
      </div>
    </div>
  );
};
