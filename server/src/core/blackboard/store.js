/**
 * BlackboardStore:项目级共享事实黑板(单一真相源)。
 *
 * 设计要点:
 *   1. **落盘** — 黑板本体是 `<workDir>/blackboard.json`(原子写,重启仍在);
 *      读写审计是 append-only 的 `runs/<BB_AUDIT_RUN_ID>/events.jsonl`。
 *   2. **与 Run 解耦** — 黑板是项目级而非 Run 级,因此审计事件写入一个
 *      专用的"审计流"(目录存在但无 run.json,`listRuns` 不会把它当成 Run)。
 *      这样既复用 EventBus 的单调 seq / 回放 / SSE 能力,又不污染 Run 列表。
 *   3. **进程内缓存** — 单进程服务,写路径全部经过本类,缓存按 projectId
 *      在写后失效,读取不额外打盘;跨进程以磁盘为准。
 *   4. **变更必留痕** — 每次 write 都发 `blackboard.written`,
 *      每次 read 都发 `blackboard.read`,payload 带 keys / reason / actor,
 *      供 P5 审计白皮书与「谁改了规则」回溯。
 */
import { storage, requireProjectId } from '../../storage/index.js';
import { defaultEventBus } from '../bus/eventBus.js';
import { BLACKBOARD_SCHEMA, assertValid, createBlackboard, ulid } from '../contracts/index.js';

/**
 * 黑板审计事件专用"流"的 runId。
 * 注意:该目录下**不会**写 run.json,因此 storage.listRuns 会忽略它。
 */
export const BB_AUDIT_RUN_ID = 'blackboard_audit';

/** 黑板可写入的列表型分类(与前端抽屉分类对齐) */
export const BB_LIST_KEYS = ['negativeConstraints', 'bossEpisodicMemory'];

function timeStamp() {
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}

/** actor -> 展示名(轨迹条目用) */
function actorLabel(actor) {
  if (!actor) return '系统';
  if (actor.name) return actor.name;
  if (actor.kind === 'boss') return '监制老板 (您)';
  if (actor.kind === 'agent') return actor.id || '智能体';
  return actor.id || '系统';
}

export class BlackboardStore {
  constructor({ bus = defaultEventBus, storage: store = storage } = {}) {
    this.bus = bus;
    this.storage = store;
    /** @type {Map<string, object>} projectId -> 黑板快照(写后失效) */
    this.cache = new Map();
    /** @type {Map<string, Promise>} projectId -> 写串行链 */
    this.writeChains = new Map();
  }

  // ── 读 ────────────────────────────────────────────────────────

  /**
   * 取(必要时创建并初始化)项目黑板。
   * **不发事件** —— 供内部/投影层静默读取。
   * @returns {Promise<object>}
   */
  async get(projectId) {
    const pId = requireProjectId(projectId, 'BlackboardStore.get');
    if (this.cache.has(pId)) return this.cache.get(pId);

    let board = await this.storage.getBlackboard(pId);
    if (!board || typeof board !== 'object') {
      board = createBlackboard(pId);
      await this.storage.saveBlackboard(pId, board);
    } else {
      // 兼容旧数据:补齐必填字段与默认结构
      board = { ...createBlackboard(pId), ...board, projectId: pId, revision: board.revision || 0 };
    }
    assertValid(BLACKBOARD_SCHEMA, board, 'Blackboard');
    this.cache.set(pId, board);
    return board;
  }

  /**
   * 语义化读取:Agent 拉取黑板时调用,记录「谁在何时读了哪些 key」。
   * @param {string} projectId
   * @param {{actor?:object, runId?:string|null, taskId?:string|null, keys?:string[], reason?:string}} [opts]
   * @returns {Promise<object>} 黑板快照
   */
  async read(projectId, opts = {}) {
    const pId = requireProjectId(projectId, 'BlackboardStore.read');
    const board = await this.get(pId);
    const keys = opts.keys?.length ? opts.keys : Object.keys(board);

    await this._emit({
      projectId: pId,
      runId: opts.runId || null,
      type: 'blackboard.read',
      actor: opts.actor || { kind: 'agent', id: 'system' },
      taskId: opts.taskId || null,
      payload: {
        revision: board.revision,
        keys,
        reason: opts.reason || 'pull',
        snapshot: { negativeConstraints: board.negativeConstraints?.length || 0,
          bossEpisodicMemory: board.bossEpisodicMemory?.length || 0 }
      }
    });
    return board;
  }

  // ── 写 ────────────────────────────────────────────────────────

