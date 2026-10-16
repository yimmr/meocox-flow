import React, { useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStudioStore } from '@/stores/useStudioStore';
import { getAssetUrl } from '@/lib/asset';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Film,
  Music,
  Image as ImageIcon,
  FolderPlus,
  Layers,
  Database,
  ExternalLink,
  Wand2,
  FileVideo,
  CheckCircle2,
} from 'lucide-react';
import { type SoundEffectType } from '@/bindings';

const initialNodes: Node[] = [
  {
    id: 'node-1',
    position: { x: 50, y: 100 },
    data: { label: '分镜 01: 智能体开场定妆照 (Scene Concept)' },
    className: 'bg-neutral-900 border border-blue-500/50 rounded-lg p-3 text-neutral-100 text-xs shadow-lg shadow-blue-500/10 font-medium',
  },
  {
    id: 'node-2',
    position: { x: 380, y: 100 },
    data: { label: '分镜 02: 视觉动作强化 (Perception & Continuity)' },
    className: 'bg-neutral-900 border border-purple-500/50 rounded-lg p-3 text-neutral-100 text-xs shadow-lg shadow-purple-500/10 font-medium',
  },
  {
    id: 'node-3',
    position: { x: 700, y: 100 },
    data: { label: '分镜 03: 剪映草稿装配 (CapCut Deterministic Export)' },
    className: 'bg-neutral-900 border border-emerald-500/50 rounded-lg p-3 text-neutral-100 text-xs shadow-lg shadow-emerald-500/10 font-medium',
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: 'node-1', target: 'node-2', animated: true, style: { stroke: '#3b82f6' } },
  { id: 'e2-3', source: 'node-2', target: 'node-3', animated: true, style: { stroke: '#a855f7' } },
];

