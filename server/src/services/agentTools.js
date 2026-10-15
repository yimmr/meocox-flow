import { storage, requireProjectId } from '../storage/index.js';
import { generateJianyingDraft } from './jianying.js';
import { formatDuration } from './media.js';
import { perceiveVideoAsset } from './videoPerception.js';
import { defaultMCPHub } from '../runtime/mcpHub.js';
import { executePipelineStep, applyPipelineTemplate, getAllPipelineTemplates } from './pipelineRunner.js';

export const AGENT_TOOLS_DEFINITIONS = [
  {
    name: 'assign_task_to_agent',
    description: '超级主脑专属委派调度工具：将特定的视频创意策划、分镜编排、剪辑工程、视觉感知或组织扩建任务正式委派给指定下属智能体（如 director、org-architect、screenwriter、timeline-editor、vision-scout）执行。',
    parameters: {
      type: 'object',
      properties: {
        targetAgentId: { type: 'string', description: '被委派的目标智能体ID（例如 director, org-architect, screenwriter, timeline-editor, vision-scout）' },
        task: { type: 'string', description: '明确且具体的执行指令与预期成果' }
      },
      required: ['targetAgentId', 'task']
    }
  },
  {
    name: 'report_capability_gap',
    description: '当在实际视频创作中发现团队缺失某项专业能力（缺少专属智能体、特殊剪辑规约或外部MCP工具）时，向超级主脑提报能力缺口工单。',
    parameters: {
      type: 'object',
      properties: {
        gapType: { type: 'string', enum: ['skill', 'agent', 'mcp'], description: '缺口类型' },
        reason: { type: 'string', description: '为何需要该能力，现有团队为何不足' },
        suggestedName: { type: 'string', description: '建议的技能/智能体命名' },
        suggestedDescription: { type: 'string', description: '对该能力的详细规格建议' }
      },
      required: ['gapType', 'reason', 'suggestedName']
    }
  },
  {
    name: 'create_custom_agent',
    description: '经创作者授权后，由组织架构师根据明确需求规格设计并创建新的子智能体。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '智能体唯一标识，如 gacha-specialist' },
        name: { type: 'string', description: '智能体显示名称' },
        model: { type: 'string', description: '执行模型，从已有模型中选' },
        skills: { type: 'array', items: { type: 'string' }, description: '绑定的技能列表' },
        tools: { type: 'array', items: { type: 'string' }, description: '允许调用的工具' },
        persona: { type: 'string', description: '人设与提示词正文 (Markdown)' }
      },
      required: ['id', 'name', 'persona']
    }
  },
  {
    name: 'create_custom_skill',
    description: '经创作者授权后，由组织架构师提炼并创建新的专业剪辑技能规约（生成扁平 SKILL.md）。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '技能文件夹名与ID' },
        name: { type: 'string', description: '技能名称' },
        description: { type: 'string', description: '适用场景与触发时机简述' },
        markdown: { type: 'string', description: '完整的 SKILL.md 文档 (含 YAML frontmatter 与规约正文)' }
      },
      required: ['id']
    }
  },
  {
    name: 'inspect_system_capabilities',
    description: '盘点当前系统所有现存智能体、剪辑技能及可用工具清单，评估能力是否完备。',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'inspect_video_content',
    description: '调度 Vision Scout 视觉感知探针，解码并分析指定素材的真实画面、场景切点、关键帧内容与音轨特征。当用户询问“视频是什么/里面有什么”、分析素材、或需要确认镜头细节以规划分镜时，必须调度此工具！',
    parameters: {
      type: 'object',
      properties: {
        assetId: { type: 'string', description: '需要探查的素材ID或文件名（如 clip_03、20260721-124409.mp4、ywzh 2026...）' }
      },
      required: ['assetId']
    }
  },
  {
    name: 'update_storyboard',
    description: '生成或更新当前项目的分镜时间轴排期。Agent 应根据分镜台词、节奏、转场与可用素材 ID，构建完整分镜列表。',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: '按顺序排列的分镜列表',
          items: {
            type: 'object',
            properties: {
              order: { type: 'number', description: '分镜序号（从 1 开始）' },
              title: { type: 'string', description: '分镜标题（如：【黄金钩子】痛点引流）' },
              scriptText: { type: 'string', description: '该分镜对应的口播台词解说文案' },
              matchedClipId: { type: 'string', description: '匹配的素材切片 ID（如 clip_01、clip_02）' },
              durationSec: { type: 'number', description: '本分镜时长（秒数，通常 3-10 秒）' },
              transition: { type: 'string', description: '视听转场与特效提示（如：重低音放大/慢动作定格）' }
            },
            required: ['order', 'title', 'scriptText', 'durationSec']
          }
        }
      },
      required: ['items']
    }
  },
  {
    name: 'update_pipeline_stage',
    description: '推进或更新项目的流水线任务阶段状态与进度。',
    parameters: {
      type: 'object',
      properties: {
        stageId: { type: 'string', enum: ['step_1', 'step_2', 'step_3', 'step_4'], description: '阶段 ID' },
        status: { type: 'string', enum: ['waiting', 'in_progress', 'completed'], description: '状态' },
        progress: { type: 'number', description: '阶段完成度百分比 (0-100)' },
        details: { type: 'string', description: '阶段执行详情汇报摘要' }
      },
      required: ['stageId', 'status']
    }
  },
  {
    name: 'export_jianying_draft',
    description: '将当前项目分镜与素材合成，一键生成并直接注入本机剪映草稿工程。',
    parameters: {
      type: 'object',
      properties: {
        draftName: { type: 'string', description: '自定义导出的草稿项目名称（可选）' }
      }
    }
  },
  {
    name: 'match_clips_to_script',
    description: '智能将当前项目素材池中的切片素材与现有分镜台词进行标签和关键词语义匹配。',
    parameters: {
      type: 'object',
      properties: {
        strategy: { type: 'string', enum: ['high_energy', 'tutorial', 'balanced'], description: '选片倾向' }
      }
    }
  },
  {
    name: 'update_project_meta',
    description: '【受限工具：仅在用户明确发出改名或重命名指令时使用】修改项目标题或分类。严禁在创作者闲聊、发散、探讨版本或未明确要求改名时调用！',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '新的项目标题（必须来自用户明确指定的修改）' },
        game: { type: 'string', description: '游戏名称' },
        category: { type: 'string', enum: ['攻略教学', '高能混剪', '爆款复刻', '剧情解说'], description: '分类' }
      }
    }
  },
  {
    name: 'init_pipeline',
    description: '在选题与策划确立后，初始化定制的项目任务流水线阶段',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '定制品类' },
        stages: {
          type: 'array',
          description: '定制的流水线阶段列表'
        }
      }
    }
  },
  {
    name: 'run_pipeline_step',
    description: '真实调度底层执行引擎，运行当前项目的指定流水线阶段（如 step_1 素材感知与切片、step_2 音频节奏对齐、step_3 爆款剧本分镜规划、step_4 智能语义镜头匹配、step_5 剪映草稿工程合成与注入）。真正调用执行逻辑并生成更新产物与日志！',
    parameters: {
      type: 'object',
      properties: {
        stageId: {
          type: 'string',
          enum: ['step_1', 'step_2', 'step_3', 'step_4', 'step_5', 'step_perception', 'step_audio', 'step_script', 'step_matching', 'step_export'],
          description: '要执行的流水线阶段 ID'
        }
      },
      required: ['stageId']
    }
  },
  {
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
    }
  },
  {
    name: 'get_pipeline_status',
    description: '查询当前项目流水线的整体进度百分比、各阶段完成情况与各阶段产物概览。',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_pipeline_templates',
    description: '查询系统预置的工业级视频任务流水线模板（如保姆级攻略教学流、游戏高能卡点混剪流、AIGC零素材口播生图流、影视长视频二创解说流等）。',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
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
    }
  },
  {
    name: 'get_motion_manifest',
    description: '读取当前项目的确定性代码动效工程清单 (motion_manifest)，获取 Remotion 场景时间轴与 Props。',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
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
    }
  },
  {
    name: 'get_motion_components_catalog',
    description: '查询系统支持的 4 大原子确定性代码动效组件库规范与 Props Schema（TechTerminal 命令行终端、DataChart 数据图表、ArchitectureFlow 架构拓扑、KineticTypography 动态大字排版）。',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
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
    }
  },
  {
    name: 'render_video_mp4',
    description: '完全告别剪映！调度本地 Remotion 确定性内核与系统 FFmpeg 硬件加速压制，一键直接导出最终 1080P/4K 60fps 成品 MP4 视频。',
    parameters: {
      type: 'object',
      properties: {
        outputFileName: { type: 'string', description: '自定义输出文件名（如 tutorial_60fps.mp4）' }
      }
    }
  },
  {
    name: 'download_local_model',
    description: '从 ModelScope 国内极速镜像源下载指定的本地开源模型权重（如 cosyvoice-2-0.5b）。',
    parameters: {
      type: 'object',
      properties: {
        modelId: { type: 'string', enum: ['cosyvoice-2-0.5b'], description: '模型标识' }
      },
      required: ['modelId']
    }
  },
  {
    name: 'get_local_models_status',
    description: '检查本地开源模型（CosyVoice 2、CTC 对齐探针、本地渲染内核）的安装就绪状态与下载进度。',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'generate_image',
    description: '真实执行 AI 文生图渲染：根据提示词生成视觉图片，自动持久化到项目素材库并直接回传到对话结果中供创作者预览与剪辑使用。当创作者要求“生成一张图/画一张图/生图/出图”时立即调用。',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '生图提示词，描述期望生成的画面内容与风格' },
        count: { type: 'number', description: '生成数量，默认 1 张' },
        aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:3'], description: '画幅比例，默认 16:9' },
        style: { type: 'string', description: '视觉风格基调，如 cinematic、anime、3d-render、ink-wash 等' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'test_mcp_task',
    description: '对指定的 MCP 任务（如 google-flow-mcp 生图、健康状态、登录凭据或自定义工具）进行自动化探测、跑图验证及故障自愈诊断。若有错误详细反馈原因与修复指引，若正常呈现实测结果。',
    parameters: {
      type: 'object',
      properties: {
        serverName: { type: 'string', description: '待测试的 MCP 服务名称，例如 google-flow 或 google-flow-mcp' },
        task: { type: 'string', enum: ['image_generation', 'health_check', 'auth_status', 'start_login', 'confirm_login', 'tool_call'], description: '测试任务类型：image_generation(生图全链路), health_check(健康检查), auth_status(登录状态), start_login(拉起专用登录窗口), confirm_login(确认登录凭据), tool_call(单工具调用)' },
        autoLaunchLogin: { type: 'boolean', description: '未登录时是否自动拉起专用 Chrome 窗口（默认可按需开启）' },
        resumeTask: { type: 'string', description: '登录确认后自动恢复执行的任务（例如 image_generation）' },
        prompt: { type: 'string', description: '用于生图测试的提示词（可选）' },
        toolName: { type: 'string', description: '特定工具调用时的工具名' },
        toolArgs: { type: 'object', description: '特定工具调用时的参数' },
        mode: { type: 'string', enum: ['readiness', 'dry_run', 'live'], description: '测试模式：readiness(探测环境与授权), dry_run(试跑与Prompt检验), live(实际提交跑图)' }
      }
    }
  }
];

