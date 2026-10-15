import React, { useState, useEffect, useRef, useMemo, Suspense, lazy } from 'react';
import { 
  ArrowLeft, 
  Settings, 
  Sparkles, 
  Zap, 
  ArrowUp,
  Bot,
  ChevronDown,
  X,
  Video,
  Music,
  FileText,
  Globe,
  Trash2,
  ListTodo,
  Clock,
  Package
} from 'lucide-react';
import { DEFAULT_QUICK_DEMANDS, THREAD_POLL_INTERVAL_MS } from '@/constants/workspaceDemands.js';
import { toast } from '@/components/ui/sonner.jsx';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel
} from '@/components/ui/alert-dialog.jsx';
import ArtifactSidebar from '../stream/ArtifactSidebar.jsx';
import TimelineFeed from '../stream/TimelineFeed.jsx';
import ProjectLibrarySidebar from './ProjectLibrarySidebar.jsx';
import ResizeSplitter from './ResizeSplitter.jsx';
import ProjectSettingsModal from './ProjectSettingsModal.jsx';
import PromptAttachmentBar from './PromptAttachmentBar.jsx';
import MediaBackdropPreview from './MediaBackdropPreview.jsx';
import MentionPopover from './MentionPopover.jsx';
import { useWorkspaceLayout } from './useWorkspaceLayout.js';
import { useWorkspaceProjectData } from './useWorkspaceProjectData.js';
import { VscodeSidebarLeftIcon, VscodeSidebarRightIcon } from './LayoutIcons.jsx';
import { apiFetch, apiUrl, waitForBackend } from '@/lib/apiClient.js';
import { applyTimelineEvent } from '@/lib/activityTimeline.js';
import { consumeJsonEventStream } from '@/lib/sseStream.js';
import { STREAM_EVENT_TYPES } from '@/types/streamProtocol.js';
import { DEFAULT_SUPER_BRAIN_ID } from '@/constants/interactionModes.js';

const WebMediaBrowserModal = lazy(() => import('../WebMediaBrowserModal.jsx'));

/**
 * 纯展示组件：智能体头像 (无任何特定领域的死数据与假数据)
 */
function AgentAvatar({ avatar, className = "text-sm" }) {
  if (avatar && typeof avatar === 'string') {
    return <span className={className}>{avatar}</span>;
  }
  return <Bot className="w-3.5 h-3.5 text-indigo-400" />;
}


/**
 * 自动计算附件底层标注序号 (如 图片1, 视频1, 音频1, 文件1，严格不带@符号)
 */
function getFileMentionLabel(file, attachedFiles = []) {
  if (!file) return '';
  const directLabel = (file.numberedLabel || file.mentionTag || file.tag || '').replace(/^@+/, '').trim();
  if (directLabel) return directLabel;

  let typeKey = 'file';
  let typeName = '文件';
  if (file.type === 'image') {
    typeKey = 'image';
    typeName = '图片';
  } else if (file.type === 'video') {
    typeKey = 'video';
    typeName = '视频';
  } else if (file.type === 'audio') {
    typeKey = 'audio';
    typeName = '音频';
  }

  let count = 0;
  for (const f of attachedFiles) {
    const fType = f.type === 'image' ? 'image' : f.type === 'video' ? 'video' : f.type === 'audio' ? 'audio' : 'file';
    if (fType === typeKey) {
      count++;
      if (f.path === file.path || (file.id && f.id === file.id)) {
        return `${typeName}${count}`;
      }
    }
  }
  return `${typeName}`;
}

