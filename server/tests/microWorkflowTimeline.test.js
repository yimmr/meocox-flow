import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractKeyParams,
  extractOutputSummary,
  extractThoughtConclusion,
  applyTimelineEvent,
  buildMicroWorkflowStages
} from '../../client/src/lib/activityTimeline.js';
import { resolveToolDescription } from '../../client/src/lib/activityResolver.js';

test('extractKeyParams preserves trailing filename for long desktop local paths', () => {
  const params = extractKeyParams({
    projectId: 'proj_ignored',
    filePath: 'C:\\Users\\imonc\\Videos\\Meocox Flow\\project_alpha\\assets\\episode_03_master.mp4',
    fps: 30
  });

  assert.equal(params.length, 2);
  assert.equal(params[0].key, 'filePath');
  assert.ok(params[0].value.endsWith('episode_03_master.mp4'), `Expected filename at end, got: ${params[0].value}`);
  assert.equal(params[1].key, 'fps');
  assert.equal(params[1].value, '30');
});

test('extractOutputSummary and extractThoughtConclusion extract contract-driven single-line summaries', () => {
  // 1. 显式 summary 参数优先
  assert.equal(
    extractOutputSummary({ count: 5 }, '成功解析 5 个镜头节点'),
    '成功解析 5 个镜头节点'
  );

  // 2. 封套 Envelope.summary 契约优先提取
  assert.equal(
    extractOutputSummary({ summary: '已生成 12 个分镜镜头' }),
    '已生成 12 个分镜镜头'
  );

  // 3. 纯文本输出提取
  assert.equal(
    extractOutputSummary('纯文本执行结果输出'),
    '纯文本执行结果输出'
  );

  // 4. 杜绝字段反向猜度：无 summary 契约的对象绝不生造/猜测摘要
  assert.equal(
    extractOutputSummary({
      count: 5,
      outputPath: '/path/to/output.mp4',
      agents: [1, 2, 3]
    }),
    ''
  );

  const rawThought = `
> 正在深度分析意图边界与推演执行拓扑...
用户希望检查配置文件并委派子智能体。
首先我需要调用 read_project_file 读取工程配置，确认参数完整性。
  `;
  assert.equal(
    extractThoughtConclusion(rawThought),
    '首先我需要调用 read_project_file 读取工程配置，确认参数完整性。'
  );
});