/**
 * Format system prompt instruction with tools schema
 */
export function getToolsPromptDescription(allowedToolNames = null) {
  const toolExamples = {
    assign_task_to_agent: `<tool_call name="assign_task_to_agent">\n{\n  "targetAgentId": "director",\n  "task": "基于现有本地素材制作一条30秒短视频，重点打造前3秒黄金钩子和卡点节奏"\n}\n</tool_call>`,
    test_mcp_task: `<tool_call name="test_mcp_task">\n{\n  "serverName": "google-flow",\n  "task": "image_generation",\n  "prompt": "A majestic golden monkey king standing on misty mountain peak, highly detailed concept art, 8k, cinematic lighting"\n}\n</tool_call>`,
    generate_image: `<tool_call name="generate_image">\n{\n  "prompt": "A majestic golden monkey king standing on misty mountain peak, highly detailed concept art, 8k, cinematic lighting",\n  "count": 1,\n  "aspectRatio": "16:9",\n  "style": "cinematic"\n}\n</tool_call>`,
    inspect_video_content: `<tool_call name="inspect_video_content">\n{\n  "assetId": "clip_01"\n}\n</tool_call>`,
    update_storyboard: `<tool_call name="update_storyboard">\n{\n  "items": [\n    {\n      "order": 1,\n      "title": "【黄金钩子】卡关痛点引流",\n      "scriptText": "卡关3小时打不过？学会这招无伤弹刀打法！",\n      "matchedClipId": "clip_02",\n      "durationSec": 4.0,\n      "transition": "重低音冲击 + 快速放大"\n    }\n  ]\n}\n</tool_call>`,
    run_pipeline_step: `<tool_call name="run_pipeline_step">\n{\n  "stageId": "step_1"\n}\n</tool_call>`,
    run_pipeline: `<tool_call name="run_pipeline">\n{}\n</tool_call>`,
    get_pipeline_status: `<tool_call name="get_pipeline_status">\n{}\n</tool_call>`,
    list_pipeline_templates: `<tool_call name="list_pipeline_templates">\n{}\n</tool_call>`,
    apply_pipeline_template: `<tool_call name="apply_pipeline_template">\n{\n  "templateId": "template_aigc_storyboard"\n}\n</tool_call>`,
    update_pipeline_stage: `<tool_call name="update_pipeline_stage">\n{\n  "stageId": "step_1",\n  "status": "completed",\n  "progress": 100,\n  "details": "已完成全部分镜设计与素材匹配"\n}\n</tool_call>`,
    export_jianying_draft: `<tool_call name="export_jianying_draft">\n{\n  "draftName": "黑神话第一章速通剪辑"\n}\n</tool_call>`,
    match_clips_to_script: `<tool_call name="match_clips_to_script">\n{\n  "strategy": "balanced"\n}\n</tool_call>`,
    update_project_meta: `<tool_call name="update_project_meta">\n{\n  "title": "《黑神话：悟空》第一章无伤打法",\n  "category": "攻略教学"\n}\n</tool_call>`,
    report_capability_gap: `<tool_call name="report_capability_gap">\n{\n  "gapType": "skill",\n  "reason": "缺少特定游戏机制算法卡点法则",\n  "suggestedName": "wukong-combo-sync"\n}\n</tool_call>`,
    inspect_system_capabilities: `<tool_call name="inspect_system_capabilities">\n{}\n</tool_call>`
  };

  const selectedTools = Array.isArray(allowedToolNames) && allowedToolNames.length > 0
    ? allowedToolNames
    : Object.keys(toolExamples);

  const renderedExamples = selectedTools
    .map(t => {
      if (toolExamples[t]) return toolExamples[t];
      return `<tool_call name="${t}">\n{}\n</tool_call>`;
    })
    .filter(Boolean)
    .join('\n\n');

  if (!renderedExamples) return '';

  return `\n【当前智能体可调用的底层工具系统】：
当需要执行对应操作时，使用以下 XML 结构格式输出工具指令（系统会自动拦截并执行）：

${renderedExamples}
`;
}

