import { Wrench, Sparkles, Network, Terminal, Brain, Cpu, Bot } from 'lucide-react';
import activityConfig from '../config/activity.json' with { type: 'json' };

/**
 * 图标注册表（纯字符串到组件的映射）
 */
const ICON_REGISTRY = {
  Wrench,
  Sparkles,
  Network,
  Terminal,
  Brain,
  Cpu,
  Bot
};

/**
 * 主题视觉原子样式映射（明确声明以保证 Tailwind 编译不被 Purge）
 */
const THEME_STYLES = {
  cyan: {
    iconClass: 'text-cyan-400',
    badgeClass: 'bg-cyan-500/12 text-cyan-300 border-cyan-400/20'
  },
  amber: {
    iconClass: 'text-amber-400',
    badgeClass: 'bg-amber-500/12 text-amber-300 border-amber-400/20'
  },
  purple: {
    iconClass: 'text-purple-400',
    badgeClass: 'bg-purple-500/12 text-purple-300 border-purple-400/20'
  },
  emerald: {
    iconClass: 'text-emerald-400',
    badgeClass: 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20'
  },
  indigo: {
    iconClass: 'text-indigo-400',
    badgeClass: 'bg-indigo-500/12 text-indigo-300 border-indigo-400/20'
  },
  slate: {
    iconClass: 'text-slate-400',
    badgeClass: 'bg-white/[0.06] text-slate-300 border-white/10'
  }
};

/**
 * 协同执行状态样式映射
 */
const STATUS_STYLES = {
  indigo: {
    dotClass: 'bg-indigo-400',
    textClass: 'text-indigo-300'
  },
  amber: {
    dotClass: 'bg-amber-400',
    textClass: 'text-amber-300'
  },
  rose: {
    dotClass: 'bg-rose-400',
    textClass: 'text-rose-300'
  },
  emerald: {
    dotClass: 'bg-emerald-400/80',
    textClass: 'text-slate-400'
  }
};

/**
 * 依据纯数据配置解析动作类型的表现描述符（图标、样式、标签）
 * 彻底消除 isSkill ? 'skill' : 'tool' 等二元硬编码
 * @param {string} type 动作类型 (如 'tool', 'skill', 'mcp', 'command')
 */
export function resolveActionDescriptor(type) {
  const normalizedType = typeof type === 'string' ? type.toLowerCase() : '';
  const conf = (normalizedType && activityConfig.actionTypes[normalizedType]) || activityConfig.defaultAction;
  const IconComponent = ICON_REGISTRY[conf.icon] || Cpu;
  const style = THEME_STYLES[conf.theme] || THEME_STYLES.slate;

  return {
    type: normalizedType || 'action',
    label: conf.label,
    Icon: IconComponent,
    iconClass: style.iconClass,
    badgeClass: style.badgeClass
  };
}

/**
 * 依据纯数据配置解析执行状态的展示描述符
 * @param {'running' | 'waiting_decision' | 'failed' | 'completed'} statusKey
 */
export function resolveActivityStatus(statusKey) {
  const conf = activityConfig.activityStatuses[statusKey] || activityConfig.activityStatuses.completed;
  const style = STATUS_STYLES[conf.color] || STATUS_STYLES.emerald;
  const pulseClass = conf.pulse ? 'animate-pulse' : '';

  return {
    label: conf.label,
    dotClass: `${style.dotClass} ${pulseClass}`.trim(),
    textClass: style.textClass
  };
}

/**
 * 基于配置关键词构造的通用状态过滤正则
 */
const STATUS_FILTER_REGEX = new RegExp(
  `^(${activityConfig.filterKeywords.join('|')})$`,
  'i'
);

/**
 * 提取有实际信息增益的业务简述（过滤纯状态泛化词如“执行成功”）
 * @param {string} summary
 */
export function cleanBusinessOutcome(summary) {
  if (!summary || typeof summary !== 'string') return null;
  const trimmed = summary.trim();
  if (!trimmed || STATUS_FILTER_REGEX.test(trimmed)) return null;
  const clean = trimmed.replace(/^\[MOCK\s*拦截\]\s*/i, '').trim();
  if (!clean || STATUS_FILTER_REGEX.test(clean)) return null;
  return clean;
}

/** 界面文案与术语定义 */
export const ACTIVITY_TERMS = activityConfig.terms;

/**
 * 系统已注册工具与技能的官方配置描述映射
 * 严格与服务端 registerLocalTools.js、systemTools.js 与 skills/ 规约的真实配置对齐，杜绝虚构假数据
 */
