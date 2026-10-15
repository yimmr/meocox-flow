import React, { useState, useEffect } from 'react';
import { 
  X, 
  FolderPlus, 
  Folder, 
  Trash2, 
  ShieldCheck, 
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/input.jsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.jsx';
import FolderInput from '@/components/ui/FolderInput.jsx';
import { apiFetch } from '@/lib/apiClient.js';

export default function NewProjectModal({ isOpen, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [libraryInput, setLibraryInput] = useState('');
  const [libraries, setLibraries] = useState([]);
  const [globalLibraries, setGlobalLibraries] = useState([]);
  const [selectedGlobalPath, setSelectedGlobalPath] = useState('');
  const [loading, setLoading] = useState(false);

  // 获取所有全局绑定的资料库
  const fetchGlobalLibraries = async () => {
    try {
      const res = await apiFetch('/api/libraries');
      if (res.ok) {
        const data = await res.json();
        setGlobalLibraries(data.libraries || []);
      }
    } catch (err) {
      console.warn('Failed to load global libraries in NewProjectModal:', err);
    }
  };

  // 每次打开弹窗时，重置所有输入与已选状态，并刷新全局资料库列表
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setLibraryInput('');
      setLibraries([]);
      setSelectedGlobalPath('');
      fetchGlobalLibraries();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 添加外部资料库路径 (手动输入或浏览选择后自动添加)
  const handleAddLibrary = (pathToAdd = libraryInput) => {
    const trimmed = (pathToAdd || '').trim();
    if (!trimmed) return;
    if (libraries.some(lib => (lib.path || '').toLowerCase() === trimmed.toLowerCase())) {
      setLibraryInput('');
      return;
    }
    const name = trimmed.split(/[\\/]/).filter(Boolean).pop() || '资料库';
    setLibraries(prev => [...prev, { name, path: trimmed, type: 'generic' }]);
    setLibraryInput('');
  };

  // 从全局资料库下拉中添加关联
  const handleAddSelectedGlobal = () => {
    if (!selectedGlobalPath) return;
    const glib = globalLibraries.find(
      g => (g.path || '').toLowerCase() === selectedGlobalPath.toLowerCase()
    );
    if (!glib) return;
    if (libraries.some(l => (l.path || '').toLowerCase() === glib.path.toLowerCase())) {
      setSelectedGlobalPath('');
      return;
    }
    setLibraries(prev => [...prev, { name: glib.name, path: glib.path, type: 'generic' }]);
    setSelectedGlobalPath('');
  };

  const handleRemoveLibrary = (index) => {
    setLibraries(libraries.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        libraries
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div 
        className="w-full max-w-xl bg-[#0F172A] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">新建项目工作区</h2>
              <p className="text-xs text-slate-400 mt-0.5">创建独立受管沙箱，自动初始化对话与资产容器</p>
            </div>
          </div>
          <Button 
            variant="ghost"
            size="iconSm"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* 项目名称 */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              项目名称 <span className="text-rose-400">*</span>
            </label>
            <Input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如: 全局业务架构推演、创意内容策划..."
              className="bg-slate-950/70 border-slate-700 rounded-xl text-slate-100 h-9"
            />
          </div>

          {/* 项目描述 */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              项目简述 <span className="text-slate-500">(可选)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要记录本项目的目标、背景或核心设定..."
              className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />
          </div>

          {/* 关联外部资料库 */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                关联资料库
              </label>
              <span className="text-[11px] text-emerald-400/90 flex items-center gap-1 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                只读保护
              </span>
            </div>

            {/* 1. 本地目录选择 (直觉操作优先显示) */}
            <div className="space-y-1">
              <span className="text-[11px] text-slate-400">本地目录</span>
              <div className="flex gap-2">
                <div className="flex-1">
                  <FolderInput
                    value={libraryInput}
                    onChange={setLibraryInput}
                    onFolderSelected={(selectedPath) => handleAddLibrary(selectedPath)}
                    placeholder="选择或输入本地目录路径..."
                    dialogTitle="选择本地资料库目录"
                    inputClassName="h-9 rounded-xl"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => handleAddLibrary()}
                  disabled={!libraryInput.trim()}
                  className="h-9 px-4 rounded-xl shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加</span>
                </Button>
              </div>
            </div>

            {/* 2. 挂载全局资料库 (shadcn Select + Button) */}
            {globalLibraries.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] text-slate-400">挂载全局资料库</span>
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <Select value={selectedGlobalPath} onValueChange={setSelectedGlobalPath}>
                      <SelectTrigger className="h-9 rounded-xl bg-slate-950/70 border-slate-700/80 text-xs text-slate-200">
                        <SelectValue placeholder="选择全局资料库..." />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700 text-slate-200">
                        {globalLibraries.map((glib) => {
                          const isAdded = libraries.some(
                            l => (l.path || '').toLowerCase() === (glib.path || '').toLowerCase()
                          );
                          return (
                            <SelectItem
                              key={glib.id || glib.path}
                              value={glib.path}
                              disabled={isAdded}
                              className="text-xs"
                            >
                              {glib.name} ({glib.path}){isAdded ? ' [已添加]' : ''}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddSelectedGlobal}
                    disabled={!selectedGlobalPath}
                    className="h-9 px-4 rounded-xl shrink-0 border border-slate-700/80 text-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>添加</span>
                  </Button>
                </div>
              </div>
            )}

            {/* 3. 已关联列表 */}
            {libraries.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-medium text-slate-400">
                  已关联 ({libraries.length})
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {libraries.map((lib, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="font-medium text-slate-200 shrink-0">{lib.name}</span>
                        <span className="text-slate-500 text-[11px] truncate font-mono">{lib.path}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="iconSm"
                        onClick={() => handleRemoveLibrary(idx)}
                        className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg h-7 w-7"
                        title="移除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 底部操作条 (加大与上方内容间距) */}
          <div className="mt-8 pt-5 flex items-center justify-end gap-3 border-t border-slate-800/80">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="px-4 text-xs font-medium text-slate-400 hover:text-slate-200 rounded-xl h-9"
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={loading || !title.trim()}
              className="px-6 text-xs font-semibold rounded-xl h-9 shadow-md shadow-indigo-600/20"
            >
              {loading && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />}
              <span>{loading ? '创建中...' : '创建'}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
