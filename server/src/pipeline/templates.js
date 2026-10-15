import { getOperator } from './operators/index.js';

export const PIPELINE_TEMPLATES = [
  {
    id: 'template_tutorial_guide',
    name: '保姆级攻略解说教学流',
    category: '攻略教学',
    icon: 'BookOpen',
    badge: '推荐 · 经典五步',
    description: '适用于游戏机制拆解、通关指引、实操演示。以痛点剧本为核心，精准匹配录屏操作步骤并注入剪映。',
    targetDuration: '30-60s',
    stages: [
      {
        id: 'step_1',
        dependsOn: [],
        operatorId: 'media_scan_perception',
        name: '素材感知与镜头切片',
        description: '由 Vision Scout 智能体扫描本地关联素材库，探针媒体分辨率/时长，提取关键帧与场景切片',
        agentId: 'vision-scout',
        agentName: 'Vision Scout',
        skillId: 'vision-scout'
      },
      {
        id: 'step_2',
        dependsOn: [],
        operatorId: 'audio_beat_detection',
        name: '音频转录与节奏对齐',
        description: '由 Vision Scout 提取音频波形、检测音乐 BPM 节拍与重音 Drop 点，对齐时间戳',
        agentId: 'vision-scout',
        agentName: 'Vision Scout',
        skillId: 'beat-sync'
      },
      {
        id: 'step_3',
        dependsOn: ['step_1'],
        operatorId: 'script_storyboard_planning',
        name: '爆款剧本与分镜规划',
        description: '由 Director 裁决题材法则，Screenwriter 规划黄金 3 秒痛点钩子与分镜解说词',
        agentId: 'screenwriter',
        agentName: 'Director + Screenwriter',
        skillId: 'screenwriter-agent'
      },
      {
        id: 'step_4',
        dependsOn: ['step_1', 'step_2', 'step_3'],
        operatorId: 'semantic_clip_matching',
        name: '智能语义镜头匹配',
        description: '由 Timeline Editor 运行语义加权模型，将台词意图与切片视频标签进行精准匹配',
        agentId: 'timeline-editor',
        agentName: 'Timeline Editor',
        skillId: 'timeline-editor'
      },
      {
        id: 'step_5',
        dependsOn: ['step_4'],
        operatorId: 'jianying_draft_synthesis',
        name: '剪映草稿工程合成与注入',
        description: '由 Timeline Editor 进行微秒级轨道量化对齐，一键注入本机剪映并注册全局索引',
        agentId: 'timeline-editor',
        agentName: 'Timeline Editor',
        skillId: 'timeline-editor'
      }
    ]
  },
  {
    id: 'template_gameplay_highlight',
    name: '游戏高能卡点混剪流',
    category: '高能混剪',
    icon: 'Zap',
    badge: '燃点卡点',
    description: '纯视听震撼卡点！扫描本地高光切片，分析音乐重音 Drop 点，无缝重音卡点并直接注入动感剪映工程。',
    targetDuration: '15-30s',
    stages: [
      {
        id: 'step_highlight_perception',
        dependsOn: [],
        operatorId: 'media_scan_perception',
        name: '实机高光切片扫描与感知',
        description: '深度感知录屏战斗爆点与高光动作瞬间，提取击杀/大招关键帧',
        agentId: 'vision-scout',
        agentName: 'Vision Scout',
        skillId: 'high-energy'
      },
      {
        id: 'step_beat_sync',
        dependsOn: [],
        operatorId: 'audio_beat_detection',
        name: 'BGM 节拍与重音 Drop 点提取',
        description: '分析背景音乐音轨，锁定重低音 Drop 点与快节奏切片网格',
        agentId: 'vision-scout',
        agentName: 'Vision Scout',
        skillId: 'beat-sync'
      },
      {
        id: 'step_beat_matching',
        dependsOn: ['step_highlight_perception', 'step_beat_sync'],
        operatorId: 'semantic_clip_matching',
        name: '高光镜头重低音卡点匹配',
        description: '以重音网格为基准，将最高击杀评分的战斗切片精确吸附在卡点时间轴上',
        agentId: 'timeline-editor',
        agentName: 'Timeline Editor',
        skillId: 'beat-sync'
      },
      {
        id: 'step_highlight_export',
        dependsOn: ['step_beat_matching'],
        operatorId: 'jianying_draft_synthesis',
        name: '动感剪映工程合成与注入',
        description: '轨道微秒量化，自动添加重低音振动转场与速度曲线，一键直达剪映',
        agentId: 'timeline-editor',
        agentName: 'Timeline Editor',
        skillId: 'timeline-editor'
      }
    ]
  },
  {
    id: 'template_aigc_storyboard',
    name: 'AIGC 零素材口播生图流',
    category: '零素材AIGC',
    icon: 'Palette',
    badge: 'AIGC 画卷',
    description: '无需本地录屏！文案分镜自动拆解、AIGC 视觉提示词工程批量生成分镜画面、语速严格对齐并合成剪映草稿。',
    targetDuration: '30-45s',
    stages: [
      {
        id: 'step_aigc_script',
        dependsOn: [],
        operatorId: 'script_storyboard_planning',
        name: '爆款文案与概念分镜规划',
        description: '提炼黄金 3 秒 Hook 与引流文案，拆解为连贯的高叙事感分镜卡片',
        agentId: 'screenwriter',
        agentName: 'Screenwriter',
        skillId: 'aigc-storyboard'
      },
      {
        id: 'step_aigc_generation',
        dependsOn: ['step_aigc_script'],
        operatorId: 'aigc_image_generation',
        name: 'AIGC 视觉概念生图与资产批处理',
        description: '由 Visual Artist 调度 Google Flow / 生图引擎，批量生成高精概念原画与视觉画面',
        agentId: 'visual-artist',
        agentName: 'Visual Artist',
        skillId: 'aigc-storyboard'
      },
      {
        id: 'step_aigc_tts',
        dependsOn: ['step_aigc_script'],
        operatorId: 'tts_voiceover_synthesis',
        name: '语音旁白与时间戳对齐',
        description: '4.2字/秒 黄金语速标定，将口播文案转化为精确对齐的时间戳音轨',
        agentId: 'director',
        agentName: 'Audio Engine',
        skillId: 'beat-sync'
      },
      {
        id: 'step_aigc_export',
        dependsOn: ['step_aigc_generation', 'step_aigc_tts'],
        operatorId: 'jianying_draft_synthesis',
        name: '分镜画卷剪映工程合成与注入',
        description: '将 AIGC 视觉原画与口播字幕多轨道精准拼接，自动配置慢动作推拉镜头与微转场',
        agentId: 'timeline-editor',
        agentName: 'Timeline Editor',
        skillId: 'timeline-editor'
      }
    ]
  },
  {
    id: 'template_video_commentary',
    name: '影视/剧情长视频二创解说流',
    category: '剧情解说',
    icon: 'Film',
    badge: '深度长篇',
    description: '片源剧情切片、深度二创文案撰写、旁白语速标定、台词意图镜头回贴与电影级剪映工程。',
    targetDuration: '60-120s',
    stages: [
      {
        id: 'step_commentary_probe',
        dependsOn: [],
        operatorId: 'media_scan_perception',
        name: '长视频片源深度切片与探针',
        description: '扫描完整影视片源，提取情节转折点与高信息密度镜头',
        agentId: 'vision-scout',
        agentName: 'Vision Scout',
        skillId: 'vision-scout'
      },
      {
        id: 'step_commentary_script',
        dependsOn: ['step_commentary_probe'],
        operatorId: 'script_storyboard_planning',
        name: '二创解说文案与分镜重构',
        description: '以悬念与伏笔重构解说故事线，建立伏笔-反转-高潮的三段式剧本',
        agentId: 'screenwriter',
        agentName: 'Screenwriter',
        skillId: 'lore-story'
      },
      {
        id: 'step_commentary_tts',
        dependsOn: ['step_commentary_script'],
        operatorId: 'tts_voiceover_synthesis',
        name: '旁白解说语速与时间轴标定',
        description: '微秒级对齐解说旁白节奏与气口间隔，生成统一音轨网格',
        agentId: 'director',
        agentName: 'Audio Engine',
        skillId: 'beat-sync'
      },
      {
        id: 'step_commentary_match',
        dependsOn: ['step_commentary_probe', 'step_commentary_script', 'step_commentary_tts'],
        operatorId: 'semantic_clip_matching',
        name: '剧情意图与精彩画面精准匹对',
        description: '依据解说台词中的人物动作、场景转变精准匹对对应片源画面',
        agentId: 'timeline-editor',
        agentName: 'Timeline Editor',
        skillId: 'timeline-editor'
      },
      {
        id: 'step_commentary_export',
        dependsOn: ['step_commentary_match'],
        operatorId: 'jianying_draft_synthesis',
        name: '电影级剪映草稿工程合成与注入',
        description: '添加电影宽银幕黑边滤镜与画外音专属轨道，一键注入剪映',
        agentId: 'timeline-editor',
        agentName: 'Timeline Editor',
        skillId: 'timeline-editor'
      }
    ]
  },
  {
    id: 'template_code_motion_explainer',
    name: '全领域代码动效解说流',
    category: '代码动效',
    icon: 'Code2',
    badge: 'Code-as-Video · 确定性渲染',
    description: '科技/教程/游戏/泛知识首选！基于 Remotion 确定性渲染架构，彻底规避文生视频排版变形与图表幻觉，毫秒级字音对齐。',
    targetDuration: '20-45s',
    stages: [
      {
        id: 'step_motion_script',
        dependsOn: [],
        operatorId: 'script_storyboard_planning',
        name: '动效剧本与视觉焦点规划',
        description: '由 Motion Director 拆解黄金痛点、知识架构、数据论据与实操演示分镜',
        agentId: 'motion-director',
        agentName: 'Motion Director',
        skillId: 'motion-design-system'
      },
      {
        id: 'step_motion_tts',
        dependsOn: ['step_motion_script'],
        operatorId: 'cosyvoice_tts_synthesis',
        name: 'CosyVoice 2 本地人声与字级对齐',
        description: '阿里开源旗舰语音大模型本地合成广播级人声，提取 CTC 微秒级字音对齐索引',
        agentId: 'voice-scout',
        agentName: 'Voice Scout',
        skillId: 'cosyvoice-voiceover'
      },
      {
        id: 'step_motion_synthesis',
        dependsOn: ['step_motion_script', 'step_motion_tts'],
        operatorId: 'motion_scene_synthesis',
        name: 'Remotion 动效场景装配与生成',
        description: '由 Code Motion Engineer 匹配科技终端、图表曲线、系统拓扑与动态文字组件并绑定 Props',
        agentId: 'code-motion-engineer',
        agentName: 'Code Motion Engineer',
        skillId: 'code-as-video-catalog'
      },
      {
        id: 'step_motion_export',
        dependsOn: ['step_motion_synthesis'],
        operatorId: 'remotion_render_direct',
        name: 'Remotion 4K/60fps 确定性本地直出 (无剪映)',
        description: '完全告别剪映！后台调用 Remotion 内核与本地 FFmpeg，直接压制导出 1080P/4K 60fps 成品 MP4 视频',
        agentId: 'render-officer',
        agentName: 'Render Officer',
        skillId: 'direct-render-pipeline'
      }
    ]
  },
  {
    id: 'template_custom',
    name: '自由自定义编排流',
    category: '自定义',
    icon: 'Layers',
    badge: '灵活拼装',
    description: '由创作者或超级主脑根据任意复杂需求灵活组装算子节点，不受预设形态限制。',
    targetDuration: '动态',
    stages: []
  }
];

