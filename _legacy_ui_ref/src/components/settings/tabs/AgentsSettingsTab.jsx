import React, { useState, useMemo } from 'react';
import {
  Bot,
  FolderOpen,
  SlidersHorizontal,
  Sparkles,
  Wrench,
  Cpu,
  Trash2
} from 'lucide-react';
import { openFolder } from '@/utils/nativeExplorer.js';
import { formatAgentDisplayName } from '@/utils/agentUtils.js';
import { toast } from '@/components/ui/sonner.jsx';
import { apiFetch } from '@/lib/apiClient.js';
import { useConfirm } from '@/components/ui/confirm-dialog.jsx';

const BUILTIN_AGENT_IDS = [
  'super-brain',
  'perception-specialist',
  'evolution-specialist'
];

export default function AgentsSettingsTab({
  agentsList = [],
  skillsList = [],
  loadingAgents = false,
  fetchAgents,
  isDesktop = false,
  handleOpenFile,
  handleOpenFolder,
  onOpenAgentEditor
}) {
  const [filterTab, setFilterTab] = useState('all');
  const [deletingId, setDeletingId] = useState(null);
  const confirm = useConfirm();

  const handleDeleteAgent = async (agent) => {
    if (!agent?.id) return;
    const displayName = formatAgentDisplayName(agent);
    const ok = await confirm({
      title: '确认删除角色',
      description: `确定要删除角色「${displayName}」吗？此操作将永久移除该角色文件且无法恢复。`,
      confirmText: '确认删除',
      cancelText: '取消',
      destructive: true
    });
    if (!ok) return;

    setDeletingId(agent.id);
    try {
      const res = await apiFetch(`/api/agents/${agent.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '删除角色失败');
      }
      toast.success(`角色「${displayName}」已删除`);
      fetchAgents?.();
    } catch (err) {
      toast.error(err.message || '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const skillMap = useMemo(() => {
    const map = {};
    (skillsList || []).forEach(s => {
      if (s?.id) map[s.id] = s;
    });
    return map;
  }, [skillsList]);

  const builtinCount = useMemo(() => {
    return agentsList.filter(a => BUILTIN_AGENT_IDS.includes(a.id) && !a.custom).length;
  }, [agentsList]);

  const customCount = useMemo(() => {
    return agentsList.filter(a => !BUILTIN_AGENT_IDS.includes(a.id) || a.custom).length;
  }, [agentsList]);

  const displayedAgents = useMemo(() => {
    const filtered = agentsList.filter(a => {
      const isBuiltin = BUILTIN_AGENT_IDS.includes(a.id) && !a.custom;
      if (filterTab === 'builtin') return isBuiltin;
      if (filterTab === 'custom') return !isBuiltin;
      return true;
    });

    return filtered.sort((a, b) => {
      if (a.id === 'super-brain') return -1;
      if (b.id === 'super-brain') return 1;
      if (a.id === 'org-architect') return -1;
      if (b.id === 'org-architect') return 1;
      if (a.id === 'director') return -1;
      if (b.id === 'director') return 1;
      return a.id.localeCompare(b.id);
    });
  }, [agentsList, filterTab]);

  const handleOpenAgentFolder = async (agent) => {
    if (agent?.filePath) {
      const folder = agent.filePath.replace(/[\\/][^\\/]+$/, '');
      await openFolder(folder);
      return;
    }
    const agentId = typeof agent === 'object' ? agent?.id : agent;
    if (handleOpenFolder) {
      await handleOpenFolder('agents', agentId);
    } else {
      await openFolder({ type: 'agents', id: agentId });
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
            全部 ({agentsList.length})
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

      {/* 智能体卡片网格 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {displayedAgents.map(a => {
          const isSuperBrain = a.id === 'super-brain';
          const isBuiltin = BUILTIN_AGENT_IDS.includes(a.id) && !a.custom;
          const isCustom = !isBuiltin;
          const skills = Array.isArray(a.skills)
            ? a.skills
            : (a.skills ? a.skills.split(/[,，\s]+/).filter(Boolean) : []);
          const tools = Array.isArray(a.tools)
            ? a.tools
            : (a.tools ? [a.tools] : ['*']);
          const isAllTools = !a.tools || a.tools.includes('*');

          return (
            <div
              key={a.id}
              className="group p-3.5 rounded-2xl border transition-all duration-200 flex flex-col justify-between space-y-3 bg-[#101522]/90 hover:bg-[#101522] border-white/[0.08] hover:border-white/[0.15] shadow-md shadow-black/20"
            >
              {/* Header: 头像 + 角色名称 + 驱动模型 */}
              <div className="flex items-center space-x-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                    isBuiltin
                      ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-400'
                      : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                  }`}
                >
                  <Bot className="w-4.5 h-4.5" />
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-fluid-base font-semibold text-white truncate" title={formatAgentDisplayName(a)}>
                      {formatAgentDisplayName(a)}
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
                    <Cpu className="w-3 h-3 text-indigo-400 shrink-0" />
                    <span className="truncate">{a.model || '跟随系统默认'}</span>
                  </div>
                </div>
              </div>

              {/* 技能与工具标签行 */}
              <div className="space-y-1.5 pt-0.5">
                {/* 行 1: 技能 */}
                <div className="flex items-center space-x-2 text-fluid-xs min-w-0">
                  <div className="flex items-center space-x-1 text-amber-400/90 shrink-0 font-medium">
                    <Sparkles className="w-3 h-3" />
                    <span>技能:</span>
                  </div>
                  <div className="flex items-center space-x-1.5 overflow-hidden whitespace-nowrap min-w-0 flex-nowrap flex-1">
                    {skills.length > 0 ? (
                      skills.map((s, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.2 rounded-md bg-white/[0.04] border border-white/10 text-slate-300 text-fluid-xs truncate shrink-0 max-w-[140px]"
                          title={skillMap[s]?.name || s}
                        >
                          {skillMap[s]?.name || s}
                        </span>
                      ))
                    ) : (
                      <span className="text-fluid-xs text-slate-500 italic">未挂载技能</span>
                    )}
                  </div>
                </div>

                {/* 行 2: 工具权限 */}
                <div className="flex items-center space-x-2 text-fluid-xs min-w-0">
                  <div className="flex items-center space-x-1 text-teal-400/90 shrink-0 font-medium">
                    <Wrench className="w-3 h-3" />
                    <span>工具:</span>
                  </div>
                  <div className="flex items-center space-x-1.5 overflow-hidden whitespace-nowrap min-w-0 flex-nowrap flex-1">
                    {isAllTools ? (
                      <span className="px-2 py-0.2 rounded-md bg-teal-500/10 border border-teal-500/25 text-teal-300 text-fluid-xs font-mono shrink-0">
                        全部工具权限 (*)
                      </span>
                    ) : tools.length > 0 ? (
                      tools.map((t, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.2 rounded-md bg-white/[0.04] border border-white/10 text-slate-300 text-fluid-xs font-mono truncate shrink-0 max-w-[140px]"
                          title={t}
                        >
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-fluid-xs text-slate-500 italic">无工具权限</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 底部动作：纯图标操作按钮 */}
              <div className="pt-1 flex items-center justify-end space-x-1.5 border-t border-white/[0.04]">
                {isCustom && (
                  <button
                    type="button"
                    onClick={() => handleDeleteAgent(a)}
                    disabled={deletingId === a.id}
                    className="p-1.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-50"
                    title="删除角色"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleOpenAgentFolder(a)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-white/[0.06] transition cursor-pointer"
                  title="在资源管理器中打开角色目录"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
                {isDesktop && (
                  <button
                    type="button"
                    onClick={() => onOpenAgentEditor?.(a)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-white/[0.06] transition cursor-pointer"
                    title="配置角色设定"
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
