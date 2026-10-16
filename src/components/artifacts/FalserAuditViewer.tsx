import React from 'react';
import { useStudioStore } from '@/stores/useStudioStore';
import { ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';
import { type AuditLogEntry, type FalserCheckResult } from '@/bindings';

export const FalserAuditViewer: React.FC = () => {
  const { blackboardState } = useStudioStore();

  if (!blackboardState || blackboardState.audit_log.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-neutral-500">
        <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30 text-emerald-400" />
        <p>暂无知觉证伪质检审计日志</p>
        <p className="text-[10px] text-neutral-600 mt-1">分镜生成时将自动触发四维自动化门禁检验</p>
      </div>
    );
  }

  const { audit_log } = blackboardState;

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between text-neutral-400 text-[11px] mb-1">
        <span className="font-medium text-neutral-200 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          Continuity Falser 质检审计
        </span>
        <span className="font-mono text-[10px]">{audit_log.length} 条记录</span>
      </div>

      <div className="space-y-2.5">
        {audit_log.map((entry: AuditLogEntry) => {
          const isPassed = entry.action === 'FALSER_PASSED';
          const isRejected = entry.action === 'FALSER_REJECTED';
          const isBattle = entry.action === 'BATTLE_WINNER_RESOLVED';
          const time = new Date(entry.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });

          return (
            <div
              key={entry.entry_id}
              className="p-3 rounded-lg border border-neutral-800 bg-neutral-900/60 space-y-2 hover:border-neutral-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-neutral-500">{time}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium border flex items-center gap-1 ${
                    isPassed
                      ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400'
                      : isRejected
                      ? 'bg-rose-950/60 border-rose-500/30 text-rose-400'
                      : isBattle
                      ? 'bg-amber-950/60 border-amber-500/30 text-amber-400'
                      : 'bg-blue-950/60 border-blue-500/30 text-blue-400'
                  }`}
                >
                  {isPassed && <CheckCircle2 className="w-3 h-3" />}
                  {isRejected && <XCircle className="w-3 h-3" />}
                  {isBattle && <CheckCircle2 className="w-3 h-3" />}
                  {entry.action}
                </span>
              </div>

              <p className="text-[11px] text-neutral-300 leading-relaxed font-mono">
                {entry.details}
              </p>

              {/* 四维探针明细 */}
              {entry.checks && entry.checks.length > 0 && (
                <div className="pt-2 border-t border-neutral-800 space-y-1">
                  {entry.checks.map((chk: FalserCheckResult, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1 text-neutral-400">
                        {chk.passed ? (
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-2.5 h-2.5 text-rose-400" />
                        )}
                        <span>{chk.probe_name}</span>
                      </span>
                      <span className="font-mono text-neutral-500">
                        {(chk.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