export function getAllPipelineTemplates() {
  return PIPELINE_TEMPLATES.map(tpl => ({
    id: tpl.id,
    name: tpl.name,
    category: tpl.category,
    icon: tpl.icon,
    badge: tpl.badge,
    description: tpl.description,
    targetDuration: tpl.targetDuration,
    stageCount: tpl.stages.length,
    stages: tpl.stages
  }));
}

export function getPipelineTemplateById(templateId) {
  if (!templateId) return null;
  return PIPELINE_TEMPLATES.find(t => t.id === templateId) || null;
}

export function instantiatePipelineStages(templateId) {
  const template = getPipelineTemplateById(templateId) || PIPELINE_TEMPLATES[0];
  return template.stages.map(stg => {
    const op = getOperator(stg.operatorId);
    return {
      id: stg.id,
      operatorId: stg.operatorId,
      name: stg.name,
      description: stg.description || op?.description || '',
      agentId: stg.agentId || op?.agentId || 'director',
      agentName: stg.agentName || op?.agentName || 'Director Agent',
      skillId: stg.skillId || op?.skillId || '',
      dependsOn: [...(stg.dependsOn || [])],
      status: 'waiting',
      progress: 0,
      details: `等待执行「${stg.name}」`,
      outputOverview: null,
      logs: []
    };
  });
}
