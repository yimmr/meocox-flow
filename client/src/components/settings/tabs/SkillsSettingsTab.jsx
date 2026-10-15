import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  SlidersHorizontal,
  Code,
  Tag,
  BookOpen,
  FolderOpen,
  Trash2
} from 'lucide-react';
import { openFolder } from '@/utils/nativeExplorer.js';
import { toast } from '@/components/ui/sonner.jsx';
import { apiFetch } from '@/lib/apiClient.js';
import { useConfirm } from '@/components/ui/confirm-dialog.jsx';

const BUILTIN_SKILL_IDS = [
  'high-energy',
  'game-guide',
  'beat-sync',
  'lore-story',
  'aigc-storyboard',
  'mcp-diagnostic'
];

const CATEGORY_LABELS = {
  genre: '流派风格',
  rhythm: '节奏卡点',
  narration: '叙事解说',
  camera: '运镜构图',
  audio: '音频配乐',
  general: '通用规约'
};

export default function SkillsSettingsTab({
  skillsList = [],
  loadingSkills = false,
  fetchSkills,
  isDesktop = false,
  handleOpenFile,
  handleOpenFolder,
  onOpenSkillEditor
}) {
  const [filterTab, setFilterTab] = useState('all');
  const [deletingId, setDeletingId] = useState(null);
  const confirm = useConfirm();

  const handleDeleteSkill = async (skill) => {
    if (!skill?.id) return;
    const displayName = skill.name || skill.id;
    const ok = await confirm({
      title: '确认删除技能',
      description: `确定要删除技能「${displayName}」吗？此操作将永久移除该技能规约文件且无法恢复。`,
      confirmText: '确认删除',
      cancelText: '取消',
      destructive: true
    });
    if (!ok) return;

    setDeletingId(skill.id);
    try {
      const res = await apiFetch(`/api/agents/skills/${skill.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '删除技能失败');
      }
      toast.success(`技能「${displayName}」已删除`);
      fetchSkills?.();
    } catch (err) {
      toast.error(err.message || '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const isBuiltinSkill = (s) => {
    if (s.custom) return false;
    if (s.isBuiltin) return true;
    return BUILTIN_SKILL_IDS.includes(s.id);
  };

  const builtinCount = useMemo(() => {
    return skillsList.filter(s => isBuiltinSkill(s)).length;
  }, [skillsList]);

  const customCount = useMemo(() => {
    return skillsList.filter(s => !isBuiltinSkill(s)).length;
  }, [skillsList]);

  const displayedSkills = useMemo(() => {
    return skillsList.filter(s => {
      const isBuiltin = isBuiltinSkill(s);
      if (filterTab === 'builtin') return isBuiltin;
      if (filterTab === 'custom') return !isBuiltin;
      return true;
    });
  }, [skillsList, filterTab]);

  const handleOpenSkillFolder = async (skill) => {
    if (skill?.filePath) {
      const folder = skill.filePath.replace(/[\\/][^\\/]+$/, '');
      await openFolder(folder);
      return;
    }
    const skillId = typeof skill === 'object' ? skill?.id : skill;
    if (handleOpenFolder) {
      await handleOpenFolder('skills', skillId);
    } else {
      await openFolder({ type: 'skills', id: skillId });
    }
  };

  return (
    <div className="space-y-3.5">
      {/* 顶部标签切换器 */}
      <div className="flex items-center">
        <div className="flex items-center space-x-1 p-1 rounded-xl bg-black/30 border border-white/[0.08] backdrop-blur-md">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1 rounded-lg text-fluid-xs font-medium transition cursor-pointer ${
              filterTab === 'all'
                ? 'bg-white/[0.08] text-white shadow-xs font-semibold border border-white/10'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            全部 ({skillsList.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('builtin')}
            className={`px-3 py-1 rounded-lg text-fluid-xs font-medium transition cursor-pointer ${
              filterTab === 'builtin'
                ? 'bg-white/[0.08] text-indigo-300 shadow-xs font-semibold border border-white/10'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            内置 ({builtinCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('custom')}
            className={`px-3 py-1 rounded-lg text-fluid-xs font-medium transition cursor-pointer ${
              filterTab === 'custom'
                ? 'bg-white/[0.08] text-amber-300 shadow-xs font-semibold border border-white/10'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            自定义 ({customCount})
          </button>
        </div>
      </div>

      {/* 技能卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {displayedSkills.map(s => {
          const isBuiltin = isBuiltinSkill(s);

          return (
            <div
              key={s.id}
              className="p-3.5 rounded-2xl bg-[#101522]/90 hover:bg-[#101522] border border-white/[0.08] hover:border-white/[0.15] shadow-md shadow-black/20 transition-all duration-200 flex flex-col justify-between space-y-3"
            >
              {/* Header: 图标 + 技能名称 + 分类徽章 */}
              <div className="flex items-center space-x-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                    isBuiltin
                      ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-400'
                      : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                  }`}
                >
                  <Sparkles className="w-4.5 h-4.5" />
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-fluid-base font-semibold text-white truncate" title={s.name || s.id}>
                      {s.name || s.id}
                    </span>
                    <span className={`text-fluid-xs px-1.5 py-0.2 rounded-md font-mono border shrink-0 ${
                      isBuiltin
                        ? 'bg-white/[0.04] text-slate-400 border-white/10'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    }`}>
                      {isBuiltin ? '内置' : '自定义'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 text-fluid-xs text-slate-400 font-mono truncate mt-0.5">
                    <Tag className="w-3 h-3 text-indigo-400 shrink-0" />
                    <span>{CATEGORY_LABELS[s.category] || s.category || '通用规约'}</span>
                    {s.hasCode && (
                      <>
                        <span className="text-slate-600">·</span>
                        <Code className="w-3 h-3 text-teal-400 shrink-0" />
                        <span className="text-teal-300">含逻辑代码</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* 描述文本 */}
              {s.description && (
                <p className="text-fluid-xs text-slate-400 leading-relaxed line-clamp-2">
                  {s.description}
                </p>
              )}

              {/* 底部动作：纯图标操作按钮 */}
              <div className="pt-1 flex items-center justify-end space-x-1.5 border-t border-white/[0.04]">
                {!isBuiltin && (
                  <button
                    type="button"
                    onClick={() => handleDeleteSkill(s)}
                    disabled={deletingId === s.id}
                    className="p-1.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-50"
                    title="删除技能"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleOpenSkillFolder(s)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-white/[0.06] transition cursor-pointer"
                  title="在资源管理器中打开技能目录"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
                {isDesktop && (
                  <button
                    type="button"
                    onClick={() => onOpenSkillEditor?.(s)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-white/[0.06] transition cursor-pointer"
                    title="查看或编辑技能"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
