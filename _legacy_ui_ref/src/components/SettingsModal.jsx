import React, { useState, useEffect, useMemo } from 'react';
import {
  Settings,
  X,
  CheckCircle2,
  Plus,
  RefreshCw,
  Bot,
  Sparkles,
  Wrench,
  FolderOpen,
  Server,
  ArrowLeft,
  AlertCircle
} from 'lucide-react';

const BUILTIN_AGENT_IDS = [
  'super-brain',
  'perception-specialist',
  'evolution-specialist'
];
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog.jsx';
import { isDesktopApp } from '../utils/desktop.js';
import { toast } from '@/components/ui/sonner.jsx';
import { apiFetch } from '@/lib/apiClient.js';
import { openFolder, openFile } from '@/utils/nativeExplorer.js';
import { getTabConfig } from './settings/settingsConfig.js';
import SettingsSidebar from './settings/SettingsSidebar.jsx';
import DirectoriesSettingsTab from './settings/tabs/DirectoriesSettingsTab.jsx';
import ModelsSettingsTab from './settings/tabs/ModelsSettingsTab.jsx';
import AgentsSettingsTab from './settings/tabs/AgentsSettingsTab.jsx';
import SkillsSettingsTab from './settings/tabs/SkillsSettingsTab.jsx';
import ToolsSettingsTab from './settings/tabs/ToolsSettingsTab.jsx';
import StorageSettingsTab from './settings/tabs/StorageSettingsTab.jsx';
import AboutSettingsTab from './settings/tabs/AboutSettingsTab.jsx';
import AgentEditorPanel from './settings/editors/AgentEditorPanel.jsx';
import SkillEditorPanel from './settings/editors/SkillEditorPanel.jsx';
import ToolProviderEditorPanel from './settings/editors/ToolProviderEditorPanel.jsx';
import CustomToolGuidePanel from './settings/editors/CustomToolGuidePanel.jsx';

