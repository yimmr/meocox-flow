import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/apiClient.js';
import { restoreThreadTimeline } from '@/lib/threadSnapshot.js';

function mergeSnapshotItems(localItems = [], persistedItems = [], getKey = (item) => item?.id) {
  const merged = [...(Array.isArray(persistedItems) ? persistedItems : [])];
  const indexes = new Map();
  merged.forEach((item, index) => {
    const key = getKey(item);
    if (key != null) indexes.set(String(key), index);
  });

  for (const item of Array.isArray(localItems) ? localItems : []) {
    const key = getKey(item);
    if (key == null || !indexes.has(String(key))) {
      if (key != null) indexes.set(String(key), merged.length);
      merged.push(item);
      continue;
    }
    // Keep persisted chronology while letting the live projection supply richer state.
    const index = indexes.get(String(key));
    merged[index] = { ...merged[index], ...item };
  }
  return merged;
}

function artifactKey(artifact) {
  return artifact?.id || artifact?.path || artifact?.url || null;
}

/** Owns the project/thread data flow and persistence used by the workspace. */
export function useWorkspaceProjectData({
  projectId,
  isNewTaskCreationRef
}) {
  const [project, setProject] = useState(null);
  const [libraries, setLibraries] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activeTaskId, setActiveTaskIdState] = useState(null);
  const [isLoadingTask, setIsLoadingTask] = useState(false);
  const [threadViews, setThreadViews] = useState({});
  const activeTaskIdRef = useRef(activeTaskId);
  const threadViewsRef = useRef(threadViews);

  const setActiveTaskId = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(activeTaskIdRef.current) : next;
    activeTaskIdRef.current = resolved;
    setActiveTaskIdState(resolved);
  }, []);

  const updateThreadView = useCallback((threadId, updater) => {
    if (!threadId) return;
    const previous = threadViewsRef.current[threadId] || { feedItems: [], artifacts: [] };
    const nextView = typeof updater === 'function' ? updater(previous) : updater;
    const next = { ...threadViewsRef.current, [threadId]: nextView };
    threadViewsRef.current = next;
    setThreadViews(next);
  }, []);

  const updateThreadField = useCallback((threadId, field, updater) => {
    updateThreadView(threadId, (view) => ({
      ...view,
      [field]: typeof updater === 'function' ? updater(view[field] || []) : updater
    }));
  }, [updateThreadView]);

  const setThreadFeedItems = useCallback((threadId, updater) => {
    updateThreadField(threadId, 'feedItems', updater);
  }, [updateThreadField]);

  const setThreadArtifacts = useCallback((threadId, updater) => {
    updateThreadField(threadId, 'artifacts', updater);
  }, [updateThreadField]);

  const setFeedItems = useCallback((updater) => {
    setThreadFeedItems(activeTaskIdRef.current, updater);
  }, [setThreadFeedItems]);

  const setArtifacts = useCallback((updater) => {
    setThreadArtifacts(activeTaskIdRef.current, updater);
  }, [setThreadArtifacts]);

  const setThreadStatus = useCallback((threadId, status) => {
    updateThreadView(threadId, (view) => ({ ...view, status }));
  }, [updateThreadView]);

  const getThreadView = useCallback((threadId) => threadViewsRef.current[threadId] || null, []);

  const feedItems = threadViews[activeTaskId]?.feedItems || [];
  const artifacts = threadViews[activeTaskId]?.artifacts || [];
  const saveTaskDetails = useCallback(async (taskId, items, arts) => {
    if (!taskId || !projectId) return;
    try {
      await apiFetch(`/api/projects/${projectId}/threads/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedItems: items, artifacts: arts })
      });
    } catch (error) {
      console.warn('保存任务详情异常:', error);
    }
  }, [projectId]);

  const loadProjectData = useCallback(async () => {
    if (!projectId) return;
    try {
      const response = await apiFetch(`/api/projects/${projectId}`);
      if (response.ok) {
        const json = await response.json();
        const nextProject = json.project;
        const threadList = nextProject?.threads || [];
        setProject(nextProject);
        setTasks(threadList);
        setActiveTaskId((previous) => {
          if (previous && threadList.some((task) => task.id === previous)) return previous;
          if (nextProject?.activeThreadId && threadList.some((task) => task.id === nextProject.activeThreadId)) {
            return nextProject.activeThreadId;
          }
          return threadList[0]?.id || null;
        });
      }

      const libraryResponse = await apiFetch(`/api/projects/${projectId}/libraries`);
      if (libraryResponse.ok) {
        const json = await libraryResponse.json();
        setLibraries(json.libraries || []);
      }
    } catch (error) {
      console.error(error);
    }
  }, [projectId]);

  const loadTaskDetails = useCallback(async (taskId, { force = false } = {}) => {
    if (!taskId || !projectId) return;
    if (!force && threadViewsRef.current[taskId]) return;
    setIsLoadingTask(true);
    try {
      const response = await apiFetch(`/api/projects/${projectId}/threads/${taskId}`);
      if (response.ok) {
        const json = await response.json();
        const thread = json.thread || {};
        updateThreadView(taskId, (previous) => {
          const status = thread.status || previous.status || null;
          const restoredItems = restoreThreadTimeline({
            feedItems: mergeSnapshotItems(previous.feedItems, thread.feedItems, (item) => item?.id || item?.messageId)
              .map((item) => item.itemType === 'thinking' && item.isThinking
                ? { ...item, isThinking: false, duration: item.duration || '1.0' }
                : item),
            messages: thread.messages || [],
            pendingDecision: thread.pendingDecision || null
          });
          const feedItems = restoredItems.map((item) => {
            if (item.status !== 'running') return item;
            if (status === 'waiting_user' && item.itemType === 'agent_execution') {
              return { ...item, status: 'waiting_decision' };
            }
            if (status === 'completed' || status === 'failed') {
              if (item.itemType === 'tool_execution') {
                return { ...item, status: status === 'failed' ? 'error' : 'success' };
              }
              if (item.itemType === 'agent_execution') return { ...item, status: 'completed' };
            }
            return item;
          });

          return {
            ...previous,
            feedItems,
            artifacts: mergeSnapshotItems(previous.artifacts, thread.artifacts, artifactKey),
            messages: thread.messages || [],
            pendingDecision: thread.pendingDecision || null,
            status
          };
        });
      }
    } catch (error) {
      console.error('加载任务详情异常:', error);
    } finally {
      setIsLoadingTask(false);
    }
  }, [projectId, updateThreadView]);

  useEffect(() => {
    if (activeTaskId) {
      if (isNewTaskCreationRef.current === activeTaskId) {
        isNewTaskCreationRef.current = null;
        return;
      }
      loadTaskDetails(activeTaskId);
    }
  }, [activeTaskId, projectId, isNewTaskCreationRef, loadTaskDetails]);

  useEffect(() => {
    loadProjectData();
  }, [loadProjectData]);

  return {
    project,
    setProject,
    libraries,
    setLibraries,
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
    activeTaskStatus: threadViews[activeTaskId]?.status || null,
    getThreadView,
    isLoadingTask,
    saveTaskDetails,
    loadProjectData,
    loadTaskDetails
  };
}
