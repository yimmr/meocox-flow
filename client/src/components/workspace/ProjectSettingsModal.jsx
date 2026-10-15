import React, { useState, useEffect } from 'react';
import {
  Settings,
  X,
  FolderOpen,
  FolderGit2,
  Plus,
  Trash2,
  Scan,
  ShieldCheck,
  Check,
  FileText,
  Share2,
  Layers,
  Sparkles,
  ChevronDown,
  Brain
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.jsx';
import { toast } from '@/components/ui/sonner.jsx';
import FolderInput from '@/components/ui/FolderInput.jsx';
import { apiFetch } from '@/lib/apiClient.js';
import { openFolder } from '@/utils/nativeExplorer.js';
import ScanLibraryModal from './ScanLibraryModal.jsx';

export default function ProjectSettingsModal({
  isOpen,
  onClose,
  project,
  onProjectUpdated
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [memoryPolicy, setMemoryPolicy] = useState('inherit');
  const [isSaving, setIsSaving] = useState(false);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [isOpeningMemory, setIsOpeningMemory] = useState(false);

  // 全局资料库列表与选择状态
  const [globalLibraries, setGlobalLibraries] = useState([]);
  const [selectedGlobalPath, setSelectedGlobalPath] = useState('');
  const [isSyncingGlobal, setIsSyncingGlobal] = useState(false);

  // 资料库快速挂载状态
  const [newLibPath, setNewLibPath] = useState('');
  const [newLibName, setNewLibName] = useState('');
  const [isMounting, setIsMounting] = useState(false);

  // 查看资料库文件弹窗
  const [selectedScanLib, setSelectedScanLib] = useState(null);

  // 获取所有全局绑定的资料库
  const fetchGlobalLibraries = async () => {
    try {
      const res = await apiFetch('/api/libraries');
      if (res.ok) {
        const data = await res.json();
        setGlobalLibraries(data.libraries || []);
      }
    } catch (err) {
      console.warn('Failed to load global libraries in settings:', err);
    }
  };

  useEffect(() => {
    if (project && isOpen) {
      setTitle(project.title || '');
      setDescription(project.description || '');
      setMemoryPolicy(project.memoryPolicy || 'inherit');
      setNewLibPath('');
      setNewLibName('');
      setSelectedGlobalPath('');
      fetchGlobalLibraries();
    }
  }, [project, isOpen]);

  if (!project) return null;

  // 保存基础设置 (标题、描述、记忆策略)
  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!title.trim()) {
      toast.error('项目名称不能为空');
      return;
    }

    setIsSaving(true);
    try {
      const res = await apiFetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          memoryPolicy
        })
      });

      if (res.ok) {
        toast.success('项目设置已保存');
        if (onProjectUpdated) await onProjectUpdated();
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error('保存失败: ' + (err.error || '未知错误'));
      }
    } catch (err) {
      toast.error('网络请求异常: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 在系统资源管理器中打开项目文件夹
  const handleOpenProjectFolder = async () => {
    setIsOpeningFolder(true);
    try {
      await openFolder({
        path: project.projectDir,
        projectId: project.id
      });
    } finally {
      setIsOpeningFolder(false);
    }
  };

  // 在系统编辑器中打开项目专属记忆文件
  const handleOpenProjectMemory = async () => {
    setIsOpeningMemory(true);
    try {
      const res = await apiFetch(`/api/projects/${project.id}/open-memory`, { method: 'POST' });
      if (res.ok) {
        toast.success('已在系统默认编辑器中打开项目记忆文件');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error('打开记忆文件失败: ' + (err.error || '未知错误'));
      }
    } catch (err) {
      toast.error('网络请求异常: ' + err.message);
    } finally {
      setIsOpeningMemory(false);
    }
  };


  // 挂载资料库（手动输入）
  const handleMountLibrary = async (e) => {
    if (e) e.preventDefault();
    if (!newLibPath.trim()) {
      toast.error('请先输入或选择资料库目录路径');
      return;
    }

    setIsMounting(true);
    try {
      const finalName = newLibName.trim() || newLibPath.trim().split(/[\\/]/).filter(Boolean).pop() || '资料库';
      const res = await apiFetch(`/api/projects/${project.id}/libraries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: finalName,
          path: newLibPath.trim()
        })
      });

      if (res.ok) {
        toast.success(`资料库【${finalName}】挂载成功`);
        setNewLibPath('');
        setNewLibName('');
        if (onProjectUpdated) await onProjectUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error('挂载失败: ' + (err.error || '未知错误'));
      }
    } catch (err) {
      toast.error('挂载网络异常: ' + err.message);
    } finally {
      setIsMounting(false);
    }
  };

  // 浏览选择本地目录后自动添加关联
  const handleAutoMount = async (selectedPath) => {
    if (!selectedPath || !selectedPath.trim()) return;
    const trimmedPath = selectedPath.trim();
    if (libraries.some(l => (l.path || '').toLowerCase() === trimmedPath.toLowerCase())) {
      toast.info('该资料库已在当前项目中挂载');
      setNewLibPath('');
      setNewLibName('');
      return;
    }

    const finalName = trimmedPath.split(/[\\/]/).filter(Boolean).pop() || '资料库';
    setIsMounting(true);
    try {
      const res = await apiFetch(`/api/projects/${project.id}/libraries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: finalName,
          path: trimmedPath
        })
      });

      if (res.ok) {
        toast.success(`资料库【${finalName}】已自动关联挂载`);
        setNewLibPath('');
        setNewLibName('');
        if (onProjectUpdated) await onProjectUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error('挂载失败: ' + (err.error || '未知错误'));
      }
    } catch (err) {
      toast.error('挂载网络异常: ' + err.message);
    } finally {
      setIsMounting(false);
    }
  };

  // 从全局资料库一键挂载到本项目
  const handleMountFromGlobal = async (glib) => {
    try {
      const res = await apiFetch(`/api/projects/${project.id}/libraries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: glib.name,
          path: glib.path
        })
      });

      if (res.ok) {
        toast.success(`已挂载全局资料库【${glib.name}】至本项目`);
        if (onProjectUpdated) await onProjectUpdated();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error('挂载失败: ' + (err.error || '未知错误'));
      }
    } catch (err) {
      toast.error('挂载网络异常: ' + err.message);
    }
  };

  // 从全局资料库下拉快速挂载
  const handleMountSelectedGlobal = async () => {
    if (!selectedGlobalPath) return;
    const glib = globalLibraries.find(
      g => (g.path || '').toLowerCase() === selectedGlobalPath.toLowerCase()
    );
    if (!glib) return;
    await handleMountFromGlobal(glib);
    setSelectedGlobalPath('');
  };

  // 将项目已挂载的资料库同步到全局资料库
  const handleSyncToGlobal = async (lib) => {
    setIsSyncingGlobal(true);
    try {
      const res = await apiFetch('/api/libraries/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: lib.name,
          path: lib.path
        })
      });

      if (res.ok) {
        toast.success(`资料库【${lib.name}】已成功同步至全局资料库！`);
        await fetchGlobalLibraries();
      } else {
        toast.error('同步失败');
      }
    } catch (err) {
      toast.error('同步异常: ' + err.message);
    } finally {
      setIsSyncingGlobal(false);
    }
  };

  // 解除资料库挂载
  const handleUnmountLibrary = async (libId, libName) => {
    if (!confirm(`确定解除资料库【${libName}】与当前项目的关联吗？\n\n（仅解除项目引用，您的外部磁盘原始文件完整保留，绝不删除）`)) {
      return;
    }

    try {
      const res = await apiFetch(`/api/projects/${project.id}/libraries/${libId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        toast.success(`资料库【${libName}】已解除挂载`);
        if (onProjectUpdated) await onProjectUpdated();
      } else {
        toast.error('解除挂载失败');
      }
    } catch (e) {
      toast.error('操作异常: ' + e.message);
    }
  };

  const libraries = project.libraries || [];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          showCloseButton={false}
          className="max-w-2xl max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col bg-[#0F172A] border-slate-700/80 rounded-2xl shadow-2xl"
        >
          <DialogTitle className="sr-only">项目设置</DialogTitle>
          <DialogDescription className="sr-only">管理当前项目的基本信息与挂载资料库</DialogDescription>

          {/* 模态窗顶部 Header */}
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/70 shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Settings className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-100">项目设置</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  基本信息设定与外部资料库关联管理
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1.5">
              {/* 定位打开项目记忆文件图标按钮 */}
              <button
                type="button"
                onClick={handleOpenProjectMemory}
                disabled={isOpeningMemory}
                className="p-1.5 text-slate-400 hover:text-purple-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="在默认编辑器中打开项目记忆文件 (MEMORY.md)"
              >
                <Brain className="w-4 h-4" />
              </button>

              {/* 定位打开本地存储目录图标按钮 */}
              <button
                type="button"
                onClick={handleOpenProjectFolder}
                disabled={isOpeningFolder}
                className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="在文件资源管理器中打开项目本地目录"
              >
                <FolderOpen className="w-4 h-4" />
              </button>


              {/* 关闭按钮 */}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="关闭 (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 滚动内容区域 */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* 1. 基本信息 */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  基本信息
                </h4>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    项目名称 <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="输入项目名称"
                    className="w-full px-3.5 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    项目描述 / 备注 <span className="text-slate-500">(可选)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="填写项目简要说明或上下文备注..."
                    className="w-full px-3.5 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                  />
                </div>
              </div>
            </div>

            {/* 2. 跨会话记忆与偏好策略 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center space-x-2">
                  <Brain className="w-4 h-4 text-purple-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    跨会话记忆与经验策略
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={handleOpenProjectMemory}
                  disabled={isOpeningMemory}
                  className="text-[11px] text-purple-400 hover:text-purple-300 transition flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 hover:border-purple-500/40 cursor-pointer disabled:opacity-50"
                  title="在系统默认编辑器中打开当前项目的 MEMORY.md"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{isOpeningMemory ? '正在打开...' : '打开项目记忆文件'}</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  记忆协同模式
                </label>
                <Select value={memoryPolicy} onValueChange={setMemoryPolicy}>
                  <SelectTrigger className="w-full bg-slate-950/70 border-slate-700/80 text-xs text-slate-100">
                    <SelectValue placeholder="选择记忆策略" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-xs text-slate-100">
                    <SelectItem value="inherit">
                      <div className="flex flex-col py-0.5 text-left">
                        <span className="font-medium text-slate-100">使用全局偏好与项目记忆（默认推荐）</span>
                        <span className="text-[10px] text-slate-400">继承全局偏好规约（FPS/画幅/声线等），同时提炼当前项目专属工程事实</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="project_only">
                      <div className="flex flex-col py-0.5 text-left">
                        <span className="font-medium text-slate-100">仅使用当前项目记忆</span>
                        <span className="text-[10px] text-slate-400">隔离外部全局偏好，仅使用并沉淀当前项目内部的特定事实与规约</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="disabled">
                      <div className="flex flex-col py-0.5 text-left">
                        <span className="font-medium text-rose-300">完全关闭记忆功能</span>
                        <span className="text-[10px] text-slate-400">该项目不载入任何历史经验记忆，亦不进行自动记忆提炼沉淀</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 3. 外部资料库关联与管理 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                <div className="flex items-center space-x-2">
                  <FolderGit2 className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    挂载外部资料库
                  </h4>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">
                  <ShieldCheck className="w-3 h-3" />
                  <span>严格只读保护</span>
                </div>
              </div>

              {/* 2.1 当前项目已挂载资料库列表 */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                  <span>当前项目已挂载 ({libraries.length})</span>
                </div>

                {libraries.length === 0 ? (
                  <div className="py-4 text-center border border-dashed border-slate-800/80 rounded-xl bg-slate-950/30 text-xs text-slate-500">
                    当前项目暂未挂载资料库，可在下方从全局快速选用或手动添加
                  </div>
                ) : (
                  <div className="space-y-2">
                    {libraries.map((lib) => {
                      const isAlreadyInGlobal = globalLibraries.some(
                        g => (g.path || '').toLowerCase() === (lib.path || '').toLowerCase()
                      );

                      return (
                        <div
                          key={lib.id}
                          className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FolderGit2 className="w-4 h-4 text-amber-400 shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-200 truncate">{lib.name}</span>
                                <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700 shrink-0">
                                  只读
                                </span>
                                {isAlreadyInGlobal && (
                                  <span className="text-[10px] text-amber-400/90 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20 shrink-0">
                                    全局已收录
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono truncate" title={lib.path}>
                                {lib.path}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* 同步到全局资料库按钮 */}
                            {!isAlreadyInGlobal && (
                              <button
                                type="button"
                                onClick={() => handleSyncToGlobal(lib)}
                                disabled={isSyncingGlobal}
                                className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg transition-colors flex items-center gap-1 text-xs cursor-pointer border border-amber-500/30"
                                title="将该项目绑定的资料库同步加入全局资料库，以便其它项目或全局大盘使用"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                                <span>同步到全局</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setSelectedScanLib(lib)}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center gap-1 text-xs cursor-pointer"
                              title="查看只读扫描文件"
                            >
                              <Scan className="w-3.5 h-3.5" />
                              <span>查看文件</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleUnmountLibrary(lib.id, lib.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                              title="解除挂载"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2.2 关联本地新目录 (直觉操作优先显示) */}
              <div className="p-3.5 bg-slate-950/40 border border-slate-800/90 rounded-xl space-y-2.5">
                <div className="text-xs font-semibold text-slate-200">
                  关联本地新目录
                </div>

                <div className="space-y-2">
                  <FolderInput
                    value={newLibPath}
                    onChange={setNewLibPath}
                    onFolderSelected={handleAutoMount}
                    placeholder="输入或点击右侧图标选择本地目录..."
                    dialogTitle="选择外部资料库目录"
                  />

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newLibName}
                      onChange={(e) => setNewLibName(e.target.value)}
                      placeholder="自定义资料库别名 (手动添加时可选，留空默认文件夹名)"
                      className="flex-1 px-3.5 py-2 bg-slate-950/90 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <Button
                      type="button"
                      onClick={handleMountLibrary}
                      disabled={isMounting || !newLibPath.trim()}
                      className="h-9 px-4 rounded-xl text-xs shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isMounting ? '挂载中...' : '添加挂载'}</span>
                    </Button>
                  </div>
                </div>
              </div>

              {/* 2.3 挂载全局资料库 (shadcn Select + Button) */}
              {globalLibraries.length > 0 && (
                <div className="p-3.5 bg-slate-950/50 border border-slate-800/80 rounded-xl space-y-2">
                  <div className="text-xs font-semibold text-slate-200">
                    挂载全局资料库
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      <Select value={selectedGlobalPath} onValueChange={setSelectedGlobalPath}>
                        <SelectTrigger className="h-9 rounded-xl bg-slate-950/70 border-slate-700/80 text-xs text-slate-200">
                          <SelectValue placeholder="选择全局资料库..." />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                          {globalLibraries.map((glib) => {
                            const isMounted = libraries.some(
                              l => (l.path || '').toLowerCase() === (glib.path || '').toLowerCase()
                            );
                            return (
                              <SelectItem
                                key={glib.id || glib.path}
                                value={glib.path}
                                disabled={isMounted}
                                className="text-xs"
                              >
                                {glib.name} ({glib.path}){isMounted ? ' [已挂载]' : ''}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleMountSelectedGlobal}
                      disabled={!selectedGlobalPath}
                      className="h-9 px-4 rounded-xl shrink-0 border border-slate-700/80 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>挂载</span>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 模态窗底部操作条 (加大间距) */}
          <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-slate-900/80 shrink-0">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="px-4 text-xs font-medium text-slate-300 hover:text-white rounded-xl h-9"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 rounded-xl text-xs font-semibold h-9"
            >
              <Check className="w-4 h-4 mr-1" />
              <span>{isSaving ? '保存中...' : '保存'}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 扫描查看资料库只读文件 */}
      <ScanLibraryModal
        isOpen={Boolean(selectedScanLib)}
        onClose={() => setSelectedScanLib(null)}
        projectId={project.id}
        library={selectedScanLib}
      />
    </>
  );
}
