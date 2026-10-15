import React, { useState, useEffect, useRef } from 'react';
import {
  Cpu,
  Zap,
  Play,
  Square,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  HardDrive,
  Activity,
  Layers,
  Sparkles,
  X,
  Upload,
  FolderOpen,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  Check,
  Mic,
  Volume2
} from 'lucide-react';
import { toast } from '@/components/ui/sonner.jsx';
import { useConfirm } from '@/components/ui/confirm-dialog.jsx';
import { apiUrl, apiFetch } from '@/lib/apiClient.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog.jsx';

export default function LocalEngineSection({
  providers = [],
  activeProviderId,
  activeModelId,
  onSelectActive,
  onLibraryChange
} = {}) {
  const confirm = useConfirm();
  const [engineData, setEngineData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorNotice, setErrorNotice] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  // Import / Upload Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState('local'); // 'local' | 'upload'

  // Local Import Form
  const [importForm, setImportForm] = useState({
    name: '',
    filePath: '',
    mmprojPath: '',
    description: '',
    copyFile: false
  });

  // Upload Form
  const [uploadForm, setUploadForm] = useState({
    name: '',
    description: '',
    modelFile: null,
    mmprojFile: null
  });
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // CosyVoice 2 Local Voice Model state
  const [cosyvoiceData, setCosyvoiceData] = useState(null);
  const [cosyvoiceLoading, setCosyvoiceLoading] = useState(false);

  const prevDownloadingRef = useRef(false);

  const fetchCosyVoiceStatus = async () => {
    try {
      const res = await apiFetch('/api/media/local-engine/cosyvoice/status');
      if (res.ok) {
        const data = await res.json();
        setCosyvoiceData(data);
      }
    } catch {}
  };

  const fetchStatus = async () => {
    try {
      const res = await apiFetch('/api/media/local-engine/status');
      if (res.ok) {
        const data = await res.json();
        setEngineData(data);

        // Check if download completed
        const isDownloading = data?.download?.active && data?.download?.status === 'downloading';
        if (prevDownloadingRef.current && !isDownloading) {
          if (onLibraryChange) onLibraryChange();
        }
        prevDownloadingRef.current = isDownloading;
      }
    } catch (err) {
      // Ignore background network error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchCosyVoiceStatus();
    const interval = setInterval(() => {
      fetchStatus();
      fetchCosyVoiceStatus();
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // CosyVoice 2 Download & Cancel Handlers
  const handleStartCosyVoiceDownload = async () => {
    setCosyvoiceLoading(true);
    try {
      const res = await apiFetch('/api/media/local-engine/cosyvoice/download', {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || '启动 CosyVoice 下载失败');
      toast.success('已启动 CosyVoice 2 从 ModelScope 的下载任务');
      await fetchCosyVoiceStatus();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCosyvoiceLoading(false);
    }
  };

  const handleCancelCosyVoiceDownload = async () => {
    try {
      await apiFetch('/api/media/local-engine/cosyvoice/cancel-download', {
        method: 'POST'
      });
      toast.info('已取消 CosyVoice 2 下载');
      await fetchCosyVoiceStatus();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // 1. Toggle Model Enabled / Disabled
  const handleToggle = async (modelId, currentEnabled) => {
    const nextEnabled = !currentEnabled;
    setErrorNotice('');

    // Optimistic UI update
    setEngineData(prev => {
      if (!prev || !prev.library) return prev;
      return {
        ...prev,
        library: prev.library.map(m => m.id === modelId ? { ...m, enabled: nextEnabled } : m)
      };
    });

    try {
      const res = await apiFetch('/api/media/local-engine/library/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, enabled: nextEnabled })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || '切换模型状态失败');
      }
      if (onLibraryChange) onLibraryChange();
      await fetchStatus();
    } catch (err) {
      setErrorNotice(err.message);
      await fetchStatus(); // revert on error
    }
  };

  // 2. Start / Stop Engine
  const handleStartEngine = async (modelId) => {
    setActionLoading(true);
    setErrorNotice('');
    try {
      const res = await apiFetch('/api/media/local-engine/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId })
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || '启动引擎失败');
      await fetchStatus();
    } catch (err) {
      setErrorNotice(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopEngine = async () => {
    setActionLoading(true);
    setErrorNotice('');
    try {
      const res = await apiFetch('/api/media/local-engine/stop', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || '停止引擎失败');
      await fetchStatus();
    } catch (err) {
      setErrorNotice(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Preset Download / Cancel
  const handleStartDownload = async (modelId) => {
    setErrorNotice('');
    try {
      const res = await apiFetch('/api/media/local-engine/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, useMirror: true })
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || '发起下载失败');
      await fetchStatus();
    } catch (err) {
      setErrorNotice(err.message);
    }
  };

  const handleCancelDownload = async () => {
    try {
      await apiFetch('/api/media/local-engine/cancel-download', { method: 'POST' });
      await fetchStatus();
    } catch (err) {}
  };

  // 4. Delete Model (Uninstall)
  const handleDeleteModel = async (modelId, modelName) => {
    const ok = await confirm({
      title: '卸载模型',
      description: `确定要从模型库中卸载/删除「${modelName}」吗？相关权重文件将被清理以释放磁盘空间。`,
      confirmText: '卸载并删除',
      variant: 'destructive',
    });
    if (!ok) return;
    setErrorNotice('');
    try {
      const res = await apiFetch(`/api/media/local-engine/library/${encodeURIComponent(modelId)}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || '删除模型失败');
      toast.success(`已成功删除模型「${modelName}」`);
      setSuccessNotice(`已成功删除模型「${modelName}」`);
      if (onLibraryChange) onLibraryChange();
      await fetchStatus();
    } catch (err) {
      toast.error(err.message);
      setErrorNotice(err.message);
    }
  };

  // 5. Open Models Folder in Explorer
  const handleOpenFolder = async () => {
    try {
      await apiFetch('/api/media/local-engine/library/open-folder', { method: 'POST' });
    } catch (err) {
      setErrorNotice('无法打开文件夹: ' + err.message);
    }
  };

  // 6. Scan Models Directory
  const handleScanFolder = async () => {
    setActionLoading(true);
    setErrorNotice('');
    try {
      const res = await apiFetch('/api/media/local-engine/library/scan', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || '扫描目录失败');
      setSuccessNotice(`扫描完成，新识别并导入 ${json.addedCount || 0} 个模型权重`);
      if (onLibraryChange) onLibraryChange();
      await fetchStatus();
    } catch (err) {
      setErrorNotice(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 7. Submit Local File Import
  const handleSubmitLocalImport = async (e) => {
    e.preventDefault();
    if (!importForm.filePath.trim()) {
      setErrorNotice('请填写本地 GGUF 模型文件的绝对路径！');
      return;
    }

    setActionLoading(true);
    setErrorNotice('');
    try {
      const res = await apiFetch('/api/media/local-engine/library/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importForm)
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || '导入模型失败');

      setSuccessNotice(`成功导入模型「${json.model?.name || '自定义模型'}」并已默认启用！`);
      setIsModalOpen(false);
      setImportForm({ name: '', filePath: '', mmprojPath: '', description: '', copyFile: false });
      if (onLibraryChange) onLibraryChange();
      await fetchStatus();
    } catch (err) {
      setErrorNotice(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // 8. Submit Web Upload
  const handleSubmitUpload = async (e) => {
    e.preventDefault();
    if (!uploadForm.modelFile) {
      setErrorNotice('请选择需要上传的主模型文件 (.gguf)！');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setErrorNotice('');

    const formData = new FormData();
    formData.append('modelFile', uploadForm.modelFile);
    if (uploadForm.mmprojFile) {
      formData.append('mmprojFile', uploadForm.mmprojFile);
    }
    formData.append('name', uploadForm.name || uploadForm.modelFile.name.replace(/\.gguf$/i, ''));
    formData.append('description', uploadForm.description);

    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        // XMLHttpRequest 不经过 window.fetch，必须显式走 apiClient 取得
        // 桌面端可用的绝对地址（否则请求会打到 tauri:// 协议上）
        xhr.open('POST', apiUrl('/api/media/local-engine/library/upload'));

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const res = JSON.parse(xhr.responseText);
              resolve(res);
            } catch (err) {
              resolve({});
            }
          } else {
            try {
              const res = JSON.parse(xhr.responseText);
              reject(new Error(res.error || '上传模型失败'));
            } catch {
              reject(new Error('上传模型失败'));
            }
          }
        };

        xhr.onerror = () => reject(new Error('网络连接中断或上传错误'));
        xhr.send(formData);
      });

      setSuccessNotice('模型文件上传成功，已加入模型库并默认开启！');
      setIsModalOpen(false);
      setUploadForm({ name: '', description: '', modelFile: null, mmprojFile: null });
      if (onLibraryChange) onLibraryChange();
      await fetchStatus();
    } catch (err) {
      setErrorNotice(err.message);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const installedProvider = (providers || []).find(p => p.type === 'installed' || p.id === 'provider_installed');
  const fallbackModels = (installedProvider?.models || []).map(m => ({
    id: m.rawId || (typeof m.id === 'string' ? m.id.replace(/^installed:/, '') : m.id),
    rawId: m.rawId || (typeof m.id === 'string' ? m.id.replace(/^installed:/, '') : m.id),
    name: m.name || m.id,
    type: 'preset',
    isInstalled: true,
    isReady: m.isReady ?? true,
    enabled: m.enabled !== false,
    isMultimodal: m.isMultimodal ?? true,
    vramRequired: m.vramRequired || '~3.8 GB',
    sizeFormatted: m.totalSizeFormatted || '2.75 GB',
    description: m.description || m.name,
    modelPath: m.modelPath || ''
  }));

  if (loading && !engineData && fallbackModels.length === 0) {
    return (
      <div className="bg-white/[0.025] backdrop-blur-xl border border-white/[0.08] rounded-2xl p-6 flex items-center justify-center space-x-2 text-xs text-slate-400">
        <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
        <span>正在加载应用模型库...</span>
      </div>
    );
  }

  const isReady = engineData?.status === 'ready';
  const isStarting = engineData?.status === 'starting';
  const download = engineData?.download || {};
  const isDownloading = download.active && download.status === 'downloading';
  const gpu = engineData?.gpu || {};
  const library = engineData?.library || [];

  // Categorize library models with rock-solid fallback to provider models
  const engineInstalledModels = library.filter(m => m.isInstalled);
  const installedModels = engineInstalledModels.length > 0 ? engineInstalledModels : fallbackModels;
  const uninstalledPresets = library.filter(m => !m.isInstalled && m.type === 'preset');
  const enabledCount = installedModels.filter(m => m.enabled).length;

  const rawGpuName = gpu.name || '';
  const cleanGpuName = rawGpuName
    .replace(/^Vulkan\d+:\s*/i, '')
    .replace(/\s*\(\d+\s*MB\)$/i, '')
    .replace(/GeForce\s+/i, '')
    .replace(/Laptop GPU/i, 'Laptop')
    .trim() || '硬件加速就绪';

  return (
    <div className="space-y-3.5">
      {/* 顶部标题与模型库动作栏 */}
      <div className="bg-[#101522]/90 border border-white/[0.08] rounded-xl p-3.5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-white/[0.06] gap-2.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-slate-300 shrink-0">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-fluid-base text-white tracking-tight">应用模型库</div>
              <div className="text-fluid-xs text-slate-400 font-mono mt-0.5">
                已安装 {installedModels.length} · 已启用 {enabledCount}
              </div>
            </div>
          </div>

          {/* 右侧动作按钮组 */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              type="button"
              onClick={handleOpenFolder}
              className="px-2.5 py-1.5 rounded-lg text-fluid-xs text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 transition flex items-center space-x-1.5 cursor-pointer"
              title="打开存放模型的本地文件夹"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>打开目录</span>
            </button>

            <button
              type="button"
              onClick={handleScanFolder}
              disabled={actionLoading}
              className="px-2.5 py-1.5 rounded-lg text-fluid-xs text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
              title="扫描本地目录中新放置的 .gguf 权重文件"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${actionLoading ? 'animate-spin' : ''}`} />
              <span>扫描本地</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setErrorNotice('');
                setSuccessNotice('');
                setIsModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-lg text-fluid-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm shadow-indigo-500/20 transition flex items-center space-x-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>导入模型</span>
            </button>
          </div>
        </div>

        {/* 硬件与引擎状态条 (流体玻璃状态组) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2.5 text-fluid-xs">
          {/* 状态 1: 硬件加速设备 */}
          <div className="bg-black/25 border border-white/[0.06] rounded-lg px-2.5 py-1.5 flex items-center justify-between min-w-0">
            <div className="flex items-center space-x-1.5 text-slate-400 shrink-0">
              <Cpu className="w-3.5 h-3.5 text-slate-400" />
              <span>设备</span>
            </div>
            <span className="font-mono text-slate-200 truncate ml-2 text-right" title={rawGpuName || 'RTX 4060'}>
              {cleanGpuName}
            </span>
          </div>

          {/* 状态 2: 显存余量 */}
          <div className="bg-black/25 border border-white/[0.06] rounded-lg px-2.5 py-1.5 flex items-center justify-between min-w-0">
            <div className="flex items-center space-x-1.5 text-slate-400 shrink-0">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>显存余量</span>
            </div>
            <span className="font-mono text-emerald-400 font-medium ml-2">
              {gpu.freeMiB ? `${(gpu.freeMiB / 1024).toFixed(1)} GB 可用` : '7.2 GB 可用'}
            </span>
          </div>

          {/* 状态 3: 推理引擎运行态 */}
          <div className="bg-black/25 border border-white/[0.06] rounded-lg px-2.5 py-1.5 flex items-center justify-between min-w-0">
            <div className="flex items-center space-x-1.5 text-slate-400 shrink-0">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span>运行状态</span>
            </div>
            <div className="flex items-center space-x-1.5 ml-2">
              {isReady ? (
                <div className="flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold text-emerald-400">已就绪</span>
                  <button
                    type="button"
                    onClick={handleStopEngine}
                    disabled={actionLoading}
                    className="text-fluid-xs text-slate-400 hover:text-rose-400 underline ml-1 cursor-pointer"
                    title="休眠引擎并释放显卡显存"
                  >
                    休眠
                  </button>
                </div>
              ) : isStarting ? (
                <div className="flex items-center space-x-1 text-amber-400">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>加载中</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1.5 text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                  <span>待命</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 提示条 */}
        {errorNotice && (
          <div className="mt-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorNotice}</span>
            </div>
            <button onClick={() => setErrorNotice('')} className="p-1 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {successNotice && (
          <div className="mt-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{successNotice}</span>
            </div>
            <button onClick={() => setSuccessNotice('')} className="p-1 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 活跃下载进度条 */}
        {isDownloading && (
          <div className="mt-3 p-3 rounded-xl bg-brand-950/40 border border-brand-500/30 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <Download className="w-3.5 h-3.5 text-brand-cyan animate-bounce" />
                <span className="font-semibold text-white">
                  正在下载模型权重: {download.modelId} ({download.currentFile})
                </span>
              </div>
              <div className="flex items-center space-x-3 font-mono text-[11px]">
                <span className="text-brand-cyan">{download.speedMbps || 0} Mbps</span>
                <span className="text-white font-bold">{download.percent || 0}%</span>
                <button
                  type="button"
                  onClick={handleCancelDownload}
                  className="text-rose-400 hover:text-rose-300 transition"
                >
                  取消
                </button>
              </div>
            </div>
            <div className="w-full h-1.5 bg-dark-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-cyan to-emerald-400 transition-all duration-300"
                style={{ width: `${download.percent || 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 模块 1: 已安装模型库 (核心视图) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-2">
            <span className="text-fluid-base font-semibold text-slate-200">本地已安装模型</span>
            <span className="text-fluid-xs px-2 py-0.2 rounded-full font-mono bg-white/[0.04] text-slate-400 border border-white/10">
              {installedModels.length} 个可用
            </span>
          </div>
          <span className="text-fluid-xs text-slate-500">
            仅已启用模型在任务和对话中可见
          </span>
        </div>

        {installedModels.length === 0 ? (
          <div className="p-7 rounded-2xl border border-dashed border-white/10 bg-white/[0.015] backdrop-blur-md text-center space-y-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mx-auto text-slate-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-200">暂未安装本地推理模型</h4>
              <p className="text-fluid-xs text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                可从下方推荐库一键下载 Qwen2.5-VL 视觉多模态模型，或点击右上角「导入模型」挂载已有权重。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-fluid-xs font-semibold text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>导入本地模型</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {installedModels.map((m) => {
              const isRunning = isReady && engineData?.activeModelId === m.id;
              const isCurrentActive = (activeProviderId === 'provider_installed' || !activeProviderId) &&
                (activeModelId === `installed:${m.id}` || activeModelId === m.id || (m.rawId && activeModelId === `installed:${m.rawId}`));
              const fileName = m.modelPath ? m.modelPath.split(/[/\\]/).pop() : '';

              return (
                <div
                  key={m.id}
                  className={`p-3.5 rounded-xl border transition-all duration-150 ${
                    !m.enabled
                      ? 'bg-white/[0.015] border-white/[0.05] opacity-50'
                      : isCurrentActive
                      ? 'bg-[#121929] border-indigo-500/40 shadow-xs'
                      : isRunning
                      ? 'bg-[#0E1B1E] border-emerald-500/40 shadow-xs'
                      : 'bg-[#101522]/60 hover:bg-[#101522] border-white/[0.07] hover:border-white/[0.15]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      {/* 模型标题独占一行 */}
                      <div className="font-semibold text-fluid-base text-white truncate">{m.name}</div>

                      {/* 类型标记独占一行 */}
                      <div className="flex items-center gap-1.5">
                        {m.isMultimodal ? (
                          <span className="text-fluid-xs px-1.5 py-0.2 rounded-md font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            视觉多模态
                          </span>
                        ) : (
                          <span className="text-fluid-xs px-1.5 py-0.2 rounded-md font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30">
                            通用语言
                          </span>
                        )}
                        <span className="text-fluid-xs px-1.5 py-0.2 rounded-md font-mono bg-white/[0.04] text-slate-400 border border-white/10">
                          {m.type === 'preset' ? '预置' : '本地'}
                        </span>
                      </div>

                      {/* 大小与显存信息独占一行 */}
                      <div className="text-fluid-xs text-slate-400 font-mono flex items-center space-x-2">
                        <span>大小 {m.sizeFormatted || m.totalSizeFormatted}</span>
                        <span className="text-slate-600">·</span>
                        <span>显存占用 {m.vramRequired}</span>
                      </div>

                      {/* 描述与紧凑文件名称 */}
                      {m.description && (
                        <p className="text-fluid-xs text-slate-400 leading-relaxed line-clamp-2">{m.description}</p>
                      )}
                      {fileName && (
                        <div className="flex items-center space-x-1.5 text-fluid-xs font-mono text-slate-500 truncate" title={m.modelPath}>
                          <span className="text-slate-400">文件:</span>
                          <span className="truncate max-w-[340px] text-slate-300">{fileName}</span>
                        </div>
                      )}
                    </div>

                    {/* 右侧控制栏：激活状态 + 启用开关 + 运行/删除 */}
                    <div className="flex items-center space-x-2 shrink-0 pt-0.5">
                      {/* 模型激活按钮 */}
                      {onSelectActive && (
                        isCurrentActive ? (
                          <span className="px-2.5 py-1 rounded-xl text-fluid-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono flex items-center space-x-1 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>使用中</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onSelectActive('provider_installed', m.id.startsWith('installed:') ? m.id : `installed:${m.id}`)}
                            className="px-2.5 py-1 rounded-xl text-fluid-xs font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 transition cursor-pointer"
                            title="设为默认对话模型"
                          >
                            设为当前
                          </button>
                        )
                      )}

                      {/* 核心开关：启用 vs 关闭 */}
                      <div className="flex items-center space-x-1.5 bg-white/[0.03] px-2 py-1 rounded-xl border border-white/10">
                        <span className={`text-fluid-xs font-medium ${m.enabled ? 'text-indigo-300' : 'text-slate-500'}`}>
                          {m.enabled ? '已启用' : '已关闭'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggle(m.id, m.enabled)}
                          className={`w-8 h-4.5 rounded-full transition-colors relative focus:outline-none cursor-pointer ${
                            m.enabled ? 'bg-indigo-600' : 'bg-white/10'
                          }`}
                          title={m.enabled ? '点击关闭：不再在列表中显示' : '点击启用：加入可用模型列表'}
                          aria-label="切换启用状态"
                        >
                          <span
                            className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                              m.enabled ? 'translate-x-3.5' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>

                      {/* 引擎测试控制 */}
                      {isRunning ? (
                        <span className="text-fluid-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-xl border border-emerald-500/30 flex items-center space-x-1 font-mono">
                          <Check className="w-3 h-3" />
                          <span>运行中</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStartEngine(m.id)}
                          disabled={actionLoading || !m.enabled}
                          className="px-2 py-1 rounded-xl text-fluid-xs font-medium text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 transition flex items-center space-x-1 disabled:opacity-30 cursor-pointer"
                          title="在本地启动并加载该模型测试"
                        >
                          <Play className="w-3 h-3 text-indigo-400 fill-current" />
                          <span>测试运行</span>
                        </button>
                      )}

                      {/* 删除模型按钮 */}
                      <button
                        type="button"
                        onClick={() => handleDeleteModel(m.id, m.name)}
                        className="p-1 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                        title="卸载该模型并删除权重文件"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 模块 2: 官方推荐模型库 (未安装的可一键按需下载) */}
      {uninstalledPresets.length > 0 && (
        <div className="space-y-2 pt-1.5">
          <div className="flex items-center space-x-2 px-1">
            <span className="text-fluid-base font-semibold text-slate-300">推荐预置模型</span>
            <span className="text-fluid-xs text-slate-500">按需一键下载安装</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {uninstalledPresets.map((m) => {
              const isModelDownloading = isDownloading && download.modelId === m.id;

              return (
                <div
                  key={m.id}
                  className="p-3.5 rounded-xl border border-white/[0.07] bg-[#101522]/60 hover:bg-[#101522] hover:border-white/[0.15] transition flex items-center justify-between"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    {/* 模型标题独占一行 */}
                    <div className="font-semibold text-fluid-base text-white truncate">{m.name}</div>

                    {/* 类型标记独占一行 */}
                    <div className="flex items-center gap-1.5">
                      {m.recommended && (
                        <span className="text-fluid-xs px-1.5 py-0.2 rounded-md font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                          推荐适配
                        </span>
                      )}
                      <span className="text-fluid-xs px-1.5 py-0.2 rounded-md font-mono bg-white/[0.04] text-slate-400 border border-white/10">
                        官方预置
                      </span>
                    </div>

                    {/* 大小与显存信息独占一行 */}
                    <div className="text-fluid-xs text-slate-400 font-mono flex items-center space-x-2">
                      <span>大小 {m.sizeFormatted}</span>
                      <span className="text-slate-600">·</span>
                      <span>显存占用 {m.vramRequired}</span>
                    </div>

                    {/* 描述 */}
                    <p className="text-fluid-xs text-slate-400 leading-relaxed">{m.description}</p>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 ml-3">
                    {isModelDownloading ? (
                      <span className="px-2.5 py-1.5 rounded-xl text-fluid-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center space-x-1.5 font-mono animate-pulse">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>下载中 {download.percent}%</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStartDownload(m.id)}
                        disabled={isDownloading}
                        className="px-3 py-1.5 rounded-xl text-fluid-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center space-x-1.5 shadow-sm shadow-indigo-500/20 disabled:opacity-40 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>安装 ({m.sizeFormatted})</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 模块 2.5: 本地语音引擎 (CosyVoice 2) */}
      <div className="space-y-2 pt-1.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-2">
            <Mic className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-fluid-base font-semibold text-slate-200">CosyVoice 2 语音合成</span>
          </div>
          <span className="text-fluid-xs px-2 py-0.2 rounded-full font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            离线人声合成 · 0.5B
          </span>
        </div>

        <div className="p-3.5 rounded-xl border border-white/[0.07] bg-[#101522]/60 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1.5 flex-1 min-w-0">
              {/* 模型标题独占一行 */}
              <div className="font-semibold text-fluid-base text-white truncate">
                {cosyvoiceData?.cosyvoice?.name || 'CosyVoice 2 (0.5B)'}
              </div>

              {/* 类型标记独占一行 */}
              <div className="flex items-center gap-1.5">
                {cosyvoiceData?.cosyvoice?.isReady ? (
                  <span className="text-fluid-xs px-1.5 py-0.2 rounded-md font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>本地已就绪</span>
                  </span>
                ) : (
                  <span className="text-fluid-xs px-1.5 py-0.2 rounded-md font-medium bg-amber-500/20 text-amber-400 border border-amber-500/40">
                    未安装
                  </span>
                )}
                <span className="text-fluid-xs px-1.5 py-0.2 rounded-md font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  离线语音合成
                </span>
              </div>

              {/* 大小与显存信息独占一行 */}
              <div className="text-fluid-xs text-slate-400 font-mono flex items-center space-x-2">
                <span>大小 1.68 GB</span>
                <span className="text-slate-600">·</span>
                <span>建议显存 ≥ 4 GB (支持 CPU)</span>
              </div>

              {/* 描述 */}
              <p className="text-fluid-xs text-slate-400 leading-relaxed">
                开源离线语音大模型，支持自然语气声音克隆与字音起止帧时间戳对齐，全本地运行无云端依赖。
              </p>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              {cosyvoiceData?.downloadProgress?.active ? (
                <div className="flex items-center space-x-2.5">
                  <span className="px-2.5 py-1.5 rounded-xl text-fluid-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center space-x-1.5 font-mono animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>下载中 {cosyvoiceData.downloadProgress.percent}%</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelCosyVoiceDownload}
                    className="text-fluid-xs text-rose-400 hover:text-rose-300 transition cursor-pointer"
                  >
                    取消
                  </button>
                </div>
              ) : cosyvoiceData?.cosyvoice?.isReady ? (
                <button
                  type="button"
                  onClick={handleStartCosyVoiceDownload}
                  disabled={cosyvoiceLoading}
                  className="px-2.5 py-1.5 rounded-xl text-fluid-xs font-semibold bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/10 transition flex items-center space-x-1.5 shadow-sm cursor-pointer"
                  title="重新下载并校验模型完整性"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                  <span>校验完整性</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartCosyVoiceDownload}
                  disabled={cosyvoiceLoading}
                  className="px-3 py-1.5 rounded-xl text-fluid-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center space-x-1.5 shadow-md shadow-indigo-500/25 disabled:opacity-40 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>一键安装 (1.68 GB)</span>
                </button>
              )}
            </div>
          </div>

          {/* 若处于下载中，展示动态进度条 */}
          {cosyvoiceData?.downloadProgress?.active && (
            <div className="mt-2.5 pt-2 border-t border-white/[0.06] space-y-1.5">
              <div className="flex items-center justify-between text-fluid-xs font-mono text-slate-400">
                <span>ModelScope 源: iic/CosyVoice2-0.5B</span>
                <span className="text-indigo-400 font-bold">
                  {cosyvoiceData.downloadProgress.speedMbps || 48} Mbps · {cosyvoiceData.downloadProgress.percent}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-200"
                  style={{ width: `${cosyvoiceData.downloadProgress.percent || 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>


      {/* 模块 3: 上传 / 导入自定义模型模态对话框 */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2 text-fluid-base font-bold text-white">
              <Upload className="w-4 h-4 text-brand-cyan" />
              <span>添加模型到应用模型库</span>
            </DialogTitle>
            <DialogDescription className="text-fluid-sm text-slate-400">
              支持本地 GGUF 权重路径直接挂载，或通过浏览器上传模型文件。
            </DialogDescription>
          </DialogHeader>

          {/* 切换导入方式：本地文件路径直接挂载 VS 浏览器上传 */}
          <div className="flex items-center p-1 bg-black/40 border border-white/10 rounded-xl">
            <button
              type="button"
              onClick={() => setModalTab('local')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-fluid-sm font-semibold transition cursor-pointer ${
                modalTab === 'local'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              本地路径挂载 (免复制)
            </button>
            <button
              type="button"
              onClick={() => setModalTab('upload')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-fluid-sm font-semibold transition cursor-pointer ${
                modalTab === 'upload'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              从电脑上传文件
            </button>
          </div>

          {/* 方式 A: 本地路径直接导入 */}
          {modalTab === 'local' && (
            <form onSubmit={handleSubmitLocalImport} className="space-y-3.5">
              <div>
                <label className="text-fluid-sm font-semibold text-slate-300 block mb-1">
                  模型显示名称
                </label>
                <input
                  type="text"
                  value={importForm.name}
                  onChange={(e) => setImportForm({ ...importForm, name: e.target.value })}
                  placeholder="如：Qwen 2.5 7B Instruct 或 Llama 3.2 Vision"
                  className="w-full bg-white/[0.03] border border-white/10 focus:border-indigo-500/50 rounded-xl px-3 py-2 text-fluid-sm text-white placeholder-slate-500 outline-none"
                />
              </div>

              <div>
                <label className="text-fluid-sm font-semibold text-slate-300 block mb-1">
                  <span className="text-rose-400">*</span> 本地 GGUF 模型文件绝对路径
                </label>
                <input
                  type="text"
                  required
                  value={importForm.filePath}
                  onChange={(e) => setImportForm({ ...importForm, filePath: e.target.value })}
                  placeholder="例如：D:\AI\models\qwen2.5-7b-instruct-q4_k_m.gguf"
                  className="w-full bg-white/[0.03] border border-white/10 focus:border-indigo-500/50 rounded-xl px-3 py-2 text-fluid-sm text-white font-mono placeholder-slate-500 outline-none"
                />
                <p className="text-fluid-xs text-slate-400 mt-1">
                  直接输入本机已有的大模型权重路径，秒级挂载，不重复占用磁盘空间。
                </p>
              </div>

              <div>
                <label className="text-fluid-sm font-semibold text-slate-300 block mb-1">
                  视觉投影文件路径 (mmproj，多模态模型可选)
                </label>
                <input
                  type="text"
                  value={importForm.mmprojPath}
                  onChange={(e) => setImportForm({ ...importForm, mmprojPath: e.target.value })}
                  placeholder="例如：D:\AI\models\mmproj-qwen-instruct-q8_0.gguf"
                  className="w-full bg-white/[0.03] border border-white/10 focus:border-indigo-500/50 rounded-xl px-3 py-2 text-fluid-sm text-white font-mono placeholder-slate-500 outline-none"
                />
                <p className="text-fluid-xs text-slate-400 mt-1">
                  纯文本语言模型留空；视觉识别与多模态模型请填入对应 mmproj 文件路径。
                </p>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="copyFileCheckbox"
                  checked={importForm.copyFile}
                  onChange={(e) => setImportForm({ ...importForm, copyFile: e.target.checked })}
                  className="rounded bg-black/40 border-white/10 text-indigo-500 focus:ring-0"
                />
                <label htmlFor="copyFileCheckbox" className="text-fluid-xs text-slate-400 select-none cursor-pointer">
                  复制文件到应用内置存储目录（文件较大时建议不勾选）
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-fluid-sm text-slate-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl text-fluid-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-md shadow-indigo-500/25 disabled:opacity-50 cursor-pointer"
                >
                  {actionLoading ? '正在导入...' : '确认导入'}
                </button>
              </div>
            </form>
          )}

          {/* 方式 B: 浏览器直接上传 */}
          {modalTab === 'upload' && (
            <form onSubmit={handleSubmitUpload} className="space-y-3.5">
              <div>
                <label className="text-fluid-sm font-semibold text-slate-300 block mb-1">
                  模型显示名称
                </label>
                <input
                  type="text"
                  value={uploadForm.name}
                  onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                  placeholder="留空则默认使用上传文件名"
                  className="w-full bg-white/[0.03] border border-white/10 focus:border-indigo-500/50 rounded-xl px-3 py-2 text-fluid-sm text-white placeholder-slate-500 outline-none"
                />
              </div>

              <div>
                <label className="text-fluid-sm font-semibold text-slate-300 block mb-1">
                  <span className="text-rose-400">*</span> 选择主模型权重文件 (.gguf)
                </label>
                <input
                  type="file"
                  required
                  accept=".gguf,.bin"
                  onChange={(e) => setUploadForm({ ...uploadForm, modelFile: e.target.files?.[0] || null })}
                  className="w-full text-fluid-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-fluid-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 file:cursor-pointer bg-white/[0.02] p-2 rounded-xl border border-white/10"
                />
              </div>

              <div>
                <label className="text-fluid-sm font-semibold text-slate-300 block mb-1">
                  选择视觉投影文件 (mmproj，多模态可选)
                </label>
                <input
                  type="file"
                  accept=".gguf,.bin"
                  onChange={(e) => setUploadForm({ ...uploadForm, mmprojFile: e.target.files?.[0] || null })}
                  className="w-full text-fluid-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-fluid-xs file:font-semibold file:bg-white/[0.06] file:text-slate-200 hover:file:bg-white/10 file:cursor-pointer bg-white/[0.02] p-2 rounded-xl border border-white/10"
                />
              </div>

              {isUploading && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-fluid-sm text-slate-300">
                    <span>正在上传模型至应用目录...</span>
                    <span className="font-mono text-indigo-400">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isUploading}
                  className="px-4 py-2 rounded-xl text-fluid-sm text-slate-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 transition disabled:opacity-50 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-5 py-2 rounded-xl text-fluid-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-md shadow-indigo-500/25 disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>上传中 {uploadProgress}%</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>开始上传</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
