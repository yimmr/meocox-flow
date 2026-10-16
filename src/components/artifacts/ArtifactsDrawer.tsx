import React from 'react';
import { useStudioStore } from '@/stores/useStudioStore';
import { VisualAssetViewer } from './VisualAssetViewer';
import { ProceduralAudioPlayer } from './ProceduralAudioPlayer';
import { CapCutExporterCard } from './CapCutExporterCard';
import {
  Layers,
  Film,
  Music,
  FileVideo,
  X,
} from 'lucide-react';

interface ArtifactsDrawerProps {
  width: number;
}

export const ArtifactsDrawer: React.FC<ArtifactsDrawerProps> = ({ width }) => {
  const {
    assets,
    selectedAsset,
    setSelectedAsset,
    activeArtifactTab,
    setActiveArtifactTab,
    generateSound,
    capcutExportResult,
    isExportingCapCut,
    exportCapCut,
    toggleRightSidebar,
  } = useStudioStore();

  const visualCount = assets.filter((a) => a.media_type === 'video' || a.media_type === 'image').length;
  const audioCount = assets.filter((a) => a.media_type === 'audio').length;

  return (
    <aside
      style={{ width }}
      className="border-l border-neutral-800 bg-neutral-950/90 flex flex-col h-full shrink-0 select-text overflow-hidden transition-none"
    >
      {/* 抽屉顶栏 */}
      <div className="h-11 px-3 border-b border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-900/40 select-none">
        <div className="flex items-center gap-2">
          <Layers className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-xs font-semibold text-neutral-100">
            多模态产物画板 (Artifacts)
          </span>
        </div>

        <button
          onClick={toggleRightSidebar}
          className="p-1 rounded text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
          title="折叠产物画板"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab 导航切换 */}
      <div className="flex items-center border-b border-neutral-800 bg-neutral-950 px-2 pt-2 gap-1 select-none">
        <button
          onClick={() => setActiveArtifactTab('visual')}
          className={`flex-1 py-1.5 px-2 rounded-t-md text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
            activeArtifactTab === 'visual'
              ? 'border-blue-500 text-neutral-100 bg-neutral-900/60'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Film className="w-3 h-3 text-blue-400" />
          <span>分镜视觉</span>
          <span className="text-[10px] px-1 rounded-full bg-neutral-800 text-neutral-400 font-mono">
            {visualCount}
          </span>
        </button>

        <button
          onClick={() => setActiveArtifactTab('audio')}
          className={`flex-1 py-1.5 px-2 rounded-t-md text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
            activeArtifactTab === 'audio'
              ? 'border-amber-500 text-neutral-100 bg-neutral-900/60'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Music className="w-3 h-3 text-amber-400" />
          <span>免版税音效</span>
          <span className="text-[10px] px-1 rounded-full bg-neutral-800 text-neutral-400 font-mono">
            {audioCount}
          </span>
        </button>

        <button
          onClick={() => setActiveArtifactTab('capcut')}
          className={`flex-1 py-1.5 px-2 rounded-t-md text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
            activeArtifactTab === 'capcut'
              ? 'border-purple-500 text-neutral-100 bg-neutral-900/60'
              : 'border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <FileVideo className="w-3 h-3 text-purple-400" />
          <span>剪映 Pro</span>
        </button>
      </div>

      {/* 产物内容滚动区 */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {activeArtifactTab === 'visual' && (
          <VisualAssetViewer
            assets={assets}
            selectedAsset={selectedAsset}
            onSelectAsset={setSelectedAsset}
          />
        )}

        {activeArtifactTab === 'audio' && (
          <ProceduralAudioPlayer
            assets={assets}
            onGenerateSound={generateSound}
          />
        )}

        {activeArtifactTab === 'capcut' && (
          <CapCutExporterCard
            assets={assets}
            exportResult={capcutExportResult}
            isExporting={isExportingCapCut}
            onExport={exportCapCut}
          />
        )}
      </div>

      {/* 底部零拷贝协议提示 */}
      <div className="p-2 border-t border-neutral-800/80 bg-neutral-950 text-[10px] text-neutral-500 flex items-center justify-between font-mono select-none">
        <span>asset:// 虚拟安全映射</span>
        <span className="text-blue-400">零内存拷贝加载</span>
      </div>
    </aside>
  );
};