test('applyTimelineEvent + buildMicroWorkflowStages unwraps Host Agent steps onto root spine and only groups delegated subagents', () => {
  let items = [];

  // 1. 主脑第 1 段思考
  items = applyTimelineEvent(items, 'step_start', {
    stepId: 'think_1',
    type: 'thinking',
    agentId: 'super-brain',
    agentName: 'Super Brain',
    agentRole: '系统总控编排',
    agentAvatar: '🧠',
    stageId: 'turn1:0:super-brain',
    turnId: 'turn1'
  });
  items = applyTimelineEvent(items, 'step_log', {
    stepId: 'think_1',
    chunk: '需要先读取项目配置。\n决定调用 read_project_file。',
    turnId: 'turn1'
  });
  items = applyTimelineEvent(items, 'step_end', {
    stepId: 'think_1',
    status: 'success',
    duration: 0.6,
    turnId: 'turn1'
  });

  // 2. 主脑调用工具
  items = applyTimelineEvent(items, 'step_start', {
    stepId: 'tool_1',
    activityId: 'act_tool_1',
    attempt: 1,
    type: 'tool',
    name: 'read_project_file',
    inputs: { filePath: 'D:\\workspace\\project\\config.json' },
    agentId: 'super-brain',
    agentName: 'Super Brain',
    stageId: 'turn1:0:super-brain',
    turnId: 'turn1'
  });
  items = applyTimelineEvent(items, 'step_end', {
    stepId: 'tool_1',
    activityId: 'act_tool_1',
    attempt: 1,
    status: 'success',
    duration: 0.3,
    summary: '成功读取 config.json (1.2KB)',
    verified: true,
    outputs: { content: '{}' },
    turnId: 'turn1'
  });

  // 3. 委派给子智能体 (Handoff Bridge)
  items = applyTimelineEvent(items, 'agent_handoff', {
    handoffId: 'hoff_1',
    fromId: 'super-brain',
    fromName: 'Super Brain',
    toId: 'specialist-agent',
    toName: '领域分析专家',
    reason: '委派执行深度资产探针分析'
  });

  // 4. 子智能体启动并执行思考 + 技能调用 (验证 agent_activity 占位合并不会误触发 attempt=2)
  items = applyTimelineEvent(items, 'agent_start', {
    activityId: 'turn1:1:specialist-agent',
    stageId: 'turn1:1:specialist-agent',
    agentId: 'specialist-agent',
    agentName: '领域分析专家',
    agentRole: '执行专家',
    agentAvatar: '🔍',
    goal: '深度资产探针分析',
    visibility: 'internal',
    turnId: 'turn1'
  });
  items = applyTimelineEvent(items, 'step_start', {
    stepId: 'think_2',
    type: 'thinking',
    agentId: 'specialist-agent',
    agentName: '领域分析专家',
    stageId: 'turn1:1:specialist-agent',
    turnId: 'turn1'
  });
  items = applyTimelineEvent(items, 'step_end', {
    stepId: 'think_2',
    status: 'success',
    duration: 0.5,
    thought: '已收到主脑委派任务包，准备加载分析技能。',
    turnId: 'turn1'
  });

  const { entries, breadcrumbs, isMultiStage } = buildMicroWorkflowStages(items);

  assert.equal(isMultiStage, true);
  assert.equal(entries.length, 4);

  // 主脑步骤直接平铺在一级左轴 (kind: 'step')，不再额外包裹主脑 Stage Group
  assert.equal(entries[0].kind, 'step');
  assert.equal(entries[0].step.itemType, 'thinking');
  assert.equal(entries[0].step.outSummary, '决定调用 read_project_file。');

  assert.equal(entries[1].kind, 'step');
  assert.equal(entries[1].step.name, 'read_project_file');
  assert.equal(entries[1].step.outSummary, '成功读取 config.json (1.2KB)');

  // 委派交接桥
  assert.equal(entries[2].kind, 'handoff');
  assert.equal(entries[2].fromName, 'Super Brain');
  assert.equal(entries[2].toName, '领域分析专家');

  // 被委派的子智能体保留复合阶段组 (kind: 'stage')
  assert.equal(entries[3].kind, 'stage');
  assert.equal(entries[3].agentId, 'specialist-agent');
  assert.equal(entries[3].steps.length, 1);
  assert.equal(entries[3].steps[0].attempt, 1);
  assert.equal(entries[3].steps[0].retryCount, 0);

  // 顶栏缩略链只展示被委派的子智能体，不重复展示主脑
  assert.equal(breadcrumbs.length, 1);
  assert.equal(breadcrumbs[0].agentId, 'specialist-agent');
});

test('consecutive thinking steps with no intermediate action append into the same thinking block and accumulate duration', () => {
  let items = [];

  // 第 1 段思考
  items = applyTimelineEvent(items, 'step_start', {
    stepId: 'think_seg_1',
    type: 'thinking',
    agentId: 'super-brain',
    turnId: 'turn2'
  });
  items = applyTimelineEvent(items, 'step_log', {
    stepId: 'think_seg_1',
    chunk: '第一阶段分析：正在评估视频工程轨道的帧率与时长一致性。',
    turnId: 'turn2'
  });
  items = applyTimelineEvent(items, 'step_end', {
    stepId: 'think_seg_1',
    status: 'success',
    duration: 1.4,
    turnId: 'turn2'
  });

  // 间隔一段时间后继续产出第 2 段思考（中间没有任何工具/技能/交接动作）
  items = applyTimelineEvent(items, 'step_start', {
    stepId: 'think_seg_2',
    type: 'thinking',
    agentId: 'super-brain',
    turnId: 'turn2'
  });
  items = applyTimelineEvent(items, 'step_log', {
    stepId: 'think_seg_2',
    chunk: '第二阶段分析：发现音频轨道存在偏移，准备制定对齐方案。',
    turnId: 'turn2'
  });
  items = applyTimelineEvent(items, 'step_end', {
    stepId: 'think_seg_2',
    status: 'success',
    duration: 2.1,
    turnId: 'turn2'
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].itemType, 'thinking');
  assert.equal(items[0].retryCount, 0);
  assert.equal(items[0].duration, '3.5');
  assert.equal(
    items[0].thought,
    '第一阶段分析：正在评估视频工程轨道的帧率与时长一致性。\n\n第二阶段分析：发现音频轨道存在偏移，准备制定对齐方案。'
  );
});

