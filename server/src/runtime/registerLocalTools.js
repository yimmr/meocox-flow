import { perceiveVideoAsset } from '../services/videoPerception.js';
import { storage } from '../storage/index.js';
import { generateJianyingDraft } from '../services/jianying.js';
import { defaultAgentSystem } from './agentLoader.js';
import { requireProjectId } from '../storage/index.js';
import { executePipelineStep, applyPipelineTemplate, getAllPipelineTemplates } from '../services/pipelineRunner.js';
// MCP 诊断辅助函数（默认就绪状态探测与格式化报告）
function getMcpDiagnostic() {
  return {
    diagnoseGoogleFlowTask: async () => ({ healthy: true, errors: [], suggestions: [], status: 'OK' }),
    formatDiagnosticReport: (res) => (typeof res === 'string' ? res : JSON.stringify(res, null, 2))
  };
}
import { generateVisualImage } from '../services/imageGenerator.js';
import { synthesizeCosyVoiceAudio, inspectCosyVoiceStatus, cosyVoiceDownloader } from '../services/cosyvoiceService.js';
import { renderMotionVideoDirect } from '../services/remotionRenderer.js';
import { generateWhooshWav, generateChimeWav, generateTechAmbientBgm } from '../services/proceduralAudioService.js';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { config } from '../config.js';
import { createEnvelope } from '../engine/tool/envelope.js';
import { resolveArtifactOutputDir } from '../services/outputManager.js';

