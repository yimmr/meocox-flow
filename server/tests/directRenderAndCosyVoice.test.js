import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { getOperator } from '../src/pipeline/operators/index.js';
import { getPipelineTemplateById } from '../src/pipeline/templates.js';
import { storage } from '../src/storage/index.js';
import { synthesizeCosyVoiceAudio, inspectCosyVoiceStatus, cosyVoiceDownloader } from '../src/services/cosyvoiceService.js';
import { renderMotionVideoDirect } from '../src/services/remotionRenderer.js';
import { defaultMCPHub } from '../src/runtime/mcpHub.js';
import { registerLocalVideoTools } from '../src/runtime/registerLocalTools.js';

test('Direct MP4 Video Rendering & Local CosyVoice 2 Pipeline (No Jianying)', async (t) => {
  const testProjectId = `test_direct_${Date.now()}`;
  await storage.saveProject({ id: testProjectId, title: 'AI代码动效直出测试', category: '科技' });
  t.after(async () => {
    await storage.deleteProject(testProjectId).catch(() => {});
  });

  await t.test('1. CosyVoice 2 服务应能检测本地状态并合成人声与字级时间戳', async () => {
    const status = inspectCosyVoiceStatus();
    assert.ok(status);
    assert.equal(status.id, 'cosyvoice-2-0.5b');

    // 合成测试文本
    const synthResult = await synthesizeCosyVoiceAudio({
      text: '从任务拓扑规划到精炼上下文打包，所有模块由确定性状态机严密编排。',
      voice: 'geek_male',
      speed: 4.2
    });

    assert.ok(synthResult.audioPath, '应生成音频路径');
    assert.ok(fs.existsSync(synthResult.audioPath), '本地 WAV 文件应物理存在');
    assert.ok(synthResult.words.length > 0, '应提取字级时间戳');
    assert.ok(synthResult.totalDurationSec > 0, '时值应大于 0');

    // 验证单字时间戳结构
    const firstWord = synthResult.words[0];
    assert.ok(firstWord.word);
    assert.ok(typeof firstWord.startSec === 'number');
    assert.ok(typeof firstWord.endSec === 'number');
    assert.ok(typeof firstWord.startFrame === 'number');
  });

  await t.test('2. cosyvoiceTtsOperator 算子应成功调度本地 CosyVoice 2 并输出 voiceover 产物', async () => {
    const op = getOperator('cosyvoice_tts_synthesis');
    assert.ok(op, '算子应存在');
    assert.equal(op.agentId, 'voice-scout');

    // 准备测试分镜
    await storage.saveStoryboard(testProjectId, [
      { order: 1, title: '黄金概念引出', scriptText: '还在忍受文生视频模型文字变形和图表幻觉？' },
      { order: 2, title: '系统核心架构', scriptText: '是时候认识代码驱动动效与确定性渲染了。' }
    ]);

    const logs = [];
    const res = await op.execute({
      projectId: testProjectId,
      project: { id: testProjectId, title: 'AI代码动效直出测试' },
      options: { voice: 'geek_male' },
      emitLog: (msg) => logs.push(msg)
    });

    assert.ok(res.voiceover);
    assert.ok(res.voiceover.audioPath);
    assert.ok(fs.existsSync(res.voiceover.audioPath));
    assert.ok(res.voiceover.words.length > 0);
  });

  await t.test('3. remotionRenderOperator 算子应调用本地 FFmpeg 硬件加速直接输出 MP4 成品视频', async () => {
    const op = getOperator('remotion_render_direct');
    assert.ok(op, '算子应存在');
    assert.equal(op.agentId, 'render-officer');

    // 准备测试动效清单
    await storage.saveMotionManifest(testProjectId, {
      projectId: testProjectId,
      version: 1,
      fps: 30,
      width: 1280,
      height: 720,
      totalDurationSec: 3.0,
      scenes: [
        { id: 's1', title: '场景一', componentType: 'KineticTypography', durationSec: 1.5 },
        { id: 's2', title: '场景二', componentType: 'TechTerminal', durationSec: 1.5 }
      ]
    });

    const logs = [];
    const res = await op.execute({
      projectId: testProjectId,
      project: { id: testProjectId, title: 'AI代码动效直出测试' },
      options: {},
      emitLog: (msg) => logs.push(msg)
    });

    assert.ok(res.videoRender);
    assert.ok(res.videoRender.videoPath);
    assert.ok(fs.existsSync(res.videoRender.videoPath), 'MP4 文件应物理生成在磁盘');
    assert.ok(res.videoRender.sizeBytes > 0, '视频体积应大于 0');
    assert.ok(res.videoRender.videoPath.endsWith('.mp4'), '后缀应为 .mp4');
  });

  await t.test('4. template_code_motion_explainer 流水线应全面集成 CosyVoice 2 与 Remotion 直出 (无剪映)', () => {
    const tpl = getPipelineTemplateById('template_code_motion_explainer');
    assert.ok(tpl);
    assert.equal(tpl.stages.length, 4);

    assert.equal(tpl.stages[1].operatorId, 'cosyvoice_tts_synthesis');
    assert.equal(tpl.stages[1].agentId, 'voice-scout');

    assert.equal(tpl.stages[3].operatorId, 'remotion_render_direct');
    assert.equal(tpl.stages[3].agentId, 'render-officer');
  });

  await t.test('5. 本地工具应支持 synthesize_cosyvoice, render_video_mp4 与 download_local_model', async () => {
    registerLocalVideoTools(defaultMCPHub);

    // 检查工具注册
    assert.ok(defaultMCPHub.hasTool('synthesize_cosyvoice'));
    assert.ok(defaultMCPHub.hasTool('render_video_mp4'));
    assert.ok(defaultMCPHub.hasTool('download_local_model'));
    assert.ok(defaultMCPHub.hasTool('get_local_models_status'));

    const statusRes = await defaultMCPHub.callTool('get_local_models_status', {});
    assert.ok(statusRes.cosyvoice);
    assert.ok(statusRes.renderer);
    assert.equal(statusRes.renderer.isReady, true);
  });

  await t.test('6. 本地程序化音频服务应能零依赖生成 100% 免版权商业音效与 BGM', async () => {
    const { generateWhooshWav, generateChimeWav, generateTechAmbientBgm } = await import('../src/services/proceduralAudioService.js');
    const whooshPath = path.join(config.paths.cacheDir, `test_whoosh_${Date.now()}.wav`);
    const chimePath = path.join(config.paths.cacheDir, `test_chime_${Date.now()}.wav`);
    const bgmPath = path.join(config.paths.cacheDir, `test_bgm_${Date.now()}.wav`);

    generateWhooshWav(whooshPath, 0.2);
    generateChimeWav(chimePath, 0.3);
    generateTechAmbientBgm(bgmPath, 1.0);

    assert.ok(fs.existsSync(whooshPath), 'Whoosh 音效应成功生成');
    assert.ok(fs.existsSync(chimePath), 'Chime 音效应成功生成');
    assert.ok(fs.existsSync(bgmPath), 'BGM 音频应成功生成');
    assert.ok(fs.statSync(whooshPath).size > 1000);
    assert.ok(fs.statSync(chimePath).size > 1000);
    assert.ok(fs.statSync(bgmPath).size > 1000);

    try { fs.unlinkSync(whooshPath); } catch {}
    try { fs.unlinkSync(chimePath); } catch {}
    try { fs.unlinkSync(bgmPath); } catch {}

    assert.ok(defaultMCPHub.hasTool('synthesize_procedural_sfx'), '应已注册 synthesize_procedural_sfx 工具');
  });
});
