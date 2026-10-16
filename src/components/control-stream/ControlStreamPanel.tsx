import React, { useState } from 'react';
import { useStudioStore } from '@/stores/useStudioStore';
import {
  Activity,
  ShieldCheck,
  Zap,
  Compass,
  Play,
  Send,
  Coins,
  History,
  AlertTriangle,
  BookmarkPlus,
} from 'lucide-react';

export const ControlStreamPanel: React.FC = () => {
  const {
    daemonStatus,
    turnSteerInput,
    quotaEstimate,
    checkpoints,
    setTurnSteerInput,
    fetchDaemonStatus,
    checkQuota,
    fetchCheckpoints,
    createCheckpoint,
  } = useStudioStore();

  const [isCheckingQuota, setIsCheckingQuota] = useState(false);

  React.useEffect(() => {
    fetchDaemonStatus();
    fetchCheckpoints();
    const interval = setInterval(() => {
      fetchDaemonStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchDaemonStatus, fetchCheckpoints]);

  const handleSendTurnSteer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!turnSteerInput.trim()) return;
    console.log('[TurnSteer] Dispatched instruction:', turnSteerInput);
    setTurnSteerInput('');
  };

  const handleSimulateQuotaCheck = async () => {
    setIsCheckingQuota(true);
    // 模拟评估一个可能超额的高算力批量渲染任务 (如 600 美分)
    await checkQuota(600, '批量 4K 60fps 场景扩散重绘 (12 镜头)');
    setIsCheckingQuota(false);
  };

  const handleCreateSnapshot = async () => {
    const snapshotName = `导演编排快照 #${checkpoints.length + 1}`;
    await createCheckpoint(snapshotName, JSON.stringify({ timestamp: Date.now() }));
  };

  return (
    <aside className="w-96 border-r border-neutral-800 bg-neutral-900/60 flex flex-col h-full shrink-0">
      {/* 头部标题与宿主守护状态 */}
      <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-neutral-100">Meocox Flow</h1>
            <p className="text-xs text-neutral-400">AIGC 导演编排中枢</p>
          </div>
        </div>

        {/* 守护常驻徽章 */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Daemon Ready</span>
        </div>
      </div>

      {/* 守护进程心跳卡片 */}
      <div className="p-3 border-b border-neutral-800/80 bg-neutral-950/40">
        <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
          <span className="flex items-center gap-1.5 font-medium text-neutral-300">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            后台伪守护监控 (L6 Storage & Daemon)
          </span>
          <span className="text-[10px] text-neutral-500">
            运行: {daemonStatus ? `${daemonStatus.uptime_seconds}s` : '连接中...'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 rounded bg-neutral-900 border border-neutral-800 flex flex-col">
            <span className="text-neutral-500 text-[10px]">排队/活跃任务</span>
            <span className="text-sm font-mono font-bold text-neutral-100">
              {daemonStatus ? daemonStatus.active_tasks_count : 0}
            </span>
          </div>
          <div className="p-2 rounded bg-neutral-900 border border-neutral-800 flex flex-col">
            <span className="text-neutral-500 text-[10px]">渲染管线状态</span>
            <span className={`text-sm font-mono font-bold ${daemonStatus?.is_rendering ? 'text-amber-400' : 'text-neutral-400'}`}>
              {daemonStatus?.is_rendering ? 'RENDERING' : 'IDLE'}
            </span>
          </div>
        </div>
      </div>

      {/* 算力守卫 (Quota Guardian) 与 时光机快照区 */}
      <div className="p-3 border-b border-neutral-800 bg-neutral-950/60 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-amber-400">
            <Coins className="w-3.5 h-3.5" />
            算力预算守卫 (Quota Guardian)
          </span>
          <button
            onClick={handleSimulateQuotaCheck}
            disabled={isCheckingQuota}
            className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
          >
            {isCheckingQuota ? '核算中...' : '核算批量算力'}
          </button>
        </div>

        {quotaEstimate && (
          <div className={`p-2 rounded border text-xs leading-relaxed ${
            quotaEstimate.requires_approval
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
              : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
          }`}>
            <div className="flex items-center gap-1 font-semibold mb-1">
              <AlertTriangle className="w-3 h-3" />
              <span>{quotaEstimate.requires_approval ? '触发零资源挂起门禁' : '预算安全'}</span>
            </div>
            <p className="text-[11px] opacity-90">{quotaEstimate.reason}</p>
          </div>
        )}

        {/* 时间轴时光机 Checkpointer */}
        <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-neutral-400">
            <History className="w-3.5 h-3.5 text-blue-400" />
            时光机检查点 ({checkpoints.length})
          </span>
          <button
            onClick={handleCreateSnapshot}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-blue-900/40 border border-blue-500/30 text-blue-300 hover:bg-blue-800/50 transition-colors"
          >
            <BookmarkPlus className="w-3 h-3" />
            <span>保存快照</span>
          </button>
        </div>
      </div>

      {/* 对话与事件流 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80 text-xs text-neutral-300 leading-relaxed">
          <div className="flex items-center gap-2 mb-1.5 text-neutral-400 font-medium">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>阶段二：可靠工程底座已上线</span>
          </div>
          <p>
            已接入 16-bit PCM 原生音效合成器、CapCut Pro 草稿装配引擎、Quota Guardian 预算熔断守卫与 SQLite WAL 时光机检查点机制。
          </p>
        </div>
      </div>

      {/* 底部 TurnSteer 动态切轨输入卡 */}
      <div className="p-3 border-t border-neutral-800 bg-neutral-950/70">
        <form onSubmit={handleSendTurnSteer} className="space-y-2">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="flex items-center gap-1 font-medium text-amber-400">
              <Play className="w-3 h-3" />
              TurnSteer 动态切轨控制帧
            </span>
            <span className="text-[10px] text-neutral-500">零资源挂起注入</span>
          </div>
          <div className="relative">
            <input
              type="text"
              value={turnSteerInput}
              onChange={(e) => setTurnSteerInput(e.target.value)}
              placeholder="中途输入导演干预指令（如：画面转为暗黑电影感）..."
              className="w-full pl-3 pr-9 py-2 text-xs bg-neutral-900 border border-neutral-700/80 rounded-md text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button
              type="submit"
              disabled={!turnSteerInput.trim()}
              className="absolute right-1.5 top-1.5 p-1 rounded bg-blue-600 text-white disabled:opacity-40 disabled:hover:bg-blue-600 hover:bg-blue-500 transition-colors"
            >
              <Send className="w-3 h-3" />
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
};
