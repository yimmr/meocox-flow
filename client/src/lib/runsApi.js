import { apiFetch, apiStreamUrl } from './apiClient.js';
import { RUN_EVENT_TYPES } from '../types/runProtocol.js';

async function request(path, init) {
  const response = await apiFetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Run API request failed (${response.status})`);
  }
  return body;
}

function projectQuery(projectId, extra = '') {
  if (typeof projectId !== 'string' || !projectId.trim()) {
    throw new Error('projectId is required');
  }
  const params = new URLSearchParams({ projectId });
  if (extra !== '' && extra !== undefined && extra !== null) {
    params.set('sinceSeq', String(extra));
  }
  return params.toString();
}

/** Stable frontend facade for project Run lifecycle and event replay. */
export const runsApi = {
  listTemplates() {
    return request('/api/runs/templates');
  },

  list(projectId) {
    return request(`/api/runs?${projectQuery(projectId)}`);
  },

  create(projectId, { templateId, autonomy, driver, source } = {}) {
    return request('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, templateId, autonomy, driver, source })
    });
  },

  createFromProjectPipeline(projectId, options = {}) {
    return runsApi.create(projectId, {
      ...options,
      driver: options.driver || 'operator',
      source: 'project-pipeline'
    });
  },

  get(projectId, runId) {
    return request(`/api/runs/${encodeURIComponent(runId)}?${projectQuery(projectId)}`);
  },

  start(projectId, runId, options = {}) {
    return request(`/api/runs/${encodeURIComponent(runId)}/start?${projectQuery(projectId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
  },

  control(projectId, runId, action) {
    if (!['pause', 'resume', 'abort'].includes(action)) {
      throw new Error(`Unsupported Run action: ${action}`);
    }
    return request(`/api/runs/${encodeURIComponent(runId)}/${action}?${projectQuery(projectId)}`, {
      method: 'POST'
    });
  },

  events(projectId, runId, sinceSeq = -1) {
    return request(`/api/runs/${encodeURIComponent(runId)}/events?${projectQuery(projectId, sinceSeq)}`);
  },

  checkpoints(projectId, runId) {
    return request(`/api/runs/${encodeURIComponent(runId)}/checkpoints?${projectQuery(projectId)}`);
  },

  rollback(projectId, runId, seq) {
    return request(`/api/runs/${encodeURIComponent(runId)}/rollback?${projectQuery(projectId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seq })
    });
  },

  subscribe(projectId, runId, { sinceSeq = -1, onEvent, onReady, onError } = {}) {
    const source = new EventSource(apiStreamUrl(
      `/api/runs/${encodeURIComponent(runId)}/stream?${projectQuery(projectId, sinceSeq)}`
    ));
    for (const type of RUN_EVENT_TYPES) {
      source.addEventListener(type, (event) => {
        try {
          const payload = JSON.parse(event.data);
          onEvent?.(payload);
          if (['run.completed', 'run.failed', 'run.aborted', 'run.blocked'].includes(payload.type)) source.close();
        }
        catch (error) { onError?.(error); }
      });
    }
    source.addEventListener('stream.ready', (event) => {
      try {
        const payload = JSON.parse(event.data);
        onReady?.(payload);
        if (['completed', 'failed', 'aborted', 'paused', 'blocked'].includes(payload.status)) source.close();
      }
      catch (error) { onError?.(error); }
    });
    source.addEventListener('stream.error', (event) => {
      try { onError?.(new Error(JSON.parse(event.data).error || 'Run event stream failed')); }
      catch (error) { onError?.(error); }
    });
    source.onerror = (event) => onError?.(event);
    return () => source.close();
  }
};