export default function NewWorkspace({
  projectId,
  onBack,
  onOpenSettings,
  _providers = [],
  _activeProviderId,
  activeModelId,
  quickDemands = DEFAULT_QUICK_DEMANDS
}) {
  const [selectedArtifactId, setSelectedArtifactId] = useState(null);

  // 🌟 任务系统状态：每个任务独立工作流与产物
  const [activeTaskMeta, setActiveTaskMeta] = useState(null);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const isNewTaskCreationRef = useRef(null);

  const {
    workspaceContainerRef,
    isLeftSidebarOpen,
    isRightSidebarOpen,
    leftWidth,
    rightWidth,
    isDraggingLeft,
    isDraggingRight,
    setLeftWidth,
    setIsRightSidebarOpen,
    setIsDraggingLeft,
    setIsDraggingRight,
    toggleLeftSidebar,
    toggleRightSidebar
  } = useWorkspaceLayout();
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [processingTaskIds, setProcessingTaskIds] = useState({});
  const [isMockMode, setIsMockMode] = useState(false); // 真实模式为主，Mock 仅作为开发调试选项
  const [loadedAgents, setLoadedAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState(DEFAULT_SUPER_BRAIN_ID);
  const [isAgentMenuOpen, setIsAgentMenuOpen] = useState(false);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);

  // 🌟 上下文资产统一管理与淡黑层预览
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [allLibraryFiles, setAllLibraryFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [isWebBrowserOpen, setIsWebBrowserOpen] = useState(false);
  const [libRefreshTrigger, setLibRefreshTrigger] = useState(0);

  // 🌟 输入框内 @ 提及弹窗交互状态 (参考图 2)
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionItemsRef = useRef([]);

  const {
    project,
    libraries,
    tasks,
    setTasks,
    activeTaskId,
    setActiveTaskId,
    feedItems,
    setFeedItems,
    setThreadFeedItems,
    artifacts,
    setArtifacts,
    setThreadArtifacts,
    setThreadStatus,
    activeTaskStatus,
    getThreadView,
    saveTaskDetails,
    loadProjectData,
    loadTaskDetails
  } = useWorkspaceProjectData({
    projectId,
    isNewTaskCreationRef
  });

  const isProcessing = Boolean(processingTaskIds[activeTaskId]) || activeTaskStatus === 'running';
  const setTaskProcessing = (threadId, processing) => {
    if (!threadId) return;
    setProcessingTaskIds((previous) => {
      if (Boolean(previous[threadId]) === Boolean(processing)) return previous;
      const next = { ...previous };
      if (processing) next[threadId] = true;
      else delete next[threadId];
      return next;
    });
    if (processing) {
      setThreadStatus(threadId, 'running');
      setTasks((previous) => previous.map((task) => task.id === threadId
        ? { ...task, status: 'running' }
        : task));
    }
  };
  const setTaskStatus = (threadId, status) => {
    if (!threadId || !status) return;
    setThreadStatus(threadId, status);
    setTasks((previous) => previous.map((task) => task.id === threadId
      ? { ...task, status }
      : task));
  };
  const activeTaskIdRef = useRef(activeTaskId);
  useEffect(() => { activeTaskIdRef.current = activeTaskId; }, [activeTaskId]);
  const tasksRef = useRef(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  const processingTaskIdsRef = useRef(processingTaskIds);
  useEffect(() => { processingTaskIdsRef.current = processingTaskIds; }, [processingTaskIds]);
  const statusPollInFlightRef = useRef(new Set());
  const threadEventCursorsRef = useRef(new Map());
  const processSseEventRef = useRef(null);
  const abortControllersByTaskRef = useRef(new Map());

  useEffect(() => {
    return () => {
      for (const controller of abortControllersByTaskRef.current.values()) {
        try { controller.abort(); } catch {}
      }
      abortControllersByTaskRef.current.clear();
    };
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return undefined;
    const refreshRunningThreads = async () => {
      const currentTasks = tasksRef.current || [];
      const currentProcessing = processingTaskIdsRef.current || {};
      const candidates = currentTasks.filter((task) =>
        task.status === 'running' &&
        !currentProcessing[task.id] &&
        !abortControllersByTaskRef.current.has(task.id)
      );
      await Promise.all(candidates.map(async (task) => {
        if (statusPollInFlightRef.current.has(task.id) || abortControllersByTaskRef.current.has(task.id)) return;
        statusPollInFlightRef.current.add(task.id);
        try {
          const response = await apiFetch(`/api/projects/${projectId}/threads/${task.id}`);
          if (!response.ok) return;
          const { thread } = await response.json();
          const turnId = thread?.activeTurnId || thread?.lastTurnId;
          if (turnId && !abortControllersByTaskRef.current.has(task.id)) {
            const cursorKey = `${task.id}:${turnId}`;
            const sinceSeq = threadEventCursorsRef.current.get(cursorKey) ?? -1;
            const eventResponse = await apiFetch(
              `/api/projects/${projectId}/threads/${task.id}/events?turnId=${encodeURIComponent(turnId)}&sinceSeq=${sinceSeq}`
            );
            if (eventResponse.ok && !abortControllersByTaskRef.current.has(task.id)) {
              const { events = [] } = await eventResponse.json();
              for (const event of events) {
                if (abortControllersByTaskRef.current.has(task.id)) break;
                processSseEventRef.current?.(event.type, {
                  ...(event.payload && typeof event.payload === 'object' ? event.payload : {}),
                  turnId,
                  eventSeq: event.seq
                }, task.id);
              }
            }
          }
          if (!thread?.status || thread.status === 'running') return;
          setTaskStatus(task.id, thread.status);
          if (thread.status === 'completed' || thread.status === 'waiting_user') {
            await loadProjectData();
            await loadTaskDetails(task.id, { force: true });
          }
        } catch (error) {
          console.warn('刷新后台任务状态失败:', error);
        } finally {
          statusPollInFlightRef.current.delete(task.id);
        }
      }));
    };

    refreshRunningThreads();
    const timer = setInterval(refreshRunningThreads, THREAD_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [projectId, loadProjectData, loadTaskDetails]);

  const currentTask = useMemo(() => {
    if (!activeTaskId) return null;
    return tasks.find(t => t.id === activeTaskId) || (activeTaskMeta?.id === activeTaskId ? activeTaskMeta : null) || { id: activeTaskId, title: '创作任务' };
  }, [tasks, activeTaskId, activeTaskMeta]);

  const agentMenuRef = useRef(null);
  const mentionMenuRef = useRef(null);
  const promptInputRef = useRef(null);
  const activeAgentByThreadRef = useRef(new Map());

  const persistThreadView = (threadId) => {
    const view = getThreadView(threadId);
    if (view) saveTaskDetails(threadId, view.feedItems || [], view.artifacts || []);
  };

  // 🌟 点击常用需求按钮自动填充对话框并聚焦
  const handleApplyQuickDemand = (promptText) => {
    if (!promptText) return;
    setInput(promptText);
    if (promptInputRef.current) {
      promptInputRef.current.focus();
    }
  };

  // 点击外部收起智能体菜单与 @ 提及菜单
  useEffect(() => {
    function handleClickOutside(e) {
      if (agentMenuRef.current && !agentMenuRef.current.contains(e.target)) {
        setIsAgentMenuOpen(false);
      }
      if (mentionMenuRef.current && !mentionMenuRef.current.contains(e.target)) {
        setMentionOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 开发环境下自动同步并持久化后端的 mock/config.json 配置状态
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    apiFetch('/api/system/mock-config')
      .then(res => res.json())
      .then(data => {
        if (data?.config?.enabled !== undefined) {
          setIsMockMode(Boolean(data.config.enabled));
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleMock = async () => {
    const next = !isMockMode;
    setIsMockMode(next);
    try {
      await apiFetch('/api/system/mock-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next })
      });
    } catch (e) {
      console.warn('同步 Mock 配置失败:', e);
    }
    toast.info(next ? '⚡ 已切换为 Mock 数据隔离环境 (已持久化至 mock/config.json)' : '🌐 已切换为真实大模型与本地工具直连 (已持久化至 mock/config.json)');
  };

  // 严格的数据与 UI 分离：根据 isMockMode 动态切换数据提供源
  // - Mock 模式：连接 /api/mock/capabilities (提供独立的 Mock 角色与演练提示词，即便后端未实现也能在前端展现)
  // - 真实直连模式：连接 /api/capabilities (完全取自后端实际注册的智能体与工具，零死数据，零残留)
  useEffect(() => {
    let isCancelled = false;
    const loadCapabilities = async () => {
      setIsLoadingCapabilities(true);
      try {
        const endpoint = isMockMode ? '/api/mock/capabilities' : '/api/capabilities';
        const res = await apiFetch(endpoint);
        if (res.ok && !isCancelled) {
          const data = await res.json();
          const incomingAgents = data.agents || [];
          // 确保系统主脑 (Super Brain) 始终置顶，其余角色排在之后
          const sortedAgents = [...incomingAgents].sort((a, b) => {
            if (a.id === DEFAULT_SUPER_BRAIN_ID) return -1;
            if (b.id === DEFAULT_SUPER_BRAIN_ID) return 1;
            return (a.name || a.id).localeCompare(b.name || b.id, 'zh-CN');
          });
          setLoadedAgents(sortedAgents);
          setSelectedAgentId(prev => {
            if (prev && sortedAgents.some(a => a.id === prev)) {
              return prev;
            }
            const hasSuperBrain = sortedAgents.some(a => a.id === DEFAULT_SUPER_BRAIN_ID);
            return hasSuperBrain ? DEFAULT_SUPER_BRAIN_ID : (sortedAgents[0]?.id || DEFAULT_SUPER_BRAIN_ID);
          });
        }
      } catch (err) {
        console.warn(`[NewWorkspace] 加载能力清单异常 (${isMockMode ? 'Mock' : 'Real'}):`, err);
      } finally {
        if (!isCancelled) setIsLoadingCapabilities(false);
      }
    };

    loadCapabilities();
    return () => { isCancelled = true; };
  }, [isMockMode]);

  const currentAgent = useMemo(() => {
    return loadedAgents.find(a => a.id === selectedAgentId) ||
      loadedAgents.find(a => a.id === DEFAULT_SUPER_BRAIN_ID) ||
      loadedAgents[0] ||
      { id: DEFAULT_SUPER_BRAIN_ID, name: 'Super Brain', role: '参谋总长', avatar: '🧠' };
  }, [loadedAgents, selectedAgentId]);

  // 2. 核心 SSE 消息处理器 (将后端细粒度事件转化为前端卡片流)
  const processSseEvent = (eventType, payload, threadId = activeTaskIdRef.current) => {
    if (Number.isInteger(payload?.eventSeq) && payload?.turnId) {
      const cursorKey = `${threadId}:${payload.turnId}`;
      const current = threadEventCursorsRef.current.get(cursorKey) ?? -1;
      if (payload.eventSeq <= current) return;
      threadEventCursorsRef.current.set(cursorKey, payload.eventSeq);
    }

    const activeAgent = activeAgentByThreadRef.current.get(threadId) || null;
    switch (eventType) {
      // 智能体登场
      case STREAM_EVENT_TYPES.AGENT_START: {
        activeAgentByThreadRef.current.set(threadId, payload);
        setThreadFeedItems(threadId, prev => applyTimelineEvent(prev, eventType, payload));
        break;
      }

      // 步骤生命周期统一由时间线投影器归并；网络事件不直接变成 UI 卡片
      case STREAM_EVENT_TYPES.STEP_START: {
        setThreadFeedItems(threadId, prev => applyTimelineEvent(prev, eventType, payload, {
          agentId: activeAgent?.agentId || null
        }));
        break;
      }

      // 实时日志/思考流分片与步骤结束更新同一条时间线项目
      case STREAM_EVENT_TYPES.STEP_LOG: {
        setThreadFeedItems(threadId, prev => applyTimelineEvent(prev, eventType, payload));
        break;
      }

      case STREAM_EVENT_TYPES.STEP_END: {
        setThreadFeedItems(threadId, prev => applyTimelineEvent(prev, eventType, payload));
        break;
      }

      // 智能体交接 (Handoff)
      case STREAM_EVENT_TYPES.AGENT_HANDOFF: {
        setThreadFeedItems(threadId, prev => applyTimelineEvent(prev, eventType, payload));
        break;
      }

      // 产物生成并推入信息流与侧边栏
      case STREAM_EVENT_TYPES.ARTIFACT_PUBLISH: {
        const art = payload.artifact;
        setThreadArtifacts(threadId, prev => {
          const exists = prev.some(a => a.id === art.id);
          if (exists) return prev.map(a => a.id === art.id ? art : a);
          return [art, ...prev];
        });
        if (threadId === activeTaskIdRef.current) setSelectedArtifactId(art.id);

        setThreadFeedItems(threadId, prev => applyTimelineEvent(prev, eventType, payload));
        break;
      }

      // 系统级诊断预警 / 护栏干预卡片
      case STREAM_EVENT_TYPES.SYSTEM_ALERT: {
        setThreadFeedItems(threadId, prev => applyTimelineEvent(prev, eventType, payload));
        break;
      }

      // 人机协同决策卡片挂起 (将活跃智能体置为 waiting_decision)
      case STREAM_EVENT_TYPES.DECISION_REQUEST: {
        setThreadFeedItems(threadId, prev => applyTimelineEvent(prev, eventType, payload));
        break;
      }

      // 决策完成广播 (恢复智能体卡片为 running)
      case STREAM_EVENT_TYPES.DECISION_RESOLVE: {
        setThreadFeedItems(threadId, prev => applyTimelineEvent(prev, eventType, payload));
        break;
      }

      // 重新打开决策卡片进行调整
      case STREAM_EVENT_TYPES.DECISION_REOPEN: {
        setThreadFeedItems(threadId, prev => applyTimelineEvent(prev, eventType, payload));
        break;
      }

      // 正文打字机文本
      case STREAM_EVENT_TYPES.TEXT_DELTA: {
        const internalOutput = activeAgent?.visibility === 'internal';
        setThreadFeedItems(threadId, prev => applyTimelineEvent(
          prev,
          internalOutput ? 'agent_text_delta' : eventType,
          internalOutput ? {
            ...payload,
            agentId: activeAgent.agentId,
            agentName: activeAgent.agentName,
            agentRole: activeAgent.agentRole,
            goal: activeAgent.goal,
            activityId: activeAgent.activityId || `${payload.turnId || activeAgent.turnId || 'turn'}:${activeAgent.agentId}`
          } : payload,
          { agentId: activeAgent?.agentId || null }
        ));
        break;
      }

      // 后端发送的阶段完成/终态 done 事件 (保证最终文本同步，若尾部无正文气泡则自动追加)
      case 'done': {
        setThreadFeedItems(threadId, prev => applyTimelineEvent(prev, eventType, payload, {
          agentId: activeAgent?.agentId || null
        }));
        break;
      }

      // 会话结束 (释放思考与执行状态，保底呈现终态正文)
      case STREAM_EVENT_TYPES.STREAM_DONE: {
        setThreadFeedItems(threadId, prev => applyTimelineEvent(prev, eventType, payload, {
          agentId: activeAgent?.agentId || null
        }));
        setTaskProcessing(threadId, false);
        setTaskStatus(threadId, payload.status === 'waiting_decision' ? 'waiting_user' : 'completed');
        break;
      }

      case STREAM_EVENT_TYPES.STREAM_ERROR:
      case 'error': {
        setThreadFeedItems(threadId, prev => applyTimelineEvent(prev, eventType, payload, {
          agentId: activeAgent?.agentId || null
        }));
        setTaskProcessing(threadId, false);
        setTaskStatus(threadId, 'failed');
        break;
      }

      default:
        break;
    }
  };

  useEffect(() => {
    processSseEventRef.current = processSseEvent;
  });

  // Restore the latest turn's internal work details when reopening a task,
  // including turns that already completed while this workspace was closed.
  useEffect(() => {
    if (
      !projectId ||
      !activeTaskId ||
      statusPollInFlightRef.current.has(activeTaskId) ||
      abortControllersByTaskRef.current.has(activeTaskId)
    ) {
      return;
    }
    let cancelled = false;
    const restoreLatestTurnEvents = async () => {
      statusPollInFlightRef.current.add(activeTaskId);
      try {
        const threadResponse = await apiFetch(`/api/projects/${projectId}/threads/${activeTaskId}`);
        if (!threadResponse.ok || cancelled || abortControllersByTaskRef.current.has(activeTaskId)) return;
        const { thread } = await threadResponse.json();
        const turnId = thread?.activeTurnId || thread?.lastTurnId;
        if (!turnId || cancelled || abortControllersByTaskRef.current.has(activeTaskId)) return;

        const cursorKey = `${activeTaskId}:${turnId}`;
        const sinceSeq = threadEventCursorsRef.current.get(cursorKey) ?? -1;
        const eventResponse = await apiFetch(
          `/api/projects/${projectId}/threads/${activeTaskId}/events?turnId=${encodeURIComponent(turnId)}&sinceSeq=${sinceSeq}`
        );
        if (!eventResponse.ok || cancelled || abortControllersByTaskRef.current.has(activeTaskId)) return;
        const { events = [] } = await eventResponse.json();
        for (const event of events) {
          if (cancelled || abortControllersByTaskRef.current.has(activeTaskId)) break;
          processSseEventRef.current?.(event.type, {
            ...(event.payload && typeof event.payload === 'object' ? event.payload : {}),
            turnId,
            eventSeq: event.seq
          }, activeTaskId);
        }
      } catch (error) {
        console.warn('恢复任务事件失败:', error);
      } finally {
        statusPollInFlightRef.current.delete(activeTaskId);
      }
    };

    restoreLatestTurnEvents();
    return () => { cancelled = true; };
  }, [projectId, activeTaskId]);

  // 3. 运行 Mock 场景剧本
  const startMockStream = async ({ targetTaskId = null, resumeFromDecision = false, decisionOptionId = null, steeringNotes = '', attachedFiles: currentAttachments = [] } = {}) => {
    const threadId = targetTaskId || activeTaskId || project?.activeThreadId || 'main';
    if (abortControllersByTaskRef.current.has(threadId)) return;
    setTaskProcessing(threadId, true);
    const abortController = new AbortController();
    abortControllersByTaskRef.current.set(threadId, abortController);

    try {
      const res = await apiFetch(`/api/projects/${projectId}/threads/${threadId}/mock-scenario/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeFromDecision,
          decisionOptionId,
          steeringNotes,
          attachedFiles: currentAttachments
        }),
        signal: abortController.signal
      });

      if (!res.ok) {
        toast.error('连接 Mock 场景服务失败');
        setTaskProcessing(threadId, false);
        setTaskStatus(threadId, 'failed');
        processSseEvent(STREAM_EVENT_TYPES.STREAM_ERROR, { code: 'MOCK_ERROR', message: '连接 Mock 场景服务失败' }, threadId);
        return;
      }

      await consumeJsonEventStream(res, (eventType, payload) => processSseEvent(eventType, payload, threadId));
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error(err);
        toast.error('流式传输中断: ' + err.message);
        setTaskStatus(threadId, 'failed');
        processSseEvent(STREAM_EVENT_TYPES.STREAM_ERROR, { code: 'STREAM_ERROR', message: err.message }, threadId);
      }
    } finally {
      if (abortControllersByTaskRef.current.get(threadId) === abortController) {
        abortControllersByTaskRef.current.delete(threadId);
      }
      setTaskProcessing(threadId, false);
      persistThreadView(threadId);
    }
  };

  // 4.1 通用动作执行总线 (执行产物绑定的 Tool Call / API Action)
  const handleExecuteAction = async (action, artifact) => {
    if (!action) return;

    if (action.type === 'link' && action.url) {
      window.open(action.url, '_blank');
      return;
    }

    try {
      const toolName = action.tool;
      if (!toolName) {
        toast.info(action.label || '操作已触发');
        return;
      }

      const res = await apiFetch(`/api/projects/${projectId}/tools/${toolName}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          args: action.args || { draftName: project?.title || '未命名工程' },
          artifactId: artifact?.id
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(json.message || `操作已执行: ${action.label || toolName}`);
        if (json.artifact) {
          setArtifacts(prev => {
            const idx = prev.findIndex(a => a.id === json.artifact.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = json.artifact;
              return updated;
            }
            return [...prev, json.artifact];
          });
          setFeedItems(prev => prev.map(item => {
            if ((item.itemType === 'artifact_result' || item.itemType === 'artifact_notification') && item.artifact?.id === json.artifact.id) {
              return { ...item, artifact: json.artifact };
            }
            return item;
          }));
        }
      } else {
        toast.error(`操作失败: ${json.error || json.message || '未知错误'}`);
      }
    } catch (e) {
      toast.error(`调用工具网络异常: ${e.message}`);
    }
  };

  // 4.2 真实大模型/智能体执行流
  const startRealStream = async (targetTaskId, promptText, currentAttachments = [], targetAgentId = null, { internalPrompt = false } = {}) => {
    const threadId = targetTaskId || activeTaskId || project?.activeThreadId || 'main';
    if (abortControllersByTaskRef.current.has(threadId)) return;
    setTaskProcessing(threadId, true);
    const abortController = new AbortController();
    abortControllersByTaskRef.current.set(threadId, abortController);

    try {
      const res = await apiFetch(`/api/projects/${projectId}/threads/${threadId}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          agentId: targetAgentId || selectedAgentId || DEFAULT_SUPER_BRAIN_ID,
          model: activeModelId || undefined,
          enableThinking: true,
          attachedFiles: currentAttachments,
          internalPrompt
        }),
        signal: abortController.signal
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 409) {
          toast.info(err.error?.message || '该任务已有执行正在运行');
          return;
        }
        const errorMsg = err.message || err.error?.message || err.error || '请求异常';
        toast.error(`调用失败: ${errorMsg}`);
        setTaskProcessing(threadId, false);
        setTaskStatus(threadId, 'failed');
        processSseEvent(STREAM_EVENT_TYPES.STREAM_ERROR, { code: 'HTTP_ERROR', message: errorMsg }, threadId);
        return;
      }

      await consumeJsonEventStream(res, (eventType, payload) => processSseEvent(eventType, payload, threadId));
    } catch (err) {
      if (err.name === 'AbortError') {
        // 用户主动取消生成，静默处理
      } else if (err instanceof TypeError || /fetch|network|ECONNREFUSED/i.test(err.message)) {
        // 网络层失败：后端不可达 / 正在重启
        console.warn('[stream] 网络连接中断，尝试自动检测恢复...', err.message);
        toast.warning('后端服务连接中断，正在自动检测恢复...');
        setTaskStatus(threadId, 'failed');
        processSseEvent(STREAM_EVENT_TYPES.STREAM_ERROR, { code: 'NETWORK_ERROR', message: '后端服务连接中断: ' + err.message }, threadId);
        const recovered = await waitForBackend({ timeoutMs: 8000 });
        if (recovered) {
          toast.info('后端服务已恢复，请重新发送消息');
        } else {
          toast.error('后端服务未能恢复，请检查服务是否正常运行');
        }
      } else {
        // 其他未知业务异常（保留原始信息辅助调试）
        console.error('[stream] 未预期的流式调用异常:', err);
        toast.error('流式调用异常: ' + err.message);
        setTaskStatus(threadId, 'failed');
        processSseEvent(STREAM_EVENT_TYPES.STREAM_ERROR, { code: 'UNEXPECTED_ERROR', message: err.message }, threadId);
      }
    } finally {
      if (abortControllersByTaskRef.current.get(threadId) === abortController) {
        abortControllersByTaskRef.current.delete(threadId);
      }
      setTaskProcessing(threadId, false);
      persistThreadView(threadId);
    }
  };

  // 4.3 用户在输入框发送消息
  const handleSendPrompt = async (promptText, options = {}) => {
    const text = (promptText !== undefined ? promptText : input).trim();
    if (!text && attachedFiles.length === 0) return;
    if (isProcessing) return;

    const targetAgentId = options.targetAgentId || options.agentId || selectedAgentId || DEFAULT_SUPER_BRAIN_ID;

    // 固化并清空当前的附加文件列表 (附带精确 tag 映射，确保大模型无缝识别 @视频1 等代号)
    const currentAttachments = attachedFiles.map(f => ({
      ...f,
      tag: f.tag || getFileMentionLabel(f, attachedFiles)
    }));

    setInput('');
    setAttachedFiles([]);
    setMentionOpen(false);

    let targetTaskId = activeTaskId;

    // 🌟 用户约定：第一次发送信息可以自动建一个任务，不用加手动创建任务按钮
    if (!targetTaskId) {
      const generatedTitle = text
        ? (text.length > 20 ? text.slice(0, 20) + '...' : text)
        : (currentAttachments.length > 0 ? `引用: ${currentAttachments[0].name}` : '新创作任务');

      try {
        const createRes = await apiFetch(`/api/projects/${projectId}/threads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: generatedTitle,
            agentId: selectedAgentId
          })
        });
        if (createRes.ok) {
          const createJson = await createRes.json();
          const newTask = createJson.data || createJson.thread;
          if (newTask && newTask.id) {
            targetTaskId = newTask.id;
            isNewTaskCreationRef.current = newTask.id;
            setActiveTaskMeta(newTask);
            setActiveTaskId(newTask.id);
            setTasks(prev => {
              if (prev.some(t => t.id === newTask.id)) return prev;
              return [...prev, newTask];
            });
          }
        }
      } catch (err) {
        console.error('自动创建任务失败:', err);
      }
    }

    if (!targetTaskId) {
      toast.error('创建任务异常，请重试');
      return;
    }

    // 追加用户消息卡片 (完整记录附带的附件列表，以便在时间线上沉淀可检视)
    // 同时清理上一轮遗留的非终态标记（如上一轮异常中断），确保旧回合状态彻底终结
    setThreadFeedItems(targetTaskId, prev => {
      const sanitizedPrev = (prev || []).map(item => {
        if (item.status === 'running' || item.isThinking) {
          return {
            ...item,
            status: item.status === 'running' ? 'failed' : item.status,
            isThinking: false
          };
        }
        return item;
      });
      return [
        ...sanitizedPrev,
        {
          id: `user_${Date.now()}`,
          itemType: 'user_message',
          content: text || (currentAttachments.length > 0 ? `[发送了 ${currentAttachments.length} 个资产资源: ${currentAttachments.map(f => f.name).join(', ')}]` : ''),
          attachedFiles: currentAttachments
        }
      ];
    });

    // 若处于开发期 Mock 模式，启动全真多智能体场景演练；否则调用真实流
    if (import.meta.env.DEV && isMockMode) {
      startMockStream({ targetTaskId, resumeFromDecision: false, attachedFiles: currentAttachments });
    } else {
      startRealStream(targetTaskId, text, currentAttachments, targetAgentId);
    }
  };

  // 5. 用户在 HITL 卡片上做出选择并恢复执行 (支持创作者补充微调要求)
  const handleResolveDecision = async (decisionId, selectedOptionId, steeringNotes = '') => {
    const threadId = activeTaskId || project?.activeThreadId || 'main';
    if (import.meta.env.DEV && isMockMode) {
      await startMockStream({
        targetTaskId: threadId,
        resumeFromDecision: true,
        decisionOptionId: selectedOptionId,
        steeringNotes
      });
    } else {
      try {
        const res = await apiFetch(`/api/projects/${projectId}/threads/${threadId}/decision/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decisionId, selectedOptionId, steeringNotes })
        });
        const json = await res.json();
        if (json.success) {
          processSseEvent(STREAM_EVENT_TYPES.DECISION_RESOLVE, {
            decisionId,
            selectedOptionId,
            selectedLabel: json.selectedLabel,
            steeringNotes
          }, threadId);
          toast.success(`已选定方案: ${json.selectedLabel}`);
          const prompt = steeringNotes?.trim() 
            ? `【创作者决策已确认】选择方案：${json.selectedLabel}。补充微调要求：${steeringNotes.trim()}。请严格基于此决策与要求继续推进任务。`
            : `【创作者决策已确认】选择方案：${json.selectedLabel}。请基于已确认的决策方案继续推进任务。`;
          await startRealStream(threadId, prompt, [], null, { internalPrompt: true });
        } else {
          toast.error(json.error || '提交决策失败');
        }
      } catch (err) {
        toast.error('决策提交异常: ' + err.message);
      }
    }
  };

  // 5.1 重新评估/打开已决的人机协同决策卡
  const handleReopenDecision = (decisionId) => {
    const threadId = activeTaskId || project?.activeThreadId || 'main';
    processSseEvent(STREAM_EVENT_TYPES.DECISION_REOPEN, { decisionId }, threadId);
    toast.info('已开启重新决策，可调整方案或补充微调要求');
  };

  // 6. 任务删除逻辑 (带二次确认)
  const handleDeleteTask = async (taskId) => {
    if (!taskId || !projectId) return;
    if (processingTaskIds[taskId]) {
      toast.info('任务仍在后台运行，请等待完成后再删除');
      return;
    }
    try {
      const res = await apiFetch(`/api/projects/${projectId}/threads/${taskId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        toast.success('已删除任务');
        setTasks(prev => prev.filter(t => t.id !== taskId));
        if (activeTaskId === taskId) {
          setThreadFeedItems(taskId, []);
          setThreadArtifacts(taskId, []);
          setActiveTaskId(null);
        }
      } else {
        toast.error('删除任务失败');
      }
    } catch (err) {
      toast.error('删除任务网络异常: ' + err.message);
    } finally {
      setTaskToDelete(null);
    }
  };

  // ── 7. 🌟 附件与 @ 提及核心逻辑 (精确匹配参考图 1/2/3 结构) ────────────

  // 资料库卡片【添加至对话框】按钮点击：纯净挂载至上下文资产栏
  const handleAddAssetToPrompt = (file) => {
    if (!file) return;

    setAttachedFiles(prev => {
      if (prev.some(f => f.path === file.path)) return prev;
      return [...prev, file];
    });

    if (promptInputRef.current) {
      promptInputRef.current.focus();
    }
  };

  // 移除上下文资产栏中的某个文件
  const handleRemoveAttachment = (fileToRemove) => {
    setAttachedFiles(prev => prev.filter(f => f.path !== fileToRemove.path));
  };

  // 监听输入框打字以动态触发 @ 提及弹窗
  const handleInputChange = (e) => {
    const val = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInput(val);

    // 检查光标前紧贴的是否为 @
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s]*)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1] || '');
      setMentionOpen(true);
      setMentionIndex(0);
    } else {
      setMentionOpen(false);
    }
  };

  useEffect(() => {
    const inputEl = promptInputRef.current;
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    const maxHeight = 176;
    const nextHeight = Math.min(Math.max(inputEl.scrollHeight, 38), maxHeight);
    inputEl.style.height = `${nextHeight}px`;
    inputEl.style.overflowY = inputEl.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [input]);

  // 从 @ 菜单中选定素材或专家
  const handleSelectMention = (file) => {
    if (!file) return;

    // 若选中的是专家角色，切换当前负责智能体并提示
    if (file.type === 'agent' || file.isAgent) {
      setSelectedAgentId(file.id);
      toast.info(`已切换负责智能体为【${file.name}】`);

      const inputEl = promptInputRef.current;
      if (inputEl) {
        const cursorPos = inputEl.selectionStart ?? input.length;
        const textBefore = input.slice(0, cursorPos);
        const atMatch = textBefore.match(/@([^\s]*)$/);
        if (atMatch) {
          const startOfAt = cursorPos - atMatch[0].length;
          const nextInput = input.slice(0, startOfAt) + input.slice(cursorPos);
          setInput(nextInput);
        }
        setTimeout(() => {
          inputEl.focus();
        }, 0);
      }
      setMentionOpen(false);
      return;
    }

    // 选定素材资产：归入统一附件栏，并在光标处插入 @代号 (如 @视频1 )
    const exists = attachedFiles.some(f => f.path === file.path);
    const nextFiles = exists ? attachedFiles : [...attachedFiles, file];
    if (!exists) {
      setAttachedFiles(nextFiles);
    }

    const mentionLabel = getFileMentionLabel(file, nextFiles);
    const tokenToInsert = `@${mentionLabel} `;

    const inputEl = promptInputRef.current;
    if (inputEl) {
      const cursorPos = inputEl.selectionStart ?? input.length;
      const textBefore = input.slice(0, cursorPos);
      const atMatch = textBefore.match(/@([^\s]*)$/);
      if (atMatch) {
        const startOfAt = cursorPos - atMatch[0].length;
        const nextInput = input.slice(0, startOfAt) + tokenToInsert + input.slice(cursorPos);
        setInput(nextInput);
        setTimeout(() => {
          inputEl.focus();
          const newPos = startOfAt + tokenToInsert.length;
          inputEl.setSelectionRange(newPos, newPos);
        }, 0);
      }
    }

    setMentionOpen(false);
  };

  // 键盘快捷处理：@ 菜单上下选择与回车确认，以及退格键删除资产卡片
  const handleInputKeyDown = (e) => {
    // 1. @ 弹窗打开时的键盘导航
    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => Math.min(prev + 1, Math.max(0, mentionItemsRef.current.length - 1)));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => Math.max(0, prev - 1));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        if (e.nativeEvent?.isComposing || e.nativeEvent?.keyCode === 229) return;
        const selectedItem = mentionItemsRef.current[
          Math.min(mentionIndex, Math.max(0, mentionItemsRef.current.length - 1))
        ];
        if (selectedItem) {
          e.preventDefault();
          handleSelectMention(selectedItem);
          return;
        }
      }
    }

    // Enter 发送；Shift+Enter 换行 (输入法组合中不拦截)
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent?.isComposing || e.nativeEvent?.keyCode === 229) return;
      e.preventDefault();
      handleSendPrompt();
      return;
    }

    // 2. 如果输入框为空且按下退格键，快速删除最后一个附件资产 (统一流畅交互)
    if (e.key === 'Backspace' && (!input || input === '') && attachedFiles.length > 0) {
      e.preventDefault();
      const last = attachedFiles[attachedFiles.length - 1];
      handleRemoveAttachment(last);
    }
  };

  return (
    <div className="h-full w-full bg-[#080B10] flex flex-col font-sans select-none overflow-hidden text-slate-200">
      {/* ── 顶部操作栏 (Header Bar) ─────────────────────────────────── */}
      <header className="h-13 border-b border-slate-800/80 bg-slate-950/90 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回大盘</span>
          </button>

          <span className="text-slate-700">|</span>

          <h2 className="text-sm font-bold text-slate-100">
            {project?.title || '多智能体协作工作台'}
          </h2>
        </div>

        {/* 顶部右侧控制群 */}
        <div className="flex items-center gap-2">
          {/* 开发期专属：Mock 开关胶囊 (仅在 DEV 模式渲染，通过持久化 mock/config.json 切换，生产构建自动移除) */}
          {import.meta.env.DEV && (
            <button
              onClick={handleToggleMock}
              className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 cursor-pointer transition-all ${
                isMockMode 
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm shadow-amber-500/10'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="开发期配置：切换 mock/config.json 开关，0 Token 虚拟演练与真实模型直连"
            >
              <Zap className={`w-3.5 h-3.5 ${isMockMode ? 'text-amber-400 fill-amber-400' : 'text-slate-500'}`} />
              <span>{isMockMode ? 'Mock 模式 (0 Token)' : '真实直连模式'}</span>
            </button>
          )}

          {/* 🌟 网络资料库快捷入口 (同全局资料库，支持免版税素材检索、嗅探与优先保存至项目目录) */}
          <button
            onClick={() => setIsWebBrowserOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-cyan-400 hover:text-cyan-300 bg-slate-900 hover:bg-slate-850 border border-cyan-500/30 hover:border-cyan-500/60 shadow-sm shadow-cyan-500/10 transition cursor-pointer"
            title="打开网络资料库 (Mixkit, 维基, Wallhaven, 必应壁纸等)"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>网络资料库</span>
          </button>

          <span className="text-slate-800">|</span>

          {/* VS Code 原生风格侧栏切换按钮：无背景、无外包圆角、纯图标、低对比度深色微调 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleLeftSidebar}
              className={`p-0.5 transition-colors cursor-pointer ${
                isLeftSidebarOpen
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-600 hover:text-slate-400'
              }`}
              title={`切换左侧资料库侧栏 (${isLeftSidebarOpen ? '显示中' : '已折叠'}) - Ctrl+B`}
            >
              <VscodeSidebarLeftIcon active={isLeftSidebarOpen} className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleRightSidebar}
              className={`p-0.5 transition-colors cursor-pointer ${
                isRightSidebarOpen
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-600 hover:text-slate-400'
              }`}
              title={`切换右侧产物侧栏 (${isRightSidebarOpen ? '显示中' : '已折叠'})`}
            >
              <VscodeSidebarRightIcon active={isRightSidebarOpen} className="w-4 h-4" />
            </button>
          </div>

          {/* 全局设置按钮 */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="打开系统设置中心"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── 核心工作主体：3 栏 VS Code 架构 (左侧资料库 + 中间信息流 + 右侧任务产物) ──────────── */}
      <div ref={workspaceContainerRef} className="flex-1 flex overflow-hidden relative">
        {/* ── 左栏：项目绑定资料库与本地沙箱 (可拖拽 / 可折叠) ── */}
        {isLeftSidebarOpen && (
          <>
            <ProjectLibrarySidebar
              project={project}
              libraries={libraries}
              width={leftWidth}
              refreshTrigger={libRefreshTrigger}
              onOpenProjectSettings={() => setIsProjectSettingsOpen(true)}
              onRefresh={loadProjectData}
              onAddToChat={handleAddAssetToPrompt}
              onFilesLoaded={(files) => setAllLibraryFiles(files)}
            />
            <ResizeSplitter
              isDragging={isDraggingLeft}
              onMouseDown={() => setIsDraggingLeft(true)}
              onDoubleClick={() => setLeftWidth(260)}
              title="左右拖动调整资料库宽度，往左推至边界自动收起，双击恢复默认(260px)"
            />
          </>
        )}

        {/* ── 中栏主视区：分步决策信息流 + 统一输入框 ── */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#080B10] min-w-[200px] select-text">
          {/* 中栏顶部任务导航子栏 */}
          <div className="h-10 px-3.5 border-b border-slate-800/80 bg-slate-950/70 flex items-center justify-between shrink-0 select-none">
            {activeTaskId ? (
              <>
                {/* 任务内状态：切回列表按钮 + 任务标题 */}
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTaskId(null);
                      setActiveTaskMeta(null);
                    }}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 px-2 py-1 rounded-md transition-colors cursor-pointer shrink-0"
                    title="切回任务列表"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>任务列表</span>
                  </button>

                  <span className="text-slate-700">/</span>

                  <span className="text-xs font-semibold text-slate-200 truncate max-w-[240px]" title={currentTask?.title || '创作任务'}>
                    {currentTask?.title || '创作任务'}
                  </span>

                  {isProcessing && (
                    <span className="flex items-center gap-1 text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                      运行中
                    </span>
                  )}
                </div>

                {/* 右侧：删除此任务图标按钮 (带确认弹窗) */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setTaskToDelete(currentTask || { id: activeTaskId, title: '创作任务' })}
                    disabled={isProcessing}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title="删除此任务 (需确认)"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* 任务列表态：标题与统计 */}
                <div className="flex items-center gap-2">
                  <ListTodo className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-slate-200">项目任务列表</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                    {tasks.length} 个任务
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                </div>
              </>
            )}
          </div>

          {/* 中栏主体内容区 */}
          {activeTaskId ? (
            /* A. 任务详情：事件驱动信息流 */
            <TimelineFeed
              feedItems={feedItems}
              currentAgent={currentAgent}
              onResolveDecision={handleResolveDecision}
              onReopenDecision={handleReopenDecision}
              onDelegateToSuperBrain={async (decision) => {
                const optionsText = (decision.options || []).map(o => `${o.label}${o.description ? ` (${o.description})` : ''}`).join('；');
                const promptText = `请帮我评估当前挂起的人机协同决策：【${decision.prompt}】。\n候选方案：${optionsText}。\n请对比各方案优劣并做出决策。`;
                await handleSendPrompt(promptText, { targetAgentId: DEFAULT_SUPER_BRAIN_ID });
              }}
              onSelectArtifact={(artId) => {
                setSelectedArtifactId(artId);
                setIsRightSidebarOpen(true);
              }}
              onExecuteAction={handleExecuteAction}
              onPreviewFile={(file) => setPreviewFile(file)}
              isProcessing={isProcessing}
              taskStatus={activeTaskStatus}
            />
          ) : (
            /* B. 任务大厅 / 默认初始状态 (无任务时) */
            <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-start">
              {tasks.length === 0 ? (
                /* 默认初始状态：极简居中 + 动态常用需求按钮 (灵活可配置) */
                <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8 max-w-md mx-auto space-y-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-md">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-medium text-slate-200">开始创作</h3>

                  {quickDemands && quickDemands.length > 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-2 max-w-md pt-1">
                      {quickDemands.map((demand) => (
                        <button
                          key={demand.id || demand.title}
                          type="button"
                          onClick={() => handleApplyQuickDemand(demand.prompt)}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-700/60 hover:border-indigo-500/50 text-slate-300 hover:text-indigo-200 text-xs transition-all flex items-center gap-1.5 shadow-sm hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span>{demand.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* 任务卡片列表 */
                <div className="space-y-2.5 max-w-3xl mx-auto w-full">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => setActiveTaskId(task.id)}
                      className="group p-3.5 rounded-xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-indigo-500/40 transition-all cursor-pointer flex items-center justify-between gap-3 shadow-sm hover:shadow-indigo-500/5"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-100 group-hover:text-indigo-300 transition-colors truncate">
                            {task.title || '未命名任务'}
                          </span>
                          {task.status === 'running' && (
                            <span className="shrink-0 text-[10px] text-indigo-300">后台处理中</span>
                          )}
                          {task.status === 'waiting_user' && (
                            <span className="shrink-0 text-[10px] text-amber-300">等待你的决定</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          {task.updatedAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-600" />
                              <span>{new Date(task.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-slate-400">
                            <Package className="w-3 h-3 text-slate-500" />
                            <span>{(task.artifacts?.length || 0)} 件产物</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* 删除该任务按钮 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTaskToDelete(task);
                          }}
                          disabled={task.status === 'running'}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors opacity-70 group-hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="删除此任务 (需确认)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 底部动作输入区：宽度严格对齐中栏最大阅读流宽度 (max-w-4xl mx-auto)，悬浮居中 */}
          <div className="w-full max-w-4xl mx-auto px-4 md:px-6 pb-4 pt-1 shrink-0">
            {/* 输入框与附件整体卡片：微内凹下沉质感 (Subtle Recessed/Inset Well)，无浮雕凸起、无发雾、输入保持中性 */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendPrompt();
              }}
              className="relative bg-[#080B12] border border-white/[0.07] hover:border-white/[0.12] focus-within:border-white/[0.18] rounded-2xl shadow-[inset_0_2px_4px_rgba(0,0,0,0.5),inset_0_1px_2px_rgba(0,0,0,0.35)] px-3.5 pt-2 pb-2 flex flex-col gap-1.5 overflow-visible transition-colors duration-150"
            >
              {/* 🌟 用户指定参考图 2：@ 提及素材/专家弹窗 (Tab 栏 + 正方形微缩封面 + 双行文件名/路径) */}
              <div ref={mentionMenuRef}>
                <MentionPopover
                  isOpen={mentionOpen}
                  query={mentionQuery}
                  attachedFiles={attachedFiles}
                  libraryFiles={allLibraryFiles}
                  agents={loadedAgents}
                  activeIndex={mentionIndex}
                  itemsRef={mentionItemsRef}
                  onSelect={handleSelectMention}
                  onClose={() => setMentionOpen(false)}
                />
              </div>

              {/* 🌟 1. 上附件栏 (有附件时显示) + 淡淡的分隔线 (紧凑利落对齐卡片内边距) */}
              {attachedFiles.length > 0 && (
                <div>
                  <PromptAttachmentBar
                    files={attachedFiles}
                    onRemove={handleRemoveAttachment}
                    onPreview={(file) => setPreviewFile(file)}
                  />
                  <div className="border-b border-white/[0.08] mt-1 mb-0.5" />
                </div>
              )}

              {/* 🌟 2. 可换行自然文本输入 */}
              <div className="flex flex-col gap-1.5 min-h-[38px]">
                <textarea
                  ref={promptInputRef}
                  rows={1}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleInputKeyDown}
                  placeholder={
                    isProcessing 
                      ? "智能体团队正在协同执行中..." 
                      : attachedFiles.length > 0 
                        ? "输入针对当前资产的创作指令，Enter 发送，Shift+Enter 换行..."
                        : "与智能体协作，键入 @ 引用素材或专家；Enter 发送，Shift+Enter 换行..."
                  }
                  disabled={isProcessing || !currentAgent}
                  className="w-full min-h-[38px] max-h-44 bg-transparent py-1 text-[14px] leading-6 text-slate-100 placeholder-slate-500 focus:outline-none resize-none overflow-y-auto"
                />
              </div>

              {/* 🌟 3. 底部栏 (左侧无背景无边框选项 + 右侧纯图标圆形发送按钮) */}
              <div className="flex items-center justify-between pt-0.5">
                {/* 智能体角色快速指派下拉菜单：无边框无背景极简风格 */}
                <div className="relative" ref={agentMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsAgentMenuOpen(!isAgentMenuOpen)}
                    disabled={isProcessing || loadedAgents.length === 0}
                    className="px-2 py-1 rounded-md text-slate-300 hover:text-slate-100 hover:bg-white/[0.06] text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-40 group"
                    title="指派负责的主控智能体"
                  >
                    <AgentAvatar avatar={currentAgent?.avatar} className="text-xs" />
                    <span className="font-medium max-w-[100px] truncate text-slate-200 group-hover:text-white">
                      {currentAgent?.role || currentAgent?.title || currentAgent?.name || (isLoadingCapabilities ? '加载中...' : '无智能体')}
                    </span>
                    <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-200 transition-colors" />
                  </button>

                  {isAgentMenuOpen && loadedAgents.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl bg-[#161822] border border-white/[0.10] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),_0_16px_40px_rgba(0,0,0,0.6)] p-1.5 z-50 space-y-0.5 animate-in fade-in zoom-in-95 duration-150">
                      <div className="text-[10px] font-mono text-slate-400 px-2 py-1 font-semibold uppercase flex items-center justify-between border-b border-white/[0.06] mb-1">
                        <span>{isMockMode ? 'MOCK AGENTS' : 'REGISTERED AGENTS'}</span>
                        <span>({loadedAgents.length})</span>
                      </div>
                      <div className="max-h-56 overflow-y-auto space-y-0.5">
                        {loadedAgents.map((ag) => {
                          const isSelected = selectedAgentId === ag.id;
                          const isSuperBrain = ag.id === DEFAULT_SUPER_BRAIN_ID;
                          return (
                            <button
                              key={ag.id}
                              type="button"
                              onClick={() => {
                                setSelectedAgentId(ag.id);
                                setIsAgentMenuOpen(false);
                              }}
                              className={`w-full px-2 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-600 text-white font-medium'
                                  : isSuperBrain
                                    ? 'text-indigo-200 hover:bg-indigo-950/40 bg-indigo-950/20'
                                    : 'text-slate-300 hover:bg-white/[0.06]'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <AgentAvatar avatar={ag.avatar || (isSuperBrain ? '🧠' : null)} />
                                <span className="truncate">{ag.name}</span>
                              </div>
                              <span className="text-[10px] opacity-70 font-mono shrink-0 ml-1">
                                {isSuperBrain ? '参谋总长 · 主脑' : (ag.role || ag.title || '')}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* 纯图标圆形发送按钮：工作时或无内容时变暗不可发送 */}
                <button
                  type="submit"
                  disabled={isProcessing || (!input.trim() && attachedFiles.length === 0) || !currentAgent}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                    isProcessing || (!input.trim() && attachedFiles.length === 0) || !currentAgent
                      ? 'bg-white/[0.05] text-slate-600 opacity-40 cursor-not-allowed shadow-none'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm hover:scale-105 active:scale-95'
                  }`}
                  title={
                    isProcessing
                      ? '智能体正在工作中，暂不可发送'
                      : !input.trim()
                        ? '请输入指令内容'
                        : !currentAgent
                          ? '请先选择智能体'
                          : '发送指令 (Enter 发送，Shift+Enter 换行)'
                  }
                >
                  <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                </button>
              </div>
            </form>
          </div>
        </main>

        {/* ── 右栏：任务交付产物与深度检视器 (可拖拽 / 可折叠) ── */}
        {isRightSidebarOpen && (
          <>
            <ResizeSplitter
              isDragging={isDraggingRight}
              onMouseDown={() => setIsDraggingRight(true)}
              onDoubleClick={() => setRightWidth(340)}
              title="左右拖动调整产物区宽度，往右推至边界自动收起，双击恢复默认(340px)"
            />
            <ArtifactSidebar
              key={activeTaskId || 'task-list'}
              artifacts={artifacts}
              width={rightWidth}
              isOpen={isRightSidebarOpen}
              onToggleOpen={toggleRightSidebar}
              selectedArtifactId={selectedArtifactId}
              onSelectArtifact={(artId) => setSelectedArtifactId(artId)}
              onExecuteAction={handleExecuteAction}
            />
          </>
        )}
      </div>

      {/* 🌟 用户指定：项目专属设置弹窗 (从旧项目完整继承迁移) */}
      <ProjectSettingsModal
        isOpen={isProjectSettingsOpen}
        onClose={() => setIsProjectSettingsOpen(false)}
        project={project}
        onProjectUpdated={loadProjectData}
      />

      {/* 🌟 用户指定：淡黑 Layer 遮罩层沉浸式多模态预览 (非 Modal 窗口，点击背景或 Esc 退出) */}
      <MediaBackdropPreview
        file={previewFile}
        isOpen={!!previewFile}
        onClose={() => setPreviewFile(null)}
      />

      {/* 🌟 用户指定：网络资料库模态弹窗 (与全局资料库保持 100% 相同交互与能力，优先保存至项目绑定目录) */}
      {isWebBrowserOpen && (
        <Suspense fallback={null}>
          <WebMediaBrowserModal
            isOpen={isWebBrowserOpen}
            onClose={() => setIsWebBrowserOpen(false)}
            project={project}
            projectId={projectId}
            libraries={libraries}
            onAssetSaved={() => {
              setLibRefreshTrigger(prev => prev + 1);
              loadProjectData();
            }}
          />
        </Suspense>
      )}

      {/* 🌟 任务删除二次确认对话框 */}
      <AlertDialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)}>
        <AlertDialogContent className="bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-6 max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold text-slate-100">
              确认删除任务【{taskToDelete?.title || '未命名任务'}】？
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-400 leading-relaxed pt-1.5">
              删除后，该任务对应的工作信息流及未存入资料库的临时产物将无法恢复。绑定的项目资料库文件不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-5 flex items-center justify-end gap-2">
            <AlertDialogCancel
              onClick={() => setTaskToDelete(null)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer border-none"
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteTask(taskToDelete?.id)}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/20 transition cursor-pointer border-none"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