export const LivingCanvasPanel: React.FC = () => {
  const {
    assets,
    selectedAsset,
    setSelectedAsset,
    fetchAssets,
    registerAsset,
    generateSound,
    exportCapCut,
  } = useStudioStore();

  const [nodes] = useState<Node[]>(initialNodes);
  const [edges] = useState<Edge[]>(initialEdges);
  const [isImporting, setIsImporting] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  React.useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleImportAsset = async () => {
    try {
      setIsImporting(true);
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Media Files',
            extensions: ['mp4', 'mov', 'webm', 'mp3', 'wav', 'png', 'jpg', 'jpeg', 'webp'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        const ext = selected.split('.').pop()?.toLowerCase() || '';
        let mediaType = 'image';
        if (['mp4', 'mov', 'webm'].includes(ext)) mediaType = 'video';
        else if (['mp3', 'wav'].includes(ext)) mediaType = 'audio';

        const name = selected.split(/[\/\\]/).pop() || 'media_asset';
        await registerAsset(selected, mediaType, name);
      }
    } catch (err) {
      console.error('Failed to import asset:', err);
    } finally {
      setIsImporting(false);
    }
  };

  const handleGenerateSound = async (type: SoundEffectType) => {
    setIsSynthesizing(true);
    await generateSound(type);
    setIsSynthesizing(false);
  };

  const handleExportCapCut = async () => {
    const videoAssets = assets.filter((a) => a.media_type === 'video');
    const clips = videoAssets.map((a, idx) => ({
      name: a.name,
      file_path: a.local_path,
      duration_ms: a.duration_ms || 4000,
      subtitle: `分镜 ${idx + 1} 智能体脚本对齐`,
    }));

    if (clips.length === 0) {
      setExportNotice('提示：请先导入至少 1 个本地视频素材后再组装剪映草稿。');
      return;
    }

    const res = await exportCapCut('MeocoxFlow_Draft', clips);
    if (res) {
      setExportNotice(`剪映 Pro 草稿已成功导出！路径: ${res.draft_dir} (${res.clip_count} 个分镜轨道)`);
    }
  };

  return (
    <main className="flex-1 flex flex-col h-full bg-neutral-950 overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="h-12 border-b border-neutral-800 px-4 flex items-center justify-between shrink-0 bg-neutral-900/40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-neutral-300 font-medium">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>Living Canvas (双栏 DAG 分镜画布)</span>
          </div>
          <span className="text-neutral-600">|</span>
          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>SQLite WAL 媒体池 ({assets.length} 个句柄)</span>
          </div>
        </div>

        {/* 媒体管线操作按钮群 */}
        <div className="flex items-center gap-2">
          {/* 程序化音效合成下拉触发 */}
          <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-700 rounded-md p-0.5 text-xs">
            <button
              onClick={() => handleGenerateSound('Whoosh')}
              disabled={isSynthesizing}
              className="px-2 py-1 rounded hover:bg-neutral-800 text-neutral-300 transition-colors flex items-center gap-1"
            >
              <Wand2 className="w-3 h-3 text-amber-400" />
              <span>Whoosh 转场</span>
            </button>
            <button
              onClick={() => handleGenerateSound('Chime')}
              disabled={isSynthesizing}
              className="px-2 py-1 rounded hover:bg-neutral-800 text-neutral-300 transition-colors"
            >
              Chime 提示
            </button>
            <button
              onClick={() => handleGenerateSound('TechAmbient')}
              disabled={isSynthesizing}
              className="px-2 py-1 rounded hover:bg-neutral-800 text-neutral-300 transition-colors"
            >
              Lo-Fi BGM
            </button>
          </div>

          {/* 剪映 CapCut 草稿导出 */}
          <button
            onClick={handleExportCapCut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-purple-600/30 hover:bg-purple-600/40 border border-purple-500/40 text-purple-200 text-xs font-medium transition-colors"
          >
            <FileVideo className="w-3.5 h-3.5" />
            <span>导出剪映工程</span>
          </button>

          {/* 导入本地素材 */}
          <button
            onClick={handleImportAsset}
            disabled={isImporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>{isImporting ? '导入中...' : '导入素材'}</span>
          </button>
        </div>
      </div>

      {/* 导出通知提示条 */}
      {exportNotice && (
        <div className="bg-purple-950/80 border-b border-purple-500/40 px-4 py-2 flex items-center justify-between text-xs text-purple-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
            <span>{exportNotice}</span>
          </div>
          <button
            onClick={() => setExportNotice(null)}
            className="text-[10px] text-purple-400 hover:text-purple-200 underline"
          >
            关闭
          </button>
        </div>
      )}

      {/* 主画布工作区：上层 ReactFlow 分镜图 + 下层时间轴素材抽屉 */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {/* 上半部分：React Flow 节点图 */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            className="bg-neutral-950"
          >
            <Background color="#262626" gap={20} size={1} />
            <Controls className="!bg-neutral-900 !border-neutral-800 !text-neutral-300 rounded shadow-lg" />
          </ReactFlow>
        </div>

        {/* 下半部分：媒体资产池 (Zero-Copy asset:// 零拷贝流式加载) */}
        <div className="h-48 border-t border-neutral-800 bg-neutral-900/80 flex flex-col shrink-0">
          <div className="px-4 py-2 border-b border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
            <span className="font-semibold text-neutral-300">
              本地资产池 (Handle-Only Context · 零 IPC 拷贝流式加载)
            </span>
            <span className="text-[11px] text-neutral-500">
              包含用户原始素材与 derived/ 程序化衍生音效
            </span>
          </div>

          <div className="flex-1 p-3 overflow-x-auto flex items-center gap-3">
            {assets.length === 0 ? (
              <div className="w-full flex flex-col items-center justify-center text-xs text-neutral-500 gap-1.5 py-6">
                <Database className="w-6 h-6 text-neutral-700" />
                <span>暂未登记任何媒体资产，点击右上角导入素材或生成免版税音效</span>
              </div>
            ) : (
              assets.map((asset) => {
                const isSelected = selectedAsset?.id === asset.id;
                const safeUrl = getAssetUrl(asset.local_path);
                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className={`w-44 h-32 rounded-lg border p-2 flex flex-col justify-between cursor-pointer shrink-0 transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-950/30'
                        : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span className="flex items-center gap-1">
                        {asset.media_type === 'video' && <Film className="w-3 h-3 text-purple-400" />}
                        {asset.media_type === 'audio' && <Music className="w-3 h-3 text-amber-400" />}
                        {asset.media_type === 'image' && <ImageIcon className="w-3 h-3 text-blue-400" />}
                        <span className="uppercase font-mono text-[10px]">{asset.media_type}</span>
                      </span>
                      <ExternalLink className="w-2.5 h-2.5 text-neutral-600" />
                    </div>

                    <div className="my-1 flex-1 flex items-center justify-center overflow-hidden rounded bg-neutral-900 border border-neutral-800/60">
                      {asset.media_type === 'image' ? (
                        <img
                          src={safeUrl}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-[10px] text-neutral-500 text-center px-2">
                          <code className="text-neutral-400 text-[9px]">{asset.id}</code>
                        </div>
                      )}
                    </div>

                    <div className="text-[11px] font-medium text-neutral-200 truncate" title={asset.name}>
                      {asset.name}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </main>
  );
};
