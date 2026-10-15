/**
 * SchedulerRuntime:依赖驱动的并发执行引擎。
 *
 * 取代旧的「run-all 顺序 for 循环」:
 *   - 每轮从 DAG 取就绪任务,受并发上限 / 并发组约束;
 *   - 任务级重试 + 指数退避 + 超时看门狗;
 *   - 全程通过 EventBus 广播(落盘 + 订阅),执行状态可回放可审计;
 *   - 失败可升级为 blocked(等待老板裁决),并计算悬挂前沿。
 */
import { readyTaskIds, blockedFrontier, validateDag } from './dag.js';
import { orderReadyTasks, respectConcurrencyGroups } from './readyQueue.js';
import { transition } from '../run/stateMachine.js';
import { emptyUsage } from '../contracts/index.js';
import { defaultGateRegistry, evaluateGate } from '../policy/qualityGate.js';
import { autoResolvePlan, resolveAutonomy } from '../policy/autonomy.js';
import { checkBudget } from '../policy/budget.js';
import { openEscalation, resolveEscalation, taskEscalationInput } from '../primitives/escalation.js';
import { recordDecision, markDecisionApplied } from '../primitives/decision.js';

const DEFAULT_CONCURRENCY = 3;

/** 宽松状态迁移:非法时直接赋值,保证运行时韧性 */
function safeTransition(kind, entity, to) {
  try {
    return transition(kind, entity, to);
  } catch {
    entity.status = to;
    entity.updatedAt = Date.now();
    return entity;
  }
}

function sleep(ms, signal) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(Object.assign(new Error('aborted'), { code: 'EABORT' }));
      }, { once: true });
    }
  });
}

/** 给 executor 的 Promise 套上超时看门狗(超时即 abort) */
function withTimeout(promise, ms, controller, onTimeout) {
  if (!ms || ms <= 0) return Promise.resolve(promise);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { controller.abort(); } catch { /* noop */ }
      if (onTimeout) onTimeout();
      reject(Object.assign(new Error(`executor timeout after ${ms}ms`), { code: 'ETIMEOUT' }));
    }, ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

function actorOf(task) {
  return {
    kind: 'agent',
    id: task.agentId || task.operatorId || 'task',
    name: task.agentId || task.operatorId || 'Task'
  };
}

export class SchedulerRuntime {
  constructor({
    bus,
    storage,
    artifactStore,
    executor,
    concurrency = DEFAULT_CONCURRENCY,
    signal = null,
    blackboard = null,
    gates = defaultGateRegistry,
    logger = console
  }) {
    this.bus = bus;
    this.storage = storage;
    this.artifactStore = artifactStore;
    this.executor = executor;
    this.concurrency = concurrency;
    /** @type {AbortSignal|null} 外部中止信号(run abort / 进程停机) */
    this.signal = signal;
    /** @type {{read:Function, get:Function}|null} 共享黑板(注入为 inputs.blackboard) */
    this.blackboard = blackboard;
    /** @type {{get:Function}|null} 质检闸门注册表(policy/qualityGate) */
    this.gates = gates;
    this.logger = logger;
  }

  async _emit(run, type, { taskId = null, actor, artifactRef = null, payload = null } = {}) {
    return this.bus.emit(run.projectId, run.id, { type, taskId, actor, artifactRef, payload });
  }

  _persistTask(task) {
    return this.storage.saveTask(task.projectId, task.runId, task);
  }

  _persistRun(run) {
    run.updatedAt = Date.now();
    return this.storage.saveRun(run.projectId, run);
  }

  /** 汇总上游产物:显式 inputRefs + 依赖任务的 resultRef */
  async _collectInputs(task, taskMap) {
    const inputs = {};
    const refs = [];
    const push = async (ref) => {
      if (!ref?.artifactId || !ref.kind) return;
      if (inputs[ref.kind] !== undefined) return;
      const got = await this.artifactStore.get(task.projectId, ref.kind, ref.artifactId, ref.version);
      if (got) {
        inputs[ref.kind] = got.payload;
        refs.push({ artifactId: ref.artifactId, version: ref.version, kind: ref.kind, hash: ref.hash });
      }
    };
    for (const ref of task.inputRefs || []) await push(ref);
    for (const dep of task.dependsOn || []) await push(taskMap.get(dep)?.resultRef);
    return { inputs, refs };
  }

