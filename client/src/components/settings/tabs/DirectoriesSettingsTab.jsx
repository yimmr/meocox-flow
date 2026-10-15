import React, { useState } from 'react';
import {
  Check,
  RotateCcw,
  AlertCircle,
  FolderSync,
  FolderOpen,
  Brain,
  FileText,
  HardDrive
} from 'lucide-react';
import FolderInput from '@/components/ui/FolderInput.jsx';
import { openPathInExplorer } from '@/utils/desktop.js';
import { apiFetch } from '@/lib/apiClient.js';
import { toast } from '@/components/ui/sonner.jsx';

export default function DirectoriesSettingsTab({
  systemSettings = {},
  initialSystemSettings = {},
  onChangeSystemSettings,
  onSaveGlobal,
  isSaving = false,
  onUndo,
  isDirty = false
}) {
  const customOutputDir = systemSettings.customOutputDir || '';
  const defaultProjectsRoot = systemSettings.defaultProjectsRoot || '';
  const enableMemory = systemSettings.enableMemory !== false;
  const memoryFilePath = systemSettings.memoryFilePath || '';
  const [isOpeningMemory, setIsOpeningMemory] = useState(false);

  const handleResetToDefault = () => {
    const updated = { ...systemSettings, customOutputDir: '' };
    onChangeSystemSettings(updated);
    onSaveGlobal(updated, false);
  };

  const handleOpenSandboxFolder = () => {
    if (defaultProjectsRoot) {
      openPathInExplorer(defaultProjectsRoot);
    }
  };

  const handleOpenMemoryFile = async () => {
    setIsOpeningMemory(true);
    try {
      const res = await apiFetch('/api/settings/open-memory', { method: 'POST' });
      if (res.ok) {
        toast.success('已打开全局记忆文件');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error('打开记忆文件失败: ' + (err.error || '未知错误'));
      }
    } catch (err) {
      toast.error('请求异常: ' + err.message);
    } finally {
      setIsOpeningMemory(false);
    }
  };

  const handleToggleMemory = () => {
    const nextVal = !enableMemory;
    const updated = { ...systemSettings, enableMemory: nextVal };
    onChangeSystemSettings(updated);
  };

  return (
    <div className="space-y-3.5">
      {/* 1. 全局产物导出根目录 (Outputs) */}
      <section className="bg-[#101522]/90 border border-white/[0.08] rounded-2xl p-4 shadow-md shadow-black/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400 shrink-0">
              <FolderSync className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-fluid-base text-white">产物导出目录</span>
              <span className="text-fluid-xs text-slate-400 font-mono ml-2">Outputs</span>
            </div>
          </div>
          {customOutputDir && (
            <button
              type="button"
              onClick={handleResetToDefault}
              className="px-2.5 py-1 rounded-xl text-fluid-xs text-slate-400 hover:text-amber-300 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 transition flex items-center space-x-1 cursor-pointer"
              title="恢复为默认保存在各项目内部"
            >
              <RotateCcw className="w-3 h-3" />
              <span>恢复默认</span>
            </button>
          )}
        </div>

        <FolderInput
          value={customOutputDir}
          onChange={(val) => {
            onChangeSystemSettings({ ...systemSettings, customOutputDir: val });
          }}
          onFolderSelected={(val) => {
            onSaveGlobal({ ...systemSettings, customOutputDir: val }, true);
          }}
          placeholder="留空默认保存在各项目内部 outputs/ 目录"
          dialogTitle="选择全局项目产物导出根目录"
        />

        <div className="text-fluid-xs text-slate-400/90 leading-relaxed">
          留空默认按项目收敛在内部 <code className="text-indigo-300 font-mono">outputs/&lt;对话ID&gt;/</code>，指定后将按项目统一集中归档。
        </div>
      </section>

      {/* 2. 全局跨会话记忆与偏好沉淀 (Memory) */}
      <section className="bg-[#101522]/90 border border-white/[0.08] rounded-2xl p-4 shadow-md shadow-black/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400 shrink-0">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-fluid-base text-white">跨会话偏好记忆</span>
              <span className="text-fluid-xs text-slate-400 font-mono ml-2">Memory</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* 打开记忆文件按钮 */}
            <button
              type="button"
              onClick={handleOpenMemoryFile}
              disabled={isOpeningMemory}
              className="px-2.5 py-1.5 rounded-xl text-fluid-xs text-purple-300 hover:text-white bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              title="在系统编辑器中查看或编辑全局 MEMORY.md"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isOpeningMemory ? '正在打开...' : '查看记忆文件'}</span>
            </button>

            {/* 开关记忆切换 */}
            <button
              type="button"
              onClick={handleToggleMemory}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                enableMemory ? 'bg-purple-600' : 'bg-slate-700'
              }`}
              role="switch"
              aria-checked={enableMemory}
              title={enableMemory ? '已开启自动记忆' : '已关闭自动记忆'}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  enableMemory ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 物理存储路径展示 */}
        <div className="flex items-center justify-between bg-black/30 border border-white/[0.06] rounded-xl px-3 py-2 text-fluid-xs font-mono text-slate-300 select-all overflow-x-auto">
          <span className="text-slate-500 font-sans shrink-0 mr-2">文件路径</span>
          <span className="truncate text-slate-300">{memoryFilePath || '%LOCALAPPDATA%\\MeocoxFlow\\MEMORY.md'}</span>
        </div>

        <div className="text-fluid-xs text-slate-400/90 leading-relaxed">
          {enableMemory
            ? '已开启：多智能体在对话收尾时将自动提炼物理事实与剪辑规约（FPS、画幅比例、声线），并在后续对话中自动注入。'
            : '已关闭：智能体将不再自动载入与沉淀全局规约偏好。'}
        </div>
      </section>

      {/* 3. 系统工程沙箱 (系统内核管理) */}
      <section className="bg-[#101522]/90 border border-white/[0.08] rounded-2xl p-4 shadow-md shadow-black/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-slate-500/10 border border-white/10 flex items-center justify-center text-slate-400 shrink-0">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-fluid-base text-white">系统工程沙箱</span>
              <span className="text-fluid-xs text-slate-400 font-mono ml-2">内核托管</span>
            </div>
          </div>
          {defaultProjectsRoot && (
            <button
              type="button"
              onClick={handleOpenSandboxFolder}
              className="px-2.5 py-1 rounded-xl text-fluid-xs text-slate-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 transition flex items-center space-x-1.5 cursor-pointer"
              title="在系统文件管理器中打开沙箱目录"
            >
              <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>打开目录</span>
            </button>
          )}
        </div>

        <div className="bg-black/30 border border-white/[0.06] rounded-xl px-3 py-2 text-fluid-xs font-mono text-slate-300 select-all overflow-x-auto truncate">
          {defaultProjectsRoot || '%LOCALAPPDATA%\\MeocoxFlow\\projects'}
        </div>
      </section>

      {/* 底部保存与撤销栏 */}
      {isDirty && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-indigo-500/[0.06] border border-indigo-500/25 animate-in fade-in">
          <div className="flex items-center space-x-1.5 text-fluid-xs text-indigo-300 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>设置已修改，请保存生效</span>
          </div>
          <div className="flex items-center space-x-2">
            {onUndo && (
              <button
                type="button"
                onClick={onUndo}
                className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-fluid-xs text-slate-300 hover:text-white border border-white/10 flex items-center space-x-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>撤销</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onSaveGlobal(systemSettings, false)}
              disabled={isSaving}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-fluid-xs font-semibold text-white shadow-md shadow-indigo-500/25 transition flex items-center space-x-1.5 disabled:opacity-40 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSaving ? '正在保存...' : '保存修改'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
