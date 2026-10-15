/**
 * RunManager:进程内「正在执行的 Run」注册表。
 *
 * 职责:
 *   - 启动/暂停/恢复/中止一次 Run(驱动 SchedulerRuntime);
 *   - 维护每个活跃 Run 的 AbortController 与 pending 事件订阅者;
 *   - 重启进程后,已落盘的事件日志仍是唯一真相源(运行中的 Run 视为中断)。
 *
 * 注意:这里只放**易失的控制句柄**;所有状态变更一律经 EventBus 落盘。
 */
import { storage } from '../../storage/index.js';
import { defaultEventBus } from '../bus/eventBus.js';
import { defaultArtifactStore } from '../artifacts/store.js';
import { defaultBlackboardStore } from '../blackboard/store.js';
import { SchedulerRuntime } from '../scheduler/runtime.js';
import { MockExecutor } from '../scheduler/executors/mockExecutor.js';
import { OperatorExecutor } from '../scheduler/executors/operatorExecutor.js';
import { loadRun } from './orchestrator.js';

/** 执行器工厂:数据可真可假,UI 不感知 */
export function resolveExecutor(kind = 'mock') {
  if (kind === 'operator') {
    return new OperatorExecutor({ storage, artifactStore: defaultArtifactStore });
  }
  return new MockExecutor();
}

class RunManager {
  constructor() {
    /** @type {Map<string, {controller:AbortController, paused:boolean, resume:Function|null, promise:Promise}>} */
    this.active = new Map();
    this.eventBus = defaultEventBus;
  }

  /** 仅允许同 projectId 的同一个 run 只能有一个执行实例 */
  _key(projectId, runId) { return `${projectId}::${runId}`; }

  isRunning(projectId, runId) { return this.active.has(this._key(projectId, runId)); }

  getActive(projectId, runId) { return this.active.get(this._key(projectId, runId)) || null; }

  /** 当前活跃 run 列表(用于 /api/runs/status) */
  listActive() {
    return [...this.active.keys()].map((k) => {
      const [projectId, runId] = k.split('::');
      const entry = this.active.get(k);
      return { projectId, runId, paused: entry.paused, startedAt: entry.startedAt };
    });
  }

  /**
   * Mark executions left in-flight by a previous process as interrupted.
   * We do not silently replay running operators because they may have external
   * side effects; users can inspect the event history and restart from a new run
   * or an explicit checkpoint rollback.
   */
  async recoverInterruptedRuns() {
    const recovered = [];
    const projects = await storage.listProjects();
    for (const project of projects) {
      const runs = await storage.listRuns(project.id);
      for (const run of runs) {
        if (!['running', 'paused'].includes(run.status) || run.id === 'run_studio_demo') continue;

        const tasks = await storage.listTasks(project.id, run.id);
        const interruptedAt = Date.now();
        for (const task of tasks) {
          if (task.status !== 'running') continue;
          task.status = 'failed';
          task.finishedAt = interruptedAt;
          task.error = {
            code: 'PROCESS_INTERRUPTED',
            message: 'Backend stopped before this task completed; it was not replayed automatically.'
          };
          await storage.saveTask(project.id, run.id, task);
        }

        run.status = 'failed';
        run.updatedAt = interruptedAt;
        await storage.saveRun(project.id, run);
        await this.eventBus.emit(project.id, run.id, {
          type: 'run.failed',
          actor: { kind: 'system', id: 'recovery' },
          payload: {
            code: 'PROCESS_INTERRUPTED',
            message: 'Backend stopped before the run completed; automatic replay was skipped.'
          }
        });
        recovered.push({ projectId: project.id, runId: run.id });
      }
    }
    return recovered;
  }

  /**
   * 启动一次 Run(后台执行,立即返回)。
   * @returns {{started:boolean, runId:string}}
   */
  start({ projectId, runId, executorKind = 'mock', concurrency = 3 }) {
    const key = this._key(projectId, runId);
    if (this.active.has(key)) return { started: false, runId, reason: 'already_running' };

    const controller = new AbortController();
    let resumeFn = null;
    const entry = {
      controller,
      paused: false,
      startedAt: Date.now(),
      start: null,
      get resume() { return resumeFn; },
      set resume(fn) { resumeFn = fn; }
    };

    entry.start = (async () => {
      const { run, tasks } = await loadRun(projectId, runId);
      const runtime = new SchedulerRuntime({
        bus: this.eventBus,
        storage,
        artifactStore: defaultArtifactStore,
        executor: resolveExecutor(executorKind),
        concurrency,
        signal: controller.signal,
        blackboard: defaultBlackboardStore
      });

      // 暂停语义:在每个事件边界插入等待点 —— 通过包装 bus 实现不侵入 runtime
      const busProxy = {
        emit: async (pId, rId, input) => {
          await this.eventBus.emit(pId, rId, input);
          while (this.active.get(key)?.paused) {
            await new Promise((r) => { this.active.get(key).resume = r; });
            if (controller.signal.aborted) break;
          }
          return null;
        }
      };
      runtime.bus = busProxy;

      return runtime.execute({ run, tasks });
    })();

    this.active.set(key, entry);
    entry.start
      .catch((err) => console.error(`[RunManager] Run ${runId} 执行异常:`, err?.message || err))
      .finally(() => this.active.delete(key));

    return { started: true, runId };
  }

  /** 暂停:等在途事件边界停下(不中断已 running 的任务) */
  pause(projectId, runId) {
    const entry = this.active.get(this._key(projectId, runId));
    if (!entry) return false;
    entry.paused = true;
    return true;
  }

  /** 恢复 */
  resume(projectId, runId) {
    const entry = this.active.get(this._key(projectId, runId));
    if (!entry) return false;
    entry.paused = false;
    const fn = entry.resume;
    entry.resume = null;
    if (fn) fn();
    return true;
  }

  /** 中止:触发 AbortSignal,runtime 会优雅收尾并 emit run.aborted */
  abort(projectId, runId) {
    const entry = this.active.get(this._key(projectId, runId));
    if (!entry) return false;
    entry.paused = false;
    const fn = entry.resume;
    entry.resume = null;
    if (fn) fn();
    entry.controller.abort();
    return true;
  }
}

export const runManager = new RunManager();
