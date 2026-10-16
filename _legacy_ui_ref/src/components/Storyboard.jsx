import React, { useState } from 'react';
import { 
  Layers, Film, Download, Sparkles, Wand2, Music, CheckCircle2, 
  ExternalLink, Copy, Check, X, Loader2, FolderCheck 
} from 'lucide-react';
import { toast } from '@/components/ui/sonner.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog.jsx';
import { apiFetch } from '@/lib/apiClient.js';
import { openFolder } from '@/utils/nativeExplorer.js';

export default function Storyboard({ 
  storyboard = [], 
  projectId,
  currentProject,
  onExportSuccess 
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportModal, setExportModal] = useState(null);
  const [copied, setCopied] = useState(false);
  const [launchingApp, setLaunchingApp] = useState(false);
  const [launchTip, setLaunchTip] = useState('');
  const [exportError, setExportError] = useState(null);

  const handleExportCapCut = async () => {
    if (storyboard.length === 0) {
      toast.warning('当前分镜时间轴为空，请先由 Agent 生成或规划分镜！');
      return;
    }

    setIsExporting(true);
    setExportError(null);
    try {
      const res = await apiFetch('/api/assets/export/jianying', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          customDraftName: currentProject?.title || 'meocox_flow_Draft'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '导出失败');
      }

      setExportModal(data);
      if (onExportSuccess) onExportSuccess(data);
    } catch (err) {
      console.error('Export draft error:', err);
      setExportError(err.message || '导出剪映工程失败，请检查网络或后端服务');
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenFolder = async (folderPath) => {
    if (!folderPath) return;
    await openFolder(folderPath);
  };

  const handleLaunchJianying = async (draftPath) => {
    setLaunchingApp(true);
    setLaunchTip('正在调起剪映专业版...');
    try {
      const res = await apiFetch('/api/assets/launch-jianying', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftPath })
      });
      const data = await res.json();
      if (data.message) {
        setLaunchTip(data.message);
      }
    } catch (e) {
      setLaunchTip('调起失败，可点击下方打开草稿目录');
    } finally {
      setTimeout(() => {
        setLaunchingApp(false);
        setLaunchTip('');
      }, 3000);
    }
  };

  const handleCopyPath = (pathText) => {
    navigator.clipboard.writeText(pathText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col p-4 bg-dark-900 overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-brand-cyan" />
            <h3 className="font-semibold text-sm text-gray-200">生成分镜与时间轴排期</h3>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">由 Agent 根据文案语意自动匹配本地画面镜头</p>
        </div>

        {/* Action button */}
        <button
          onClick={handleExportCapCut}
          disabled={isExporting || storyboard.length === 0}
          className="flex items-center space-x-1.5 bg-gradient-to-r from-brand-600 to-brand-cyan hover:opacity-90 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-md shadow-brand-500/20 transition active:scale-95"
        >
          {isExporting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>正在生成草稿...</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>导出剪映工程</span>
            </>
          )}
        </button>
      </div>

      {/* Timeline List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {storyboard.map((item) => (
          <div 
            key={item.order}
            className="bg-dark-800/90 border border-dark-700 rounded-xl p-3.5 hover:border-dark-600 transition"
          >
            {/* Top row: Order, Time, Title */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <span className="w-5 h-5 rounded-full bg-brand-500/20 border border-brand-500/40 text-brand-cyan text-xs font-bold flex items-center justify-center font-mono">
                  {item.order}
                </span>
                <span className="font-semibold text-xs text-white">{item.title}</span>
              </div>
              <span className="text-xs font-mono bg-dark-900 px-2 py-0.5 rounded border border-dark-700 text-gray-300">
                {item.timeRange}
              </span>
            </div>

            {/* Script Text */}
            <div className="text-xs text-gray-200 bg-dark-900/60 p-2.5 rounded-lg border border-dark-700/60 mb-2.5">
              <span className="text-gray-400 font-medium">🗣️ 台词/口播：</span>
              <span>{item.scriptText}</span>
            </div>

            {/* Matched Details */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center space-x-1.5 bg-dark-900/40 px-2 py-1.5 rounded border border-dark-700/50">
                <Film className="w-3.5 h-3.5 text-brand-cyan shrink-0" />
                <span className="text-gray-400">镜头匹配:</span>
                <span className="text-brand-cyan font-mono truncate">{item.matchedClipId}.mp4</span>
              </div>
              <div className="flex items-center space-x-1.5 bg-dark-900/40 px-2 py-1.5 rounded border border-dark-700/50">
                <Wand2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-gray-400">特效/转场:</span>
                <span className="text-gray-300 truncate">{item.transition}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Audio track hint */}
      <div className="mt-3 p-2.5 rounded-lg bg-dark-800/50 border border-dark-700 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center space-x-2">
          <Music className="w-4 h-4 text-emerald-400" />
          <span>推荐配乐：`Epic_Orchestral_Battle_03.mp3`（135 BPM，重音卡点）</span>
        </div>
        <span className="text-emerald-400 font-medium">BPM自动对齐</span>
      </div>

      {/* Export Result Modal */}
      <Dialog open={!!exportModal} onOpenChange={(open) => !open && setExportModal(null)}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-white">剪映草稿工程导出成功！</span>
            </DialogTitle>
            <DialogDescription>
              已生成剪映专业版兼容草稿工程文件。
            </DialogDescription>
          </DialogHeader>

          {exportModal && (
            <div className="space-y-3 text-xs">
              <div className="bg-dark-900/80 p-3 rounded-xl border border-dark-700 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-400">草稿工程名称:</span>
                  <span className="font-semibold text-white truncate max-w-[200px]">{exportModal.draftName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">预估成片时长:</span>
                  <span className="font-mono text-brand-cyan">{exportModal.durationSec} 秒</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">视频镜头轨道:</span>
                  <span className="font-mono text-gray-200">{exportModal.segmentsCount} 个片段</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">智能对齐字幕:</span>
                  <span className="font-mono text-gray-200">{exportModal.subtitlesCount} 条文本</span>
                </div>
              </div>

              {exportModal.syncedToJianying ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl flex items-start space-x-2.5">
                  <FolderCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-emerald-300 leading-relaxed text-[11px]">
                    <span className="font-bold">已直接注入本机剪映草稿库！</span>
                    <p className="text-gray-400 mt-0.5">
                      现在只需在 Windows 打开【剪映专业版】，首屏草稿列表即可直接加载本工程！
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-dark-900 p-3 rounded-xl border border-dark-700 text-gray-300 text-[11px]">
                  工程文件已保存至 Studio 导出目录，可直接复制至剪映草稿目录。
                </div>
              )}

              {/* Path copy */}
              <div>
                <span className="text-gray-400 text-[11px] block mb-1">工程保存目录路径：</span>
                <div className="flex items-center space-x-2 bg-dark-900 border border-dark-700 px-2.5 py-1.5 rounded-lg">
                  <span className="font-mono text-[10px] text-gray-300 truncate flex-1">
                    {exportModal.jianyingDraftDir || exportModal.outputDirectory}
                  </span>
                  <button
                    onClick={() => handleCopyPath(exportModal.jianyingDraftDir || exportModal.outputDirectory)}
                    className="p-1 hover:bg-dark-700 rounded text-brand-cyan hover:text-white transition cursor-pointer"
                    title="复制路径"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Direct Actions: Open Folder & Launch Jianying */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => handleOpenFolder(exportModal.jianyingDraftDir || exportModal.outputDirectory)}
                  className="px-3 py-2 rounded-xl bg-dark-700 hover:bg-dark-650 text-gray-200 hover:text-white text-xs font-semibold flex items-center justify-center space-x-1.5 border border-dark-600 transition cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-brand-cyan" />
                  <span>打开草稿文件夹</span>
                </button>
                <button
                  onClick={() => handleLaunchJianying(exportModal.jianyingDraftDir || exportModal.outputDirectory)}
                  disabled={launchingApp}
                  className="px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 shadow-lg shadow-emerald-500/20 transition active:scale-95 cursor-pointer"
                >
                  {launchingApp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{launchTip || '立即启动剪映'}</span>
                </button>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <button
              onClick={() => setExportModal(null)}
              className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-md transition cursor-pointer"
            >
              完成并返回工作台
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Error Modal */}
      <Dialog open={!!exportError} onOpenChange={(open) => !open && setExportError(null)}>
        <DialogContent className="max-w-md p-6 border-red-500/40">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-rose-400">
              <X className="w-5 h-5" />
              <span className="text-white">导出剪映工程失败</span>
            </DialogTitle>
            <DialogDescription>
              工程文件生成或同步过程中遇到了问题。
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300">
            {exportError}
          </div>

          <DialogFooter className="pt-2">
            <button
              onClick={() => setExportError(null)}
              className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white hover:bg-dark-700 transition cursor-pointer"
            >
              关闭
            </button>
            <button
              onClick={handleExportCapCut}
              className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow transition cursor-pointer"
            >
              重试导出
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