/**
 * Main Agent Action Dispatcher
 */
export async function executeAgentAction(projectId, toolName, args = {}) {
  const pId = requireProjectId(projectId, 'unknown');

  switch (toolName) {
    case 'generate_image': {
      const res = await defaultMCPHub.callTool('generate_image', args, { projectId: pId });
      return {
        ...res,
        tool: 'generate_image'
      };
    }

    case 'test_mcp_task': {
      const res = await defaultMCPHub.callTool('test_mcp_task', args, { projectId: pId });
      return {
        ...res,
        tool: 'test_mcp_task'
      };
    }

    case 'inspect_video_content': {
      const assetId = args.assetId || args.filename || args.id;
      const res = await perceiveVideoAsset(pId, assetId);
      return {
        success: res.success,
        tool: 'inspect_video_content',
        assetId,
        analysis: res.analysis,
        message: res.success 
          ? `Vision Scout 成功深度探针 ${res.analysis.filename}：${res.analysis.vision.gameOrScene}，已抽取 ${res.analysis.keyframes?.length || 0} 处关键帧`
          : (res.error || '探针执行失败')
      };
    }

    case 'update_storyboard': {
      const items = Array.isArray(args.items) ? args.items : [];
      let currentSec = 0;
      const formattedStoryboard = items.map((item, idx) => {
        const order = item.order || idx + 1;
        const dur = Number(item.durationSec) || 4.0;
        const startSec = currentSec;
        const endSec = currentSec + dur;
        currentSec = endSec;

        return {
          order,
          timeRange: `${formatDuration(startSec)} - ${formatDuration(endSec)}`,
          durationSec: dur,
          title: item.title || `分镜 ${order}`,
          scriptText: item.scriptText || '',
          matchedClipId: item.matchedClipId || 'clip_01',
          transition: item.transition || '平滑淡入',
          status: 'matched'
        };
      });

      await storage.saveStoryboard(pId, formattedStoryboard);

      // Auto update step 3 pipeline to completed
      await storage.updatePipelineStage(pId, {
        stageId: 'step_3',
        status: 'completed',
        progress: 100,
        details: `已排期 ${formattedStoryboard.length} 个镜头分镜`
      });

      return {
        success: true,
        tool: 'update_storyboard',
        count: formattedStoryboard.length,
        storyboard: formattedStoryboard,
        message: `成功更新并保存 ${formattedStoryboard.length} 个分镜镜头`
      };
    }

    case 'update_pipeline_stage': {
      const pipeline = await storage.updatePipelineStage(pId, {
        stageId: args.stageId,
        status: args.status,
        progress: args.progress,
        details: args.details
      });

      return {
        success: true,
        tool: 'update_pipeline_stage',
        pipeline,
        message: `流水线阶段 ${args.stageId} 状态已更新为 ${args.status}`
      };
    }

    case 'run_pipeline_step': {
      const stageId = args.stageId || 'step_1';
      const stepResult = await executePipelineStep(pId, stageId);
      const updatedPipeline = await storage.getPipeline(pId);
      return {
        success: true,
        tool: 'run_pipeline_step',
        stageId,
        stageName: stepResult.stage?.name || stageId,
        details: stepResult.details,
        outputOverview: stepResult.outputOverview,
        logs: stepResult.logs,
        pipeline: updatedPipeline,
        message: `流水线阶段「${stepResult.stage?.name || stageId}」真实执行完成！${stepResult.details || ''}`
      };
    }

    case 'run_pipeline': {
      const pipeline = await storage.getPipeline(pId);
      const stages = pipeline.stages || [];
      const fromStageId = args.fromStageId;
      let startIndex = 0;
      if (fromStageId) {
        const idx = stages.findIndex(s => s.id === fromStageId);
        if (idx !== -1) startIndex = idx;
      }
      const results = [];
      for (let i = startIndex; i < stages.length; i++) {
        const stg = stages[i];
        const res = await executePipelineStep(pId, stg.id);
        results.push(res);
      }
      const finalPipeline = await storage.getPipeline(pId);
      return {
        success: true,
        tool: 'run_pipeline',
        stagesExecuted: results.length,
        results,
        pipeline: finalPipeline,
        message: `已顺序执行完成 ${results.length} 个流水线阶段，整体进度达到 ${finalPipeline.overallProgress || 0}%`
      };
    }

    case 'get_pipeline_status': {
      let pipeline = await storage.getPipeline(pId);
      if (!pipeline.stages || pipeline.stages.length === 0) {
        const defaultStages = (await storage.resetPipeline(pId)).stages;
        pipeline = { ...pipeline, stages: defaultStages };
      }
      return {
        success: true,
        tool: 'get_pipeline_status',
        overallProgress: pipeline.overallProgress || 0,
        stages: (pipeline.stages || []).map(s => ({
          id: s.id,
          name: s.name,
          status: s.status,
          progress: s.progress,
          details: s.details
        })),
        message: `当前项目流水线整体进度 ${pipeline.overallProgress || 0}%`
      };
    }

    case 'list_pipeline_templates': {
      const templates = getAllPipelineTemplates();
      return {
        success: true,
        tool: 'list_pipeline_templates',
        templates,
        message: `查询到 ${templates.length} 种工业级任务流水线模板：${templates.map(t => t.name).join('、')}`
      };
    }

    case 'apply_pipeline_template': {
      const templateId = args.templateId || 'template_tutorial_guide';
      const updatedPipeline = await applyPipelineTemplate(pId, templateId);
      return {
        success: true,
        tool: 'apply_pipeline_template',
        templateId: updatedPipeline.templateId,
        templateName: updatedPipeline.templateName,
        pipeline: updatedPipeline,
        message: `项目已成功应用「${updatedPipeline.templateName}」流水线，包含 ${updatedPipeline.stages?.length || 0} 个专业阶段！`
      };
    }

    case 'export_jianying_draft': {
      const project = await storage.getProject(pId);
      const storyboard = await storage.getStoryboard(pId);
      const assets = await storage.getAssets(pId);

      if (storyboard.length === 0) {
        throw new Error('分镜时间轴为空，无法导出剪映草稿');
      }

      const draftResult = await generateJianyingDraft({
        project,
        storyboard,
        assets,
        customDraftName: args.draftName || project?.title
      });

      await storage.updatePipelineStage(pId, {
        stageId: 'step_4',
        status: 'completed',
        progress: 100,
        details: `剪映工程已注入: ${draftResult.draftName}`
      });

      return {
        success: true,
        tool: 'export_jianying_draft',
        ...draftResult,
        draftPath: draftResult.jianyingDraftDir || draftResult.outputDirectory,
        message: `剪映草稿「${draftResult.draftName}」生成并注入成功！`
      };
    }

    case 'match_clips_to_script': {
      const storyboard = await storage.getStoryboard(pId);
      const assets = await storage.getAssets(pId);
      if (assets.length === 0) {
        return { success: false, message: '素材库为空，请先扫描导入素材' };
      }

      const updated = storyboard.map((sb, idx) => {
        let bestAsset = assets[0];
        let bestScore = -1;

        for (const a of assets) {
          let score = 0;
          for (const tag of (a.tags || [])) {
            if (sb.scriptText.includes(tag) || sb.title.includes(tag)) {
              score += 2;
            }
          }
          if (score > bestScore) {
            bestScore = score;
            bestAsset = a;
          }
        }

        return {
          ...sb,
          matchedClipId: bestAsset?.id || sb.matchedClipId || assets[idx % assets.length].id
        };
      });

      await storage.saveStoryboard(pId, updated);
      return {
        success: true,
        tool: 'match_clips_to_script',
        storyboard: updated,
        message: `已自动为 ${updated.length} 个分镜重新匹对最佳视频镜头`
      };
    }

    case 'update_project_meta': {
      const project = (await storage.getProject(pId)) || {};
      const updated = {
        ...project,
        ...(args.title ? { title: args.title } : {}),
        ...(args.game ? { game: args.game } : {}),
        ...(args.category ? { category: args.category } : {}),
        status: project.status || 'idle'
      };
      await storage.saveProject(updated);
      return {
        success: true,
        tool: 'update_project_meta',
        project: updated,
        message: `项目已命名为「${updated.title}」`
      };
    }

    case 'init_pipeline': {
      const defaultStages = [
        {
          id: 'step_1',
          name: '素材感知与镜头切片',
          description: '扫描本地关联素材库，探针媒体分辨率/时长，提取关键帧与场景切片',
          status: 'completed',
          progress: 100,
          details: '已完成素材分析与选题策划',
          outputOverview: { status: '已就绪' },
          logs: []
        },
        {
          id: 'step_2',
          name: '音频转录与节奏对齐',
          description: '提取音频音轨波形、检测音乐 BPM 节拍与重音 Drop 点，对齐时间戳',
          status: 'waiting',
          progress: 0,
          details: '等待执行音频与节奏分析',
          outputOverview: null,
          logs: []
        },
        {
          id: 'step_3',
          name: '爆款剧本与分镜规划',
          description: '根据选题规划黄金 3 秒痛点钩子，按 3-8 秒节奏拆解分镜与口播解说词',
          status: 'waiting',
          progress: 0,
          details: '等待生成分镜表',
          outputOverview: null,
          logs: []
        },
        {
          id: 'step_4',
          name: '智能语义镜头匹配',
          description: '将分镜台词意图与切片视频标签进行加权匹对，挑选最契合的高光镜头',
          status: 'waiting',
          progress: 0,
          details: '等待镜头匹配',
          outputOverview: null,
          logs: []
        },
        {
          id: 'step_5',
          name: '剪映草稿工程合成与注入',
          description: '微秒级多轨道量化对齐（视频轨+字幕轨），一键生成并直接注入本机剪映客户端',
          status: 'waiting',
          progress: 0,
          details: '等待草稿合成',
          outputOverview: null,
          logs: []
        }
      ];

      const stages = Array.isArray(args.stages) && args.stages.length > 0 ? args.stages : defaultStages;
      const pipelineData = {
        currentStage: 'STEP_2',
        overallProgress: 20,
        stages
      };
      await storage.savePipeline(pId, pipelineData);
      return {
        success: true,
        tool: 'init_pipeline',
        pipeline: pipelineData,
        message: `已为项目成功建立 5 步分步式流水线！`
      };
    }

    default: {
      if (defaultMCPHub.hasTool(toolName)) {
        const res = await defaultMCPHub.callTool(toolName, args, { projectId: pId });
        return {
          success: true,
          tool: toolName,
          result: res,
          message: `成功调用工具「${toolName}」`
        };
      }
      throw new Error(`未知工具调用: ${toolName}`);
    }
  }
}
