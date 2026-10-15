import { requireProjectId } from '../../storage/index.js';
import { storage } from '../../storage/index.js';
import { agentTeam } from '../../agents/agentTeam.js';

export const jianyingDraftOperator = {
  id: 'jianying_draft_synthesis',
  aliases: ['step_5', 'step_export'],
  name: '剪映草稿工程合成与注入',
  description: '由 Timeline Editor 进行微秒级轨道量化对齐，一键注入本机剪映并注册全局索引',
  agentId: 'timeline-editor',
  agentName: 'Timeline Editor',
  skillId: 'timeline-editor',
  inputs: ['storyboard', 'assets', 'project'],
  outputs: ['draftPath', 'jianyingDraftDir'],

  async execute({ projectId, project, options, emitLog }) {
    const pId = requireProjectId(projectId, 'operator:jianyingDraftOperator');
    emitLog(`[智能体调度] 激活 Timeline Editor (微秒级轨道量化合成引擎) [SKILL: timeline-editor]`, 'info');
    emitLog(`[剪映合成] 开始构建微秒级多轨道剪映 Draft JSON 并探针媒体参数...`, 'info');

    const storyboard = await storage.getStoryboard(pId);
    const assets = await storage.getAssets(pId);

    if (storyboard.length === 0) {
      throw new Error('分镜列表为空，无法合成剪映工程');
    }

    const draftResult = await agentTeam.editor.synthesizeDraft({
      project,
      storyboard,
      assets,
      customDraftName: options.draftName || project?.title
    });

    emitLog(`[剪映合成] 轨道量化计算完成，视频轨+字幕轨已实现微秒级绝对对齐`, 'info');
    emitLog(`[全局索引] 已写入剪映全局索引 root_meta_info.json 并生成关键帧封面`, 'info');
    emitLog(`[剪映注入] 注入本机剪映客户端草稿库: ${draftResult.draftPath || draftResult.jianyingDraftDir}`, 'success');

    return {
      outputOverview: {
        draftName: draftResult.draftName,
        draftPath: draftResult.draftPath || draftResult.jianyingDraftDir,
        videoSegments: draftResult.videoSegmentsCount || storyboard.length,
        textSegments: draftResult.textSegmentsCount || storyboard.length,
        injectionStatus: '已直接就绪剪映客户端'
      },
      details: `剪映工程「${draftResult.draftName}」已成功注入剪映，可直接在剪映打开编辑`
    };
  }
};
