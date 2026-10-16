import React, { useState } from 'react';
import { type AssetMetadata, type CapCutClipInput, type CapCutExportResult } from '@/bindings';
import {
  FileVideo,
  CheckCircle2,
  FolderCheck,
} from 'lucide-react';

interface CapCutExporterCardProps {
  assets: AssetMetadata[];
  exportResult: CapCutExportResult | null;
  isExporting: boolean;
  onExport: (draftName: string, clips: CapCutClipInput[]) => Promise<CapCutExportResult | null>;
}

export const CapCutExporterCard: React.FC<CapCutExporterCardProps> = ({
  assets,
  exportResult,
  isExporting,
  onExport,
}) => {
  const [draftName, setDraftName] = useState('MeocoxFlow_Cyberpunk_Draft');
  const [lastResult, setLastResult] = useState<CapCutExportResult | null>(exportResult);

  const videoAssets = assets.filter((a) => a.media_type === 'video');

  const handleTriggerExport = async () => {
    // 构造剪映轨道分镜列表
    const clips: CapCutClipInput[] = videoAssets.map((asset, index) => ({
      name: asset.name,
      file_path: asset.local_path,
      duration_ms: asset.duration_ms || 4000,
      subtitle: `第 ${index + 1} 幕 · 导演智能体对齐镜头`,
    }));

    if (clips.length === 0) {
      alert('请先导入至少 1 个本地视频资产，以便组装剪映 Pro 多轨工程。');
      return;
    }

    const res = await onExport(draftName.trim() || 'MeocoxFlow_Draft', clips);
    if (res) {
      setLastResult(res);
    }
  };

  return (
    <div className="space-y-4 text-xs text-neutral-200">
      {/* 头部功能介绍 */}
      <div className="p-3 rounded-xl border border-purple-500/30 bg-purple-950/20 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-purple-300 font-semibold">
            <FileVideo className="w-3.5 h-3.5" />
            <span>剪映 Pro 工业级草稿组装 (GEM-01)</span>
          </div>
          <span className="text-[10px] text-purple-400 font-mono">微秒时间戳对齐</span>
        </div>
        <p className="text-[11px] text-neutral-400 leading-relaxed">
          将智能体推导的分镜视频与程序化音效一次性拼装为标准 CapCut 剪映 Pro 工程，可直接在剪映客户端中无损打开二次精修。
        </p>
      </div>

      {/* 待装配轨道清单 */}
      <div className="p-3 rounded-xl border border-neutral-800 bg-neutral-950/80 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-neutral-400 font-medium">
            待组装视频分镜 ({videoAssets.length} 轨)
          </span>
          <span className="text-[10px] text-neutral-500 font-mono">
            {videoAssets.length > 0 ? '素材完备' : '待导入视频素材'}
          </span>
        </div>

        {videoAssets.length === 0 ? (
          <div className="p-4 rounded-lg bg-neutral-900 border border-neutral-800 text-center text-neutral-500 text-[11px]">
            左侧资产库暂无视频素材。请导入视频文件后执行一键草稿组装。
          </div>
        ) : (
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {videoAssets.map((asset, idx) => (
              <div
                key={asset.id}
                className="p-1.5 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-between text-[11px]"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="font-mono text-purple-400 font-bold">
                    #{idx + 1}
                  </span>
                  <span className="truncate text-neutral-300" title={asset.name}>
                    {asset.name}
                  </span>
                </div>
                <span className="text-[10px] text-neutral-500 font-mono shrink-0">
                  {((asset.duration_ms || 4000) / 1000).toFixed(1)}s
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 草稿名称输入 */}
        <div className="pt-2 border-t border-neutral-800 space-y-1">
          <label className="text-[11px] text-neutral-400">剪映工程名称：</label>
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-neutral-900 border border-neutral-700 rounded text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        <button
          onClick={handleTriggerExport}
          disabled={isExporting || videoAssets.length === 0}
          className="w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors disabled:opacity-40 disabled:hover:bg-purple-600"
        >
          <FileVideo className="w-3.5 h-3.5" />
          <span>{isExporting ? '正在生成剪映 Pro 草稿...' : '一键导出剪映工程'}</span>
        </button>
      </div>

      {/* 导出成功结果反馈 */}
      {lastResult && (
        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>剪映 Pro 工程已成功组装！</span>
          </div>

          <div className="space-y-1 text-[11px] text-neutral-300">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">草稿名称：</span>
              <span className="font-bold text-neutral-200">{lastResult.draft_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">分镜轨道：</span>
              <span className="font-mono">{lastResult.clip_count} 个镜头片段</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">成片总时长：</span>
              <span className="font-mono">{(lastResult.total_duration_ms / 1000).toFixed(1)} 秒</span>
            </div>
          </div>

          <div className="p-2 rounded bg-neutral-950 border border-neutral-800 text-[10px] text-neutral-400 font-mono break-all flex items-start gap-1">
            <FolderCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <span>{lastResult.draft_dir}</span>
          </div>
        </div>
      )}
    </div>
  );
};
