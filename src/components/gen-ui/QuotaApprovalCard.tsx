import React from 'react';
import { type QuotaCardPayload } from '@/types/director';
import {
  Coins,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
} from 'lucide-react';

interface QuotaApprovalCardProps {
  card: QuotaCardPayload;
  onResolve: (updated: QuotaCardPayload) => void;
}

export const QuotaApprovalCard: React.FC<QuotaApprovalCardProps> = ({
  card,
  onResolve,
}) => {
  const isApproved = card.status === 'approved';
  const isRejected = card.status === 'rejected';
  const isPending = card.status === 'pending';

  const { estimate, task_desc } = card;
  const costDollars = (estimate.estimated_cost_cents / 100).toFixed(2);
  const remainingDollars = (estimate.remaining_daily_budget_cents / 100).toFixed(2);

  const handleApprove = () => {
    onResolve({
      ...card,
      status: 'approved',
    });
  };

  const handleReject = () => {
    onResolve({
      ...card,
      status: 'rejected',
    });
  };

  return (
    <div className={`w-full max-w-2xl my-2 rounded-xl border shadow-xl overflow-hidden text-neutral-200 select-text flex flex-col max-h-[380px] ${
      estimate.requires_approval
        ? 'border-amber-500/40 bg-neutral-900/90'
        : 'border-emerald-500/40 bg-neutral-900/90'
    }`}>
      {/* 头部 */}
      <div className={`px-3.5 py-2.5 border-b flex items-center justify-between shrink-0 ${
        estimate.requires_approval
          ? 'bg-amber-950/40 border-amber-500/20'
          : 'bg-emerald-950/40 border-emerald-500/20'
      }`}>
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
            estimate.requires_approval
              ? 'bg-amber-500/20 border border-amber-500/30 text-amber-300'
              : 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
          }`}>
            <Coins className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-neutral-100">
              算力预算守卫 (Quota Guardian) 门禁
            </h3>
            <span className="text-[10px] text-neutral-400">
              {task_desc}
            </span>
          </div>
        </div>

        {isApproved && (
          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>已审批放行</span>
          </span>
        )}

        {isRejected && (
          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-rose-950/60 border border-rose-500/30 text-rose-400 font-medium">
            <XCircle className="w-3 h-3" />
            <span>已拦截中止</span>
          </span>
        )}

        {isPending && estimate.requires_approval && (
          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-950/70 border border-amber-500/40 text-amber-300 font-mono">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>零资源挂起中</span>
          </span>
        )}
      </div>

      {/* 核心核算数据区 */}
      <div className="p-3 space-y-2.5 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 flex flex-col">
            <span className="text-neutral-500 text-[10px]">本次任务预估开销</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base font-bold font-mono text-neutral-100">
                ${costDollars}
              </span>
              <span className="text-[10px] text-neutral-400 font-mono">
                ({estimate.estimated_cost_cents} 美分)
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 flex flex-col">
            <span className="text-neutral-500 text-[10px]">今日剩余预算额度</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className={`text-base font-bold font-mono ${
                estimate.remaining_daily_budget_cents < estimate.estimated_cost_cents
                  ? 'text-rose-400'
                  : 'text-emerald-400'
              }`}>
                ${remainingDollars}
              </span>
              <span className="text-[10px] text-neutral-400 font-mono">
                ({estimate.remaining_daily_budget_cents} 美分)
              </span>
            </div>
          </div>
        </div>

        {/* 触发原因说明 */}
        <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-300 leading-relaxed">
          <span className="text-neutral-500 font-medium mr-1">门禁判断理由：</span>
          <span>{estimate.reason}</span>
        </div>
      </div>

      {/* 底部操作区 */}
      {isPending && (
        <div className="px-3 py-2 bg-neutral-950 border-t border-neutral-800/80 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-neutral-500 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3 text-amber-400" />
            <span>挂起状态不消耗任何后台 GPU/CPU 计算资源</span>
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReject}
              className="text-[11px] px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
            >
              放弃/削减质量
            </button>
            <button
              onClick={handleApprove}
              className="flex items-center gap-1 text-[11px] px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium shadow-sm transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>特批放行并渲染</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