  /**
   * 顶层键整体覆盖式写入(patch 中出现的键替换,未出现的键保留)。
   *
   * @param {string} projectId
   * @param {object} patch 顶层键 -> 值
   * @param {{actor?:object, runId?:string|null, taskId?:string|null, reason?:string, keys?:string[]}} [opts]
   * @returns {Promise<object>} 更新后的黑板
   */
  async write(projectId, patch, opts = {}) {
    const pId = requireProjectId(projectId, 'BlackboardStore.write');
    if (!patch || typeof patch !== 'object') {
      throw new Error('[BlackboardStore.write] patch 必须是对象');
    }
    const { actor = { kind: 'boss', id: 'user' }, runId = null, taskId = null, reason = 'edit' } = opts;

    // 串行化同一项目的「读-改-写」,避免并发写相互覆盖
    const prev = this.writeChains.get(pId) || Promise.resolve();
    const next = prev.then(async () => {
      const board = await this.get(pId);
      const merged = { ...board };
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'projectId' || k === 'revision' || k === 'updatedAt') continue;
        merged[k] = v;
      }
      merged.projectId = pId;
      merged.revision = (board.revision || 0) + 1;
      merged.updatedAt = Date.now();

      assertValid(BLACKBOARD_SCHEMA, merged, 'Blackboard');
      await this.storage.saveBlackboard(pId, merged);
      this.cache.set(pId, merged);

      const changedKeys = Object.keys(patch).filter(
        (k) => k !== 'projectId' && k !== 'revision' && k !== 'updatedAt'
      );
      await this._emit({
        projectId: pId,
        runId,
        type: 'blackboard.written',
        actor,
        taskId,
        payload: {
          revision: merged.revision,
          keys: opts.keys?.length ? opts.keys : changedKeys,
          reason,
          changed: changedKeys
        }
      });
      return merged;
    });

    this.writeChains.set(pId, next.then(() => undefined, () => undefined));
    return next;
  }

  /**
   * 往列表型分类里追加一条规则(前端「加一条规则」入口)。
   *
   * @param {string} projectId
   * @param {{category?:string, rule:string, source?:string, agent?:string, time?:string}} input
   * @param {{actor?:object, runId?:string|null, reason?:string}} [opts]
   * @returns {Promise<object>} 更新后的黑板
   */
  async appendRule(projectId, input, opts = {}) {
    const pId = requireProjectId(projectId, 'BlackboardStore.appendRule');
    const rule = (input?.rule || '').trim();
    if (!rule) throw new Error('[BlackboardStore.appendRule] rule 不能为空');

    const category = BB_LIST_KEYS.includes(input?.category) ? input.category : 'bossEpisodicMemory';

    // 同一次写里追加 pub/sub 轨迹,保证服务端是「规则 + 谁改的」的完整真相源
    const current = await this.get(pId);
    const trace = {
      id: ulid('ps'),
      time: input.time || timeStamp(),
      agent: input.agent || (actorLabel(opts.actor)),
      action: 'write',
      key: `#${category}`,
      summary: `追加事实/偏好约束: "${rule.slice(0, 24)}${rule.length > 24 ? '...' : ''}"`
    };

    if (category === 'bossEpisodicMemory') {
      const entry = {
        id: input.id || ulid('mem'),
        time: input.time || timeStamp(),
        rule,
        source: input.source || 'boss'
      };
      return this.write(pId, {
        bossEpisodicMemory: [entry, ...(current.bossEpisodicMemory || [])],
        pubSubEvents: [trace, ...(current.pubSubEvents || [])]
      }, { ...opts, reason: opts.reason || 'append_rule' });
    }

    return this.write(pId, {
      [category]: [rule, ...(current[category] || [])],
      pubSubEvents: [trace, ...(current.pubSubEvents || [])]
    }, { ...opts, reason: opts.reason || 'append_rule' });
  }

  /**
   * 记录一条 pub/sub 轨迹条目(谁 read/write 了哪个 key)。
   * 与事件日志互补:事件用于机器审计,pubSubEvents 用于前端可视化。
   */
  async trace(projectId, entry, opts = {}) {
    const pId = requireProjectId(projectId, 'BlackboardStore.trace');
    const current = await this.get(pId);
    const item = {
      id: entry?.id || ulid('ps'),
      time: entry?.time || timeStamp(),
      agent: entry?.agent || '系统',
      action: entry?.action || 'read',
      key: entry?.key || '#facts',
      summary: entry?.summary || ''
    };
    return this.write(pId, { pubSubEvents: [item, ...(current.pubSubEvents || [])] },
      { ...opts, reason: opts.reason || 'trace' });
  }

  /** 清空进程内缓存(测试 / 外部改动磁盘后) */
  invalidate(projectId) {
    if (projectId) this.cache.delete(projectId);
    else this.cache.clear();
  }

  /** 审计事件回放(供 /api/blackboard/events 与 SSE) */
  async history(projectId, { sinceSeq = -1 } = {}) {
    const pId = requireProjectId(projectId, 'BlackboardStore.history');
    return this.storage.readEvents(pId, BB_AUDIT_RUN_ID, { sinceSeq });
  }

  /** 订阅黑板审计事件(SSE)。返回退订函数。 */
  subscribe(listener, projectId = null) {
    return projectId
      ? this.bus.subscribe(BB_AUDIT_RUN_ID, listener, projectId)
      : this.bus.subscribe(BB_AUDIT_RUN_ID, listener);
  }

  /** 内部:把审计事件写入黑板审计流(无 runId 时仍可落盘) */
  async _emit({ projectId, runId, type, actor, taskId, payload }) {
    try {
      await this.bus.emit(projectId, runId || BB_AUDIT_RUN_ID, {
        type,
        actor,
        taskId,
        payload: payload ?? null
      });
    } catch (err) {
      // 审计失败不应阻断业务写入,但要吵醒运维
      console.warn(`[Blackboard] 审计事件写入失败(${type}): ${err.message}`);
    }
  }
}

/** 进程内单例(与 defaultEventBus 同生命周期) */
export const defaultBlackboardStore = new BlackboardStore();