  async _runTask(run, task, taskMap, options) {
    safeTransition('task', task, 'running');
    task.attempts = (task.attempts || 0) + 1;
    task.progress = 0;
    task.startedAt = Date.now();
    await this._persistTask(task);
    await this._emit(run, 'task.started', { taskId: task.id, actor: actorOf(task), payload: { attempt: task.attempts } });

    const maxAttempts = task.policy?.maxAttempts ?? 2;
    const timeoutMs = task.policy?.timeoutMs ?? 120000;

    for (;;) {
      try {
        const controller = new AbortController();
        const onExternalAbort = () => controller.abort();
        if (this.signal?.aborted) controller.abort();
        else this.signal?.addEventListener('abort', onExternalAbort, { once: true });
        const { inputs, refs } = await this._collectInputs(task, taskMap);
        // 共享黑板注入:所有算子都能读到全案事实,读取本身留痕
        if (this.blackboard) {
          inputs.blackboard = await this.blackboard.read(run.projectId, {
            actor: actorOf(task),
            runId: run.id,
            taskId: task.id,
            reason: `task:${task.id}`
          });
        }
        const ctx = {
          projectId: run.projectId,
          run,
          task,
          inputs,
          inputRefs: refs,
          options,
          signal: controller.signal,
          /** 共享黑板:算子可读可写(写入会发 blackboard.written) */
          blackboard: this.blackboard
            ? {
                get: () => this.blackboard.get(run.projectId),
                read: (keys) => this.blackboard.read(run.projectId, {
                  actor: actorOf(task), runId: run.id, taskId: task.id, keys, reason: `task:${task.id}`
                }),
                write: (patch, extra = {}) => this.blackboard.write(run.projectId, patch, {
                  actor: actorOf(task), runId: run.id, taskId: task.id, reason: `task:${task.id}`, ...extra
                }),
                appendRule: (ruleInput, extra = {}) => this.blackboard.appendRule(run.projectId, ruleInput, {
                  actor: actorOf(task), runId: run.id, taskId: task.id, ...extra
                })
              }
            : null,
          emitLog: (text, level = 'info') =>
            this._emit(run, 'task.log', { taskId: task.id, actor: actorOf(task), payload: { text, level } }),
          emitEvent: (type, payload) =>
            this._emit(run, type, { taskId: task.id, actor: actorOf(task), payload }),
          produce: (args) => this.artifactStore.produce(run.projectId, args)
        };

        const result = await withTimeout(
          this.executor.execute(task, ctx),
          timeoutMs,
          controller,
          () => this._emit(run, 'task.log', {
            taskId: task.id,
            actor: actorOf(task),
            payload: { text: `⏱️ 执行超时(${timeoutMs}ms),已中止`, level: 'warn' }
          })
        ).finally(() => this.signal?.removeEventListener('abort', onExternalAbort));

        const artifacts = result?.artifacts || [];

        // ── 质检闸门:产出后自动判定,达标放行,未达标按 onFail 处置 ──
        const gateId = task.policy?.qualityGateId;
        const gate = gateId ? this.gates?.get?.(gateId) : null;
        if (gateId && gate) {
          const metrics = result?.metrics ?? {};
          const verdict = evaluateGate(gate, metrics);
          await this._emit(run, verdict.pass ? 'gate.passed' : 'gate.failed', {
            taskId: task.id,
            actor: actorOf(task),
            payload: {
              gateId: gate.id,
              pass: verdict.pass,
              onFail: gate.onFail ?? null,
              failures: verdict.failures,
              warnings: verdict.warnings,
              metrics
            }
          });
          if (!verdict.pass) {
            const gateErr = new Error(
              `[Gate ${gate.id}] 质检未通过: ${verdict.failures.map((f) => `${f.metric} ${f.op} ${f.expected} (实际: ${f.actual})`).join('; ')}`
            );
            gateErr.code = 'EGATE';
            gateErr.gateId = gate.id;
            gateErr.failureAction = gate.onFail || null;
            gateErr.failures = verdict.failures;
            throw gateErr;
          }
        }

        if (artifacts[0]?.ref) task.resultRef = artifacts[0].ref;
        task.usage = { ...emptyUsage(), ...(task.usage || {}), ...(result?.usage || {}) };
        task.outputOverview = result?.overview ?? null;
        task.details = result?.details ?? null;
        task.progress = 100;
        task.finishedAt = Date.now();
        safeTransition('task', task, 'succeeded');
        await this._persistTask(task);
        await this._emit(run, 'task.succeeded', {
          taskId: task.id,
          actor: actorOf(task),
          artifactRef: task.resultRef,
          payload: { overview: result?.overview ?? null, artifacts: artifacts.map((a) => a.ref).filter(Boolean) }
        });
        return;
      } catch (err) {
        // 质检闸门的处置动作优先(onFail),其次任务策略 onFailure
        const gateAction = err.code === 'EGATE' ? (err.failureAction || null) : null;
        const action = gateAction ?? task.policy?.onFailure ?? 'escalate';
        if (action === 'retry' && task.attempts < maxAttempts) {
          const backoff = Math.min(500 * 2 ** (task.attempts - 1), 8000);
          await this._emit(run, 'task.retrying', {
            taskId: task.id,
            actor: actorOf(task),
            payload: { attempt: task.attempts, backoffMs: backoff, error: err.message }
          });
          await sleep(backoff, null);
          task.attempts += 1;
          await this._persistTask(task);
          continue;
        }

        // ── 升级路径:先按自治矩阵算脱困计划(纯计算,不发事件)──
        let plan = null;
        if (action === 'escalate') {
          plan = autoResolvePlan(resolveAutonomy(task, run), { severity: err.severity || 'block' });
        }
        const autoRetry = Boolean(plan?.canAuto && plan.action === 'retry' && task.attempts < maxAttempts);
        const primitiveCtx = { bus: this.bus, projectId: run.projectId, runId: run.id };

        if (autoRetry) {
          // 自动脱困:escalation.opened -> decision.received -> escalation.resolved -> decision.applied -> 重试
          const escalation = await openEscalation(primitiveCtx, taskEscalationInput({ run, task, err }));
          const decision = await recordDecision(primitiveCtx, {
            scope: 'escalation',
            refId: escalation.id,
            intent: 'selectOption',
            payload: { optionId: 'retry', auto: true, level: plan.level, reason: plan.reason },
            actor: 'system'
          });
          await resolveEscalation(primitiveCtx, {
            id: escalation.id,
            resolution: { optionId: 'retry', by: 'autonomy', level: plan.level, note: plan.reason },
            actor: { kind: 'system', id: 'autonomy' }
          });
          await markDecisionApplied(primitiveCtx, decision, { action: 'retry' });
          const backoff = Math.min(500 * 2 ** (task.attempts - 1), 8000);
          await this._emit(run, 'task.retrying', {
            taskId: task.id,
            actor: actorOf(task),
            payload: { attempt: task.attempts, backoffMs: backoff, error: err.message, auto: true, level: plan.level }
          });
          await sleep(backoff, null);
          task.attempts += 1;
          await this._persistTask(task);
          continue;
        }

        task.error = { message: err.message, code: err.code || null, name: err.name, at: Date.now() };
        const terminal = action === 'escalate'
          ? (plan?.canAuto ? 'skipped' : 'blocked')
          : action === 'skip' ? 'skipped' : 'failed';
        task.finishedAt = Date.now();
        safeTransition('task', task, terminal);
        await this._persistTask(task);
        await this._emit(run, 'task.failed', {
          taskId: task.id,
          actor: actorOf(task),
          payload: {
            error: task.error,
            action,
            terminalStatus: terminal,
            ...(plan ? { autoResolved: plan.canAuto, autonomy: plan.level } : {})
          }
        });

        if (action === 'escalate') {
          const escalation = await openEscalation(primitiveCtx, taskEscalationInput({ run, task, err }));
          if (plan?.canAuto) {
            // 重试耗尽后的自动跳过:同样留完整裁决链(可审计)
            const decision = await recordDecision(primitiveCtx, {
              scope: 'escalation',
              refId: escalation.id,
              intent: 'selectOption',
              payload: { optionId: 'skip', auto: true, level: plan.level, reason: plan.reason },
              actor: 'system'
            });
            await resolveEscalation(primitiveCtx, {
              id: escalation.id,
              resolution: { optionId: 'skip', by: 'autonomy', level: plan.level, note: plan.reason },
              actor: { kind: 'system', id: 'autonomy' }
            });
            await markDecisionApplied(primitiveCtx, decision, { action: 'skip' });
          }
        }
        return;
      }
    }
  }

