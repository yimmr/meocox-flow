import React, { useState, useEffect } from 'react';
import { useStudioStore } from '@/stores/useStudioStore';
import { open } from '@tauri-apps/plugin-dialog';
import {
  FolderOpen,
  Plus,
  Film,
  Music,
  Image as ImageIcon,
  Database,
  Wand2,
  Tag,
  Search,
  BookOpen,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { type SoundEffectType } from '@/bindings';

interface ProjectLibrarySidebarProps {
  width: number;
}

export const ProjectLibrarySidebar: React.FC<ProjectLibrarySidebarProps> = ({ width }) => {
  const {
    assets,
    selectedAsset,
    setSelectedAsset,
    registerAsset,
    generateSound,
    setActiveArtifactTab,
    setTurnSteerInput,
    turnSteerInput,
    skillIndexes,
    fetchSkills,
    fetchBlackboardState,
  } = useStudioStore();

  const [filterType, setFilterType] = useState<'all' | 'video' | 'audio' | 'image'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isSkillsExpanded, setIsSkillsExpanded] = useState(false);

  useEffect(() => {
    fetchSkills();
    fetchBlackboardState();
  }, [fetchSkills, fetchBlackboardState]);

  const handleImportFile = async () => {
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

  const handleQuickSynth = async (type: SoundEffectType) => {
    setIsSynthesizing(true);
    await generateSound(type);
    setIsSynthesizing(false);
  };

  const filteredAssets = assets.filter((a) => {
    if (filterType !== 'all' && a.media_type !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleInsertAssetTag = (assetId: string, assetName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tag = ` @${assetName} [${assetId}] `;
    setTurnSteerInput(`${turnSteerInput}${tag}`);
  };

  const handleInsertSkillKeyword = (keyword: string) => {
    setTurnSteerInput(`${turnSteerInput} [启用技能: ${keyword}] `);
  };

  return (
    <aside
      style={{ width }}
      className="border-r border-neutral-800 bg-neutral-950/80 flex flex-col h-full shrink-0 select-none overflow-hidden transition-none"
    >
      {/* 头部：标题与导入按钮 */}
      <div className="h-11 px-3 border-b border-neutral-800 flex items-center justify-between shrink-0 bg-neutral-900/40">
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-neutral-200">
            媒体资产库 (WAL)
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-800 text-neutral-400 font-mono">
            {assets.length}
          </span>
        </div>

        <button
          onClick={handleImportFile}
          disabled={isImporting}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
          title="导入本地媒体文件并登记至 SQLite WAL 媒体池"
        >
          <Plus className="w-3 h-3" />
          <span>{isImporting ? '导入中' : '导入素材'}</span>
        </button>
      </div>

      {/* 快速程序化免版税音效生成 (GEM-02 移植) */}
      <div className="p-2.5 border-b border-neutral-800 bg-neutral-900/20">
        <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-1.5">
          <span className="flex items-center gap-1 font-medium text-neutral-300">
            <Wand2 className="w-3 h-3 text-amber-400" />
            <span>免版税 PCM 音效生成</span>
          </span>
          <span className="text-[10px] text-neutral-500 font-mono">GEM-02 原生</span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => handleQuickSynth('Whoosh')}
            disabled={isSynthesizing}
            className="px-1.5 py-1 rounded bg-neutral-850 hover:bg-neutral-800 text-[10px] text-neutral-300 border border-neutral-750 flex flex-col items-center gap-0.5 transition-colors disabled:opacity-50"
          >
            <span>Whoosh</span>
            <span className="text-[8px] text-neutral-500 font-mono">0.45s 转场</span>
          </button>
          <button
            onClick={() => handleQuickSynth('Chime')}
            disabled={isSynthesizing}
            className="px-1.5 py-1 rounded bg-neutral-850 hover:bg-neutral-800 text-[10px] text-neutral-300 border border-neutral-750 flex flex-col items-center gap-0.5 transition-colors disabled:opacity-50"
          >
            <span>Chime</span>
            <span className="text-[8px] text-neutral-500 font-mono">0.8s 提示</span>
          </button>
          <button
            onClick={() => handleQuickSynth('TechAmbient')}
            disabled={isSynthesizing}
            className="px-1.5 py-1 rounded bg-neutral-850 hover:bg-neutral-800 text-[10px] text-neutral-300 border border-neutral-750 flex flex-col items-center gap-0.5 transition-colors disabled:opacity-50"
          >
            <span>Tech BGM</span>
            <span className="text-[8px] text-neutral-500 font-mono">16s 背景</span>
          </button>
        </div>
      </div>

      {/* 搜索与类型过滤 */}
      <div className="p-2.5 border-b border-neutral-800 space-y-2">
        <div className="relative">
          <Search className="w-3 h-3 text-neutral-500 absolute left-2 top-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索资产名称、ID 或特征..."
            className="w-full bg-neutral-900 border border-neutral-800 rounded-md pl-6 pr-2 py-1 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-1 text-[11px]">
          {(['all', 'video', 'audio', 'image'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-2 py-0.5 rounded text-[10px] capitalize transition-colors ${
                filterType === type
                  ? 'bg-blue-600 text-white font-medium'
                  : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {type === 'all' ? '全部' : type}
            </button>
          ))}
        </div>
      </div>

      {/* 资产列表区 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filteredAssets.length === 0 ? (
          <div className="p-6 text-center text-xs text-neutral-500">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30 text-neutral-400" />
            <p>暂无符合条件的媒体资产</p>
            <p className="text-[10px] text-neutral-600 mt-1">导入或生成后将自动登记入库</p>
          </div>
        ) : (
          filteredAssets.map((asset) => {
            const isSelected = selectedAsset?.id === asset.id;
            return (
              <div
                key={asset.id}
                onClick={() => {
                  setSelectedAsset(asset);
                  if (asset.media_type === 'audio') setActiveArtifactTab('audio');
                  else setActiveArtifactTab('visual');
                }}
                className={`group p-2 rounded-lg border text-left cursor-pointer transition-all flex items-start gap-2 ${
                  isSelected
                    ? 'border-blue-500/60 bg-blue-950/20 text-neutral-100'
                    : 'border-neutral-850 bg-neutral-900/40 hover:bg-neutral-900 hover:border-neutral-750 text-neutral-300'
                }`}
              >
                {/* 媒体类型图标 */}
                <div className="mt-0.5 shrink-0">
                  {asset.media_type === 'video' && (
                    <div className="w-5 h-5 rounded bg-purple-950/60 border border-purple-500/30 flex items-center justify-center text-purple-400">
                      <Film className="w-3 h-3" />
                    </div>
                  )}
                  {asset.media_type === 'audio' && (
                    <div className="w-5 h-5 rounded bg-amber-950/60 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <Music className="w-3 h-3" />
                    </div>
                  )}
                  {asset.media_type === 'image' && (
                    <div className="w-5 h-5 rounded bg-blue-950/60 border border-blue-500/30 flex items-center justify-center text-blue-400">
                      <ImageIcon className="w-3 h-3" />
                    </div>
                  )}
                </div>

                {/* 资产简述 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-medium truncate" title={asset.name}>
                      {asset.name}
                    </span>
                    {asset.duration_ms && (
                      <span className="text-[9px] text-neutral-500 font-mono shrink-0">
                        {(asset.duration_ms / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-neutral-500 font-mono mt-0.5">
                    <span className="truncate">{asset.id}</span>
                    <button
                      onClick={(e) => handleInsertAssetTag(asset.id, asset.name, e)}
                      className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-300 flex items-center gap-0.5 transition-opacity"
                      title="在指令输入框中引用此资产"
                    >
                      <Tag className="w-2.5 h-2.5" />
                      <span>引用</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Level 1 渐进式技能微索引折叠面板 */}
      <div className="border-t border-neutral-800 bg-neutral-950 shrink-0">
        <button
          onClick={() => setIsSkillsExpanded(!isSkillsExpanded)}
          className="w-full px-3 py-2 flex items-center justify-between text-[11px] text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/60 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-3 h-3 text-cyan-400" />
            <span className="font-medium">视听技能微索引 (Level 1)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono text-neutral-500">
              {skillIndexes.length} 技能
            </span>
            {isSkillsExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </div>
        </button>

        {isSkillsExpanded && (
          <div className="p-2 space-y-1.5 max-h-40 overflow-y-auto bg-neutral-900/50 border-t border-neutral-850">
            {skillIndexes.map((skill) => (
              <div
                key={skill.name}
                className="p-1.5 rounded bg-neutral-950 border border-neutral-800 text-[10px] space-y-1"
              >
                <div className="flex items-center justify-between font-mono text-cyan-300">
                  <span>{skill.name}</span>
                </div>
                <p className="text-neutral-400 line-clamp-1">{skill.description}</p>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {skill.trigger_keywords.map((kw: string, i: number) => (
                    <button
                      key={i}
                      onClick={() => handleInsertSkillKeyword(kw)}
                      className="px-1 py-0.2 rounded bg-neutral-850 hover:bg-cyan-950 hover:text-cyan-300 border border-neutral-750 text-[9px] text-neutral-400 transition-colors"
                      title="点击将技能关键词填入切轨栏"
                    >
                      +{kw}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部存储状态说明 */}
      <div className="p-2.5 border-t border-neutral-800/80 bg-neutral-950 text-[10px] text-neutral-500 flex items-center justify-between font-mono">
        <span>SQLite WAL 模式</span>
        <span className="text-emerald-500">零内存拷贝</span>
      </div>
    </aside>
  );
};
