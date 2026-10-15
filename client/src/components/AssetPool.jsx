import React, { useState, useEffect } from 'react';
import { 
  Film, Play, Search, Tag, Clock, FolderSearch, 
  Loader2, Sparkles, AlertCircle, HardDrive, CheckCircle2, Cpu, Zap 
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog.jsx';
import { apiFetch } from '@/lib/apiClient.js';

const API_BASE = '/api';

export default function AssetPool({ 
  assets = [], 
  projectId,
  onAssetsUpdated 
}) {
  const [filterTag, setFilterTag] = useState('全部');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClip, setSelectedClip] = useState(null);

  // Scan modal state — 目录留空，由后端 /api/health 下发的默认 assets 目录填充
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scanPath, setScanPath] = useState('');
  const [defaultScanPath, setDefaultScanPath] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`${API_BASE}/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && d.assetsDir && !scanPath) {
          setDefaultScanPath(d.assetsDir);
          setScanPath(d.assetsDir);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const tags = ['全部', 'Boss战', '高能瞬间', '加点教学', '跑图', '本地导入'];

  const filteredAssets = assets.filter(item => {
    const matchesTag = filterTag === '全部' || (item.tags && item.tags.includes(filterTag));
    const matchesSearch = (item.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (item.speech || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (item.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTag && matchesSearch;
  });

  const handleStartScan = async () => {
    setIsScanning(true);
    setScanResult(null);
    try {
      const res = await apiFetch('/api/assets/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          directoryPath: scanPath
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '扫描请求失败');

      setScanResult(data);
      if (onAssetsUpdated) onAssetsUpdated();
    } catch (err) {
      setScanResult({ error: err.message });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 bg-dark-900 overflow-hidden relative">
      {/* Top Filter & Search */}
      <div className="flex flex-col space-y-3 mb-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Film className="w-4 h-4 text-brand-cyan" />
            <h3 className="font-semibold text-sm text-gray-200">本地已切片素材池 ({filteredAssets.length})</h3>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setScanResult(null);
                setIsScanModalOpen(true);
              }}
              className="flex items-center space-x-1.5 bg-dark-800 hover:bg-dark-700 border border-brand-500/40 text-brand-cyan hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition active:scale-95 shadow-sm"
            >
              <FolderSearch className="w-3.5 h-3.5" />
              <span>扫描本地录屏/导入</span>
            </button>
          </div>
        </div>

        {/* Search bar & Tag filters */}
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
            <input 
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索画面标签、台词或素材名..."
              className="w-full bg-dark-800 border border-dark-700 text-xs rounded-lg pl-9 pr-3 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-brand-500 transition"
            />
          </div>
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
          {tags.map(tag => (
            <button
              key={tag}
              onClick={() => setFilterTag(tag)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition ${
                filterTag === tag 
                  ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/30' 
                  : 'bg-dark-800 text-gray-400 hover:text-gray-200 border border-dark-700'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Asset Cards Grid */}
      <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-3 pr-1">
        {filteredAssets.map(clip => (
          <div 
            key={clip.id}
            onClick={() => setSelectedClip(clip)}
            className="group bg-dark-800/90 border border-dark-700 hover:border-brand-500/60 rounded-xl p-3 flex flex-col justify-between cursor-pointer transition-colors duration-150"
          >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-dark-900 rounded-lg overflow-hidden border border-dark-700 flex items-center justify-center mb-2.5">
              {clip.thumbnail ? (
                <img 
                  src={clip.thumbnail} 
                  alt={clip.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-1" />
                  <Film className="w-8 h-8 text-dark-600 group-hover:text-brand-cyan transition" />
                </>
              )}
              
              {/* Duration badge */}
              <div className="absolute bottom-1.5 right-1.5 z-2 bg-black/80 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-mono text-gray-300 flex items-center space-x-1">
                <Clock className="w-2.5 h-2.5" />
                <span>{clip.duration}</span>
              </div>

              {/* AI Score & CAS Indicator */}
              <div className="absolute top-1.5 left-1.5 z-2 flex items-center space-x-1">
                <div className="bg-brand-500/80 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-bold text-white">
                  匹配度 {clip.score ? (clip.score * 100).toFixed(0) : '90'}%
                </div>
                {clip.mediaId && (
                  <div className="bg-emerald-950/80 border border-emerald-500/50 backdrop-blur px-1.5 py-0.5 rounded text-[9px] font-mono text-emerald-300 flex items-center space-x-0.5" title={`CAS媒体指纹: ${clip.mediaId}`}>
                    <Cpu className="w-2.5 h-2.5 text-emerald-400" />
                    <span>CAS</span>
                  </div>
                )}
              </div>

              {/* Play overlay icon */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-3 bg-black/30">
                <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-lg">
                  <Play className="w-4 h-4 ml-0.5" />
                </div>
              </div>
            </div>

            {/* Title & Speech */}
            <div>
              <div className="font-mono text-xs font-semibold text-gray-200 truncate group-hover:text-brand-cyan transition">
                {clip.name}
              </div>
              <p className="text-[11px] text-gray-400 mt-1 line-clamp-1 italic">
                "{clip.speech || '暂无字幕台词'}"
              </p>
              {/* CAS 深度感知识别特征提示 */}
              {(clip.analysis?.vision?.gameOrScene || clip.analysis?.video?.gameOrScene) && (
                <div className="mt-1 flex items-center space-x-1 text-[10px] text-brand-cyan truncate">
                  <Sparkles className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">
                    {clip.analysis?.vision?.gameOrScene || clip.analysis?.video?.gameOrScene}
                  </span>
                </div>
              )}
            </div>

            {/* Tags & Metadata */}
            <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-dark-700/60">
              <div className="flex flex-wrap gap-1">
                {(clip.tags || []).slice(0, 2).map(tag => (
                  <span key={tag} className="text-[10px] bg-dark-700/80 text-gray-300 px-1.5 py-0.5 rounded border border-dark-600">
                    #{tag}
                  </span>
                ))}
              </div>
              <span className="text-[10px] font-mono text-gray-500">
                {clip.resolution || '1080P'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Clip Detail Modal Preview */}
      <Dialog open={!!selectedClip} onOpenChange={(open) => !open && setSelectedClip(null)}>
        <DialogContent className="max-w-lg p-5">
          {selectedClip && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2 text-sm">
                  <Film className="w-4 h-4 text-brand-cyan" />
                  <span className="truncate max-w-xs">{selectedClip.name}</span>
                </DialogTitle>
                <DialogDescription>
                  素材片段详细信息与视觉感知报告
                </DialogDescription>
              </DialogHeader>

              {selectedClip.thumbnail ? (
                <div className="aspect-video bg-dark-900 rounded-xl overflow-hidden mb-3 border border-dark-700">
                  <img src={selectedClip.thumbnail} alt={selectedClip.name} className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="aspect-video bg-dark-900 rounded-xl flex items-center justify-center mb-3 border border-dark-700">
                  <Film className="w-12 h-12 text-dark-600" />
                </div>
              )}

              <div className="space-y-2 text-xs">
                {/* CAS 指纹信息条 */}
                {selectedClip.mediaId && (
                  <div className="bg-emerald-950/40 p-2 rounded-lg border border-emerald-500/30 flex items-center justify-between text-emerald-300">
                    <div className="flex items-center space-x-1.5">
                      <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                      <span>CAS 内容寻址存储 (免重复分析/跨项目共享)</span>
                    </div>
                    <span className="font-mono text-[10px] bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-500/40 text-emerald-200">
                      {selectedClip.mediaId}
                    </span>
                  </div>
                )}

                {/* 深度感知视觉理解 */}
                {(selectedClip.analysis?.vision || selectedClip.analysis?.video) && (
                  <div className="bg-brand-950/30 p-2.5 rounded-lg border border-brand-500/30 space-y-1.5">
                    <div className="flex items-center space-x-1.5 text-brand-cyan font-semibold">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Vision Scout 视觉感知报告</span>
                    </div>
                    <div className="text-gray-200 leading-relaxed">
                      <strong>识别主题：</strong>{selectedClip.analysis.vision?.gameOrScene || selectedClip.analysis.video?.gameOrScene}
                    </div>
                    <div className="text-gray-300 leading-relaxed">
                      <strong>核心动作：</strong>{selectedClip.analysis.vision?.visualActions || selectedClip.analysis.video?.visualActions}
                    </div>
                    {selectedClip.analysis.editorialAdvice && (
                      <div className="pt-1 border-t border-brand-500/20 text-amber-300 flex items-center space-x-2">
                        <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>编导策略: {selectedClip.analysis.editorialAdvice.hookPotential} · {selectedClip.analysis.editorialAdvice.cutStrategy}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-dark-900/80 p-2.5 rounded-lg border border-dark-700/80">
                  <span className="text-gray-400">🗣️ 伴生台词/旁白：</span>
                  <span className="text-gray-200 ml-1">{selectedClip.speech || '暂无字幕'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-dark-900/50 p-2 rounded border border-dark-700">
                    <span className="text-gray-500 block text-[10px]">时长</span>
                    <span className="font-mono text-gray-200">{selectedClip.duration}</span>
                  </div>
                  <div className="bg-dark-900/50 p-2 rounded border border-dark-700">
                    <span className="text-gray-500 block text-[10px]">分辨率</span>
                    <span className="font-mono text-gray-200">{selectedClip.resolution || '1080P'}</span>
                  </div>
                  <div className="bg-dark-900/50 p-2 rounded border border-dark-700">
                    <span className="text-gray-500 block text-[10px]">帧率</span>
                    <span className="font-mono text-gray-200">{selectedClip.fps || 60} FPS</span>
                  </div>
                </div>

                {selectedClip.localPath && (
                  <div className="bg-dark-900/50 p-2 rounded border border-dark-700 truncate font-mono text-[10px] text-gray-400">
                    路径: {selectedClip.localPath}
                  </div>
                )}
              </div>

              <DialogFooter className="mt-4">
                <button
                  type="button"
                  onClick={() => setSelectedClip(null)}
                  className="bg-dark-700 hover:bg-dark-600 text-white px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  关闭
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Local Scan Modal */}
      <Dialog open={isScanModalOpen} onOpenChange={setIsScanModalOpen}>
        <DialogContent className="max-w-md p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-sm text-brand-cyan">
              <FolderSearch className="w-5 h-5" />
              <span className="text-white">扫描本地录屏目录并自动提取特征</span>
            </DialogTitle>
            <DialogDescription>
              指定你的游戏录屏或素材切片存放目录，系统将调用 FFprobe 自动提取分辨率、时长、帧率，并生成镜头缩略图。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-gray-300 font-semibold mb-1">目录绝对路径：</label>
              <div className="flex items-center space-x-1.5 bg-dark-900 border border-dark-700 rounded-lg px-2.5 py-2">
                <HardDrive className="w-4 h-4 text-gray-500 shrink-0" />
                <input
                  type="text"
                  value={scanPath}
                  onChange={(e) => setScanPath(e.target.value)}
                  placeholder="例如: D:\Videos 或 D:\apps\meocox-flow\assets"
                  className="w-full bg-transparent text-white font-mono text-xs focus:outline-none"
                />
              </div>
            </div>

            {/* Quick suggestions */}
            <div className="flex items-center space-x-2 text-[11px] text-gray-500">
              <span>快速填入:</span>
              <button
                type="button"
                onClick={() => setScanPath(defaultScanPath)}
                disabled={!defaultScanPath}
                className="text-brand-cyan hover:underline font-mono cursor-pointer"
              >
                [默认 assets 目录]
              </button>
            </div>

            {/* Scan status result */}
            {scanResult && (
              <div className={`p-3 rounded-xl border text-xs ${
                scanResult.error 
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' 
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}>
                {scanResult.error ? (
                  <div className="flex items-center space-x-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{scanResult.error}</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{scanResult.message}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setIsScanModalOpen(false)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleStartScan}
              disabled={isScanning || !scanPath.trim()}
              className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-md flex items-center space-x-1.5 transition active:scale-95 cursor-pointer"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>正在扫描并生成缩略图...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>开始智能扫描</span>
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