  /**
   * 执行整张 DAG 直至收敛。
   * @param {{run:object, tasks:object[], options?:object}} input
   * @returns {Promise<{run:object, tasks:object[]}>}
   */
  async execute({ run, tasks, options = {} }) {
    const dagResult = validateDag(tasks);
    if (!dagResult.valid) {
      throw new Error(`DAG 非法: ${dagResult.errors.join('; ')}`);
    }
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    safeTransition('run', run, 'running');
    await this._persistRun(run);
    await this._emit(run, 'run.started', {
      actor: { kind: 'system', id: 'scheduler' },
      payload: { templateId: run.templateId, taskIds: run.taskIds, concurrency: this.concurrency, order: dagResult.order }
    });

    const active = new Map();
    let aborted = Boolean(this.signal?.aborted);
    let budgetBlocked = false;
    let lastTickUsage = null;

    for (;;) {
      if (this.signal?.aborted) { aborted = true; break; }

      // ── 预算硬约束:优先于自治等级(预算为空 => hasLimits=false,行为不变)──
      const budget = checkBudget(run, tasks);
      if (budget.hasLimits) {
        const usageJson = JSON.stringify(budget.usage);
        if (usageJson !== lastTickUsage) {
          lastTickUsage = usageJson;
          await this._emit(run, 'budget.tick', {
            actor: { kind: 'system', id: 'budget' },
            payload: { usage: budget.usage, limits: budget.limits, breaches: budget.breaches }
          });
        }
        if (budget.exceeded) {
          await this._emit(run, 'budget.exceeded', {
            actor: { kind: 'system', id: 'budget' },
            payload: { usage: budget.usage, limits: budget.limits, breaches: budget.breaches }
          });
          budgetBlocked = true;
          break;
        }
      }

      const ready = orderReadyTasks(readyTaskIds(tasks), taskMap);
      const activeTasks = [...active.keys()].map((id) => taskMap.get(id));
      for (const id of ready) {
        if (active.size >= this.concurrency) break;
        const task = taskMap.get(id);
        if (!respectConcurrencyGroups(task, activeTasks)) continue;
        const p = this._runTask(run, task, taskMap, options)
          .catch((err) => this.logger.error?.(`[Scheduler] 任务 ${id} 运行异常:`, err))
          .finally(() => active.delete(id));
        active.set(id, p);
      }

      if (active.size === 0) break;
      await Promise.race(active.values());
    }

    // 中止时优雅收尾:等待在途任务落盘,未启动任务标记 skipped
    if (aborted && active.size) {
      await Promise.allSettled([...active.values()]);
    }
    if (aborted) {
      for (const t of tasks) {
        if (t.status === 'pending' || t.status === 'ready') {
          t.status = 'skipped';
          t.finishedAt = Date.now();
          await this._persistTask(t);
        }
      }
      safeTransition('run', run, 'aborted');
      await this._persistRun(run);
      await this._emit(run, 'run.aborted', {
        actor: { kind: 'system', id: 'scheduler' },
        payload: { reason: 'user_abort' }
      });
      return { run, tasks };
    }

    // 预算超限:等在途任务收尾(费用已发生),不再调度新任务,run 置 blocked
    if (budgetBlocked) {
      if (active.size) await Promise.allSettled([...active.values()]);
      const finalBudget = checkBudget(run, tasks);
      run.usage = finalBudget.usage;
      safeTransition('run', run, 'blocked');
      await this._persistRun(run);
      await this._emit(run, 'run.blocked', {
        actor: { kind: 'system', id: 'budget' },
        payload: {
          reason: 'budget_exceeded',
          blockedTaskIds: tasks.filter((t) => t.status === 'pending' || t.status === 'blocked').map((t) => t.id),
          usage: finalBudget.usage,
          limits: finalBudget.limits,
          breaches: finalBudget.breaches
        }
      });
      return { run, tasks };
    }

    // 收敛判定
    const failed = tasks.filter((t) => t.status === 'failed');
    const blocked = tasks.filter((t) => t.status === 'blocked');
    const stuck = blockedFrontier(tasks);
    run.usage = tasks.reduce((acc, t) => ({
      tokens: acc.tokens + (t.usage?.tokens || 0),
      cost: acc.cost + (t.usage?.cost || 0),
      seconds: acc.seconds + (t.usage?.seconds || 0),
      gpuSeconds: acc.gpuSeconds + (t.usage?.gpuSeconds || 0)
    }), emptyUsage());

    if (failed.length) {
      safeTransition('run', run, 'failed');
      await this._persistRun(run);
      await this._emit(run, 'run.failed', { actor: { kind: 'system', id: 'scheduler' }, payload: { failedTaskIds: failed.map((t) => t.id) } });
    } else if (blocked.length || stuck.length) {
      safeTransition('run', run, 'blocked');
      await this._persistRun(run);
      await this._emit(run, 'run.blocked', {
        actor: { kind: 'system', id: 'scheduler' },
        payload: { blockedTaskIds: blocked.map((t) => t.id), blockedFrontier: stuck, usage: run.usage }
      });
    } else {
      safeTransition('run', run, 'completed');
      await this._persistRun(run);
      await this._emit(run, 'run.completed', { actor: { kind: 'system', id: 'scheduler' }, payload: { usage: run.usage } });
    }

    return { run, tasks };
  }
}