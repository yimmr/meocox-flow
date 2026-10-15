import React, { useEffect, useState } from 'react';
import { X, FolderGit2, FileText, Film, Music, Image as ImageIcon, ShieldCheck, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient.js';

export default function ScanLibraryModal({ isOpen, onClose, projectId, library }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const scan = async () => {
    if (!projectId || !library?.id) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/libraries/${library.id}/scan`, {
        method: 'POST'
      });
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && library) {
      scan();
    }
  }, [isOpen, library]);

  if (!isOpen || !library) return null;

  const getFileIcon = (ext) => {
    const e = (ext || '').toLowerCase();
    if (['.mp4', '.mov', '.avi', '.mkv'].includes(e)) return <Film className="w-3.5 h-3.5 text-blue-400" />;
    if (['.mp3', '.wav', '.flac', '.aac'].includes(e)) return <Music className="w-3.5 h-3.5 text-amber-400" />;
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(e)) return <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />;
    return <FileText className="w-3.5 h-3.5 text-slate-400" />;
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full max-w-2xl bg-[#0F172A] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <FolderGit2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-100">{library.name}</h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  只读引用
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-md font-mono mt-0.5">{library.path}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status notice */}
        <div className="px-6 py-2.5 bg-slate-900/40 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5 text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>扫描索引已安全保存在项目内部 .cache/libraries/，宿主目录零修改</span>
          </div>
          <button
            onClick={scan}
            disabled={loading}
            className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>重新扫描</span>
          </button>
        </div>

        {/* Files List */}
        <div className="p-6 overflow-y-auto flex-1 space-y-2">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
              <span>正在只读探针外部资料库目录...</span>
            </div>
          ) : !data || data.totalFiles === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              该资料库目录下未发现任何可读取文件。
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-xs text-slate-400 mb-2">
                共发现 <span className="text-slate-200 font-semibold">{data.totalFiles}</span> 个文件
                {data.hasMore && <span className="text-slate-500 ml-1">(显示前 50 项)</span>}:
              </div>
              {data.files?.map((f, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between px-3 py-2 bg-slate-900/80 border border-slate-800/80 rounded-xl text-xs"
                >
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    {getFileIcon(f.extension)}
                    <span className="text-slate-200 font-mono truncate">{f.relativePath}</span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono shrink-0 ml-3">
                    {formatSize(f.sizeBytes)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
