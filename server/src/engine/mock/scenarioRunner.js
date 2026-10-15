import { STREAM_EVENT_TYPES, STEP_TYPES, ARTIFACT_TYPES, createStreamEvent } from './protocol.js';

/**
 * 辅助延迟函数
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 经典场景剧本：《128 BPM 游戏高光燃剪全自动化生产流程》
 * 
 * 包含：
 * 1. 艾米 (总编导)：意图分析 + beat-sync 技能调用
 * 2. 维克多 (侦查员)：inspect_video_content 终端流式高频抽帧 + 发布切片库产物 (Clips Pool)
 * 3. 诺亚 (剪辑师)：发起 HITL 决策卡片 (选择节奏方案)
 * 4. 决策恢复：分镜装配 + 发布故事板产物 (Storyboard) + 全流程完成
 */
export async function runMockScenario({
  sendEvent,
  isAborted = () => false,
  decisionOptionId = null,
  resumeFromDecision = false,
  steeringNotes = '',
  attachedFiles = []
}) {
  if (resumeFromDecision) {
    return await executeStageAfterDecision({ sendEvent, isAborted, decisionOptionId, steeringNotes });
  }

  // ─────────────────────────────────────────────────────────────
  // 阶段 1: 艾米 (Amy - 总编导) 接手任务
  // ─────────────────────────────────────────────────────────────
  if (isAborted()) return;

  const refGoalSuffix = attachedFiles.length > 0
    ? `（优先结合引用的 ${attachedFiles.length} 个素材: ${attachedFiles.map(f => '@' + f.tag).join(', ')} 规划）`
    : '';

  sendEvent(STREAM_EVENT_TYPES.AGENT_START, {
    agentId: 'director',
    agentName: '艾米 (Amy)',
    agentRole: '总编导 (Director Agent)',
    agentAvatar: '🎬',
    goal: `分析视频制作意图，确立 128 BPM 燃剪节奏框架并拆解生产 SOP。${refGoalSuffix}`
  });
  await sleep(400);

  // 步骤 1.1: 艾米思考 (Cognitive Reasoning)
  if (isAborted()) return;
  sendEvent(STREAM_EVENT_TYPES.STEP_START, {
    stepId: 'step-amy-think',
    agentId: 'director',
    type: STEP_TYPES.THINKING,
    title: '深度分析用户意图与视听调性定位',
    trigger: attachedFiles.length > 0 
      ? `响应意图，已关联 ${attachedFiles.length} 个引用文件: ${attachedFiles.map(f => '@' + f.tag + ' (' + f.name + ')').join('; ')}`
      : '帮我把录屏目录里的精彩击杀挑出来，做成 128 BPM 的卡点短视频。'
  });

  const attachedThoughts = attachedFiles.length > 0
    ? `- **素材感知标定**：已识别用户挂载的引用素材：${attachedFiles.map(f => `**@${f.tag}** (\`${f.name}\`)`).join('、')}。已锁定本地物理路径，将作为一级重点输入直接驱动视觉侦查员。\n`
    : '';

  const amyThoughtChunks = [
    '用户希望将原始游戏录屏提炼为高密度的 **128 BPM 卡点高光短视频**。\n\n',
    attachedThoughts,
    '- **核心节奏标定**：配乐基准 128 BPM，单拍时值 468.75ms，4 拍构成一个 1.875s 的小节律动单元；\n',
    '- **因果规划推演**：直接快切会导致缺乏铺垫，盲目慢放则丧失击杀张力。我需要先通过专业技能 `beat-sync` 计算精准节拍量化网格，再协调多模态侦查员提取高光瞬间。\n'
  ].filter(Boolean);
  for (const chunk of amyThoughtChunks) {
    if (isAborted()) return;
    sendEvent(STREAM_EVENT_TYPES.STEP_LOG, { stepId: 'step-amy-think', chunk });
    await sleep(200);
  }

  sendEvent(STREAM_EVENT_TYPES.STEP_END, {
    stepId: 'step-amy-think',
    status: 'success',
    duration: 1.1
  });
  await sleep(350);

  // 步骤 1.2: 艾米调用技能 beat-sync
  if (isAborted()) return;
  sendEvent(STREAM_EVENT_TYPES.STEP_START, {
    stepId: 'step-amy-skill-beat',
    agentId: 'director',
    type: STEP_TYPES.SKILL,
    name: 'beat-sync',
    title: '调用垂直技能：卡点燃剪与节拍量化 (beat-sync)',
    inputs: {
      targetPacing: '0.468s - 1.875s',
      baseBpm: 128,
      transitionStyle: '白闪抽帧 + 节拍变焦冲击'
    }
  });

  const amySkillLogs = [
    '[beat-sync] 正在加载音频工程节拍模板库 (BPM 128)... OK\n',
    '[beat-sync] 计算量化时间标尺：\n',
    '  - Beat 1 (Drop重音): 00:00.000\n',
    '  - Beat 2 (副拍变焦): 00:00.468\n',
    '  - Beat 3 (抽帧切片): 00:00.937\n',
    '  - Beat 4 (过载收口): 00:01.406\n',
    '[beat-sync] 生成动态转场曲线：白闪阈值 Alpha=0.85，径向模糊衰减 3 帧。\n'
  ];
  for (const log of amySkillLogs) {
    if (isAborted()) return;
    sendEvent(STREAM_EVENT_TYPES.STEP_LOG, { stepId: 'step-amy-skill-beat', chunk: log });
    await sleep(180);
  }

  sendEvent(STREAM_EVENT_TYPES.STEP_END, {
    stepId: 'step-amy-skill-beat',
    status: 'success',
    duration: 1.4,
    outputs: {
      gridId: 'grid_128_bpm_v1',
      beatDurationMs: 468.75,
      transitionMatrix: 'WhiteFlashZoom_Curves'
    }
  });
  await sleep(400);

  // 艾米转交任务 -> 维克多
  if (isAborted()) return;
  sendEvent(STREAM_EVENT_TYPES.AGENT_HANDOFF, {
    fromAgentId: 'director',
    fromName: '艾米 (总编导)',
    toAgentId: 'vision-scout',
    toName: '维克多 (多模态侦查员)',
    reason: '已锁定 128 BPM 律动网格。指令已下达：请维克多扫描本地录屏目录，提取高可信度击杀瞬间。'
  });
  await sleep(500);

  // ─────────────────────────────────────────────────────────────
  // 阶段 2: 维克多 (Victor - 多模态侦查员) 接手任务
  // ─────────────────────────────────────────────────────────────
  if (isAborted()) return;
  sendEvent(STREAM_EVENT_TYPES.AGENT_START, {
    agentId: 'vision-scout',
    agentName: '维克多 (Victor)',
    agentRole: '多模态侦查员 (Vision Scout)',
    agentAvatar: '👁️',
    goal: '全量扫描本地素材库，执行视觉高频抽帧与击杀行为检测。',
    visibility: 'internal'
  });
  await sleep(350);

  // 步骤 2.1: 维克多运行工具 inspect_video_content (CMD 终端流式高频日志)
  if (isAborted()) return;
  sendEvent(STREAM_EVENT_TYPES.STEP_START, {
    stepId: 'step-victor-tool-scan',
    agentId: 'vision-scout',
    type: STEP_TYPES.TOOL,
    name: 'inspect_video_content',
    title: '执行底层工具：视频内容深度扫描与特征提取',
    inputs: {
      targetDir: 'footage_gameplay',
      sampleRateFps: 60,
      confidenceThreshold: 0.85,
      features: ['killfeed', 'headshot_banner', 'clutch_action']
    }
  });

  const cmdTerminalLogs = [
    '> ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration footage_raw_01.mp4\n',
    '[probe] 视频编码: H.264 (High) | 分辨率: 1920x1080 @ 60.00 fps | 时长: 03:42.50\n',
    '[probe] 总扫描帧数: 13,350 帧。挂载本地 GPU 轻量感知张量模型...\n',
    '[detect] Frame 01280 (00:21.33) -> [击杀播报] 步枪击杀 (置信度: 0.94)\n',
    '[detect] Frame 03410 (00:56.83) -> [爆头勋章] 狙击远距爆头 (置信度: 0.98)\n',
    '[detect] Frame 05120 (01:25.33) -> [极限残血] 1v2 反杀反制 (置信度: 0.92)\n',
    '[detect] Frame 07890 (02:11.50) -> [大招清场] 终极技能爆发 (置信度: 0.99)\n',
    '[detect] Frame 09840 (02:44.00) -> [胜利战报] 队伍获胜勋章 (置信度: 0.96)\n',
    '[filter] 算法过滤完成：自动修剪前后 0.5s 冗余，提炼出 5 组精粹高光切片 (共 11.2s)。\n'
  ];

  for (const line of cmdTerminalLogs) {
    if (isAborted()) return;
    sendEvent(STREAM_EVENT_TYPES.STEP_LOG, { stepId: 'step-victor-tool-scan', chunk: line });
    await sleep(150);
  }

  sendEvent(STREAM_EVENT_TYPES.STEP_END, {
    stepId: 'step-victor-tool-scan',
    status: 'success',
    duration: 2.1,
    outputs: {
      scannedFrames: 13350,
      detectedClipsCount: 5,
      netDurationSec: 11.2,
      peakScore: 0.99
    }
  });
  await sleep(400);

  // 维克多发布产物 1: 切片库 (Clips Pool)
  if (isAborted()) return;
  sendEvent(STREAM_EVENT_TYPES.ARTIFACT_PUBLISH, {
    artifact: {
      id: 'artifact-clips-pool-v1',
      type: ARTIFACT_TYPES.CARDS,
      title: '高光击杀素材切片池 (5段)',
      badge: '5个精选片段 · 11.2s',
      sourceAgentId: 'vision-scout',
      sourceStepId: 'step-victor-tool-scan',
      actions: [
        { id: 'act_copy_clips', label: '复制切片清单', icon: 'copy', type: 'copy' }
      ],
      data: {
        totalDuration: '11.2s',
        items: [
          { id: 'clip-1', title: '01. 突击步枪首杀', badge: '00:20.80 - 00:22.60', description: '首杀破点，包含爆头徽章判定 (评分: 0.94)', meta: { tag: 'First Blood', score: 0.94 } },
          { id: 'clip-2', title: '02. 狙击穿墙爆头', badge: '00:56.10 - 00:58.20', description: '超远距离贯穿击杀 (评分: 0.98)', meta: { tag: 'Headshot', score: 0.98 } },
          { id: 'clip-3', title: '03. 残血极限反杀', badge: '01:24.50 - 01:27.10', description: '残血 1v2 走位反杀 (评分: 0.92)', meta: { tag: 'Clutch', score: 0.92 } },
          { id: 'clip-4', title: '04. 大招群体处决', badge: '02:10.50 - 02:13.40', description: '终极技能高潮清场 (评分: 0.99)', meta: { tag: 'Multi-Kill', score: 0.99 } },
          { id: 'clip-5', title: '05. 战局胜利徽章', badge: '02:43.20 - 02:45.30', description: '战报结算与胜利勋章 (评分: 0.96)', meta: { tag: 'Victory', score: 0.96 } }
        ]
      }
    }
  });
  await sleep(500);

  // 维克多转交任务 -> 诺亚 (剪辑师)
  if (isAborted()) return;
  sendEvent(STREAM_EVENT_TYPES.AGENT_HANDOFF, {
    fromAgentId: 'vision-scout',
    fromName: '维克多 (侦查员)',
    toAgentId: 'timeline-editor',
    toName: '诺亚 (剪辑师)',
    reason: '5 段击杀切片已入库并在侧栏就绪。请诺亚接入，向用户提报节奏裁决，并编排分镜故事板。'
  });
  await sleep(500);

  // ─────────────────────────────────────────────────────────────
  // 阶段 3: 诺亚 (Noah - 剪辑师) 接手，并抛出 HITL 决策卡片
  // ─────────────────────────────────────────────────────────────
  if (isAborted()) return;
  sendEvent(STREAM_EVENT_TYPES.AGENT_START, {
    agentId: 'timeline-editor',
    agentName: '诺亚 (Noah)',
    agentRole: '剪辑师 (Timeline Editor)',
    agentAvatar: '✂️',
    goal: '微秒级音画吸附装配与剪映工程分镜输出',
    visibility: 'internal'
  });
  await sleep(350);

  // 步骤 3.1: 诺亚深度思考分析素材与剪辑策略 (Cognitive Reasoning)
  if (isAborted()) return;
  sendEvent(STREAM_EVENT_TYPES.STEP_START, {
    stepId: 'step-noah-think',
    agentId: 'timeline-editor',
    type: STEP_TYPES.THINKING,
    title: '分析素材特征并推演剪辑风格分支',
    trigger: '多模态侦查员已交付 5 段高光切片，推进分镜故事板装配策略'
  });

  const noahThoughtChunks = [
    '审阅维克多交付的 5 段高光切片（涵盖步枪首杀、超远狙击爆头、残血极限反杀与大招高潮）。\n\n',
    '当前音乐为 128 BPM 强律动，重拍间距 0.468s。**发现关键艺术流派分歧**：\n',
    '- **方案 A (极速卡点快剪)**：将 5 个击杀全部精确压进 0.468s 重音瞬间，视听密度极高；\n',
    '- **方案 B (电影感蓄力慢放)**：前 2 秒慢放蓄力拉伸悬念，第 3 秒 Drop 点爆发瞬间快切。\n\n',
    '该剪辑调性直接决定成片风格走向，属于人类创意裁决范畴。**决定：发起人机协同 (HITL) 决策挂起，由人类编导定夺。**\n'
  ];
  for (const chunk of noahThoughtChunks) {
    if (isAborted()) return;
    sendEvent(STREAM_EVENT_TYPES.STEP_LOG, { stepId: 'step-noah-think', chunk });
    await sleep(180);
  }

  sendEvent(STREAM_EVENT_TYPES.STEP_END, {
    stepId: 'step-noah-think',
    status: 'success',
    duration: 0.9
  });
  await sleep(300);

  // 发起人机协同 (HITL) 决策卡片
  if (isAborted()) return;
  sendEvent(STREAM_EVENT_TYPES.DECISION_REQUEST, {
    decisionId: 'dec-pacing-selection',
    agentId: 'timeline-editor',
    prompt: '素材切片已定位完毕，共精选出 5 段高光片段。在生成正式分镜故事板前，请裁决剪辑推进风格：',
    options: [
      {
        id: 'opt_rapid_cut',
        label: '方案 A：极速卡点快剪 (推荐)',
        description: '每个击杀严格压缩在 0.468s 重拍瞬间，极高信息密度与视听张力，适合短视频完播率冲刺。',
        isRecommended: true
      },
      {
        id: 'opt_cinematic_buildup',
        label: '方案 B：电影感蓄力慢放',
        description: '前 2 秒慢动作蓄力拉伸悬念，第 3 秒 Drop 点爆发瞬间快切，适合长镜头沉浸感。',
        isRecommended: false
      }
    ],
    status: 'pending'
  });

  // 如果没有预先选定选项，流程在此挂起，等待用户决策
  if (!decisionOptionId) {
    return;
  }

  // 若预设了 decisionOptionId，直接串联后半程
  await executeStageAfterDecision({ sendEvent, isAborted, decisionOptionId });
}

/**
 * 用户在 HITL 卡片上做出选择后，继续执行后半程
 */
export async function executeStageAfterDecision({
  sendEvent,
  isAborted = () => false,
  decisionOptionId = 'opt_rapid_cut',
  steeringNotes = ''
}) {
  if (isAborted()) return;

  const chosenLabel = decisionOptionId === 'opt_rapid_cut' ? '方案 A：极速卡点快剪' : '方案 B：电影感蓄力慢放';

  // 1. 广播决策已裁决
  sendEvent(STREAM_EVENT_TYPES.DECISION_RESOLVE, {
    decisionId: 'dec-pacing-selection',
    selectedOptionId: decisionOptionId,
    selectedLabel: chosenLabel,
    steeringNotes: steeringNotes || '',
    resolvedAt: Date.now()
  });
  await sleep(300);

  // 2. 诺亚执行装配工具
  sendEvent(STREAM_EVENT_TYPES.STEP_START, {
    stepId: 'step-noah-build-storyboard',
    agentId: 'timeline-editor',
    type: STEP_TYPES.TOOL,
    name: 'update_storyboard',
    title: `依据用户裁决【${chosenLabel}】装配分镜故事板`,
    inputs: {
      styleStrategy: decisionOptionId,
      ...(steeringNotes ? { steeringNotes } : {}),
      sourceClipsId: 'artifact-clips-pool-v1',
      targetDuration: '12.0s',
      bpm: 128
    }
  });

  const noahAssembleLogs = [
    `[TimelineEditor] 应用剪辑策略: ${chosenLabel}\n`,
    ...(steeringNotes ? [`[TimelineEditor] 融入创作者补充微调要求: "${steeringNotes}"\n`] : []),
    '[TimelineEditor] 计算对齐点：5 个切片与 128 BPM 鼓点微秒级吸附\n',
    '  - Shot 01: [00:00.00 - 00:01.87] 突击步枪首杀 -> 白闪入场\n',
    '  - Shot 02: [00:01.87 - 00:03.75] 狙击穿墙爆头 -> 0.46s 变焦重拍撞击\n',
    '  - Shot 03: [00:03.75 - 00:05.62] 残血极限反杀 -> 动态心跳音效吸附\n',
    '  - Shot 04: [00:05.62 - 00:09.37] 大招清场 -> 持续高潮轰鸣铺垫\n',
    '  - Shot 05: [00:09.37 - 00:11.25] 胜利战报 -> 定格 + 粒子消散\n',
    '[TimelineEditor] 生成分镜故事板 Draft v1 成功。\n'
  ];

  for (const line of noahAssembleLogs) {
    if (isAborted()) return;
    sendEvent(STREAM_EVENT_TYPES.STEP_LOG, { stepId: 'step-noah-build-storyboard', chunk: line });
    await sleep(140);
  }

  sendEvent(STREAM_EVENT_TYPES.STEP_END, {
    stepId: 'step-noah-build-storyboard',
    status: 'success',
    duration: 1.8,
    outputs: {
      totalShots: 5,
      timelineDuration: '11.25s',
      draftPath: 'projects/demo/draft_content.json'
    }
  });
  await sleep(350);

  // 3. 发布侧边栏产物 2: 分镜故事板
  if (isAborted()) return;
  sendEvent(STREAM_EVENT_TYPES.ARTIFACT_PUBLISH, {
    artifact: {
      id: 'artifact-storyboard-v1',
      type: ARTIFACT_TYPES.CARDS,
      title: '128 BPM 燃剪分镜故事板 (5镜)',
      badge: '5个分镜 · 11.25s · 已对齐鼓点',
      sourceAgentId: 'timeline-editor',
      sourceStepId: 'step-noah-build-storyboard',
      actions: [
        { id: 'act_export_draft', label: '一键交付/导出工程', icon: 'play', variant: 'primary', type: 'tool_call', tool: 'export_jianying_draft' },
        { id: 'act_copy_storyboard', label: '复制分镜数据', icon: 'copy', type: 'copy' }
      ],
      data: {
        items: [
          { id: 'shot-1', title: 'Shot 01 (1.87s)', badge: '白闪冲击', description: '开局步枪首杀破点，画面从暗色白闪吸附进入第一鼓点', meta: { audio: '128 BPM 前奏启动，重拍白闪音效', transition: '白闪冲击' } },
          { id: 'shot-2', title: 'Shot 02 (1.87s)', badge: '变焦推镜', description: '瞬镜甩狙远距离爆头，准星极速拉近至击杀瞬间', meta: { audio: 'Drop 重低音轰鸣，清脆爆头反馈音', transition: '变焦推镜' } },
          { id: 'shot-3', title: 'Shot 03 (1.87s)', badge: '时间静止', description: '1v2 残血极限走位滑铲反杀，红血预警 UI 闪烁', meta: { audio: '心跳急促声，0.5x 瞬间慢放后恢复', transition: '时间静止' } },
          { id: 'shot-4', title: 'Shot 04 (3.75s)', badge: '光效漫溢', description: '大招清场高光时刻，全屏粒子特效与范围冲击波', meta: { audio: '双倍密集军鼓滚奏，高频打击乐推进', transition: '光效漫溢' } },
          { id: 'shot-5', title: 'Shot 05 (1.88s)', badge: '暗角渐变', description: '团队胜利胜利徽章定格，落幕淡出至 Logo', meta: { audio: '清脆胜利号角，尾韵自然衰减', transition: '暗角渐变' } }
        ]
      }
    }
  });
  await sleep(400);

  // 3.5 剪辑师 (诺亚) 完成装配，向总编导 (艾米/主脑) 汇报并移交成果
  if (isAborted()) return;
  sendEvent(STREAM_EVENT_TYPES.AGENT_HANDOFF, {
    fromAgentId: 'timeline-editor',
    fromName: '诺亚 (剪辑师)',
    toAgentId: 'director',
    toName: '艾米 (总编导)',
    type: 'return',
    isReturn: true,
    reason: `已按创作者裁决【${chosenLabel}】装配完成 5 镜卡点分镜故事板，向总编导汇报交付。`
  });
  await sleep(400);

  // 4. 总编导 (艾米/主脑) 接管主控权并向创作者交付最终总结对话
  if (isAborted()) return;
  sendEvent(STREAM_EVENT_TYPES.AGENT_START, {
    agentId: 'director',
    agentName: '艾米 (总编导)',
    agentRole: '主脑总控编导',
    agentAvatar: '🎬',
    goal: '整合各专员执行成果并向创作者汇报交付',
    visibility: 'user'
  });
  await sleep(250);

  const noteSummary = steeringNotes ? `（兼顾微调要求：${steeringNotes}）` : '';
  sendEvent(STREAM_EVENT_TYPES.TEXT_DELTA, {
    delta: '🎉 **全流程协同编排完成！**\n\n' +
      '- **总编导 (艾米)** 已制定 128 BPM 视听卡点基准；\n' +
      '- **多模态侦查员 (维克多)** 已从录屏素材中提取出 5 段高光击杀（可查看侧栏【素材切片池】）；\n' +
      `- **剪辑师 (诺亚)** 已依您的裁决【${chosenLabel}】${noteSummary}生成了 5 镜完整故事板（可查看侧栏【分镜故事板】）。\n\n` +
      '您可以在左侧面板随时预览各分镜设计，或点击卡片回溯每一位智能体的具体执行日志。'
  });
  await sleep(200);

  // 5. 流结束
  sendEvent(STREAM_EVENT_TYPES.STREAM_DONE, {
    summary: '128 BPM 游戏高光燃剪全流程模拟完成',
    totalAgentsInvolved: ['director', 'vision-scout', 'timeline-editor'],
    artifactsCount: 2
  });
}
