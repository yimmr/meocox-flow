import axios from 'axios';
import { config } from '../config.js';
import { getToolsPromptDescription } from './agentTools.js';
import { loadAllSkills } from '../agents/skillLoader.js';
import { defaultAgentSystem } from '../runtime/agentLoader.js';
import { modelGateway, MODEL_TYPE } from './ai/index.js';

export const SUPER_BRAIN_SYSTEM_PROMPT = `你是人类创作者的贴身超级大脑与总控副驾（Super Brain / Executive Orchestrator）。
你是创作者不可或缺的超级副手与参谋总长，统筹整个创作项目与智能体团队。

【核心定位与行为守则】：
1. 【松弛、智慧、真诚的战略对话伙伴】：
   - 面对创作者的日常打招呼（如“你好”）、闲聊探讨、游戏机制分析、创意发散、输入游戏版本（如“遗忘之海2026年9月版本”）或泛咨询时，保持自然、有温度、富有远见的高情商对话。
   - 【绝对严禁擅自推进分镜或切片】：绝不主动输出死板的 [PROPOSAL:] 选项卡片，绝不在创作者未明确确认做视频时私自排分镜或调用底层剪辑工具！
   - 不做具体脏活：你绝不亲自去排具体分镜时间轴或写切片细节，这些繁琐具体的业务全部下发给专业的编导组执行。

2. 【工作区零擅动红线（Workspace Guard）】：
   - 【绝对严禁擅自修改工作区与项目】：当创作者发送简短关键词、游戏版本（如“遗忘之海2026年9月版本”）、灵感想法或素材讨论时，你必须专注于纯文本对话交流与头脑风暴！
   - 【绝对禁止自动调用工具修改项目标题、游戏归属或分类】：创作者的项目标题、素材库路径与工作区环境是用户神圣不可侵犯的资产。绝不自作主张把它当成立项指令，绝不擅自去改写项目元数据！
   - 只有当创作者发出字面明确的修改指令（如“请把当前项目改名为……”、“重命名项目为……”）时，才允许处理项目重命名。

3. 【创意发散与全局统筹】：
   - 当创作者提出粗略的想法时，帮其梳理思路、提炼爆款亮点、分析受众心理；
   - 可以探查现有素材概况与画面；当需要查看具体画面时调度 <tool_call name="inspect_video_content">。
   - 当创作者明确要求“生成一张图 / 画一张图 / 生图 / 出图 / 给我画个XXX”时,必须立即调用 <tool_call name="generate_image"> 真实渲染图片,并把返回的图片直接呈现在对话中;严禁只口头回复“已生成”而不真正产出图片。

4. 【工单委派机制（Delegation Protocol）】：
   - 只有当创作者明确表示“我们要开工做这个视频”、“开始做吧”、“帮我出分镜”或创意方案达成共识后，你才行使总调度权。
   - 调度工具：调用 <tool_call name="assign_task_to_agent">，将任务委派给【Director Agent (总编导)】（targetAgentId: "director"），附带详尽具体的任务指令。
   - 委派后以沉稳干练的口吻告知创作者：“已正式向总编导下发制作工单，编导正在「编导制作舱」进行镜头与分镜落地，你可以前往制作舱查看与微调，我们继续在这里探讨大局。”

5. 【流水线敏捷调度与指挥（Pipeline Orchestration）】：
   - 当创作者指令开工、推进流水线或期望一键跑通制作时，你拥有最高流水线指挥权：
     - 调用 <tool_call name="list_pipeline_templates">：查询系统内置的工业级流水线模板清单。
     - 调用 <tool_call name="apply_pipeline_template">：为项目切换最契合的流水线模版（如 template_aigc_storyboard 零素材生图流、template_gameplay_highlight 游戏高能卡点混剪流、template_tutorial_guide 攻略解说教学流、template_video_commentary 影视长视频二创解说流）。
     - 调用 <tool_call name="run_pipeline_step">：真实触发特定流水线阶段（如素材感知切片、音频对齐、剧本分镜、镜头匹配、AIGC生图或剪映草稿工程注入）。
     - 调用 <tool_call name="run_pipeline">：一键顺序触发项目整套流水线全流程自动化。
     - 调用 <tool_call name="get_pipeline_status">：实时巡检当前项目流水线执行情况与阶段产物。
- 语气专业、冷静、富有远见、具备卓越的影视制作与系统架构视野。`;

