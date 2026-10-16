import React from 'react';
import { type AssetMetadata } from '@/bindings';
import { getAssetUrl } from '@/lib/asset';
import {
  Film,
  Clock,
  HardDrive,
  Copy,
} from 'lucide-react';

interface VisualAssetViewerProps {
  assets: AssetMetadata[];
  selectedAsset: AssetMetadata | null;
  onSelectAsset: (asset: AssetMetadata) => void;
}

export const VisualAssetViewer: React.FC<VisualAssetViewerProps> = ({
  assets,
  selectedAsset,
  onSelectAsset,
}) => {
  const visualAssets = assets.filter(
    (a) => a.media_type === 'video' || a.media_type === 'image'
  );

  const activeAsset =
    selectedAsset && (selectedAsset.media_type === 'video' || selectedAsset.media_type === 'image')
      ? selectedAsset
      : visualAssets[0] || null;

  const handleCopyHandle = (id: string) => {
    navigator.clipboard.writeText(id);
  };

  if (!activeAsset) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-neutral-500 space-y-2">
        <Film className="w-8 h-8 text-neutral-700" />
        <div className="text-xs font-medium text-neutral-400">暂无视觉分镜资产</div>
        <p className="text-[11px] text-neutral-600 leading-relaxed max-w-xs">
          请在左侧导入视频/图像素材，或在对话流中生成首批视觉分镜。
        </p>
      </div>
    );
  }

  const safeUrl = getAssetUrl(activeAsset.local_path);

  return (
    <div className="space-y-4">
      {/* 媒体预览视窗 (Zero-Copy asset:// 流式协议) */}
      <div className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950/80 shadow-inner flex flex-col">
        <div className="relative aspect-video bg-neutral-900 flex items-center justify-center overflow-hidden">
          {activeAsset.media_type === 'video' ? (
            <video
              src={safeUrl}
              controls
              className="w-full h-full object-contain"
            />
          ) : (
            <img
              src={safeUrl}
              alt={activeAsset.name}
              className="w-full h-full object-contain"
            />
          )}
        </div>

        {/* 媒体信息条 */}
        <div className="p-3 border-t border-neutral-800/80 space-y-2 bg-neutral-900/40">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-neutral-100 truncate max-w-[220px]" title={activeAsset.name}>
                {activeAsset.name}
              </h4>
              <p className="text-[10px] text-neutral-400 mt-0.5 line-clamp-1">
                {activeAsset.summary || '无摘要描述'}
              </p>
            </div>

            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-bold bg-neutral-800 text-neutral-300">
              {activeAsset.media_type}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] text-neutral-400 font-mono">
            <div className="flex items-center gap-1 truncate">
              <HardDrive className="w-3 h-3 text-neutral-500 shrink-0" />
              <span className="truncate" title={activeAsset.local_path}>
                {activeAsset.local_path.split(/[\\\/]/).pop()}
              </span>
            </div>

            {activeAsset.duration_ms && (
              <div className="flex items-center gap-1 justify-end">
                <Clock className="w-3 h-3 text-neutral-500 shrink-0" />
                <span>{(activeAsset.duration_ms / 1000).toFixed(1)}s</span>
              </div>
            )}
          </div>

          {/* 句柄与快捷复制 */}
          <div className="flex items-center justify-between text-[10px] text-neutral-500 pt-1.5 border-t border-neutral-800">
            <span className="font-mono text-neutral-400">{activeAsset.id}</span>
            <button
              onClick={() => handleCopyHandle(activeAsset.id)}
              className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
              title="复制全链路唯一资产句柄"
            >
              <Copy className="w-2.5 h-2.5" />
              <span>复制句柄</span>
            </button>
          </div>
        </div>
      </div>

      {/* 视觉资产缩略图走廊 */}
      {visualAssets.length > 1 && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-semibold text-neutral-400 px-1">
            全部视觉资产 ({visualAssets.length})
          </span>
          <div className="grid grid-cols-3 gap-2">
            {visualAssets.map((asset) => {
              const isSelected = activeAsset.id === asset.id;
              const thumbUrl = getAssetUrl(asset.local_path);
              return (
                <div
                  key={asset.id}
                  onClick={() => onSelectAsset(asset)}
                  className={`aspect-video rounded-lg border overflow-hidden cursor-pointer relative group transition-all ${
                    isSelected
                      ? 'border-blue-500 ring-2 ring-blue-500/20'
                      : 'border-neutral-800 hover:border-neutral-700 bg-neutral-900'
                  }`}
                  title={asset.name}
                >
                  {asset.media_type === 'image' ? (
                    <img
                      src={thumbUrl}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-neutral-900 text-neutral-500">
                      <Film className="w-4 h-4 text-purple-400" />
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1 text-[9px] text-neutral-300 truncate">
                    {asset.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
