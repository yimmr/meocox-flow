/**
 * OperatorExecutor:把既有真实算子(pipeline/operators/*)适配成 TaskExecutor。
 *
 * 关键点:算子仍是「真实实现」,但被 DAG 调度器统一驱动,
 * 并把产出登记为版本化产物(带 lineage),从而接入影响面分析。
 */
import { getOperator } from '../../../pipeline/operators/index.js';
import { requireProjectId } from '../../../storage/index.js';
import { emptyUsage } from '../../contracts/index.js';

/** 旧算子 outputs 字符串 -> ArtifactKind 映射 */
export const OUTPUT_KIND_MAP = {
  assets: 'asset_index',
  audio_rhythm: 'audio_rhythm',
  storyboard: 'storyboard',
  prompts: 'prompt_batch',
  images: 'image_set',
  voiceover: 'voiceover',
  clip_match: 'clip_match',
  timeline_manifest: 'timeline_manifest',
  jianying_draft: 'jianying_draft',
  motion_manifest: 'motion_manifest',
  motion_preview: 'motion_preview',
  video_render: 'video_render'
};

export class OperatorExecutor {
  constructor({ storage, artifactStore }) {
    this.storage = storage;
    this.artifactStore = artifactStore;
  }

  get id() { return 'operator'; }

  canExecute(task) {
    return Boolean(getOperator(task?.operatorId));
  }

  async execute(task, ctx) {
    const operator = getOperator(task.operatorId);
    if (!operator) throw new Error(`未知算子: ${task.operatorId}`);
    const pId = requireProjectId(ctx.projectId, 'OperatorExecutor');

    const project = ctx.project || (await this.storage.getProject(pId));
    const stage = {
      id: task.id,
      operatorId: task.operatorId,
      name: operator.name,
      description: operator.description,
      agentId: task.agentId || operator.agentId,
      skillId: operator.skillId
    };

    const res = await operator.execute({
      projectId: pId,
      project,
      stage,
      options: ctx.options || {},
      emitLog: ctx.emitLog
    });

    const kinds = task.produces?.length
      ? task.produces
      : (operator.outputs || []).map((o) => OUTPUT_KIND_MAP[o]).filter(Boolean);

    const artifacts = [];
    for (const kind of kinds) {
      const { artifact, versionMeta } = await this.artifactStore.produce(pId, {
        kind,
        payload: res.outputOverview ?? res.details ?? {},
        lineage: ctx.inputRefs || [],
        producedBy: { taskId: task.id, agentId: task.agentId || operator.agentId, operatorId: task.operatorId }
      });
      artifacts.push({
        kind,
        ref: { artifactId: artifact.id, version: versionMeta.version, kind, hash: versionMeta.hash }
      });
    }

    return {
      artifacts,
      overview: res.outputOverview ?? null,
      details: res.details ?? null,
      usage: { ...emptyUsage(), seconds: Number(res.durationSec) || 0 }
    };
  }
}