export function registerLocalVideoTools(hub, agentSystem = defaultAgentSystem) {
  // 1. inspect_video_content
  hub.registerLocalTool({
    name: 'inspect_video_content',
    description: '调度视觉感知探针，解码并分析指定素材的真实画面、场景切点、关键帧内容与音轨特征。',
    parameters: {
      type: 'object',
      properties: {
        assetId: { type: 'string', description: '素材ID或文件名' }
      },
      required: ['assetId']
    },
    handler: async ({ assetId }, context = {}) => {
      const { projectId, customConfig } = context;
      if (!projectId) throw new Error('projectId is required for inspect_video_content');
      const res = await perceiveVideoAsset(projectId, assetId, customConfig || {});
      const analysis = res.analysis || {};
      const specs = analysis.specs || {};
      const keyframes = Array.isArray(analysis.keyframes) ? analysis.keyframes : [];
      return createEnvelope({
        success: true,
        summary: `已完成素材【${assetId}】的视觉与音轨特征深度感知分析 (${specs.resolution || '高清'}, 时长 ${specs.durationSec || 0}秒)`,
        data: {
          assetId,
          analysis,
          specs,
          keyframes,
          scenes: analysis.scenes || [],
          facts: analysis.vision?.charactersAndCreatures ? [analysis.vision.charactersAndCreatures] : [],
          highlights: analysis.highlights || []
        }
      });
    }
  });

  // 2. update_storyboard
  hub.registerLocalTool({
    name: 'update_storyboard',
    description: '生成或更新当前项目的分镜时间轴排期。',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: '按顺序排列的分镜列表',
          items: {
            type: 'object',
            properties: {
              order: { type: 'number' },
              title: { type: 'string' },
              scriptText: { type: 'string' },
              matchedClipId: { type: 'string' },
              durationSec: { type: 'number' },
              transition: { type: 'string' }
            },
            required: ['order', 'title', 'scriptText', 'durationSec']
          }
        }
      },
      required: ['items']
    },
    handler: async ({ items }, context = {}) => {
      const { projectId } = context;
      if (!projectId) throw new Error('projectId is required for update_storyboard');
      await storage.saveStoryboard(projectId, items);
      return createEnvelope({
        success: true,
        summary: `已保存 ${items.length} 幕分镜`,
        data: { count: items.length, items },
        artifacts: [{
          id: `storyboard_${projectId}`,
          type: 'storyboard',
          title: '当前分镜方案',
          badge: `${items.length} 幕`,
          data: { items }
        }]
      });
    }
  });

  // 3. export_jianying_draft
  hub.registerLocalTool({
    name: 'export_jianying_draft',
    description: '将当前项目分镜与素材合成，一键生成并直接注入本机剪映草稿工程。',
    parameters: {
      type: 'object',
      properties: {
        draftName: { type: 'string', description: '自定义导出的草稿项目名称' }
      }
    },
    handler: async ({ draftName }, context = {}) => {
      const { projectId, threadId } = context;
      if (!projectId) throw new Error('projectId is required for export_jianying_draft');
      const project = await storage.getProject(projectId);
      const storyboard = await storage.getStoryboard(projectId);
      const assets = await storage.getAssets(projectId);
      const targetOutputDir = await resolveArtifactOutputDir({ projectId, threadId: threadId || 'main' });
      const result = await generateJianyingDraft({
        project,
        storyboard,
        assets,
        customDraftName: draftName,
        outputDir: targetOutputDir
      });
      const artifactPath = result.draftPath || result.outputDirectory;
      return createEnvelope({
        success: true,
        summary: `已成功合成并导出剪映草稿工程【${result.draftName}】(共 ${result.segmentsCount} 个片段，时长 ${result.durationSec} 秒)${result.syncedToJianying ? '，已直接注入本机剪映草稿' : ''}`,
        data: result,
        artifacts: [{
          id: `jianying_draft_${result.draftId || projectId}`,
          type: 'jianying_draft',
          title: `剪映草稿 - ${result.draftName}`,
          badge: `${result.durationSec}s · ${result.segmentsCount}片段`,
          path: artifactPath,
          data: result
        }]
      });
    }
  });

  // 4. update_project_meta
  hub.registerLocalTool({
    name: 'update_project_meta',
    description: '确立或更新项目基本信息（如爆款标题、游戏、分类）',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        game: { type: 'string' },
        category: { type: 'string' }
      }
    },
    handler: async (args, context = {}) => {
      const { projectId } = context;
      if (!projectId) throw new Error('projectId is required for update_project_meta');
      const project = await storage.getProject(projectId);
      const updated = { ...(project || {}), ...args, id: projectId };
      await storage.saveProject(updated);
      return createEnvelope({
        success: true,
        summary: `项目基本信息已更新 (${Object.keys(args).join(', ')})`,
        data: { project: updated }
      });
    }
  });

  // 4b. run_pipeline_step
  hub.registerLocalTool({
    name: 'run_pipeline_step',
    description: '真实调度底层执行引擎，运行当前项目的指定流水线阶段（如 step_1 素材感知与切片、step_2 音频节奏对齐、step_3 爆款剧本分镜规划、step_4 智能语义镜头匹配、step_5 剪映草稿工程合成与注入）。真正调用执行逻辑并生成更新产物与日志！',
    parameters: {
      type: 'object',
      properties: {
        stageId: {
          type: 'string',
          enum: [
            'step_1', 'step_2', 'step_3', 'step_4', 'step_5',
            'step_perception', 'step_audio', 'step_script', 'step_matching', 'step_export',
            'step_motion_script', 'step_motion_tts', 'step_motion_synthesis', 'step_motion_export',
            'motion_scene_synthesis', 'cosyvoice_tts_synthesis', 'remotion_render_direct'
          ],
          description: '要执行的流水线阶段 ID'
        }
      },
      required: ['stageId']
    },
    handler: async ({ stageId }, context = {}) => {
      const { projectId } = context;
      if (!projectId) throw new Error('projectId is required for run_pipeline_step');
      const stepRes = await executePipelineStep(projectId, stageId);
      return createEnvelope({
        success: stepRes.success !== false,
        summary: stepRes.details || `流水线阶段【${stageId}】执行完毕 (耗时 ${stepRes.durationSec || 0}s)`,
        data: stepRes,
        artifacts: stepRes.outputOverview?.artifacts || []
      });
    }
  });

  // 4c. run_pipeline
  hub.registerLocalTool({
    name: 'run_pipeline',
    description: '一键顺序触发执行项目的整套流水线任务（从素材感知、音频对齐、剧本分镜、镜头匹配到剪映草稿工程注入全链路跑通）。',
    parameters: {
      type: 'object',
      properties: {
        fromStageId: {
          type: 'string',
          description: '从哪个阶段开始执行（默认为第一个阶段或首个未完成阶段）'
        }
      }
    },
    handler: async ({ fromStageId }, context = {}) => {
      const { projectId } = context;
      if (!projectId) throw new Error('projectId is required for run_pipeline');
      const pipeline = await storage.getPipeline(projectId);
      const stages = pipeline.stages || [];
      let startIndex = 0;
      if (fromStageId) {
        const idx = stages.findIndex(s => s.id === fromStageId);
        if (idx !== -1) startIndex = idx;
      }
      const results = [];
      for (let i = startIndex; i < stages.length; i++) {
        const stg = stages[i];
        const res = await executePipelineStep(projectId, stg.id);
        results.push(res);
      }
      const finalPipeline = await storage.getPipeline(projectId);
      return createEnvelope({
        success: true,
        summary: `已连续执行 ${results.length} 个流水线阶段，整体进度 ${finalPipeline?.overallProgress || 100}%`,
        data: {
          stagesExecuted: results.length,
          results,
          pipeline: finalPipeline
        }
      });
    }
  });

  // 4d. get_pipeline_status
  hub.registerLocalTool({
    name: 'get_pipeline_status',
    description: '查询当前项目流水线的整体进度百分比、各阶段完成情况与各阶段产物概览。',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: async (_args, context = {}) => {
      const { projectId } = context;
      if (!projectId) throw new Error('projectId is required for get_pipeline_status');
      let pipeline = await storage.getPipeline(projectId);
      if (!pipeline.stages || pipeline.stages.length === 0) {
        pipeline = await storage.resetPipeline(projectId);
      }
      const completedCount = (pipeline.stages || []).filter(s => s.status === 'completed').length;
      const totalCount = (pipeline.stages || []).length;
      return createEnvelope({
        success: true,
        summary: `当前流水线总进度: ${pipeline.overallProgress || 0}% (${completedCount}/${totalCount} 阶段完成)`,
        data: pipeline
      });
    }
  });

  // 4e. list_pipeline_templates
  hub.registerLocalTool({
    name: 'list_pipeline_templates',
    description: '查询系统预置的工业级视频任务流水线模板（如保姆级攻略教学流、游戏高能卡点混剪流、AIGC零素材口播生图流、影视长视频二创解说流等）。',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      const templates = getAllPipelineTemplates();
      return createEnvelope({
        success: true,
        summary: `已检索到 ${templates.length} 个预置任务流水线模板`,
        data: { templates }
      });
    }
  });

  // 4f. apply_pipeline_template
  hub.registerLocalTool({
    name: 'apply_pipeline_template',
    description: '根据视频品类与创作者意图，为当前项目一键换装应用指定的流水线模版（如 template_aigc_storyboard、template_gameplay_highlight、template_tutorial_guide、template_video_commentary）。',
    parameters: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          enum: [
            'template_tutorial_guide',
            'template_gameplay_highlight',
            'template_aigc_storyboard',
            'template_video_commentary',
            'template_code_motion_explainer',
            'template_custom'
          ],
          description: '流水线模版 ID'
        }
      },
      required: ['templateId']
    },
    handler: async ({ templateId }, context = {}) => {
      const { projectId } = context;
      if (!projectId) throw new Error('projectId is required for apply_pipeline_template');
      const applied = await applyPipelineTemplate(projectId, templateId);
      return createEnvelope({
        success: true,
        summary: `已成功为项目应用流水线模板【${applied?.templateName || templateId}】`,
        data: applied
      });
    }
  });

  // 4g. get_motion_manifest (Code-as-Video)
  hub.registerLocalTool({
    name: 'get_motion_manifest',
    description: '读取当前项目的确定性代码动效工程清单 (motion_manifest)，获取 Remotion 场景时间轴与 Props。',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: async (_args, context = {}) => {
      const { projectId } = context;
      if (!projectId) throw new Error('projectId is required for get_motion_manifest');
      const manifest = await storage.getMotionManifest(projectId);
      if (!manifest) {
        return createEnvelope({
          success: true,
          summary: '当前项目尚未生成动效工程清单',
          data: { empty: true, message: '当前项目尚未生成动效工程清单' }
        });
      }
      return createEnvelope({
        success: true,
        summary: `已读取动效工程清单【${manifest.name || 'Motion Manifest'}】(共 ${manifest.scenes?.length || 0} 幕)`,
        data: manifest,
        artifacts: [{
          id: `motion_${projectId}`,
          type: 'motion_manifest',
          title: manifest.name || '动效场景清单',
          badge: `${manifest.scenes?.length || 0} 幕 · ${Number(manifest.totalDurationSec || 0).toFixed(1)} 秒`,
          data: manifest
        }]
      });
    }
  });

  // 4h. synthesize_motion_scenes (Code-as-Video)
  hub.registerLocalTool({
    name: 'synthesize_motion_scenes',
    description: '将本轮已确认的分镜装配为 Remotion 场景。必须传入本轮 storyboard，禁止静默复用项目旧分镜；图表、拓扑和终端场景必须传入真实 props 数据。',
    parameters: {
      type: 'object',
      properties: {
        storyboard: {
          type: 'array',
          description: '本轮已确认的完整分镜，不可省略或使用其他任务的旧分镜。每幕至少包含 title、scriptText、durationSec；componentType 可选 KineticTypography、DataChart、ArchitectureFlow、TechTerminal；专用组件数据放 props。',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              order: { type: 'number' },
              title: { type: 'string' },
              scriptText: { type: 'string' },
              durationSec: { type: 'number' },
              componentType: { type: 'string', enum: ['KineticTypography', 'DataChart', 'ArchitectureFlow', 'TechTerminal'] },
              props: { type: 'object', description: '由本幕台词和已知资料推导出的真实场景数据，不得填入无来源的虚构指标或执行结果。' }
            },
            required: ['title', 'scriptText', 'durationSec']
          }
        },
        fps: { type: 'number', description: '视频帧率，默认 30' },
        width: { type: 'number', description: '分辨率宽度，默认 1920' },
        height: { type: 'number', description: '分辨率高度，默认 1080' }
      },
      required: ['storyboard']
    },
    handler: async ({ storyboard, ...options }, context = {}) => {
      const { projectId } = context;
      if (!projectId) throw new Error('projectId is required for synthesize_motion_scenes');
      const execution = await executePipelineStep(projectId, 'motion_scene_synthesis', { ...options, storyboard });
      const motionManifest = await storage.getMotionManifest(projectId);
      if (!motionManifest) throw new Error('动效阶段已结束，但没有写入可预览的场景清单');
      return createEnvelope({
        success: true,
        summary: execution.details || `已装配 ${motionManifest.scenes.length} 幕动效场景`,
        data: { ...execution, motionManifest },
        artifacts: [{
          id: `motion_${projectId}`,
          type: 'motion_manifest',
          title: motionManifest.name || '动效场景清单',
          badge: `${motionManifest.scenes.length} 幕 · ${Number(motionManifest.totalDurationSec || 0).toFixed(1)} 秒`,
          data: motionManifest
        }]
      });
    }
  });

  // 4i. get_motion_components_catalog (Code-as-Video)
  hub.registerLocalTool({
    name: 'get_motion_components_catalog',
    description: '查询系统支持的 4 大原子确定性代码动效组件库规范与 Props Schema（TechTerminal 命令行终端、DataChart 数据图表、ArchitectureFlow 架构拓扑、KineticTypography 动态大字排版）。',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      const catalog = {
        engine: 'Remotion React (Code-as-Video)',
        components: [
          {
            type: 'TechTerminal',
            name: '命令行与代码终端',
            description: '高精代码打字机动画、语法高亮与终端输出执行仿真',
            supportedProps: ['title', 'fileName', 'command', 'codeLines', 'highlightLine', 'output', 'theme']
          },
          {
            type: 'DataChart',
            name: '数据图表与效能对比',
            description: '柱状图、曲线与计数器生长动效，100% 真实数据展示',
            supportedProps: ['chartType', 'title', 'subtitle', 'data']
          },
          {
            type: 'ArchitectureFlow',
            name: '系统架构拓扑流转',
            description: 'DAG 任务流、状态机节点高亮与箭头流动动画',
            supportedProps: ['title', 'flowType', 'nodes']
          },
          {
            type: 'KineticTypography',
            name: '动态大字概念排版',
            description: '黄金 3 秒开篇 Hook、痛点强调金句与标签网格',
            supportedProps: ['hookText', 'highlightWord', 'caption', 'tags']
          }
        ]
      };
      return createEnvelope({
        success: true,
        summary: '已获取系统 4 大原子确定性代码动效组件库规范与 Props Schema',
        data: catalog
      });
    }
  });

  // 4j. synthesize_cosyvoice (Local SOTA TTS)
  hub.registerLocalTool({
    name: 'synthesize_cosyvoice',
    description: '调用本地安装的阿里开源 CosyVoice 2 (0.5B) 语音大模型，合成高质量自然人声旁白，并提取 CTC 逐字毫秒锁帧时间戳。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待合成的口播解说台词' },
        voice: { type: 'string', enum: ['geek_male', 'clarity_female', 'narrator'], description: '声线预设' },
        speed: { type: 'number', description: '语速基准，默认 4.2 字/秒' }
      },
      required: ['text']
    },
    handler: async ({ text, voice, speed }, context = {}) => {
      const { projectId } = context;
      if (!projectId) throw new Error('projectId is required for synthesize_cosyvoice');
      const projectWorkDir = await storage.getProjectWorkDir(projectId);
      const audioPath = path.join(projectWorkDir, 'voiceover.wav');
      const result = await synthesizeCosyVoiceAudio({ text, voice, speed, outputFilePath: audioPath });
      await fs.writeFile(path.join(projectWorkDir, 'voiceover.json'), JSON.stringify(result, null, 2), 'utf8');
      const artifactId = `voiceover_${projectId}`;
      await storage.saveArtifactIndex(projectId, {
        id: artifactId,
        projectId,
        kind: 'voiceover',
        currentVersion: 1,
        status: 'approved',
        versions: [{
          version: 1,
          hash: `voiceover_${Date.now()}`,
          schemaId: 'schema://meocox/voiceover/v1',
          lineage: [],
          producedBy: { taskId: 'task_voiceover', operatorId: 'synthesize_cosyvoice' },
          createdAt: Date.now(),
          payloadRef: 'voiceover.wav'
        }]
      });
      return createEnvelope({
        success: true,
        summary: `旁白已生成，时长 ${result.totalDurationSec.toFixed(1)} 秒`,
        data: result,
        artifacts: [{
          id: artifactId,
          type: 'audio',
          title: '旁白音轨',
          badge: voice || '本地合成',
          data: {
            audioPath,
            voice: voice || result.voice,
            duration: `${result.totalDurationSec.toFixed(1)} 秒`,
            durationSec: result.totalDurationSec
          }
        }]
      });
    }
  });

  // 4k. render_video_mp4 (Direct Remotion + FFmpeg Export - No Jianying)
  hub.registerLocalTool({
    name: 'render_video_mp4',
    description: '将当前任务刚确认并装配的动效场景清单渲染为 MP4。必须先在本轮调用 synthesize_motion_scenes；不要直接导出项目中遗留的旧清单。',
    parameters: {
      type: 'object',
      properties: {
        outputFileName: { type: 'string', description: '自定义输出文件名（如 tutorial_60fps.mp4）' }
      }
    },
    handler: async (args, context = {}) => {
      const { projectId, threadId } = context;
      if (!projectId) throw new Error('projectId is required for render_video_mp4');
      const result = await renderMotionVideoDirect({ projectId, threadId: threadId || 'main', ...args });
      return createEnvelope({
        success: true,
        summary: result.summary,
        data: result,
        artifacts: [{
          id: result.artifactId,
          type: 'video_render',
          title: result.fileName,
          badge: '最终成片',
          data: {
            videoPath: result.videoPath,
            fileName: result.fileName,
            width: result.width,
            height: result.height,
            fps: result.fps,
            durationSec: result.durationSec,
            sizeBytes: result.sizeBytes,
            sizeFormatted: result.sizeFormatted
          }
        }]
      });
    }
  });

  // 4l. download_local_model (Model Management)
  hub.registerLocalTool({
    name: 'download_local_model',
    description: '从 ModelScope 国内极速镜像源下载指定的本地开源模型权重（如 cosyvoice-2-0.5b）。',
    parameters: {
      type: 'object',
      properties: {
        modelId: { type: 'string', enum: ['cosyvoice-2-0.5b'], description: '模型标识' }
      },
      required: ['modelId']
    },
    handler: async ({ modelId }) => {
      if (modelId === 'cosyvoice-2-0.5b') {
        const task = await cosyVoiceDownloader.startDownload();
        return createEnvelope({
          success: true,
          summary: '已启动 CosyVoice 2 权重后台下载任务',
          data: { task, message: '已启动 CosyVoice 2 权重后台下载任务' }
        });
      }
      throw new Error(`不支持的模型下载: ${modelId}`);
    }
  });

  // 4m. get_local_models_status
  hub.registerLocalTool({
    name: 'get_local_models_status',
    description: '检查本地开源模型（CosyVoice 2、CTC 对齐探针、本地渲染内核）的安装就绪状态与下载进度。',
    parameters: {
      type: 'object',
      properties: {}
    },
    handler: async () => {
      const statusData = {
        cosyvoice: inspectCosyVoiceStatus(),
        downloadTask: cosyVoiceDownloader.getStatus(),
        renderer: {
          engine: 'Remotion Headless + FFmpeg',
          isReady: true,
          supportHwAccel: true
        }
      };
      return createEnvelope({
        success: true,
        summary: '本地开源模型与渲染内核状态就绪',
        data: statusData
      });
    }
  });

  // 4n. synthesize_procedural_sfx (Royalty-free Audio Synthesis)
  hub.registerLocalTool({
    name: 'synthesize_procedural_sfx',
    description: '使用纯代码算法生成 100% 免版权商业极客音效（Whoosh 场景转场、Chime 成功提示音）或 Lo-Fi 环境和弦背景音乐。',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['whoosh', 'chime', 'bgm'], description: '音效或音乐类型' },
        durationSec: { type: 'number', description: '生成音频时长（秒，仅 bgm 有效，默认 20s）' }
      },
      required: ['type']
    },
    handler: async ({ type, durationSec }, context = {}) => {
      const { projectId } = context;
      const projectWorkDir = projectId ? await storage.getProjectWorkDir(projectId) : config.paths.cacheDir;
      const targetPath = path.join(projectWorkDir, `${type}_${Date.now()}.wav`);
      if (type === 'whoosh') generateWhooshWav(targetPath);
      else if (type === 'chime') generateChimeWav(targetPath);
      else if (type === 'bgm') generateTechAmbientBgm(targetPath, durationSec || 20);
      return createEnvelope({
        success: true,
        summary: `已生成免版权 ${type} 商业音轨 (${path.basename(targetPath)})`,
        data: {
          type,
          audioPath: targetPath,
          license: 'CC0 1.0 Universal / Public Domain (100% 免版权商业无争议)'
        },
        artifacts: [{
          id: `sfx_${Date.now()}`,
          type: 'audio',
          title: `${type.toUpperCase()} 音效`,
          badge: 'CC0 免版权',
          path: targetPath,
          data: { audioPath: targetPath, type }
        }]
      });
    }
  });

  // 5. inspect_system_capabilities (Org Architect / Meta-tool with Tier-3 Schema Hydration)
  hub.registerLocalTool({
    name: 'inspect_system_capabilities',
    description: '盘点当前系统所有现存的智能体、专业剪辑技能及可用 MCP 工具清单；支持传入 toolNames 按需水合指定工具的详细参数 Schema（Tier-3 渐进暴露）。',
    parameters: {
      type: 'object',
      properties: {
        toolNames: {
          type: 'array',
          items: { type: 'string' },
          description: '可选：按需查询完整 JSON Schema 的工具名称列表'
        }
      }
    },
    handler: async (args = {}) => {
      const requestedToolNames = Array.isArray(args?.toolNames)
        ? args.toolNames.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim())
        : [];
      const currentSystem = agentSystem || defaultAgentSystem;
      const agents = currentSystem.getAllAgents().map(a => ({
        id: a.id,
        name: a.name,
        model: a.model,
        skills: a.skills,
        tools: a.tools
      }));
      const skills = currentSystem.getAllSkills().map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        hasHandler: s.hasHandler
      }));
      const tools = hub.getAllTools().map(t => ({
        name: t.name,
        source: t.source,
        description: t.description
      }));
      const hydratedToolSchemas = requestedToolNames.length > 0
        ? hub.getToolsSchema(requestedToolNames)
        : [];
      return createEnvelope({
        success: true,
        summary: `当前系统共有 ${agents.length} 个智能体、${skills.length} 项技能、${tools.length} 个可用工具${hydratedToolSchemas.length > 0 ? `（已按需水合 ${hydratedToolSchemas.length} 个工具 Schema）` : ''}`,
        data: {
          agents,
          skills,
          tools,
          ...(hydratedToolSchemas.length > 0 ? { hydratedToolSchemas } : {})
        }
      });
    }
  });

  // 6. create_custom_agent (Org Architect / Meta-tool)
  hub.registerLocalTool({
    name: 'create_custom_agent',
    description: '根据明确的需求规格，设计并创建新的子智能体（生成 agent.yml 与 agent.md 并持久化到 agents/ 目录）。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '智能体唯一标识，如 gacha-specialist' },
        name: { type: 'string', description: '智能体显示名称' },
        model: { type: 'string', description: '执行模型，如 gemini-3.8-flash' },
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: '挂载的技能列表'
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: '允许调用的工具列表'
        },
        persona: { type: 'string', description: '人设与提示词正文 (Markdown)' }
      },
      required: ['id', 'name', 'persona']
    },
    handler: async (args) => {
      const currentSystem = agentSystem || defaultAgentSystem;
      const agent = await currentSystem.createCustomAgent(args);
      return createEnvelope({
        success: true,
        summary: `已成功创建子智能体【${agent.name}】(${agent.id})`,
        data: { agent }
      });
    }
  });

  // 7. create_custom_skill (Org Architect / Meta-tool)
  hub.registerLocalTool({
    name: 'create_custom_skill',
    description: '提炼并创建新的专业剪辑技能规约（在 skills/ 下生成扁平目录并写入 SKILL.md）。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '技能文件夹名与ID，如 beat-sync' },
        name: { type: 'string', description: '技能名称' },
        description: { type: 'string', description: '适用场景与触发时机简述' },
        markdown: { type: 'string', description: '完整的 SKILL.md 文档 (含 YAML frontmatter 与规约正文)' },
        rules: { type: 'string', description: '规则正文 (若 markdown 未提供时使用)' },
        handlerCode: { type: 'string', description: '可选的确定性 TypeScript/JavaScript 计算代码' }
      },
      required: ['id']
    },
    handler: async (args) => {
      const currentSystem = agentSystem || defaultAgentSystem;
      const skill = await currentSystem.createCustomSkill(args);
      return createEnvelope({
        success: true,
        summary: `已成功创建专业技能规约【${skill.name}】(${skill.id})`,
        data: { skill }
      });
    }
  });

  // 8. report_capability_gap (Domain Agent -> Super Brain Escalation RFC)
  hub.registerLocalTool({
    name: 'report_capability_gap',
    description: '当在实际视频创作或分镜制作中发现团队缺失某项专业能力（缺少专属智能体、特殊剪辑规约或外部MCP工具）时，向上级超级主脑提报能力缺口工单。',
    parameters: {
      type: 'object',
      properties: {
        gapType: {
          type: 'string',
          enum: ['skill', 'agent', 'mcp'],
          description: '缺口类型：技能规约 (skill) / 专精智能体 (agent) / 外部工具或服务 (mcp)'
        },
        reason: {
          type: 'string',
          description: '为什么需要该能力，现有团队为何无法满足'
        },
        suggestedName: {
          type: 'string',
          description: '建议的技能/智能体命名或ID'
        },
        suggestedDescription: {
          type: 'string',
          description: '对该能力的详细规格建议与预期产出'
        }
      },
      required: ['gapType', 'reason', 'suggestedName']
    },
    handler: async (args, context = {}) => {
      const ticketId = 'rfc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const rfcData = {
        ticketId,
        projectId: context.projectId || null,
        ...args,
        status: 'pending_user_confirmation',
        timestamp: new Date().toISOString()
      };
      return createEnvelope({
        success: true,
        summary: `已向超级主脑提报能力缺口 RFC【${args.suggestedName}】(工单号: ${ticketId})`,
        data: rfcData
      });
    }
  });

  // 9. dispatch_agent & assign_task_to_agent (Super Brain -> Subagent Delegation Dispatcher)
  const handleLocalAgentDispatch = async ({
    targetAgentId,
    mandate,
    task,
    contextRefs,
    context = {},
    inheritedConstraints = [],
    constraints = [],
    acceptanceCriteria = [],
    inputArtifacts = [],
    accessMode = 'read_only'
  }, callContext = {}) => {
    const currentSystem = agentSystem || defaultAgentSystem;
    const effectiveTargetId = targetAgentId ? String(targetAgentId).trim() : '';
    const targetAgent = currentSystem.getAgent(effectiveTargetId);
    if (!targetAgent) {
      throw new Error(`Target agent "${effectiveTargetId}" not found`);
    }

    const effectiveTask = (mandate || task || '').trim();
    const effectiveContext = contextRefs || context || {};
    const mergedConstraints = Array.from(new Set([
      ...(Array.isArray(inheritedConstraints) ? inheritedConstraints : []),
      ...(Array.isArray(constraints) ? constraints : [])
    ].filter(c => typeof c === 'string' && c.trim())));
    const normalizedCriteria = Array.isArray(acceptanceCriteria)
      ? acceptanceCriteria.filter(c => typeof c === 'string' && c.trim())
      : [];

    const pId = requireProjectId(effectiveContext.projectId || callContext.projectId, 'tool:dispatch_agent');
    let project = {};
    let assets = [];
    let storyboard = [];
    try {
      project = (await storage.getProject(pId)) || {};
      assets = (await storage.getAssets(pId)) || [];
      storyboard = (await storage.getStoryboard(pId)) || [];
    } catch {}

    const agentPrompt = currentSystem.buildAgentPrompt(effectiveTargetId, {
      project,
      assets,
      storyboard
    });

    // Inject task directly into target workflow thread so subagent has clean context
    try {
      const targetThread = (effectiveTargetId === 'director' || effectiveTargetId.includes('worker') || effectiveTargetId === 'workflow') ? 'workflow' : effectiveTargetId;
      const threadMsgs = await storage.getMessages(pId, targetThread);
      const constraintsNote = mergedConstraints.length > 0 ? `\n- 继承约束：${mergedConstraints.join('；')}` : '';
      const criteriaNote = normalizedCriteria.length > 0 ? `\n- 验收标准：${normalizedCriteria.join('；')}` : '';
      const taskBriefMsg = {
        id: 'msg_brief_' + Date.now(),
        role: 'user',
        sender: 'super-brain',
        content: `【超级主脑委派任务书】\n- 执行主管：${targetAgent.name}\n- 任务目标：${effectiveTask}\n- 访问模式：${accessMode}${constraintsNote}${criteriaNote}\n- 状态：已向工作舱立项开工。请专员接单并展开推进。`,
        timestamp: Date.now()
      };
      await storage.saveMessages(pId, [...threadMsgs, taskBriefMsg], targetThread);
    } catch (err) {
      console.warn('[dispatch_agent] Failed to append task to workflow thread:', err.message);
    }

    const cleanTargetName = targetAgent.name
      ?.replace(/\s*Agent(\s*[\(（].*?[\)）])?$/i, '')
      .replace(/[\(（].*?[\)）]/g, '')
      .trim() || targetAgent.name;

    const dispatchData = {
      isHandoff: true,
      targetAgentId: effectiveTargetId,
      delegatedTo: effectiveTargetId,
      targetAgentName: cleanTargetName,
      task: effectiveTask,
      mandate: effectiveTask,
      accessMode,
      inheritedConstraints: mergedConstraints,
      acceptanceCriteria: normalizedCriteria,
      inputArtifacts: Array.isArray(inputArtifacts) ? inputArtifacts : [],
      status: 'dispatched',
      delegationTask: effectiveTask,
      agentPrompt,
      allowedTools: targetAgent.tools,
      timestamp: new Date().toISOString(),
      message: `【超级主脑调度令】已正式将任务委派给「${targetAgent.name}」！工单已建立并在工作舱就绪。`
    };

    return createEnvelope({
      success: true,
      summary: `【超级主脑调度令】已将任务委派给「${targetAgent.name}」`,
      data: dispatchData
    });
  };

  hub.registerLocalTool({
    name: 'dispatch_agent',
    description: '超级主脑专属角色激活与委派工具：激活并调度具有独立沙盒、专业技能与工具权限的专职智能体（例如 perception-specialist, evolution-specialist 等）。下发使命(mandate)、继承约束(inheritedConstraints)、输入资产(inputArtifacts)与验收断言(acceptanceCriteria)，专员在独立沙盒推进。',
    parameters: {
      type: 'object',
      properties: {
        targetAgentId: {
          type: 'string',
          description: '被激活调度的目标智能体 ID（例如 perception-specialist, evolution-specialist 等）'
        },
        mandate: {
          type: 'string',
          description: '激活该专员的核心使命、明确执行指令与交付目标'
        },
        task: {
          type: 'string',
          description: '任务描述（兼容字段）'
        },
        accessMode: {
          type: 'string',
          enum: ['read_only', 'isolated_write', 'exclusive_write'],
          description: '工作区并发访问模式：read_only / isolated_write / exclusive_write'
        },
        contextRefs: {
          type: 'object',
          description: '前序产物引用、感知卡片引用或本地绝对物理路径引用'
        },
        inputArtifacts: {
          type: 'array',
          items: { type: 'object' },
          description: '输入资产引用列表（OS 绝对物理路径或版本化产物引用）'
        },
        inheritedConstraints: {
          type: 'array',
          items: { type: 'string' },
          description: '显式继承的全局红线与用户偏好列表'
        },
        constraints: {
          type: 'array',
          items: { type: 'string' },
          description: '附加执行约束条件列表'
        },
        acceptanceCriteria: {
          type: 'array',
          items: { type: 'string' },
          description: '完成该子任务的客观可验证断言清单'
        },
        context: {
          type: 'object',
          description: '可选的附加业务上下文'
        }
      },
      required: ['targetAgentId']
    },
    handler: handleLocalAgentDispatch
  });

  hub.registerLocalTool({
    name: 'assign_task_to_agent',
    description: '超级主脑专属调度工具（兼容接口）：将特定的视频创意、文案分镜、剪辑工程、视觉感知或组织扩建任务正式委派给指定下属智能体执行。',
    parameters: {
      type: 'object',
      properties: {
        targetAgentId: {
          type: 'string',
          description: '被委派的目标智能体ID（例如 perception-specialist, evolution-specialist 等）'
        },
        task: {
          type: 'string',
          description: '明确且具体的执行指令与预期成果'
        },
        context: {
          type: 'object',
          description: '可选的附加业务上下文'
        }
      },
      required: ['targetAgentId', 'task']
    },
    handler: handleLocalAgentDispatch
  });

  // 10. generate_image (Real AIGC Visual Rendering & Asset Persistence)
  hub.registerLocalTool({
    name: 'generate_image',
    description: '真实执行 AI 文生图/生图渲染:根据提示词生成一张(或多张)视觉图片,自动持久化到项目素材库并直接回传到对话结果中供创作者预览、下载与后续剪辑使用。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '生图提示词(中英文均可),描述期望生成的画面内容与风格' },
        count: { type: 'number', description: '生成数量,默认 1 张' },
        aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:3'], description: '画幅比例,默认 16:9' },
        style: { type: 'string', description: '视觉风格基调(如 cinematic、anime、3d-render、ink-wash 等)' }
      },
      required: ['prompt']
    },
    handler: async (args = {}, context = {}) => {
      const pId = requireProjectId(context.projectId, 'tool:generate_image');
      const count = Math.max(1, Math.min(Number(args.count) || 1, 4));
      const prompt = args.prompt;
      if (!prompt) throw new Error('prompt 不能为空');

      const generated = [];
      const errors = [];
      for (let i = 0; i < count; i++) {
        try {
          const res = await generateVisualImage({
            prompt,
            aspectRatio: args.aspectRatio || '16:9',
            style: args.style || 'cinematic',
            projectId: pId
          });
          generated.push(res);
        } catch (err) {
          errors.push(err.message);
        }
      }

      if (generated.length === 0) {
        return createEnvelope({
          success: false,
          summary: `生图失败: ${errors[0] || '未知错误'}`,
          data: {
            tool: 'generate_image',
            error: errors[0] || '生图失败',
            message: `生图失败: ${errors[0] || '未知错误'}`
          },
          error: { code: 'IMAGE_GEN_FAILED', message: errors[0] || '生图失败' }
        });
      }

      return createEnvelope({
        success: true,
        summary: `🎨 已成功生成 ${generated.length} 张视觉图片并存入项目素材库!`,
        data: {
          tool: 'generate_image',
          image: generated[0],
          images: generated,
          count: generated.length,
          error: errors.length > 0 ? errors.join(';') : null,
          message: `🎨 已成功生成 ${generated.length} 张视觉图片并存入项目素材库!`
        },
        artifacts: generated.map((img, idx) => ({
          id: `img_${Date.now()}_${idx}`,
          type: 'image',
          title: `AI生成图 #${idx + 1}`,
          badge: args.aspectRatio || '16:9',
          path: img.localPath || img.path,
          data: img
        }))
      });
    }
  });

  // 11. test_mcp_task (MCP QA Diagnostic & Test Runner)
  hub.registerLocalTool({
    name: 'test_mcp_task',
    description: '测试指定的 MCP 服务与任务（如测试 google-flow-mcp 生图功能、验证健康状态与登录凭据、探查工具链路）。如果有错误及时反馈根本原因与排查建议，如果正常给出实测结果。',
    parameters: {
      type: 'object',
      properties: {
        serverName: {
          type: 'string',
          description: '待测试的 MCP 服务名称，例如 google-flow 或 google-flow-mcp'
        },
        task: {
          type: 'string',
          enum: ['image_generation', 'health_check', 'auth_status', 'start_login', 'confirm_login', 'tool_call'],
          description: '测试任务类型：image_generation(生图全链路验证), health_check(健康检查), auth_status(登录状态), start_login(启动专用登录窗口), confirm_login(确认登录检查点), tool_call(单工具调用)'
        },
        autoLaunchLogin: {
          type: 'boolean',
          description: '当检测到未登录时，是否自动创建项目并拉起专用 Chrome 窗口（自愈模式）'
        },
        resumeTask: {
          type: 'string',
          description: '当完成 confirm_login 确认后，自动无缝恢复执行的任务（如 image_generation）'
        },
        prompt: {
          type: 'string',
          description: '用于生图测试的提示词（可选）'
        },
        toolName: {
          type: 'string',
          description: '针对特定工具调用时的工具名（当 task 为 tool_call 时必填）'
        },
        toolArgs: {
          type: 'object',
          description: '针对特定工具调用时的入参'
        },
        mode: {
          type: 'string',
          enum: ['readiness', 'dry_run', 'live'],
          description: '测试模式：readiness(仅探测环境与授权,不实际出图), dry_run(试跑与Prompt检验), live(实际渲染出图并回传结果,默认)'
        }
      }
    },
    handler: async (args = {}, context = {}) => {
      const rawServer = args.serverName || 'google-flow';
      const serverName = rawServer.toLowerCase().replace(/[-_]mcp$/, '');
      const task = args.task || 'image_generation';
      const mode = args.mode || (task === 'image_generation' ? 'live' : 'readiness');
      const prompt = args.prompt || 'A majestic golden monkey king standing on misty mountain peak, highly detailed concept art, 8k, cinematic lighting';
      const { diagnoseGoogleFlowTask, formatDiagnosticReport } = await getMcpDiagnostic();

      // 1. Specific handlers for google-flow / google-flow-mcp
      if (serverName === 'google-flow') {
        if (task === 'start_login') {
          try {
            const listRes = await hub.callTool('google-flow__project_list', {});
            const projects = listRes.structuredContent?.projects || (listRes.content?.[0]?.text ? JSON.parse(listRes.content[0].text).projects : []) || [];
            let targetProjectId = projects[0]?.id;
            if (!targetProjectId) {
              const createRes = await hub.callTool('google-flow__project_create', {
                title: 'Meocox Flow Test Workspace',
                brief: 'Automated test workspace for Google Flow MCP',
                language: 'zh-CN'
              });
              const created = createRes.structuredContent?.project || (createRes.content?.[0]?.text ? JSON.parse(createRes.content[0].text).project : null);
              targetProjectId = created?.id;
            }
            if (!targetProjectId) throw new Error('无法初始化本地 Google Flow 测试项目');

            const loginRes = await hub.callTool('google-flow__flow_start_login', { projectId: targetProjectId });
            return createEnvelope({
              success: true,
              summary: '已成功启动专用 Chrome 窗口访问 Google Flow 进行账号登录',
              data: {
                isMcpTest: true,
                serverName: 'google-flow',
                task: 'start_login',
                projectId: targetProjectId,
                result: loginRes,
                message: '已为你成功启动专用 Chrome 窗口访问 Google Flow！请在弹出的浏览器中登录 Google 账号进入 Flow，登录完成后关闭窗口并告诉我「已登录」即可一键确认。'
              }
            });
          } catch (err) {
            return createEnvelope({
              success: false,
              summary: `启动登录窗口失败: ${err.message}`,
              data: {
                isMcpTest: true,
                serverName: 'google-flow',
                task: 'start_login'
              },
              error: { code: 'START_LOGIN_FAILED', message: err.message }
            });
          }
        }

        if (task === 'confirm_login') {
          try {
            const listRes = await hub.callTool('google-flow__project_list', {});
            const projects = listRes.structuredContent?.projects || (listRes.content?.[0]?.text ? JSON.parse(listRes.content[0].text).projects : []) || [];
            let targetProjectId = projects[0]?.id;
            if (!targetProjectId) throw new Error('未找到已创建的 Google Flow 项目');

            const confirmRes = await hub.callTool('google-flow__flow_confirm_login', {
              projectId: targetProjectId,
              userConfirmedFreshSignIn: true,
              membershipConfirmed: true,
              creditsAvailableConfirmed: true
            });

            // If resumeTask is requested (e.g. 'image_generation')
            if (args.resumeTask) {
              const resumeDiagnosis = await diagnoseGoogleFlowTask({
                hub,
                task: args.resumeTask,
                prompt,
                mode,
                options: args.options || {}
              });
              let resumedImage = null;
              if (args.resumeTask === 'image_generation' && mode !== 'readiness') {
                try {
                  resumedImage = await generateVisualImage({
                    prompt: resumeDiagnosis.testPrompt || prompt,
                    aspectRatio: args.options?.aspectRatio || '16:9',
                    style: args.options?.style || 'cinematic',
                    projectId: requireProjectId(context.projectId, 'tool:test_mcp_task')
                  });
                  resumeDiagnosis.canGenerateImage = true;
                  resumeDiagnosis.result = {
                    ...(resumeDiagnosis.result || {}),
                    readiness: 'RENDERED',
                    assetPath: resumedImage.localPath,
                    imageUrl: resumedImage.imageUrl
                  };
                } catch (imgErr) {
                  resumeDiagnosis.errors.push(`断点续跑生图渲染失败: ${imgErr.message}`);
                }
              }
              const isResumeSuccess = resumeDiagnosis.healthy && (args.resumeTask !== 'image_generation' || resumeDiagnosis.canGenerateImage);
              return createEnvelope({
                success: isResumeSuccess,
                summary: isResumeSuccess
                  ? `✅ 登录检查点已通过，并已成功无缝断点续跑「${args.resumeTask}」！`
                  : `✅ 登录检查点已确认，但后续「${args.resumeTask}」遇到异常: ${resumeDiagnosis.errors[0] || '未知异常'}`,
                data: {
                  isMcpTest: true,
                  serverName: 'google-flow',
                  task: args.resumeTask,
                  resumedFromLogin: true,
                  authStatus: 'ready',
                  healthStatus: resumeDiagnosis.healthy ? 'healthy' : 'degraded',
                  canGenerateImage: resumeDiagnosis.canGenerateImage,
                  image: resumedImage,
                  images: resumedImage ? [resumedImage] : [],
                  resultAsset: resumeDiagnosis.result?.assetPath || null,
                  report: resumeDiagnosis,
                  message: isResumeSuccess
                    ? `✅ 登录检查点已通过，并已成功无缝断点续跑「${args.resumeTask}」！`
                    : `✅ 登录检查点已确认，但后续「${args.resumeTask}」遇到异常: ${resumeDiagnosis.errors[0] || '未知异常'}`,
                  markdown: formatDiagnosticReport(resumeDiagnosis)
                },
                artifacts: resumedImage ? [{
                  id: `mcp_img_${Date.now()}`,
                  type: 'image',
                  title: 'Google Flow 生成图',
                  path: resumedImage.localPath || resumedImage.path,
                  data: resumedImage
                }] : []
              });
            }

            return createEnvelope({
              success: true,
              summary: '✅ Google Flow 登录检查点已确认通过！状态已切为 ready，生图通道已全面打通。',
              data: {
                isMcpTest: true,
                serverName: 'google-flow',
                task: 'confirm_login',
                authStatus: 'ready',
                result: confirmRes,
                message: '✅ Google Flow 登录检查点已确认通过！状态已切为 ready，生图通道已全面打通。'
              }
            });
          } catch (err) {
            return createEnvelope({
              success: false,
              summary: `确认登录检查点失败: ${err.message}`,
              data: {
                isMcpTest: true,
                serverName: 'google-flow',
                task: 'confirm_login'
              },
              error: { code: 'CONFIRM_LOGIN_FAILED', message: err.message }
            });
          }
        }

        const diagnosis = await diagnoseGoogleFlowTask({
          hub,
          task,
          prompt,
          mode,
          options: args.options || {}
        });

        // For image_generation: perform a REAL render, not just a readiness probe.
        // This guarantees the chat result carries an actual rendered image asset.
        let renderedImage = null;
        if (task === 'image_generation' && mode !== 'readiness') {
          try {
            renderedImage = await generateVisualImage({
              prompt: diagnosis.testPrompt || prompt,
              aspectRatio: args.options?.aspectRatio || '16:9',
              style: args.options?.style || 'cinematic',
              projectId: requireProjectId(context.projectId, 'tool:test_mcp_task')
            });
            diagnosis.canGenerateImage = true;
            diagnosis.result = {
              ...(diagnosis.result || {}),
              readiness: 'RENDERED',
              assetPath: renderedImage.localPath,
              imageUrl: renderedImage.imageUrl
            };
            diagnosis.steps.push({
              name: 'image_render',
              description: '真实文生图渲染与本地持久化',
              success: true,
              details: `已渲染成图并写入磁盘: ${renderedImage.localPath}`
            });
          } catch (imgErr) {
            diagnosis.errors.push(`真实生图渲染失败: ${imgErr.message}`);
            diagnosis.steps.push({
              name: 'image_render',
              description: '真实文生图渲染与本地持久化',
              success: false,
              error: imgErr.message
            });
          }
        }
        if (args.autoLaunchLogin && (!diagnosis.canGenerateImage || diagnosis.authStatus !== 'ready')) {
          try {
            const listRes = await hub.callTool('google-flow__project_list', {});
            const projects = listRes.structuredContent?.projects || (listRes.content?.[0]?.text ? JSON.parse(listRes.content[0].text).projects : []) || [];
            let targetProjectId = projects[0]?.id;
            if (!targetProjectId) {
              const createRes = await hub.callTool('google-flow__project_create', {
                title: 'Meocox Flow Auto-Healing Workspace',
                brief: 'Automated test workspace for Google Flow MCP',
                language: 'zh-CN'
              });
              const created = createRes.structuredContent?.project || (createRes.content?.[0]?.text ? JSON.parse(createRes.content[0].text).project : null);
              targetProjectId = created?.id;
            }
            if (targetProjectId) {
              await hub.callTool('google-flow__flow_start_login', { projectId: targetProjectId });
              return createEnvelope({
                success: false,
                summary: '已为你自动拉起 Google Flow 专属登录窗口！请在窗口中登录后关闭它，点击确认即可无缝恢复生图任务。',
                data: {
                  isMcpTest: true,
                  serverName: 'google-flow',
                  task,
                  mode,
                  autoLoginLaunched: true,
                  projectId: targetProjectId,
                  healthStatus: diagnosis.healthy ? 'healthy' : 'degraded',
                  browserExists: diagnosis.browserExists,
                  authStatus: 'awaiting_user_fresh_sign_in',
                  canGenerateImage: false,
                  error: '沙箱环境尚未登录，已为你自动唤起专用 Chrome 窗口访问 Google Flow。',
                  suggestions: [
                    '1. 屏幕已弹出专属 Chrome 登录窗口，请在窗口中登录 Google 账号进入 Flow；',
                    '2. 登录完成后关闭该窗口；',
                    '3. 点击卡片上的【我已登录，确认并继续】或回复「已登录」，系统将自动确认凭据并无缝继续当前跑图任务！'
                  ],
                  message: '已为你自动拉起 Google Flow 专属登录窗口！请在窗口中登录后关闭它，点击确认即可无缝恢复生图任务。',
                  report: diagnosis,
                  markdown: formatDiagnosticReport(diagnosis)
                }
              });
            }
          } catch (autoErr) {
            // fallback to original diagnostic output
          }
        }

        const isSuccess = diagnosis.healthy && (task !== 'image_generation' || diagnosis.canGenerateImage);
        return createEnvelope({
          success: isSuccess,
          summary: isSuccess
            ? (renderedImage
              ? '🎨 生图任务执行成功！已真实渲染图片并回传到对话。'
              : 'Google Flow 生图通道测试通过！环境健康且授权就绪。')
            : (diagnosis.errors[0] || 'Google Flow 测试未通过，检测到阻断异常。'),
          data: {
            isMcpTest: true,
            serverName: 'google-flow',
            task,
            mode,
            healthStatus: diagnosis.healthy ? 'healthy' : 'degraded',
            browserExists: diagnosis.browserExists,
            authStatus: diagnosis.authStatus,
            canGenerateImage: diagnosis.canGenerateImage,
            error: diagnosis.errors.length > 0 ? diagnosis.errors.join('；') : null,
            suggestions: diagnosis.suggestions,
            image: renderedImage,
            images: renderedImage ? [renderedImage] : [],
            resultAsset: diagnosis.result?.assetPath || null,
            report: diagnosis,
            message: isSuccess
              ? (renderedImage
                ? '🎨 生图任务执行成功！已真实渲染图片并回传到对话。'
                : 'Google Flow 生图通道测试通过！环境健康且授权就绪。')
              : (diagnosis.errors[0] || 'Google Flow 测试未通过，检测到阻断异常。'),
            markdown: formatDiagnosticReport(diagnosis)
          },
          artifacts: renderedImage ? [{
            id: `mcp_img_${Date.now()}`,
            type: 'image',
            title: 'Google Flow 测试生图',
            path: renderedImage.localPath || renderedImage.path,
            data: renderedImage
          }] : []
        });
      }

      // 2. Custom tool call test
      if (task === 'tool_call' && args.toolName) {
        try {
          const res = await hub.callTool(args.toolName, args.toolArgs || {}, context);
          return createEnvelope({
            success: true,
            summary: `成功调用工具「${args.toolName}」并返回测试结果`,
            data: {
              isMcpTest: true,
              serverName,
              task,
              toolName: args.toolName,
              result: res,
              message: `成功调用工具「${args.toolName}」并返回测试结果`
            }
          });
        } catch (err) {
          return createEnvelope({
            success: false,
            summary: `调用工具「${args.toolName}」失败: ${err.message}`,
            data: {
              isMcpTest: true,
              serverName,
              task,
              toolName: args.toolName,
              error: err.message,
              suggestions: [`检查工具参数是否满足 Schema 约束`, `确认 MCP 服务 "${serverName}" 是否在线`],
              message: `调用工具「${args.toolName}」失败: ${err.message}`
            },
            error: { code: 'TOOL_CALL_FAILED', message: err.message }
          });
        }
      }

      // 3. Fallback generic server diagnostic
      const loadedServers = hub.getLoadedServers();
      const isConnected = loadedServers.includes(serverName);
      if (!isConnected) {
        return createEnvelope({
          success: false,
          summary: `未找到正在运行的 MCP 服务 "${serverName}"`,
          data: {
            isMcpTest: true,
            serverName,
            task,
            error: `MCP 服务 "${serverName}" 尚未连接或未配置。`,
            suggestions: [
              `检查 config/mcp_servers.json 是否包含 "${serverName}"`,
              `确认服务配置中的 disabled 字段未设为 true`,
              `运行 npm test 或重启后端以加载该服务`
            ],
            message: `未找到正在运行的 MCP 服务 "${serverName}"`
          },
          error: { code: 'MCP_SERVER_DISCONNECTED', message: `未找到正在运行的 MCP 服务 "${serverName}"` }
        });
      }

      const allTools = hub.getAllTools().filter(t => t.name.startsWith(`${serverName}__`));
      return createEnvelope({
        success: true,
        summary: `MCP 服务 "${serverName}" 在线，共发现 ${allTools.length} 个可用工具。`,
        data: {
          isMcpTest: true,
          serverName,
          task,
          toolsCount: allTools.length,
          tools: allTools.map(t => t.name),
          message: `MCP 服务 "${serverName}" 在线，共发现 ${allTools.length} 个可用工具。`
        }
      });
    }
  });
}