export const DIRECTOR_SYSTEM_PROMPT = `你是专精于影视与短视频工业级落地的一线总编导（Director Agent）。
你坐镇【编导制作舱】，负责直接执行具体的【视频创作工作流】。

【核心定位与行为守则】：
1. 【专业干练，接单即干】：
   - 你负责具体的镜头语言、叙事节奏把控、黄金3秒痛点钩子打造、本地素材切片匹配与分镜排期。
   - 你拥有完整的工单落地工具：
     - 调用 <tool_call name="update_storyboard">：生成或更新分镜时间轴（含镜头序号、标题、解说台词、匹配素材ID、时长秒数与转场提示）。
     - 调用 <tool_call name="run_pipeline_step">：真实运行指定的任务流水线阶段（如素材感知、音频对齐、分镜规划、镜头匹配或草稿合成）。
     - 调用 <tool_call name="run_pipeline">：一键跑通当前制作流水线全流程。
     - 调用 <tool_call name="get_pipeline_status">：实时巡检当前项目流水线执行情况与阶段产物。
     - 调用 <tool_call name="match_clips_to_script">：匹配最佳素材切片。
     - 调用 <tool_call name="update_pipeline_stage">：推进流水线各阶段进度。
     - 调用 <tool_call name="export_jianying_draft">：一键注入剪映专业版草稿。
     - 调用 <tool_call name="inspect_video_content">：深度感知分析素材画面细节。
2. 【与创作者协同微调】：
   - 向创作者专业拆解镜头安排与逻辑，积极吸纳创作者对台词文案、卡点节奏的修改意见并调用工具微调分镜。
- 语气专业、干练、雷厉风行、专注于视听艺术与剪辑工程交付。`;

export const BASE_SYSTEM_PROMPT = SUPER_BRAIN_SYSTEM_PROMPT;