export default function SettingsModal({
  isOpen,
  onClose,
  initialTab = 'models',
  providers = [],
  activeProviderId,
  activeModelId,
  onSaveProviders,
  onSelectActive,
  onAgentsUpdated
}) {
  // Navigation Tab State (默认从模型配置或系统配置进入)
  const normalizedInitialTab = initialTab === 'mcp' ? 'tools' : (initialTab && initialTab !== 'project' ? initialTab : 'models');
  const [activeTab, setActiveTab] = useState(normalizedInitialTab);
  const [toolsView, setToolsView] = useState(initialTab === 'mcp' ? 'mcp' : 'catalog');

  // System Global Settings (customOutputDir, defaultProjectsRoot, enableMemory, memoryFilePath)
  const [systemSettings, setSystemSettings] = useState({
    customOutputDir: '',
    defaultProjectsRoot: '',
    enableMemory: true,
    memoryFilePath: ''
  });
  const [initialSystemSettings, setInitialSystemSettings] = useState({
    customOutputDir: '',
    defaultProjectsRoot: '',
    enableMemory: true,
    memoryFilePath: ''
  });


  const [notice, setNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Desktop vs Web Mode detection
  const isDesktop = isDesktopApp();

  // Agents, Skills & MCP State
  const [agentsList, setAgentsList] = useState([]);
  const [skillsList, setSkillsList] = useState([]);
  const [mcpData, setMcpData] = useState({ servers: [], mcpGroups: [], tools: [], toolsCount: 0 });
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [loadingMcp, setLoadingMcp] = useState(false);

  // Exclusive Editor Panel Router State: { active: boolean, type: 'agent'|'skill'|'provider', item: object|null, isSaving: boolean }
  const [editorState, setEditorState] = useState({
    active: false,
    type: null,
    item: null,
    isSaving: false
  });

  useEffect(() => {
    setEditorState({ active: false, type: null, item: null, isSaving: false });
  }, [activeTab]);

  // Storage & Cache management state
  const [storageStats, setStorageStats] = useState(null);
  const [isStorageLoading, setIsStorageLoading] = useState(false);

  // Extract all available models from configured providers
  const availableModels = useMemo(() => {
    const list = [];
    (providers || []).forEach(p => {
      const validModels = (p.models || []).filter(m => {
        if (p.type === 'installed' || p.id === 'provider_installed') {
          if (m.isInstalled === false || m.isReady === false || m.enabled === false) return false;
        }
        return true;
      });
      validModels.forEach(m => {
        const modelId = typeof m === 'string' ? m : (m.id || m.name);
        const modelLabel = typeof m === 'string' ? m : (m.name || m.id);
        if (modelId && !list.some(item => item.id === modelId)) {
          list.push({
            id: modelId,
            label: `${modelLabel} (${p.name || p.id})`
          });
        }
      });
    });

    return list;
  }, [providers]);

  // Data Fetching Functions
  const fetchStorageStats = async () => {
    setIsStorageLoading(true);
    try {
      const res = await apiFetch('/api/media/storage/stats');
      const data = await res.json();
      if (data.success) {
        setStorageStats(data.stats);
      }
    } catch (e) {
      console.warn('获取存储统计失败:', e);
    } finally {
      setIsStorageLoading(false);
    }
  };

  const fetchAgents = async () => {
    setLoadingAgents(true);
    try {
      const res = await apiFetch(`/api/agents?t=${Date.now()}`);
      const data = await res.json();
      if (data.success) {
        const loadedAgents = data.agents || [];
        setAgentsList(loadedAgents);
        onAgentsUpdated?.(loadedAgents);
      }
    } catch (e) {
      console.warn('获取智能体失败:', e);
    } finally {
      setLoadingAgents(false);
    }
  };

  const fetchSkills = async () => {
    setLoadingSkills(true);
    try {
      const res = await apiFetch('/api/agents');
      const data = await res.json();
      if (data.success) {
        setSkillsList(data.skills || []);
      }
    } catch (e) {
      console.warn('获取技能失败:', e);
    } finally {
      setLoadingSkills(false);
    }
  };

  const fetchMcp = async () => {
    setLoadingMcp(true);
    try {
      const res = await apiFetch('/api/agents/tools');
      const data = await res.json();
      if (data.success) {
        setMcpData({
          servers: data.servers || [],
          mcpGroups: data.mcpGroups || [],
          tools: data.tools || [],
          toolsCount: data.toolsCount || 0
        });
      }
    } catch (e) {
      console.warn('获取MCP失败:', e);
    } finally {
      setLoadingMcp(false);
    }
  };

  const handleOpenFile = async (filePath) => {
    await openFile(filePath);
  };

  const handleOpenFolder = async (type, id = '', builtin = false) => {
    await openFolder({ type, id, builtin });
  };

  // Exclusive Editor Open Handlers
  const handleOpenAgentEditor = (agent = null) => {
    if (skillsList.length === 0) fetchSkills();
    if (mcpData.tools.length === 0) fetchMcp();
    setEditorState({
      active: true,
      type: 'agent',
      item: agent,
      isSaving: false
    });
  };

  const handleOpenSkillEditor = async (skill = null) => {
    if (skill && skill.id) {
      try {
        const res = await apiFetch(`/api/agents/skills/${skill.id}`);
        const data = await res.json();
        if (data.success && data.skill) {
          setEditorState({
            active: true,
            type: 'skill',
            item: data.skill,
            isSaving: false
          });
          return;
        }
      } catch (err) {
        console.warn('读取完整技能配置失败，回退基础数据:', err);
      }
    }
    setEditorState({
      active: true,
      type: 'skill',
      item: skill,
      isSaving: false
    });
  };

  const handleOpenProviderEditor = (provider = null) => {
    setEditorState({
      active: true,
      type: 'provider',
      item: provider,
      isSaving: false
    });
  };

  const handleOpenToolGuide = () => {
    setEditorState({
      active: true,
      type: 'tool_guide',
      item: null,
      isSaving: false
    });
  };

  const handleCloseEditor = () => {
    setEditorState({
      active: false,
      type: null,
      item: null,
      isSaving: false
    });
  };

  // Exclusive Editor Save Handlers
  const handleSaveAgent = async (formData) => {
    setEditorState(prev => ({ ...prev, isSaving: true }));
    try {
      const isEdit = Boolean(editorState.item?.id);
      const url = isEdit ? `/api/agents/${editorState.item.id}` : '/api/agents/custom';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        toast.success(isEdit ? '智能体配置已保存' : '智能体创建成功');
        await fetchAgents();
        handleCloseEditor();
      } else {
        toast.error(data.error || '保存智能体失败');
      }
    } catch (err) {
      toast.error('网络请求异常: ' + err.message);
    } finally {
      setEditorState(prev => ({ ...prev, isSaving: false }));
    }
  };

  const handleSaveSkill = async (formData) => {
    setEditorState(prev => ({ ...prev, isSaving: true }));
    try {
      const isEdit = Boolean(editorState.item?.id);
      const url = isEdit ? `/api/agents/skills/${editorState.item.id}` : '/api/agents/skills/custom';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        toast.success(isEdit ? '技能规约已更新' : '技能创建成功');
        await fetchSkills();
        handleCloseEditor();
      } else {
        toast.error(data.error || '保存技能失败');
      }
    } catch (err) {
      toast.error('网络请求异常: ' + err.message);
    } finally {
      setEditorState(prev => ({ ...prev, isSaving: false }));
    }
  };

  const handleSaveProvider = async (formData) => {
    setEditorState(prev => ({ ...prev, isSaving: true }));
    try {
      const res = await apiFetch('/api/agents/mcp/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        toast.success('MCP 工具源配置已保存并连接');
        await fetchMcp();
        handleCloseEditor();
      } else {
        toast.error(data.error || '保存 MCP 工具源失败');
      }
    } catch (err) {
      toast.error('网络请求异常: ' + err.message);
    } finally {
      setEditorState(prev => ({ ...prev, isSaving: false }));
    }
  };

  // Sync initial props
  useEffect(() => {
    if (isOpen) {
      if (initialTab && initialTab !== 'project') {
        const norm = initialTab === 'mcp' ? 'tools' : initialTab;
        setActiveTab(norm);
        setToolsView(initialTab === 'mcp' ? 'mcp' : 'catalog');
      } else {
        setActiveTab('models');
        setToolsView('catalog');
      }

      apiFetch('/api/settings')
        .then(res => res.json())
        .then(data => {
          if (data.settings) {
            const customOut = data.settings.customOutputDir || '';
            const root = data.settings.defaultProjectsRoot || '';
            const enableMemory = data.settings.enableMemory !== undefined ? Boolean(data.settings.enableMemory) : true;
            const memoryFilePath = data.settings.memoryFilePath || '';
            const nextSettings = { customOutputDir: customOut, defaultProjectsRoot: root, enableMemory, memoryFilePath };
            setSystemSettings(nextSettings);
            setInitialSystemSettings(nextSettings);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, initialTab]);

  // Tab activation lazy fetching
  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'agents') {
        fetchAgents();
        fetchSkills();
        fetchMcp();
      }
      if (activeTab === 'skills') fetchSkills();
      if (activeTab === 'tools' || activeTab === 'mcp') fetchMcp();
      if (activeTab === 'storage') fetchStorageStats();
    }
  }, [isOpen, activeTab]);

  const isGlobalDirty =
    (systemSettings.customOutputDir || '') !== (initialSystemSettings.customOutputDir || '') ||
    Boolean(systemSettings.enableMemory) !== Boolean(initialSystemSettings.enableMemory);

  const handleSaveGlobal = async (dataToSave = systemSettings, silent = false) => {
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customOutputDir: dataToSave.customOutputDir ? dataToSave.customOutputDir.trim() : '',
          enableMemory: dataToSave.enableMemory !== undefined ? Boolean(dataToSave.enableMemory) : true
        })
      });
      const data = await res.json();
      if (data.settings) {
        const customOut = data.settings.customOutputDir || '';
        const root = data.settings.defaultProjectsRoot || '';
        const enableMemory = data.settings.enableMemory !== undefined ? Boolean(data.settings.enableMemory) : true;
        const memoryFilePath = data.settings.memoryFilePath || '';
        const nextSettings = { customOutputDir: customOut, defaultProjectsRoot: root, enableMemory, memoryFilePath };
        setSystemSettings(nextSettings);
        setInitialSystemSettings(nextSettings);
      }
      setNotice(silent ? '已自动保存' : '系统全局设置已保存');
      setTimeout(() => setNotice(''), 2500);
    } catch (e) {
      console.error(e);
      setNotice('保存失败: ' + (e.message || '未知错误'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndo = async () => {
    if (activeTab === 'directories') {
      const restored = { ...initialSystemSettings };
      setSystemSettings(restored);
      await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customOutputDir: restored.customOutputDir || '',
          enableMemory: Boolean(restored.enableMemory)
        })
      });
      setNotice('已撤销修改并恢复初始设置');
      setTimeout(() => setNotice(''), 2500);
    }
  };


  // Keyboard shortcut Esc to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const currentTabConfig = getTabConfig(activeTab);
  const CurrentTabIcon = currentTabConfig.icon;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-5xl h-[86vh] max-h-[840px] min-h-[560px] p-0 gap-0 overflow-hidden flex flex-col bg-[#0D111A] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/80 settings-modal-fluid">
        <DialogTitle className="sr-only">全局设置中心</DialogTitle>
        <DialogDescription className="sr-only">统一管理全局工作区、AI 智能体引擎、技能生态与系统资源</DialogDescription>

        {/* Top Header */}
        <div className="px-5 py-3 border-b border-white/[0.07] flex items-center justify-between shrink-0 bg-[#090D15]">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-slate-300">
              <Settings className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-fluid-title text-white">设置中心</h3>
              <span className="text-fluid-xs text-slate-500 font-mono">Settings</span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {notice && (
              <span className="text-fluid-xs text-emerald-400 flex items-center space-x-1.5 font-medium animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{notice}</span>
              </span>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-white/[0.08] transition cursor-pointer"
              title="关闭 (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Main Area: Left Sidebar + Right Content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Vertical Grouped Sidebar */}
          <SettingsSidebar
            activeTab={activeTab}
            onSelectTab={(tabId) => {
              handleCloseEditor();
              setActiveTab(tabId);
              setToolsView('catalog');
            }}
          />

          {/* Right Content Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#0D111A] overflow-hidden">
            {/* Right Pane Section Header (Adaptive: Normal vs Exclusive Editor) */}
            {editorState.active ? (
              <div className="px-6 py-3.5 border-b border-white/[0.07] bg-[#090D15] shrink-0 flex items-center justify-between">
                <div className="flex items-center space-x-3.5 min-w-0">
                  {editorState.type === 'agent' && (() => {
                    const agent = editorState.item;
                    const isSuperBrain = agent?.id === 'super-brain';
                    const isBuiltin = BUILTIN_AGENT_IDS.includes(agent?.id) && !agent?.custom;
                    const displayName = agent
                      ? (agent.title ? `${agent.name}(${agent.title})` : agent.name || agent.id)
                      : '创建新角色';
                    const subtitle = isSuperBrain
                      ? '系统总控调度主脑'
                      : isBuiltin
                      ? '内置标准工种角色'
                      : agent
                      ? '用户自定义角色'
                      : '配置角色人设、驱动模型以及绑定的规约与工具权限';

                    return (
                      <>
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isBuiltin
                              ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-400'
                              : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                          }`}
                        >
                          <Bot className="w-5 h-5" />
                        </div>

                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-white truncate">
                            {displayName}
                          </h4>
                          <p className="text-[11px] text-gray-400 truncate mt-0.5">
                            {subtitle}
                          </p>
                        </div>
                      </>
                    );
                  })()}

                  {editorState.type === 'skill' && (() => {
                    const isBuiltin = editorState.item && !editorState.item.custom;
                    return (
                      <>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isBuiltin
                            ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400'
                            : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                        }`}>
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-white truncate">
                            {editorState.item ? `编辑技能: ${editorState.item.name || editorState.item.id}` : '新建自定义技能'}
                          </h4>
                          <p className="text-[11px] text-gray-400 truncate mt-0.5">
                            编写剪辑规则手册与可选的确定性代码逻辑
                          </p>
                        </div>
                      </>
                    );
                  })()}

                  {editorState.type === 'provider' && (
                    <>
                      <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
                        <Wrench className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">
                          {editorState.item ? `配置工具源: ${editorState.item.id}` : '接入外部 MCP 工具源'}
                        </h4>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">
                          管理外部进程通信命令、参数与原子工具导出
                        </p>
                      </div>
                    </>
                  )}
                  {editorState.type === 'tool_guide' && (
                    <>
                      <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                        <Wrench className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">
                          添加自定义工具指引
                        </h4>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">
                          自定义原子工具开发规范约定与本地文件存放规则
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* Right Action: Open local folder if available */}
                <div className="flex items-center space-x-2 shrink-0">
                  {editorState.type === 'agent' && editorState.item?.id && (
                    <button
                      type="button"
                      onClick={() => {
                        if (editorState.item.filePath) {
                          const folder = editorState.item.filePath.replace(/[\\/][^\\/]+$/, '');
                          openFolder(folder);
                        } else {
                          handleOpenFolder('agents', editorState.item.id);
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-amber-400 border border-dark-700/80 hover:border-amber-500/30 text-xs flex items-center space-x-1.5 transition cursor-pointer"
                      title="在系统资源管理器中打开该角色本地目录"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>打开本地目录</span>
                    </button>
                  )}
                  {editorState.type === 'skill' && editorState.item?.id && (
                    <button
                      type="button"
                      onClick={() => {
                        if (editorState.item.filePath) {
                          const folder = editorState.item.filePath.replace(/[\\/][^\\/]+$/, '');
                          openFolder(folder);
                        } else {
                          handleOpenFolder('skills', editorState.item.id);
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-amber-400 border border-dark-700/80 hover:border-amber-500/30 text-xs flex items-center space-x-1.5 transition cursor-pointer"
                      title="在系统资源管理器中打开该技能本地目录"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>打开本地目录</span>
                    </button>
                  )}
                  {editorState.type === 'provider' && (
                    <button
                      type="button"
                      onClick={() => handleOpenFile('config/mcp_servers.json')}
                      className="px-3 py-1.5 rounded-xl bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-teal-400 border border-dark-700/80 hover:border-teal-500/30 text-xs flex items-center space-x-1.5 transition cursor-pointer"
                      title="打开本地配置文件 config/mcp_servers.json"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>打开配置文件</span>
                    </button>
                  )}
                  {editorState.type === 'tool_guide' && (
                    <>
                      <button
                        type="button"
                        onClick={handleCloseEditor}
                        className="px-2.5 py-1.5 rounded-xl bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700/80 text-xs flex items-center space-x-1.5 transition cursor-pointer"
                        title="返回全部工具列表"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>返回工具列表</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenFolder('tools')}
                        className="px-3 py-1.5 rounded-xl bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-amber-400 border border-dark-700/80 hover:border-amber-500/30 text-xs flex items-center space-x-1.5 transition cursor-pointer"
                        title="在系统资源管理器中打开工具文件目录"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>打开本地目录</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-6 py-3 border-b border-white/[0.07] bg-[#090D15] shrink-0 flex items-center justify-between">
                <div className="flex items-center space-x-2.5 min-w-0">
                  {((activeTab === 'tools' || activeTab === 'mcp') && toolsView === 'mcp') ? (
                    <>
                      <div className="w-8 h-8 rounded-xl bg-teal-500/10 border border-teal-500/25 flex items-center justify-center text-teal-400 shrink-0">
                        <Server className="w-4 h-4" />
                      </div>
                      <div className="flex items-center space-x-2 min-w-0">
                        <h4 className="font-bold text-fluid-base text-white truncate">MCP 管理</h4>
                        <span className="text-fluid-xs px-1.5 py-0.2 rounded-md border font-mono shrink-0 text-teal-400 bg-teal-500/10 border-teal-500/20">
                          全局
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400 shrink-0">
                        <CurrentTabIcon className="w-4 h-4" />
                      </div>
                      <div className="flex items-center space-x-2 min-w-0">
                        <h4 className="font-bold text-fluid-base text-white truncate">{currentTabConfig.label}</h4>
                        <span className={`text-fluid-xs px-1.5 py-0.2 rounded-md border font-mono shrink-0 ${currentTabConfig.scopeColor}`}>
                          {currentTabConfig.scope}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Right Side Actions integrated in single header */}
                <div className="flex items-center space-x-2 shrink-0 ml-4">
                  {activeTab === 'agents' && (
                    <>
                      <button
                        onClick={fetchAgents}
                        disabled={loadingAgents}
                        className="p-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] text-slate-400 hover:text-white border border-white/10 transition cursor-pointer disabled:opacity-50"
                        title="刷新智能体列表"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingAgents ? 'animate-spin' : ''}`} />
                      </button>
                      {isDesktop ? (
                        <button
                          onClick={() => handleOpenAgentEditor(null)}
                          className="px-3 py-1.5 rounded-xl text-fluid-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-indigo-500/25 transition cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>新建智能体</span>
                        </button>
                      ) : (
                        <span className="text-fluid-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>只读模式</span>
                        </span>
                      )}
                    </>
                  )}

                  {activeTab === 'skills' && (
                    <>
                      <button
                        onClick={fetchSkills}
                        disabled={loadingSkills}
                        className="p-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] text-slate-400 hover:text-white border border-white/10 transition cursor-pointer disabled:opacity-50"
                        title="刷新技能列表"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingSkills ? 'animate-spin' : ''}`} />
                      </button>
                      {isDesktop ? (
                        <button
                          onClick={() => handleOpenSkillEditor(null)}
                          className="px-3 py-1.5 rounded-xl text-fluid-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-indigo-500/25 transition cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>新建技能</span>
                        </button>
                      ) : (
                        <span className="text-fluid-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>只读模式</span>
                        </span>
                      )}
                    </>
                  )}

                  {(activeTab === 'tools' || activeTab === 'mcp') && (
                    <>
                      {toolsView === 'catalog' ? (
                        <>
                          <button
                            onClick={fetchMcp}
                            disabled={loadingMcp}
                            className="p-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] text-slate-400 hover:text-white border border-white/10 transition cursor-pointer disabled:opacity-50"
                            title="刷新工具列表"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${loadingMcp ? 'animate-spin' : ''}`} />
                          </button>
                          <button
                            onClick={() => setToolsView('mcp')}
                            className="px-3 py-1.5 rounded-xl text-fluid-xs font-medium flex items-center space-x-1.5 transition cursor-pointer bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/10"
                          >
                            <Server className="w-3.5 h-3.5 text-teal-400" />
                            <span>MCP 管理</span>
                          </button>
                          {isDesktop ? (
                            <button
                              onClick={handleOpenToolGuide}
                              className="px-3 py-1.5 rounded-xl text-fluid-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-indigo-500/25 transition cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>添加工具</span>
                            </button>
                          ) : (
                            <span className="text-fluid-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>只读模式</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setToolsView('catalog')}
                            className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/10 text-fluid-xs flex items-center space-x-1.5 transition cursor-pointer"
                            title="返回全部工具列表"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            <span>返回工具列表</span>
                          </button>
                          <button
                            onClick={fetchMcp}
                            disabled={loadingMcp}
                            className="p-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] text-slate-400 hover:text-white border border-white/10 transition cursor-pointer disabled:opacity-50"
                            title="刷新 MCP 服务列表"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${loadingMcp ? 'animate-spin' : ''}`} />
                          </button>
                          {isDesktop ? (
                            <button
                              onClick={() => handleOpenProviderEditor(null)}
                              className="px-3 py-1.5 rounded-xl text-fluid-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-indigo-500/25 transition cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>接入 MCP</span>
                            </button>
                          ) : (
                            <span className="text-fluid-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>只读模式</span>
                            </span>
                          )}
                        </>
                      )}
                    </>
                  )}

                  {activeTab === 'storage' && (
                    <button
                      onClick={fetchStorageStats}
                      disabled={isStorageLoading}
                      className="px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] text-slate-300 hover:text-white border border-white/10 text-fluid-xs flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50"
                      title="刷新存储状态"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isStorageLoading ? 'animate-spin text-indigo-400' : ''}`} />
                      <span>刷新统计</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Scrollable Tab Content Pane / Exclusive Editor */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0 flex flex-col">
              {editorState.active ? (
                <div className="flex-1 flex flex-col min-h-0">
                  {editorState.type === 'agent' && (
                    <AgentEditorPanel
                      agent={editorState.item}
                      providers={providers}
                      availableModels={availableModels}
                      skillsList={skillsList}
                      toolsList={mcpData.tools || []}
                      onSave={handleSaveAgent}
                      onCancel={handleCloseEditor}
                      handleOpenFolder={handleOpenFolder}
                      isSaving={editorState.isSaving}
                    />
                  )}
                  {editorState.type === 'skill' && (
                    <SkillEditorPanel
                      skill={editorState.item}
                      onSave={handleSaveSkill}
                      onCancel={handleCloseEditor}
                      isSaving={editorState.isSaving}
                    />
                  )}
                  {editorState.type === 'provider' && (
                    <ToolProviderEditorPanel
                      provider={editorState.item}
                      onSave={handleSaveProvider}
                      onCancel={handleCloseEditor}
                      isSaving={editorState.isSaving}
                    />
                  )}
                  {editorState.type === 'tool_guide' && (
                    <CustomToolGuidePanel
                      onCancel={handleCloseEditor}
                      handleOpenFolder={handleOpenFolder}
                      onRefresh={fetchMcp}
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {activeTab === 'directories' && (
                    <DirectoriesSettingsTab
                      systemSettings={systemSettings}
                      initialSystemSettings={initialSystemSettings}
                      onChangeSystemSettings={setSystemSettings}
                      onSaveGlobal={handleSaveGlobal}
                      isSaving={isSaving}
                      onUndo={handleUndo}
                      isDirty={isGlobalDirty}
                    />
                  )}

                  {activeTab === 'models' && (
                    <ModelsSettingsTab
                      providers={providers}
                      activeProviderId={activeProviderId}
                      activeModelId={activeModelId}
                      onSaveProviders={onSaveProviders}
                      onSelectActive={onSelectActive}
                    />
                  )}

                  {activeTab === 'agents' && (
                    <AgentsSettingsTab
                      agentsList={agentsList}
                      skillsList={skillsList}
                      loadingAgents={loadingAgents}
                      fetchAgents={fetchAgents}
                      availableModels={availableModels}
                      isDesktop={isDesktop}
                      handleOpenFile={handleOpenFile}
                      handleOpenFolder={handleOpenFolder}
                      onOpenAgentEditor={handleOpenAgentEditor}
                    />
                  )}

                  {activeTab === 'skills' && (
                    <SkillsSettingsTab
                      skillsList={skillsList}
                      loadingSkills={loadingSkills}
                      fetchSkills={fetchSkills}
                      isDesktop={isDesktop}
                      handleOpenFile={handleOpenFile}
                      handleOpenFolder={handleOpenFolder}
                      onOpenSkillEditor={handleOpenSkillEditor}
                    />
                  )}

                  {(activeTab === 'tools' || activeTab === 'mcp') && (
                    <ToolsSettingsTab
                      mcpData={mcpData}
                      loading={loadingMcp}
                      fetchMcp={fetchMcp}
                      isDesktop={isDesktop}
                      handleOpenFile={handleOpenFile}
                      handleOpenFolder={handleOpenFolder}
                      onOpenProviderEditor={handleOpenProviderEditor}
                      onOpenToolGuide={handleOpenToolGuide}
                      activeView={toolsView}
                      onSwitchView={setToolsView}
                    />
                  )}

                  {activeTab === 'storage' && (
                    <StorageSettingsTab
                      storageStats={storageStats}
                      isStorageLoading={isStorageLoading}
                      fetchStorageStats={fetchStorageStats}
                      handleOpenFolder={handleOpenFolder}
                    />
                  )}

                  {activeTab === 'about' && (
                    <AboutSettingsTab />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

