/**
 * MockExecutor:虚拟数据驱动执行器(可插拔驱动之一)。
 *
 * 与 OperatorExecutor 共享同一 TaskExecutor 接口,
 * 因此「先用虚拟数据跑通全链路,再逐个算子替换为真实实现」时,
 * UI / 调度器 / 事件流完全无感知。
 *
 * 任务可通过 task.mock 指定剧本:
 *   { steps: string[], stepDelayMs, failTimes, alwaysFail,
 *     artifacts: [{ kind, payload }], overview }
 */
import { emptyUsage } from '../../contracts/index.js';

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

export class MockExecutor {
  constructor() {}

  get id() { return 'mock'; }

  canExecute() { return true; }

  async execute(task, ctx) {
    const mock = task.mock || {};

    if (mock.alwaysFail) {
      throw new Error(`[Mock] 任务 ${task.id} 按剧本永久失败`);
    }
    if (mock.failTimes && (task.attempts || 1) <= mock.failTimes) {
      throw new Error(`[Mock] 任务 ${task.id} 第 ${task.attempts} 次尝试按剧本失败`);
    }

    const steps = mock.steps || [
      `接管任务 ${task.id}`,
      '读取上游产物并推演',
      '生成中间结果',
      '自检并提交'
    ];
    const stepDelay = mock.stepDelayMs ?? 40;

    for (let i = 0; i < steps.length; i += 1) {
      await sleep(stepDelay, ctx.signal);
      ctx.emitEvent('task.progress', { progress: Math.round(((i + 1) / steps.length) * 100) });
      ctx.emitLog(`[Mock] ${steps[i]}`, 'info');
    }

    const artifacts = [];
    for (const spec of mock.artifacts || []) {
      const { artifact, versionMeta } = await ctx.produce({
        kind: spec.kind,
        payload: spec.payload ?? {},
        lineage: ctx.inputRefs || [],
        producedBy: { taskId: task.id, agentId: task.agentId, operatorId: task.operatorId }
      });
      artifacts.push({
        kind: spec.kind,
        ref: { artifactId: artifact.id, version: versionMeta.version, kind: spec.kind, hash: versionMeta.hash }
      });
    }

    return {
      artifacts,
      overview: mock.overview ?? { mock: true, taskId: task.id },
      details: `[Mock] 任务 ${task.id} 已完成虚拟执行`,
      metrics: mock.metrics ?? {},
      usage: { ...emptyUsage(), seconds: (steps.length * stepDelay) / 1000 }
    };
  }
}