export function buildGroundedSystemPrompt({ project, assets = [], storyboard = [], skills = [], activePerception = null, agentId = null, thread = null, messages = [] } = {}) {
  let effectiveAgentId = agentId;
  if (!effectiveAgentId) {
    if (thread === 'workflow') effectiveAgentId = 'director';
    else if (thread === 'main') effectiveAgentId = 'super-brain';
  }

  let assetSummary = '（暂无素材，等待扫描导入）';
  if (assets.length > 0) {
    assetSummary = assets.slice(0, 15).map(a => 
      `- 素材ID: "${a.id}", 文件名: "${a.name}", 时长: ${a.duration || a.durationSec + 's'}, 标签: [${(a.tags || []).join(', ')}]${a.analysis ? ` | 视觉感知: ${a.analysis.vision?.gameOrScene || '已感知'}` : ''}`
    ).join('\n');
  }

  let storyboardSummary = '（当前暂无分镜排期）';
  if (storyboard.length > 0) {
    storyboardSummary = storyboard.map(s => 
      `- 第${s.order}镜: 【${s.title}】(${s.timeRange}) 台词: "${s.scriptText}", 匹配素材ID: "${s.matchedClipId}"`
    ).join('\n');
  }

  let perceptionBlock = '';
  if (activePerception) {
    perceptionBlock = `
【Vision Scout 深度视觉感知实测报告（已自动完成本地真实解码与抽帧）】：
- 探测目标：${activePerception.filename}
- 本地文件路径: ${activePerception.filePath}
- 规格参数实测：分辨率 ${activePerception.specs.resolution} (${activePerception.specs.fps} FPS), 码率: ${activePerception.specs.bitrate}, 音频: ${activePerception.specs.audio}, 真实时长: ${activePerception.specs.duration}
- 真实画面场景：${activePerception.vision.gameOrScene}
- 主体角色与生物：${activePerception.vision.charactersAndCreatures}
- 核心视觉动作：${activePerception.vision.visualActions}
- 界面UI与文字：${activePerception.vision.uiAndText}
- 光影氛围与运镜：${activePerception.vision.atmosphereAndLighting}
- 剪辑编导价值：${activePerception.vision.cinematicValue}
- 建议分镜定位：${activePerception.editorialAdvice?.suggestedRole || '核心爆点'}，${activePerception.editorialAdvice?.cutStrategy || '卡点重低音'}
- 已抽取关键帧时间点：${(activePerception.keyframes || []).map(k => k.timestamp).join('、')}
`;
  }

  const activeAgentsList = defaultAgentSystem.getAllAgents().map(a => `${a.name} (${a.id})`).join('、');
  const activeSkillsList = defaultAgentSystem.getAllSkills().map(s => `${s.name} (${s.id})`).join('、');

  let basePromptText = BASE_SYSTEM_PROMPT;
  let allowedTools = null;

  const selectedAgent = effectiveAgentId ? defaultAgentSystem.getAgent(effectiveAgentId) : null;

  if (effectiveAgentId === 'super-brain') {
    basePromptText = SUPER_BRAIN_SYSTEM_PROMPT;
    allowedTools = ['assign_task_to_agent', 'test_mcp_task', 'generate_image', 'list_pipeline_templates', 'apply_pipeline_template', 'run_pipeline_step', 'run_pipeline', 'get_pipeline_status', 'inspect_system_capabilities', 'report_capability_gap', 'inspect_video_content'];
    // Only expose update_project_meta if user explicitly asked to rename / change title in messages
    const lastUserMsg = (messages || []).filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    const isExplicitRenameRequest = /(改名|重命名|更新标题|修改标题|更名|修改项目名)/i.test(lastUserMsg);
    if (isExplicitRenameRequest) {
      allowedTools.push('update_project_meta');
    }
  } else if (effectiveAgentId === 'director') {
    basePromptText = DIRECTOR_SYSTEM_PROMPT;
    allowedTools = ['list_pipeline_templates', 'apply_pipeline_template', 'run_pipeline_step', 'run_pipeline', 'get_pipeline_status', 'update_storyboard', 'update_pipeline_stage', 'match_clips_to_script', 'export_jianying_draft', 'inspect_video_content', 'report_capability_gap'];
  } else if (selectedAgent) {
    // 动态智能体：从其 agent.yml / agent.md 解析其拥有的 tools，彻底告别架构写死
    if (selectedAgent.persona) {
      basePromptText = `你是专职执行业务的【${selectedAgent.name}】（ID: ${selectedAgent.id}）。\n${selectedAgent.persona}`;
    }
    if (Array.isArray(selectedAgent.tools) && !selectedAgent.tools.includes('*')) {
      allowedTools = [...selectedAgent.tools];
      if (!allowedTools.includes('get_pipeline_status')) allowedTools.push('get_pipeline_status');
    } else {
      allowedTools = null; // 开放所有可用工具
    }
  }

  let agentPersonaBlock = '';
  if (effectiveAgentId) {
    try {
      const selectedAgent = defaultAgentSystem.getAgent(effectiveAgentId);
      if (selectedAgent) {
        agentPersonaBlock = `
【当前对话担当智能体】：
- 智能体名称：${selectedAgent.name} (ID: ${selectedAgent.id})
- 核心人设与指引：
${selectedAgent.persona}
`;
        if (Array.isArray(selectedAgent.skills) && selectedAgent.skills.length > 0) {
          const boundSkillsText = selectedAgent.skills
            .map(sid => {
              const s = defaultAgentSystem.getSkill(sid);
              return s ? `### 专业规范手册【${s.name}】:\n${s.rules}` : null;
            })
            .filter(Boolean)
            .join('\n\n');
          if (boundSkillsText) {
            agentPersonaBlock += `\n【必须遵循的专业技能标准】：\n${boundSkillsText}\n`;
          }
        }
      }
    } catch (e) {
      console.warn('[Chat] Failed to inject custom agent persona:', e.message);
    }
  }

  return `${basePromptText}

当前正在服务的项目上下文：
- 项目标题: 《${project?.title || '未命名剪辑项目'}》
- 所属游戏: ${project?.game || '黑神话：悟空'}
- 项目分类: ${project?.category || '攻略教学'}
- 当前系统在编智能体: ${activeAgentsList || '加载中...'}
- 当前系统已装配技能库: ${activeSkillsList || '加载中...'}
${agentPersonaBlock}
${perceptionBlock}
【当前项目真实本地切片素材库】（匹配画面时必须优先选用下列素材ID）：
${assetSummary}

【当前已有分镜时间轴】：
${storyboardSummary}

${getToolsPromptDescription(allowedTools)}
`;
}

export const SYSTEM_PROMPT = BASE_SYSTEM_PROMPT;

/**
 * Format target chat completions URL
 */
export function formatCompletionsUrl(baseUrl) {
  let target = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!target.endsWith('/chat/completions')) {
    target = `${target}/chat/completions`;
  }
  return target;
}

/**
 * Ping / Test a custom provider connection
 */
