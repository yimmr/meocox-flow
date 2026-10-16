import React, { useState, useEffect, Suspense, lazy } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from '@/components/ui/sonner.jsx';
import Header from './components/Header.jsx';
import ProjectGrid from './components/workspace/ProjectGrid.jsx';
import NewProjectModal from './components/workspace/NewProjectModal.jsx';
import { apiFetch, waitForBackend } from '@/lib/apiClient.js';
import { openFolder } from './utils/nativeExplorer.js';
import { TooltipProvider } from '@/components/ui/tooltip.jsx';
import { useConfirm } from '@/components/ui/confirm-dialog.jsx';

const SettingsModal = lazy(() => import('./components/SettingsModal.jsx'));
const NewWorkspace = lazy(() => import('./components/workspace/NewWorkspace.jsx'));
const GlobalLibraryPage = lazy(() => import('./components/library/GlobalLibraryPage.jsx'));

export const DEFAULT_INSTALLED_PROVIDER = {
  id: 'provider_installed',
  name: '应用模型',
  type: 'installed',
  baseUrl: '',
  apiKey: '',
  models: []
};

export default function App() {
  const confirm = useConfirm();
  const [backendReady, setBackendReady] = useState(false);
  const [backendError, setBackendError] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [agents, setAgents] = useState([]);

  // 提供商与模型配置状态
  const [providers, setProviders] = useState([DEFAULT_INSTALLED_PROVIDER]);
  const [activeProviderId, setActiveProviderId] = useState('provider_installed');
  const [activeModelId, setActiveModelId] = useState('installed:qwen3-vl-4b');

  // 模态弹窗控制状态
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('models');
  const [isGlobalLibraryOpen, setIsGlobalLibraryOpen] = useState(false);

  // 1. 获取所有项目列表
  const fetchProjects = async () => {
    try {
      const res = await apiFetch('/api/projects');
      if (res.ok) {
        const json = await res.json();
        setProjects(json.projects || []);
      }
    } catch (e) {
      console.error('获取项目列表异常:', e);
    } finally {
      setLoading(false);
    }
  };

  // 2. 获取底层智能体能力清单
  const fetchCapabilities = async () => {
    try {
      const res = await apiFetch('/api/capabilities');
      if (res.ok) {
        const json = await res.json();
        setAgents(json.agents || []);
      }
    } catch (e) {
      console.error('获取引擎能力异常:', e);
    }
  };

  // 3. 获取用户配置的 Providers 与活跃模型
  const fetchProviders = async () => {
    try {
      const res = await apiFetch('/api/settings/providers');
      if (res.ok) {
        const data = await res.json();
        if (data.providers && data.providers.length > 0) {
          setProviders(data.providers);
        }
        if (data.activeProviderId) setActiveProviderId(data.activeProviderId);
        if (data.activeModelId) setActiveModelId(data.activeModelId);
      }
    } catch (e) {
      console.warn('获取提供商配置失败，回退内置:', e);
    }
  };

  // 保存 Providers 到后端
  const handleSaveProviders = async (newProviders) => {
    setProviders(newProviders);
    try {
      await apiFetch('/api/settings/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeProviderId,
          activeModelId,
          providers: newProviders
        })
      });
      toast.success('模型提供商配置已保存');
    } catch (e) {
      toast.error('保存提供商配置失败: ' + e.message);
    }
  };

  // 切换活跃模型
  const handleSelectActiveModel = async (pId, mId) => {
    setActiveProviderId(pId);
    setActiveModelId(mId);
    try {
      await apiFetch('/api/settings/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeProviderId: pId,
          activeModelId: mId,
          providers
        })
      });
      toast.success(`已切换活跃模型: ${mId}`);
    } catch (e) {
      console.error(e);
    }
  };

  // 初始化
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const ready = await waitForBackend({ timeoutMs: 15000 }).catch(() => false);
      if (cancelled) return;
      if (ready) {
        setBackendReady(true);
        setBackendError(false);
        await Promise.all([fetchProjects(), fetchCapabilities(), fetchProviders()]);
      } else {
        setBackendReady(false);
        setBackendError(true);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // 创建新项目
  const handleCreateProject = async ({ title, description, libraries, settings }) => {
    try {
      const res = await apiFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          libraries,
          settings
        })
      });

      if (res.ok) {
        const json = await res.json();
        toast.success(`项目【${title}】创建成功`);
        await fetchProjects();
        if (json.project?.id) {
          setActiveProjectId(json.project.id);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error('创建项目失败: ' + (err.summary || err.error?.message || '未知错误'));
      }
    } catch (e) {
      toast.error('创建项目网络异常: ' + e.message);
    }
  };

  // 删除项目 (带有现代二次确认弹窗)
  const handleDeleteProject = async (projectId, projectTitle) => {
    const proj = projects.find(p => p.id === projectId);
    const targetTitle = projectTitle || proj?.title || '未命名项目';

    const ok = await confirm({
      title: '删除项目二次确认',
      description: `确定要彻底删除项目【${targetTitle}】吗？此操作将永久移除该项目的沙箱工作区及全部对话推演记录。（外部挂载的本地资料库原始文件将完整保留，不受任何影响）`,
      confirmText: '确认删除',
      cancelText: '取消',
      variant: 'destructive',
    });

    if (!ok) return;

    try {
      const res = await apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`项目【${targetTitle}】已安全删除`);
        if (activeProjectId === projectId) {
          setActiveProjectId(null);
        }
        await fetchProjects();
      } else {
        toast.error('删除项目失败');
      }
    } catch (e) {
      toast.error('删除项目异常: ' + e.message);
    }
  };

  // 打开本地文件夹 (统一支持绝对路径、项目对象或项目ID)
  const handleOpenFolder = async (target) => {
    await openFolder(target);
  };

  // 更新当前项目标题
  const handleUpdateProjectTitle = async (newTitle) => {
    if (!activeProjectId || !newTitle.trim()) return;
    try {
      const res = await apiFetch(`/api/projects/${activeProjectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() })
      });
      if (res.ok) {
        toast.success('项目标题已更新');
        await fetchProjects();
      }
    } catch (e) {
      toast.error('更新标题失败: ' + e.message);
    }
  };

  // 打开设置模态窗
  const handleOpenSettings = (tab = 'models') => {
    setSettingsTab(tab);
    setIsSettingsOpen(true);
  };

  const currentProject = projects.find(p => p.id === activeProjectId) || null;

  if (!backendReady) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0B0F17] text-slate-300 gap-4 select-none font-sans">
        {backendError ? (
          <div className="p-8 max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col items-center text-center shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-slate-100 mb-1">本地服务尚未就绪</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              后端服务在预设时间内未响应。常见原因：端口 3001 尚未启动或正在重启中。
              <br />
              <span className="font-mono text-slate-500 text-[11px] block mt-1">日志位置：%LOCALAPPDATA%\MeocoxFlow\logs\backend.log</span>
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-colors cursor-pointer"
            >
              重新连接
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-9 h-9 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            <div className="text-xs text-slate-400">正在连接本地引擎服务...</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="h-screen w-screen flex flex-col bg-[#0B0F17] overflow-hidden select-none font-sans">
      {/* ─────────────────────────────────────────────────────────────
          1. 统一正统 Header (Brand + 面包屑 + 工作室Demo + 设置中心)
         ───────────────────────────────────────────────────────────── */}
      {!activeProjectId && (
        <Header
          currentProject={currentProject}
          onBackToHome={() => {
            setIsGlobalLibraryOpen(false);
            setActiveProjectId(null);
            fetchProjects();
          }}
          onOpenSettings={handleOpenSettings}
          onOpenGlobalLibrary={() => {
            setIsGlobalLibraryOpen(true);
          }}
          isGlobalLibraryActive={isGlobalLibraryOpen}
          onUpdateProjectTitle={handleUpdateProjectTitle}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. 主内容区
         ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
              正在加载工作模块...
            </div>
          }
        >
          {isGlobalLibraryOpen ? (
            <GlobalLibraryPage
              onBack={() => setIsGlobalLibraryOpen(false)}
              onOpenSettings={handleOpenSettings}
            />
          ) : activeProjectId ? (
            <NewWorkspace
              projectId={activeProjectId}
              onBack={() => {
                setActiveProjectId(null);
                fetchProjects();
              }}
              agents={agents}
              onOpenSettings={handleOpenSettings}
              providers={providers}
              activeProviderId={activeProviderId}
              activeModelId={activeModelId}
            />
          ) : (
            <ProjectGrid
              projects={projects}
              loading={loading}
              onOpenProject={(id) => {
                setActiveProjectId(id);
              }}
              onOpenFolder={handleOpenFolder}
              onDeleteProject={handleDeleteProject}
              onOpenNewModal={() => setIsNewModalOpen(true)}
            />
          )}
        </Suspense>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. 核心模态弹窗系统
         ───────────────────────────────────────────────────────────── */}
      {/* 新建项目窗口 (Codex 风格 + 系统文件夹选择器) */}
      <NewProjectModal
        isOpen={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onCreate={handleCreateProject}
      />

      {/* 全局设置中心 (模型提供商、目录设置、智能体、技能、MCP、存储、关于) */}
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            initialTab={settingsTab}
            providers={providers}
            activeProviderId={activeProviderId}
            activeModelId={activeModelId}
            onSaveProviders={handleSaveProviders}
            onSelectActive={handleSelectActiveModel}
            onAgentsUpdated={fetchCapabilities}
          />
        </Suspense>
      )}
    </div>
    </TooltipProvider>
  );
}
