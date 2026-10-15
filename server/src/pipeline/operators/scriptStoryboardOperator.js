import { requireProjectId } from '../../storage/index.js';
import { storage } from '../../storage/index.js';
import { agentTeam } from '../../agents/agentTeam.js';

export const scriptStoryboardOperator = {
  id: 'script_storyboard_planning',
  aliases: ['step_3', 'step_script'],
  name: '爆款剧本与分镜规划',
  description: '由 Director 裁决题材法则，Screenwriter 规划黄金 3 秒痛点钩子与分镜解说词',
  agentId: 'screenwriter',
  agentName: 'Director + Screenwriter',
  skillId: 'screenwriter-agent',
  inputs: ['project', 'assets'],
  outputs: ['storyboard'],

  async execute({ projectId, project, options, emitLog }) {
    const pId = requireProjectId(projectId, 'operator:scriptStoryboardOperator');
    emitLog(`[智能体调度] 激活 Director Agent (总编导) 进行题材裁决 [SKILL: director-agent]`, 'info');

    const genreSkill = await agentTeam.director.decideGenreSkill(project);
    emitLog(`[法则装载] 裁决剪辑法则为「${genreSkill.name}」(品类: ${genreSkill.category})`, 'info');

    emitLog(`[智能体调度] 激活 Screenwriter Agent (文案编剧) 挂载对应法则 [SKILL: screenwriter-agent]`, 'info');
    emitLog(`[编剧思考] 遵循黄金3秒高压痛点法则，严格执行 4.2字/秒 黄金语速与气口对齐...`, 'info');

    const assets = await storage.getAssets(pId);
    const planResult = await agentTeam.screenwriter.planStoryboard({
      project,
      genreSkill,
      availableClips: assets,
      targetDuration: options.targetDuration || 35
    });

    emitLog(`[分镜编排] 剧本输出黄金钩子: “${planResult.hookText}”`, 'info');
    emitLog(`[分镜编排] 拆解生成 ${planResult.shots.length} 个高光叙事镜头，预估总时长: ${planResult.totalDurationSec.toFixed(1)}s`, 'info');

    await storage.saveStoryboard(pId, planResult.shots);
    emitLog(`[剧本规划] ✅ 编剧智能体成功规划分镜剧本并持久化至时间轴`, 'success');

    return {
      outputOverview: {
        storyboardCount: planResult.shots.length,
        totalDurationSec: planResult.totalDurationSec,
        totalDurationFormatted: `${Math.round(planResult.totalDurationSec)} 秒`,
        hookStrategy: `法则: ${genreSkill.name} (黄金3秒痛点 + 叙事拆解 + 互动引流)`
      },
      details: `编剧智能体完成剧本创作，共 ${planResult.shots.length} 个镜头，预估时长 ${planResult.totalDurationSec.toFixed(1)} 秒`
    };
  }
};
