/**
 * 事件总线:内核中一切状态变化的唯一广播出口。
 *
 * 职责:
 *   1. 为每 run 维护单调 seq;
 *   2. 事件 append-only 落盘(委托 storage);
 *   3. 同步分发给订阅者(SSE / 遥测 / 审计 / 测试)。
 *
 * UI 层(第 6 层)只是这里的订阅者之一 —— 动画 = 事件的投影。
 */
import { storage } from '../../storage/index.js';
import { buildEvent, loadLastSeq, ensureValidEvent } from './eventLog.js';

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} projectId::runId -> listeners */
    this.listeners = new Map();
    /** @type {Map<string, number>} projectId::runId -> lastSeq */
    this.seqState = new Map();
    /** @type {Map<string, Promise>} projectId::runId -> serialized emit chain */
    this.emitChains = new Map();
    /** 记录所有 runId 的订阅,便于单测断言 */
    this.validateEvents = true;
  }

  /**
   * 订阅某 run 的事件流。
   * @param {string} runId
   * @param {(event:object)=>void} listener
   * @returns {() => void} 取消订阅
   */
  subscribe(runId, listener, projectId = null) {
    const key = projectId ? this._key(projectId, runId) : runId;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    const listeners = this.listeners.get(key);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && this.listeners.get(key) === listeners) {
        this.listeners.delete(key);
      }
    };
  }

  _key(projectId, runId) { return `${projectId}::${runId}`; }

  /** 取(或惰性恢复)某 run 的当前 seq */
  async currentSeq(projectId, runId) {
    const key = this._key(projectId, runId);
    if (!this.seqState.has(key)) {
      const last = await loadLastSeq(storage, projectId, runId);
      this.seqState.set(key, last);
    }
    return this.seqState.get(key);
  }

  /**
   * 发射一个事件:分配 seq → 落盘 → 分发。
   *
   * 同一 run 的发射被串行化(链式 Promise):
   * 并发任务同时上报时,seq 仍唯一且严格递增,不会相互覆盖。
   *
   * @param {string} projectId
   * @param {string} runId
   * @param {{type:string, actor?:object, taskId?:string, artifactRef?:object, payload?:any}} input
   * @returns {Promise<object>} 已落盘的事件
   */
  emit(projectId, runId, input) {
    const key = this._key(projectId, runId);
    const prev = this.emitChains.get(key) || Promise.resolve();
    const next = prev.then(() => this._emit(projectId, runId, input));
    // 存「吞掉异常」的链,避免一次失败卡死后续发射;调用方仍从 next 拿到真实 reject
    this.emitChains.set(key, next.then(() => undefined, () => undefined));
    return next;
  }

  async _emit(projectId, runId, input) {
    const last = await this.currentSeq(projectId, runId);
    const seq = last + 1;
    const event = buildEvent({
      runId,
      projectId,
      seq,
      type: input.type,
      actor: input.actor,
      taskId: input.taskId,
      artifactRef: input.artifactRef,
      payload: input.payload
    });

    if (this.validateEvents) ensureValidEvent(event);

    await storage.appendEvent(projectId, runId, event);
    this.seqState.set(this._key(projectId, runId), seq);
    this.dispatch(runId, event, projectId);
    return event;
  }

  /** 同步分发给订阅者(单个监听器异常不影响其他监听器) */
  dispatch(runId, event, projectId = event.projectId) {
    const scoped = this.listeners.get(this._key(projectId, runId));
    // Retain the original unscoped subscription form for existing extensions.
    const legacy = this.listeners.get(runId);
    for (const set of [scoped, legacy]) {
      if (!set) continue;
      for (const fn of set) {
        try {
          fn(event);
        } catch (err) {
          console.warn(`[EventBus] 监听器异常(已忽略): ${err.message}`);
        }
      }
    }
  }

  /**
   * 重放某 run 的事件(默认全部,可给 sinceSeq)。
   * @returns {Promise<object[]>}
   */
  async replay(projectId, runId, { sinceSeq = -1 } = {}) {
    return storage.readEvents(projectId, runId, { sinceSeq });
  }

  /** 清空某 run 的内存序号缓存(重置/重跑时用) */
  resetSeq(runId, projectId = null) {
    if (projectId) {
      this.seqState.delete(this._key(projectId, runId));
      return;
    }
    for (const key of this.seqState.keys()) {
      if (key.endsWith(`::${runId}`)) this.seqState.delete(key);
    }
  }
}

/** 全局默认总线(进程内单例) */
export const defaultEventBus = new EventBus();
