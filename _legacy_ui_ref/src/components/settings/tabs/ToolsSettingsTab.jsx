import React, { useState, useMemo } from 'react';
import {
  Wrench,
  Search,
  Server,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Terminal,
  Trash2,
  FolderOpen,
  Plus,
  Sparkles
} from 'lucide-react';
import { toast } from '@/components/ui/sonner.jsx';
import { apiFetch } from '@/lib/apiClient.js';
import { useConfirm } from '@/components/ui/confirm-dialog.jsx';
import { openFolder } from '@/utils/nativeExplorer.js';

export default function ToolsSettingsTab({
  mcpData = { servers: [], mcpGroups: [], tools: [], toolsCount: 0 },
  loading = false,
  fetchMcp,
  isDesktop = false,
  handleOpenFile,
  handleOpenFolder,
  onOpenProviderEditor,
  onOpenToolGuide,
  activeView = 'catalog',
  onSwitchView
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('all');
  const [expandedToolNames, setExpandedToolNames] = useState({});
  const [deletingName, setDeletingName] = useState(null);
  const [deletingMcpId, setDeletingMcpId] = useState(null);

  const [expandedMcpServers, setExpandedMcpServers] = useState({});
  const [expandedMcpToolNames, setExpandedMcpToolNames] = useState({});
  const [togglingMcpId, setTogglingMcpId] = useState(null);

  const confirm = useConfirm();

  const toggleToolExpanded = (toolName) => {
    setExpandedToolNames(prev => ({
      ...prev,
      [toolName]: !prev[toolName]
    }));
  };

  const toggleMcpExpanded = (serverId) => {
    setExpandedMcpServers(prev => ({
      ...prev,
      [serverId]: !prev[serverId]
    }));
  };

  const toggleMcpToolExpanded = (toolName) => {
    setExpandedMcpToolNames(prev => ({
      ...prev,
      [toolName]: !prev[toolName]
    }));
  };

  const handleToggleMcp = async (serverId, targetEnabled) => {
    setTogglingMcpId(serverId);
    try {
      const res = await apiFetch('/api/agents/mcp/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, enabled: targetEnabled })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '切换 MCP 状态失败');
      await fetchMcp?.();
      toast.success('工具源状态已更新');
    } catch (err) {
      toast.error(`切换工具源状态失败: ${err.message}`);
    } finally {
      setTogglingMcpId(null);
    }
  };

  const handleDeleteMcp = async (srv) => {
    if (!srv?.id) return;
    const ok = await confirm({
      title: '确认删除 MCP 服务',
      description: `确定要删除外部 MCP 服务「${srv.name || srv.id}」吗？关联的 ${srv.toolsCount || 0} 个原子工具也将从智能体可用列表中移除。`,
      confirmText: '确认删除',
      cancelText: '取消',
      destructive: true
    });
    if (!ok) return;

    setDeletingMcpId(srv.id);
    try {
      const res = await apiFetch(`/api/agents/mcp/${srv.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除 MCP 服务失败');
      toast.success(`MCP 服务「${srv.name || srv.id}」已移除`);
      await fetchMcp?.();
    } catch (err) {
      toast.error(`删除 MCP 失败: ${err.message}`);
    } finally {
      setDeletingMcpId(null);
    }
  };

  const handleDeleteTool = async (tool) => {
    if (!tool?.name) return;
    const ok = await confirm({
      title: '确认删除工具',
      description: `确定要删除自定义工具「${tool.name}」吗？此操作将永久移除该工具文件且无法恢复。`,
      confirmText: '确认删除',
      cancelText: '取消',
      destructive: true
    });
    if (!ok) return;

    setDeletingName(tool.name);
    try {
      const res = await apiFetch(`/api/agents/tools/${tool.name}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除工具失败');
      toast.success(`自定义工具「${tool.name}」已删除`);
      await fetchMcp?.();
    } catch (err) {
      toast.error(`删除工具失败: ${err.message}`);
    } finally {
      setDeletingName(null);
    }
  };

  const handleOpenToolFolder = async (tool) => {
    if (tool?.filePath) {
      const folder = tool.filePath.replace(/[\\/][^\\/]+$/, '');
      await openFolder(folder);
      return;
    }
    if (handleOpenFolder) {
      await handleOpenFolder('tools');
    } else {
      await openFolder({ type: 'tools' });
    }
  };

  const handleOpenMcpFolder = async (srv) => {
    if (srv?.filePath) {
      const folder = srv.filePath.replace(/[\\/][^\\/]+$/, '');
      await openFolder(folder);
      return;
    }
    if (handleOpenFolder) {
      await handleOpenFolder('mcp');
    } else {
      await openFolder({ type: 'mcp' });
    }
  };

  const localTools = useMemo(() => {
    return (mcpData.tools || []).filter(t => t.source === 'local');
  }, [mcpData.tools]);

  const builtinToolsCount = useMemo(() => {
    return localTools.filter(t => !t.custom).length;
  }, [localTools]);

  const customToolsCount = useMemo(() => {
    return localTools.filter(t => t.custom).length;
  }, [localTools]);

  const filteredTools = useMemo(() => {
    return localTools.filter(tool => {
      if (filterTab === 'builtin' && tool.custom) return false;
      if (filterTab === 'custom' && !tool.custom) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        tool.name.toLowerCase().includes(q) ||
        (tool.description && tool.description.toLowerCase().includes(q))
      );
    });
  }, [localTools, filterTab, searchQuery]);

  const mcpServersList = useMemo(() => {
    return (mcpData.mcpGroups || []).filter(srv => srv.id !== 'builtin');
  }, [mcpData.mcpGroups]);

  return (
    <div className="space-y-3.5">
      {/* 视图 1: 原子工具清单 */}
      {activeView === 'catalog' && (
        <div className="space-y-3.5">
          {/* 搜索与过滤栏 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="搜索工具名称或功能描述..."
                className="w-full bg-white/[0.03] border border-white/[0.08] focus:border-indigo-500/50 rounded-xl pl-8.5 pr-3 py-1.5 text-fluid-xs text-white placeholder-slate-500 focus:outline-none transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fluid-xs text-slate-400 hover:text-white"
                >
                  清空
                </button>
              )}
            </div>

            {/* 分类过滤器 */}
            <div className="flex items-center space-x-1 p-1 rounded-xl bg-black/30 border border-white/[0.08] backdrop-blur-md shrink-0">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1 rounded-lg text-fluid-xs font-medium transition cursor-pointer ${
                  filterTab === 'all'
                    ? 'bg-white/[0.08] text-white shadow-xs font-semibold border border-white/10'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                全部 ({localTools.length})
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
                内置 ({builtinToolsCount})
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
                自定义 ({customToolsCount})
              </button>
            </div>
          </div>

          {/* 工具卡片列表 */}
          {filteredTools.length === 0 ? (
            <div className="text-center py-10 rounded-2xl bg-white/[0.015] border border-dashed border-white/10 space-y-2.5">
              <Wrench className="w-6 h-6 text-slate-500 mx-auto" />
              <p className="text-fluid-xs text-slate-400">
                {filterTab === 'custom'
                  ? '暂无用户自定义工具'
                  : '未找到符合条件的原子工具'}
              </p>
              {filterTab === 'custom' && (
                <button
                  type="button"
                  onClick={onOpenToolGuide}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-fluid-xs font-semibold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加自定义工具</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredTools.map(tool => {
                const isCustom = Boolean(tool.custom);
                const isExpanded = Boolean(expandedToolNames[tool.name]);
                const params = tool.parameters?.properties || {};
                const paramKeys = Object.keys(params);

                return (
                  <div
                    key={tool.name}
                    className="p-3.5 rounded-2xl bg-[#101522]/90 hover:bg-[#101522] border border-white/[0.08] hover:border-white/[0.15] shadow-md shadow-black/20 transition-all duration-200 space-y-2.5 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-fluid-base font-bold text-white truncate">
                              {tool.name}
                            </span>
                            <span className={`text-fluid-xs font-medium px-1.5 py-0.2 rounded-md border shrink-0 ${
                              isCustom
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                : 'bg-white/[0.04] text-slate-400 border-white/10'
                            }`}>
                              {isCustom ? '自定义' : '内置'}
                            </span>
                          </div>
                        </div>

                        {/* 纯图标动作按钮 */}
                        <div className="flex items-center space-x-1 shrink-0">
                          {isCustom && (
                            <button
                              type="button"
                              disabled={deletingName === tool.name}
                              onClick={() => handleDeleteTool(tool)}
                              className="p-1 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-50"
                              title="删除自定义工具"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenToolFolder(tool)}
                            className="p-1 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-white/[0.06] transition cursor-pointer"
                            title="在资源管理器中打开工具目录"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {tool.description && (
                        <p className="text-fluid-xs text-slate-400 leading-relaxed line-clamp-2">
                          {tool.description}
                        </p>
                      )}
                    </div>

                    {/* 参数折叠区域 */}
                    {paramKeys.length > 0 && (
                      <div className="pt-1.5 border-t border-white/[0.04]">
                        <button
                          type="button"
                          onClick={() => toggleToolExpanded(tool.name)}
                          className="flex items-center gap-1 text-fluid-xs text-slate-400 hover:text-indigo-300 transition cursor-pointer font-mono"
                        >
                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          <span>参数结构 ({paramKeys.length})</span>
                        </button>

                        {isExpanded && (
                          <div className="mt-1.5 p-2 bg-black/30 rounded-xl border border-white/[0.06] space-y-1 text-fluid-xs font-mono text-slate-300">
                            {paramKeys.map(k => (
                              <div key={k} className="flex items-center justify-between">
                                <span className="text-indigo-300">{k}</span>
                                <span className="text-slate-500">{params[k]?.type || 'any'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 视图 2: 外部 MCP 服务管理 */}
      {activeView === 'mcp' && (
        <div className="space-y-3">
          {mcpServersList.length === 0 ? (
            <div className="text-center py-10 rounded-2xl bg-white/[0.015] border border-dashed border-white/10 space-y-2.5">
              <Server className="w-6 h-6 text-slate-500 mx-auto" />
              <p className="text-fluid-xs text-slate-400">
                暂未接入外部 MCP 服务
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {mcpServersList.map(srv => {
                const isExpanded = Boolean(expandedMcpServers[srv.id]);

                return (
                  <div
                    key={srv.id}
                    className="p-3.5 rounded-2xl bg-[#101522]/90 hover:bg-[#101522] border border-white/[0.08] hover:border-white/[0.15] shadow-md shadow-black/20 transition space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-xl bg-teal-500/10 border border-teal-500/25 flex items-center justify-center text-teal-400 shrink-0">
                          <Server className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-fluid-base text-white">{srv.name || srv.id}</span>
                            <span className="text-fluid-xs font-mono px-1.5 py-0.2 rounded-md bg-white/[0.04] text-slate-400 border border-white/10">
                              {srv.toolsCount || 0} 个工具
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 开关与操作 */}
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteMcp(srv)}
                          disabled={deletingMcpId === srv.id}
                          className="p-1.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-50"
                          title="删除该服务"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {isDesktop && (
                          <button
                            type="button"
                            onClick={() => onOpenProviderEditor?.(srv)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-teal-400 hover:bg-white/[0.06] transition cursor-pointer"
                            title="修改服务配置"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {srv.canToggle !== false && (
                          <button
                            type="button"
                            disabled={togglingMcpId === srv.id}
                            onClick={() => handleToggleMcp(srv.id, !srv.enabled)}
                            className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              srv.enabled ? 'bg-teal-500' : 'bg-slate-700'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                srv.enabled ? 'translate-x-4.5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 命令行展示 */}
                    {srv.command && srv.command !== 'internal' && (
                      <div className="text-fluid-xs font-mono text-slate-400 bg-black/30 px-3 py-1.5 rounded-xl border border-white/[0.06] flex items-center space-x-2 truncate">
                        <Terminal className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{srv.command} {(srv.args || []).join(' ')}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
