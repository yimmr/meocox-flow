import React, { useState } from 'react';
import { apiFetch } from '@/lib/apiClient.js';
import {
  CheckCircle2,
  AlertCircle,
  Layers,
  Cpu,
  Zap,
  FolderOpen,
  Trash2,
  SlidersHorizontal,
  HardDrive
} from 'lucide-react';

export default function StorageSettingsTab({
  storageStats,
  fetchStorageStats
}) {
  const [isStorageCleaning, setIsStorageCleaning] = useState(false);
  const [storageActionNotice, setStorageActionNotice] = useState('');
  const [lruQuota, setLruQuota] = useState('10GB');

  const handleCleanStorage = async (action) => {
    setIsStorageCleaning(true);
    try {
      const res = await apiFetch('/api/media/storage/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (data.success) {
        if (fetchStorageStats) fetchStorageStats();
        setStorageActionNotice(`已释放 ${data.result?.freedFormatted || '0 B'} 空间`);
        setTimeout(() => setStorageActionNotice(''), 3000);
      }
    } catch (e) {
      setStorageActionNotice('清理失败: ' + (e.message || '未知错误'));
      setTimeout(() => setStorageActionNotice(''), 3000);
    } finally {
      setIsStorageCleaning(false);
    }
  };

  const handleOpenStorageFolder = async (level = 'root') => {
    try {
      const res = await apiFetch('/api/media/storage/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level })
      });
      const data = await res.json();
      if (data.success) {
        setStorageActionNotice('已打开存储目录');
        setTimeout(() => setStorageActionNotice(''), 2500);
      }
    } catch (e) {
      console.warn('打开存储目录失败:', e);
    }
  };

  const handleRunLru = async () => {
    setIsStorageCleaning(true);
    try {
      const quotaMap = {
        '2GB': 2 * 1024 * 1024 * 1024,
        '5GB': 5 * 1024 * 1024 * 1024,
        '10GB': 10 * 1024 * 1024 * 1024,
        '20GB': 20 * 1024 * 1024 * 1024,
        '50GB': 50 * 1024 * 1024 * 1024
      };
      const maxSizeBytes = quotaMap[lruQuota] || 10 * 1024 * 1024 * 1024;
      const res = await apiFetch('/api/media/storage/lru', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxSizeBytes })
      });
      const data = await res.json();
      if (data.success) {
        if (fetchStorageStats) fetchStorageStats();
        if (data.result?.freedBytes > 0) {
          setStorageActionNotice(`淘汰完成：已释放 ${data.result.freedFormatted}`);
        } else {
          setStorageActionNotice(`缓存（${data.stats?.totalFormatted || '0 B'}）未超出配额 ${lruQuota}`);
        }
        setTimeout(() => setStorageActionNotice(''), 3000);
      }
    } catch (e) {
      setStorageActionNotice('淘汰失败: ' + (e.message || '未知错误'));
      setTimeout(() => setStorageActionNotice(''), 3000);
    } finally {
      setIsStorageCleaning(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* 操作状态提示 */}
      {storageActionNotice && (
        <div className="p-3 rounded-2xl bg-indigo-500/[0.08] border border-indigo-500/30 text-fluid-xs text-indigo-300 flex items-center space-x-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-indigo-400" />
          <span>{storageActionNotice}</span>
        </div>
      )}

      {/* 4 维核心容量卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="p-3.5 rounded-2xl bg-[#101522]/90 border border-white/[0.08] shadow-md shadow-black/20">
          <div className="text-fluid-xs text-slate-400 flex items-center justify-between">
            <span>衍生构件</span>
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-fluid-base font-bold text-indigo-300 mt-1">
            {storageStats?.artifactsFormatted || '0 B'}
          </div>
          <div className="text-fluid-xs text-slate-500 font-mono mt-0.5">
            {storageStats?.artifactFilesCount || 0} 个切片与缩略图
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#101522]/90 border border-white/[0.08] shadow-md shadow-black/20">
          <div className="text-fluid-xs text-slate-400 flex items-center justify-between">
            <span>感知元数据</span>
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-fluid-base font-bold text-emerald-300 mt-1">
            {storageStats?.metadataFormatted || '0 B'}
          </div>
          <div className="text-fluid-xs text-slate-500 font-mono mt-0.5">
            {storageStats?.mediaCount || 0} 个素材指纹
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#101522]/90 border border-white/[0.08] shadow-md shadow-black/20">
          <div className="text-fluid-xs text-slate-400 flex items-center justify-between">
            <span>孤儿失效项</span>
            <AlertCircle className={`w-3.5 h-3.5 ${(storageStats?.orphanedCount || 0) > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
          </div>
          <div className={`text-fluid-base font-bold mt-1 ${(storageStats?.orphanedCount || 0) > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
            {storageStats?.orphanedCount || 0} 个
          </div>
          <div className="text-fluid-xs text-slate-500 mt-0.5">
            文件已移除或失效
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#101522]/90 border border-white/[0.08] shadow-md shadow-black/20">
          <div className="text-fluid-xs text-slate-400 flex items-center justify-between">
            <span>缓存总体积</span>
            <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-fluid-base font-bold text-white mt-1">
            {storageStats?.totalFormatted || '0 B'}
          </div>
          <div className="text-fluid-xs text-slate-500 font-mono mt-0.5">
            CAS 内容寻址存储
          </div>
        </div>
      </div>

      {/* 素材类型分布 */}
      <div className="p-3 rounded-2xl bg-[#101522]/90 border border-white/[0.08] shadow-md shadow-black/20 flex items-center justify-between text-fluid-xs">
        <span className="text-slate-400">已索引素材类型分布</span>
        <div className="flex items-center space-x-2 font-mono">
          <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-indigo-300 border border-white/10">
            视频: {storageStats?.byType?.video || 0}
          </span>
          <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-purple-300 border border-white/10">
            音频: {storageStats?.byType?.audio || 0}
          </span>
          <span className="px-2 py-0.5 rounded-md bg-white/[0.04] text-emerald-300 border border-white/10">
            图片: {storageStats?.byType?.image || 0}
          </span>
        </div>
      </div>

      {/* 分级缓存瘦身控制 */}
      <div className="p-4 rounded-2xl bg-[#101522]/90 border border-white/[0.08] shadow-md shadow-black/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-fluid-base text-white">分级缓存控制</span>
          </div>
          <button
            type="button"
            onClick={() => handleOpenStorageFolder('root')}
            className="px-2.5 py-1 rounded-xl text-fluid-xs text-slate-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 transition flex items-center space-x-1 cursor-pointer"
            title="在系统文件管理器中打开 CAS 根目录"
          >
            <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span>打开存储目录</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          {/* L1 清理衍生缩略图 */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between space-y-2.5">
            <div>
              <div className="font-semibold text-fluid-xs text-white">L1 安全瘦身</div>
              <p className="text-fluid-xs text-slate-400 mt-1 leading-relaxed">
                清理衍生缩略图与关键帧，保留分析元数据与分镜语义。
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCleanStorage('artifacts')}
              disabled={isStorageCleaning}
              className="w-full py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white rounded-xl text-fluid-xs font-medium transition flex items-center justify-center space-x-1.5 border border-white/10 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>清理衍生构件</span>
            </button>
          </div>

          {/* L2 清理失效孤儿项 */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between space-y-2.5">
            <div>
              <div className="font-semibold text-fluid-xs text-white">L2 孤儿清理</div>
              <p className="text-fluid-xs text-slate-400 mt-1 leading-relaxed">
                扫描并彻底移除源文件已不存在的过期元数据与残留缓存。
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCleanStorage('orphaned')}
              disabled={isStorageCleaning}
              className="w-full py-1.5 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white rounded-xl text-fluid-xs font-medium transition flex items-center justify-center space-x-1.5 border border-white/10 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5 text-amber-400" />
              <span>清理失效孤儿</span>
            </button>
          </div>

          {/* L3 LRU 自动配额淘汰 */}
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between space-y-2.5">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-fluid-xs text-white">LRU 配额淘汰</span>
                <select
                  value={lruQuota}
                  onChange={(e) => setLruQuota(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-lg px-2 py-0.5 text-fluid-xs text-white outline-none font-mono"
                >
                  <option value="2GB">2 GB</option>
                  <option value="5GB">5 GB</option>
                  <option value="10GB">10 GB</option>
                  <option value="20GB">20 GB</option>
                  <option value="50GB">50 GB</option>
                </select>
              </div>
              <p className="text-fluid-xs text-slate-400 mt-1 leading-relaxed">
                按最少最近使用规则自动淘汰旧构件，维持磁盘限额。
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunLru}
              disabled={isStorageCleaning}
              className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-fluid-xs font-semibold shadow-md shadow-indigo-500/20 transition flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>执行配额淘汰</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