test('error and stream_error finalize in-flight thinking items to error status and false isThinking', () => {
  let items = [];
  items = applyTimelineEvent(items, 'step_start', {
    stepId: 'think_err_1',
    type: 'thinking',
    agentId: 'super-brain',
    turnId: 'turn_err'
  });
  items = applyTimelineEvent(items, 'step_log', {
    stepId: 'think_err_1',
    chunk: '正在推演系统指令...',
    turnId: 'turn_err'
  });

  assert.equal(items[0].status, 'running');
  assert.equal(items[0].isThinking, true);

  // 触发 stream_error 事件
  items = applyTimelineEvent(items, 'stream_error', {
    code: 'NETWORK_ERROR',
    message: '连接服务失败'
  });

  assert.equal(items[0].status, 'error');
  assert.equal(items[0].isThinking, false);
  assert.ok(parseFloat(items[0].duration) >= 0);

  // 验证附加了系统警报
  const alertItem = items.find(it => it.itemType === 'system_alert');
  assert.ok(alertItem, 'Should append system_alert');
  assert.equal(alertItem.level, 'error');
});

test('stream_done finalizes in-flight thinking items to success status', () => {
  let items = [];
  items = applyTimelineEvent(items, 'step_start', {
    stepId: 'think_done_1',
    type: 'thinking',
    agentId: 'super-brain',
    turnId: 'turn_done'
  });

  assert.equal(items[0].status, 'running');
  assert.equal(items[0].isThinking, true);

  items = applyTimelineEvent(items, 'stream_done', {
    status: 'completed',
    text: '回答完成'
  });

  assert.equal(items[0].status, 'success');
  assert.equal(items[0].isThinking, false);
});

test('dispatch_agent tool call is absorbed into handoff and attached to subagent stage without redundant step row', () => {
  let items = [];

  // 1. 主脑思考
  items = applyTimelineEvent(items, 'step_start', {
    stepId: 'think_dispatch',
    type: 'thinking',
    agentId: 'super-brain',
    turnId: 'turn_disp'
  });
  items = applyTimelineEvent(items, 'step_end', {
    stepId: 'think_dispatch',
    status: 'success',
    duration: 0.8,
    turnId: 'turn_disp'
  });

  // 2. 主脑调用 dispatch_agent 工具
  items = applyTimelineEvent(items, 'step_start', {
    stepId: 'tool_disp',
    type: 'tool',
    name: 'dispatch_agent',
    inputs: {
      targetAgentId: 'perception-specialist',
      mandate: '探查本地视频资产元数据与关键帧',
      acceptanceCriteria: ['获取分辨率与时长']
    },
    agentId: 'super-brain',
    turnId: 'turn_disp'
  });
  items = applyTimelineEvent(items, 'step_end', {
    stepId: 'tool_disp',
    status: 'success',
    duration: 0.1,
    turnId: 'turn_disp'
  });

  // 3. 产生 agent_handoff
  items = applyTimelineEvent(items, 'agent_handoff', {
    handoffId: 'hoff_disp',
    fromId: 'super-brain',
    fromName: 'Super Brain',
    toId: 'perception-specialist',
    toName: 'Perception Specialist',
    reason: '委派感知专员探查视频'
  });

  // 4. 子智能体运行步骤
  items = applyTimelineEvent(items, 'step_start', {
    stepId: 'sub_step_1',
    type: 'tool',
    name: 'inspect_video_content',
    agentId: 'perception-specialist',
    stageId: 'stage_p1',
    turnId: 'turn_disp'
  });
  items = applyTimelineEvent(items, 'step_end', {
    stepId: 'sub_step_1',
    status: 'success',
    duration: 0.4,
    turnId: 'turn_disp'
  });

  const { entries } = buildMicroWorkflowStages(items);

  // 验证：主脑步骤仅有 thinking，dispatch_agent 不作为独立 step 出现！
  const hostSteps = entries.filter((e) => e.kind === 'step');
  assert.equal(hostSteps.length, 1);
  assert.equal(hostSteps[0].step.itemType, 'thinking');

  // 验证：handoff 正确挂载了 dispatchStep
  const handoffEntry = entries.find((e) => e.kind === 'handoff');
  assert.ok(handoffEntry);
  assert.ok(handoffEntry.dispatchStep);
  assert.equal(handoffEntry.dispatchStep.name, 'dispatch_agent');
  assert.equal(handoffEntry.dispatchStep.inputs.mandate, '探查本地视频资产元数据与关键帧');

  // 验证：子阶段 stage 继承了该 handoff 与 dispatchStep
  const stageEntry = entries.find((e) => e.kind === 'stage');
  assert.ok(stageEntry);
  assert.ok(stageEntry.handoff);
  assert.equal(stageEntry.handoff.dispatchStep.name, 'dispatch_agent');
  assert.equal(stageEntry.steps.length, 1);
});