export async function testConnection({ baseUrl, apiKey, model, apiMode = 'auto', type }) {
  // Test installed model in app
  if (type === 'installed' || String(model).startsWith('installed:')) {
    const { inspectModelPreset } = await import('./perception/localEngine/paths.js');
    const presetId = String(model).replace(/^installed:/i, '');
    const preset = inspectModelPreset(presetId);
    if (!preset || !preset.isReady) {
      throw new Error(`安装模型 [${presetId}] 未下载就绪，请在模型管理器中先下载安装。`);
    }
    return { success: true, latency: 1, model: presetId };
  }

  const cleanBase = (baseUrl || '').trim().replace(/\/+$/, '');
  const key = (apiKey || '').trim();
  const startTime = Date.now();

  // 判断是否为 Anthropic 协议
  const isAnthropic = apiMode === 'anthropic_messages' || /anthropic\.com/i.test(cleanBase);

  if (isAnthropic) {
    let targetUrl = cleanBase;
    if (!targetUrl.endsWith('/messages')) {
      if (!targetUrl.includes('/v1')) {
        targetUrl = `${targetUrl}/v1/messages`;
      } else {
        targetUrl = `${targetUrl}/messages`;
      }
    }

    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    };
    if (key && key !== 'your_api_key_here') {
      headers['x-api-key'] = key;
    }

    try {
      await axios({
        method: 'post',
        url: targetUrl,
        headers,
        data: {
          model: model || 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5
        },
        timeout: 10000
      });

      const latency = Date.now() - startTime;
      return { success: true, latency, model };
    } catch (error) {
      let errorDetail = error.message;
      if (error.response?.data) {
        const data = error.response.data;
        errorDetail = typeof data === 'object' ? (data.error?.message || JSON.stringify(data)) : String(data);
      }
      throw new Error(errorDetail);
    }
  }

  // 标准 OpenAI / Google 兼容端点
  let targetUrl = cleanBase;
  if (!targetUrl.endsWith('/chat/completions')) {
    if (!targetUrl.includes('/v1') && !targetUrl.includes('/openai') && !targetUrl.includes('/api/')) {
      targetUrl = `${targetUrl}/v1/chat/completions`;
    } else {
      targetUrl = `${targetUrl}/chat/completions`;
    }
  }

  const headers = {
    'Content-Type': 'application/json',
  };
  if (key && key !== 'your_api_key_here') {
    headers['Authorization'] = `Bearer ${key}`;
  }

  try {
    await axios({
      method: 'post',
      url: targetUrl,
      headers,
      data: {
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
        temperature: 0.1,
      },
      timeout: 10000,
    });

    const latency = Date.now() - startTime;
    return { success: true, latency, model };
  } catch (error) {
    let errorDetail = error.message;
    if (error.response?.data) {
      const data = error.response.data;
      errorDetail = typeof data === 'object' ? (data.error?.message || JSON.stringify(data)) : String(data);
    }
    throw new Error(errorDetail);
  }
}

/**
 * Fetch remote models from standard upstream endpoints
 */
export async function fetchRemoteModels({ baseUrl, apiKey }) {
  const cleanBase = (baseUrl || '').trim().replace(/\/+$/, '');
  const key = (apiKey || '').trim();

  let targetUrl = cleanBase;
  if (!targetUrl.endsWith('/models')) {
    if (!targetUrl.includes('/v1') && !targetUrl.includes('/openai') && !targetUrl.includes('/api/')) {
      targetUrl = `${targetUrl}/v1/models`;
    } else {
      targetUrl = `${targetUrl}/models`;
    }
  }

  const headers = {};
  if (key && key !== 'your_api_key_here') {
    headers['Authorization'] = `Bearer ${key}`;
    headers['x-api-key'] = key;
  }

  const response = await axios({
    method: 'get',
    url: targetUrl,
    headers,
    timeout: 10000
  });

  const data = response.data;
  let rawList = [];
  if (Array.isArray(data)) {
    rawList = data;
  } else if (Array.isArray(data?.data)) {
    rawList = data.data;
  } else if (Array.isArray(data?.models)) {
    rawList = data.models;
  }

  const models = rawList.map(m => {
    const id = typeof m === 'string' ? m : (m.id || m.name);
    return {
      id,
      name: m.name || id
    };
  }).filter(m => Boolean(m.id));

  return models;
}

/**
 * Calls model via Model Gateway (handles API endpoints & In-App Installed Models)
 */
export async function streamChat({ messages, customConfig = {}, onChunk, onComplete, onError }) {
  const effectiveConfig = await modelGateway.resolveConfig(customConfig);

  const effectiveSystemPrompt = customConfig.systemPrompt || SYSTEM_PROMPT;
  const fullMessages = [
    { role: 'system', content: effectiveSystemPrompt },
    ...messages
  ];

  await modelGateway.streamChat({
    messages: fullMessages,
    modelConfig: effectiveConfig,
    temperature: 0.7,
    max_tokens: 2048,
    onChunk,
    onComplete,
    onError
  });
}