const SYSTEM_TOOL_DESCRIPTIONS = {
  // ── 核心编排与元调度工具 (systemTools.js) ──
  invoke_skill: '调度执行已注册的专业技能 (Skill)，在独立沙箱上下文中运行，不污染主会话上下文',
  load_skill: '载入项目指定的专业技能资产并挂载到当前执行环境',
  dispatch_agent: '超级主脑专属角色激活与委派工具：激活并调度具有独立沙盒、专业技能与工具权限的专职智能体',
  assign_task_to_agent: '超级主脑专属调度工具：将特定的视频创意、分镜、剪辑、感知或扩建任务正式委派给指定下属智能体',
  request_hitl_decision: '当面临多个关键备选方案、高危操作或需用户主观偏好确认时，挂起当前执行流，向用户发起交互式决策卡片',
  apply_workflow_decision: '主脑代人类进行裁决并恢复工作流执行',
  register_dynamic_agent: '在系统运行时动态创建并持久化注册一个全新的专业智能体',
  register_dynamic_skill: '在系统运行时动态创建并持久化注册一个全新的专业操作技能/SOP',

  // ── 视频感知与剪辑工业流水线工具 (registerLocalTools.js) ──
  inspect_video_content: '调度视觉感知探针，解码并分析指定素材的真实画面、场景切点、关键帧内容与音轨特征',
  update_storyboard: '生成或更新当前项目的分镜时间轴排期',
  export_jianying_draft: '将当前项目分镜与素材合成，一键生成并直接注入本机剪映草稿工程',
  update_project_meta: '确立或更新项目基本信息（如爆款标题、游戏、分类）',
  run_pipeline_step: '真实调度底层执行引擎，运行当前项目的指定流水线阶段',
  run_pipeline: '一键顺序触发执行项目的整套流水线任务（从素材感知、音频对齐、剧本分镜到草稿注入全链路跑通）',
  get_pipeline_status: '查询当前项目流水线的整体进度百分比、各阶段完成情况与各阶段产物概览',
  list_pipeline_templates: '查询系统预置的工业级视频任务流水线模板',
  apply_pipeline_template: '根据视频品类与创作者意图，为当前项目一键换装应用指定的流水线模版',
  get_motion_manifest: '读取当前项目的确定性代码动效工程清单 (motion_manifest)，获取 Remotion 场景时间轴与 Props',
  synthesize_motion_scenes: '将本轮已确认的分镜装配为 Remotion 场景',
  get_motion_components_catalog: '查询系统支持的 4 大原子确定性代码动效组件库规范与 Props Schema',
  synthesize_cosyvoice: '调用本地安装的阿里开源 CosyVoice 2 (0.5B) 语音大模型，合成高质量自然人声旁白，并提取 CTC 逐字毫秒锁帧时间戳',
  render_video_mp4: '将当前任务刚确认并装配的动效场景清单渲染为 MP4 成片',
  download_local_model: '从 ModelScope 国内极速镜像源下载指定的本地开源模型权重',
  get_local_models_status: '检查本地开源模型（CosyVoice 2、CTC 对齐探针、本地渲染内核）的安装就绪状态与下载进度',
  synthesize_procedural_sfx: '使用纯代码算法生成 100% 免版权商业极客音效或 Lo-Fi 环境和弦背景音乐',
  inspect_system_capabilities: '盘点当前系统所有现存的智能体、专业剪辑技能及可用 MCP 工具清单',
  create_custom_agent: '根据明确的需求规格，设计并创建新的子智能体',
  create_custom_skill: '提炼并创建新的专业剪辑技能规约',
  report_capability_gap: '当在实际视频创作中发现团队缺失某项专业能力时，向上级超级主脑提报能力缺口工单',
  generate_image: '真实执行 AI 文生图/生图渲染:根据提示词生成视觉图片并自动持久化到项目素材库',
  test_mcp_task: '测试指定的 MCP 服务与任务（如测试 google-flow-mcp 生图功能、验证健康状态与登录凭据）',

  // ── 系统预置专业技能 SOP (skills/) ──
  'video-perception': '将本地物理视频切分场景、探测时长、景别与运动特征，输出结构化事实卡片并利用CAS强缓存',
  'audio-perception': '音频特征感知与节奏检测分析',
  'image-perception': '图像画面特征与视觉构图感知',
  'doc-perception': '文档资料解析与结构化提取',
  'cosyvoice-voiceover': 'CosyVoice 人声旁白定制与合成',
  'direct-render-pipeline': 'Remotion 与 FFmpeg 本地直出成片流水线',
  'motion-design-system': '代码级动效设计系统与组件排期',
  'remotion-best-practices': 'Remotion 最佳实践规范',
  'audio-sfx-director': '算法极客音效与背景音乐编排设计',
  'code-as-video-catalog': 'Code-as-Video 确定性代码视频资产库'
};

/**
 * 解析工具或技能的功能描述：
 * 1. 优先使用执行事件显式携带的系统配置描述 (explicitDesc)
 * 2. 其次匹配系统官方工具配置映射表 (SYSTEM_TOOL_DESCRIPTIONS)
 * 3. 若均无真实配置，绝不捏造假话术，直接返回 null，由 UI 优雅隐去 Tooltip
 */
export function resolveToolDescription(toolName, explicitDesc = '') {
  if (typeof explicitDesc === 'string' && explicitDesc.trim()) {
    return explicitDesc.trim();
  }
  const normalized = typeof toolName === 'string' ? toolName.trim().toLowerCase() : '';
  if (normalized && SYSTEM_TOOL_DESCRIPTIONS[normalized]) {
    return SYSTEM_TOOL_DESCRIPTIONS[normalized];
  }
  return null;
}