test('buildMicroWorkflowStages absorbs agent_execution and agent_activity into stage metadata without creating phantom tool steps', () => {
  const items = [
    // 1. 主脑思考
    {
      id: 'item_1',
      itemType: 'thinking',
      agentId: 'super-brain',
      status: 'success',
      duration: 1.0,
      thought: '正在规划任务...'
    },
    // 2. 委派交接
    {
      id: 'item_2',
      itemType: 'agent_handoff',
      fromId: 'super-brain',
      fromName: 'Super Brain',
      toId: 'perception-specialist',
      toName: 'Perception Specialist',
      reason: '探查视频'
    },
    // 3. 子智能体容器占位 (agent_activity)
    {
      id: 'item_3',
      itemType: 'agent_activity',
      agentId: 'perception-specialist',
      agentName: 'Perception Specialist',
      stageId: 'stage_p1',
      status: 'running'
    },
    // 4. 子智能体原子工具步骤 (tool_execution)
    {
      id: 'item_4',
      itemType: 'tool_execution',
      name: 'inspect_video_content',
      agentId: 'perception-specialist',
      stageId: 'stage_p1',
      status: 'success',
      duration: 0.8,
      inputs: { videoPath: 'D:\\test.mp4' },
      outputs: { duration: 120 }
    },
    // 5. 子智能体正文执行体容器 (agent_execution，由内部 delta 产生)
    {
      id: 'item_5',
      itemType: 'agent_execution',
      agentId: 'perception-specialist',
      stageId: 'stage_p1',
      summary: '视频总时长 120 秒，已成功解析'
    },
    // 6. 返回交接
    {
      id: 'item_6',
      itemType: 'agent_handoff',
      fromId: 'perception-specialist',
      fromName: 'Perception Specialist',
      toId: 'super-brain',
      toName: 'Super Brain',
      reason: '完成探查，交回控制权'
    }
  ];

  const { entries } = buildMicroWorkflowStages(items);

  const stages = entries.filter((e) => e.kind === 'stage');
  assert.equal(stages.length, 1);
  const pStage = stages[0];

  // 严格验证：子智能体步骤数必须为 1 (仅 inspect_video_content)，agent_execution 和 agent_activity 决不能漏入 steps
  assert.equal(pStage.steps.length, 1);
  assert.equal(pStage.steps[0].name, 'inspect_video_content');
  assert.equal(pStage.steps[0].itemType, 'tool_execution');

  // 验证：agent_execution 的 summary 被吸收至阶段元数据
  assert.equal(pStage.summary, '视频总时长 120 秒，已成功解析');
});

test('resolveToolDescription accurately reflects system-configured tool and skill descriptions and rejects blind fallbacks', () => {
  // 1. 显式 description 优先
  assert.equal(
    resolveToolDescription('custom_tool', '自定义工具显式描述'),
    '自定义工具显式描述'
  );

  // 2. 真实系统配置工具匹配
  assert.equal(
    resolveToolDescription('inspect_video_content'),
    '调度视觉感知探针，解码并分析指定素材的真实画面、场景切点、关键帧内容与音轨特征'
  );
  assert.equal(
    resolveToolDescription('dispatch_agent'),
    '超级主脑专属角色激活与委派工具：激活并调度具有独立沙盒、专业技能与工具权限的专职智能体'
  );

  // 3. 真实系统技能 SOP 匹配
  assert.equal(
    resolveToolDescription('video-perception'),
    '将本地物理视频切分场景、探测时长、景别与运动特征，输出结构化事实卡片并利用CAS强缓存'
  );

  // 4. 未知工具绝不瞎写占位文案，直接返回 null
  assert.equal(
    resolveToolDescription('unknown_nonexistent_tool'),
    null
  );
});

test('applyTimelineEvent retains system-provided tool description across lifecycle', () => {
  let items = [];
  items = applyTimelineEvent(items, 'step_start', {
    stepId: 'tool_inspect',
    activityId: 'act_1',
    type: 'tool',
    name: 'inspect_video_content',
    description: '调度视觉感知探针，解码并分析指定素材的真实画面、场景切点、关键帧内容与音轨特征。',
    inputs: { assetId: 'sample.mp4' },
    agentId: 'perception-specialist',
    agentName: 'Perception Specialist'
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].description, '调度视觉感知探针，解码并分析指定素材的真实画面、场景切点、关键帧内容与音轨特征。');

  items = applyTimelineEvent(items, 'step_end', {
    stepId: 'tool_inspect',
    status: 'success',
    outputs: { success: true }
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].description, '调度视觉感知探针，解码并分析指定素材的真实画面、场景切点、关键帧内容与音轨特征。');
});


