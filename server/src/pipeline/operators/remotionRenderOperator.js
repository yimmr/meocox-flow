import { requireProjectId, storage } from '../../storage/index.js';
import { renderMotionVideoDirect } from '../../services/remotionRenderer.js';

/**
 * Remotion 确定性直接出片算子 (Direct Video Render Operator - 告别剪映)
 */
export const remotionRenderOperator = {
  id: 'remotion_render_direct',
  aliases: ['step_direct_render', 'render_mp4'],
  name: 'Remotion 4K/60fps 确定性本地直出',
  description: '由 Render Officer 调用 Remotion 内核与本地 FFmpeg，直接压制导出 1080P/4K 60fps 最终成片 MP4，零外部剪辑软件依赖',
  agentId: 'render-officer',
  agentName: 'Render Officer (直接出片总监)',
  skillId: 'direct-render-pipeline',
  inputs: ['motion_manifest', 'voiceover', 'project'],
  outputs: ['video_render'],

  async execute({ projectId, project, options = {}, emitLog }) {
    const pId = requireProjectId(projectId, 'operator:remotionRenderOperator');
    emitLog(`[智能体调度] 激活 Render Officer (直接渲染出片总监) [SKILL: direct-render-pipeline]`, 'info');
    emitLog(`[直接出片] 绕过外部剪辑软件，启动 Remotion 确定性渲染内核与本地硬件加速压制...`, 'info');

    const manifest = await storage.getMotionManifest(pId);
    if (!manifest) {
      throw new Error('未检测到代码动效工程清单 (motion_manifest)，无法执行视频直出');
    }

    emitLog(`[合流编码] 正在融合动效画面、CosyVoice 2 人声音轨与 UI 动效音效...`, 'info');

    const renderResult = await renderMotionVideoDirect({
      projectId: pId,
      manifest,
      outputFileName: options.outputFileName || null,
      options
    });

    emitLog(`[压制完成] ✅ 最终 MP4 视频直接输出成功！`, 'success');
    emitLog(`[文件信息] 物理路径: ${renderResult.videoPath} (大小: ${renderResult.sizeFormatted})`, 'info');

    return {
      outputOverview: {
        engine: 'Remotion Headless + FFmpeg Native Encoder',
        videoPath: renderResult.videoPath,
        fileName: renderResult.fileName,
        resolution: `${renderResult.width}x${renderResult.height}`,
        fps: `${renderResult.fps} fps`,
        duration: renderResult.durationFormatted,
        size: renderResult.sizeFormatted,
        status: '可直接打开播放或发布'
      },
      videoRender: renderResult,
      details: `Render Officer 已将工程直接渲染为工业级 MP4 成品视频 (${renderResult.durationFormatted})，保存在本地磁盘。`
    };
  }
};
