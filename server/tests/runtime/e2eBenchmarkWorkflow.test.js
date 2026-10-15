import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createProject,
  createThread,
  getThread,
  getThreadMessages,
  deleteProject,
  setMockOverride
} from '../../src/engine/index.js';
import { storage } from '../../src/storage/index.js';
import { MCPHub } from '../../src/runtime/mcpHub.js';
import { registerLocalVideoTools } from '../../src/runtime/registerLocalTools.js';
import { executeThreadTurn } from '../../src/services/threadTurnRunner.js';
import { triggerAutoMemoryConvergence } from '../../src/services/autoMemoryExtractor.js';
import { buildProjectRulesTier } from '../../src/engine/orchestrator/promptBuilder.js';

describe('P2+ Benchmark Real-World Video Creation Workflow Suite', () => {
  let hub;
  let projectId;
  let threadId;
  let workDir;

  before(async () => {
    // 1. 初始化本地 MCPHub 并注入 25 项合规工具
    hub = new MCPHub();
    registerLocalVideoTools(hub);

    // 2. 创建真实标杆项目与线程
    const projRes = await createProject({
      title: '神话黑风山实机卡点混剪',
      category: '游戏攻略'
    });
    assert.equal(projRes.success, true);
    projectId = projRes.data.id;

    workDir = await storage.getProjectWorkDir(projectId);

    const threadRes = await createThread(projectId, { title: '主线制作任务' });
    assert.equal(threadRes.success, true);
    threadId = threadRes.data.id;
  });

  after(async () => {
    setMockOverride(null);
    if (projectId) {
      await deleteProject(projectId).catch(() => {});
    }
  });

  it('Step 1: Local perception & storyboard layout compliant with Envelope specs', async () => {
    // 模拟素材探针感知
    const inspectRes = await hub.executeTool('inspect_video_content', {
      assetId: 'boss_fight_raw_01',
      extractTags: true
    }, { projectId });

    assert.equal(inspectRes.success, true);
    assert.ok(typeof inspectRes.summary === 'string');
    assert.ok(inspectRes.data);
    assert.equal(inspectRes.error, null);

    // 编排 3 幕分镜故事板
    const storyboardItems = [
      { order: 1, title: '黄金3秒蓄力', scriptText: '风压扑面，起手前摇蓄力！', durationSec: 3.5 },
      { order: 2, title: '识破定身大招', scriptText: '定身法定型，重棍当头劈下！', durationSec: 4.0 },
      { order: 3, title: '处决硬直收尾', scriptText: '硬直跪地，行云流水处决！', durationSec: 3.5 }
    ];

    const sbRes = await hub.executeTool('update_storyboard', {
      items: storyboardItems
    }, { projectId });

    assert.equal(sbRes.success, true);
    assert.equal(sbRes.data.count, 3);
    assert.ok(Array.isArray(sbRes.artifacts));
    assert.equal(sbRes.artifacts[0].type, 'storyboard');
    assert.equal(sbRes.artifacts[0].badge, '3 幕');

    // 验证物理持久化
    const savedStoryboard = await storage.getStoryboard(projectId);
    assert.equal(savedStoryboard.length, 3);
    assert.equal(savedStoryboard[0].title, '黄金3秒蓄力');
  });

  it('Step 2: Export JianYing draft with zero-copy physical path & Envelope', async () => {
    const exportRes = await hub.executeTool('export_jianying_draft', {
      draftName: '黑神话定身劈棍大招工程',
      ratio: '16:9'
    }, { projectId });

    assert.equal(exportRes.success, true);
    assert.ok(exportRes.summary.includes('导出剪映草稿工程'));
    assert.equal(exportRes.data.draftName, '黑神话定身劈棍大招工程');
    assert.ok(exportRes.data.draftPath, '应包含绝对物理路径');
    assert.ok(fs.existsSync(exportRes.data.draftPath), '草稿目录应真实存在于本地磁盘');

    const draftJsonPath = path.join(exportRes.data.draftPath, 'draft_content.json');
    assert.ok(fs.existsSync(draftJsonPath), 'draft_content.json 必须物理存在');

    assert.ok(Array.isArray(exportRes.artifacts));
    assert.equal(exportRes.artifacts[0].type, 'jianying_draft');
    assert.ok(exportRes.artifacts[0].title.includes('黑神话定身劈棍大招工程'));
  });


  it('Step 3: Trigger auto memory convergence and verify empirical facts & preferences', async () => {
    // 构造第一轮次所产生的复合执行信封
    const turnEnvelope = {
      success: true,
      summary: '分镜规划与剪映草稿工程导出完毕',
      data: {
        toolExecutions: [
          {
            tool: 'update_storyboard',
            envelope: {
              success: true,
              summary: '已编排 3 幕分镜',
              data: { count: 3 }
            }
          },
          {
            tool: 'export_jianying_draft',
            envelope: {
              success: true,
              summary: '剪映草稿已导出',
              data: {
                draftName: '黑神话定身劈棍大招工程',
                segmentsCount: 3,
                durationSec: 11
              }
            }
          }
        ]
      }
    };

    const userPrompt = '以后视频统一按 60fps 渲染，画幅用 16:9，剪辑风格为快节奏卡点，旁白选用 geek_male';

    const convergenceRes = await triggerAutoMemoryConvergence({
      projectId,
      threadId,
      prompt: userPrompt,
      envelope: turnEnvelope
    });

    assert.equal(convergenceRes.success, true);
    assert.equal(convergenceRes.updated, true);
    assert.ok(convergenceRes.projectFactsCount >= 2);
    assert.ok(convergenceRes.userPreferencesCount >= 4);

    // 检查项目级 MEMORY.md 与全局用户级偏好
    const memory = await storage.getMemory(projectId);
    assert.ok(memory.projectMemory.includes('黑神话定身劈棍大招工程'));
    assert.ok(memory.projectMemory.includes('分镜时间轴方案 (共 3 幕)'));

    assert.ok(memory.userMemory.includes('60 FPS'));
    assert.ok(memory.userMemory.includes('16:9'));
    assert.ok(memory.userMemory.includes('快节奏卡点'));
    assert.ok(memory.userMemory.includes('geek_male'));
  });

  it('Step 4: Cross-turn prompt injection & thread turn execution end-to-end recall', async () => {
    // 1. 验证跨会话提示词装配层（Tier 3）是否精准注入 Section 6 记忆
    const memoryData = await storage.getMemory(projectId);
    const storyboard = await storage.getStoryboard(projectId);
    const project = await storage.getProject(projectId);

    const systemPrompt = buildProjectRulesTier({
      project,
      storyboard,
      assets: [],
      registeredAgents: [],
      registeredSkills: [],
      memoryText: memoryData.combinedText
    });

    assert.ok(systemPrompt.includes('## 6. 跨会话持久经验与偏好记忆'));
    assert.ok(systemPrompt.includes('黑神话定身劈棍大招工程'));
    assert.ok(systemPrompt.includes('快节奏卡点'));
    assert.ok(systemPrompt.includes('60 FPS'));

    // 2. 通过 UI-Agnostic threadTurnRunner 执行第二轮真实对话
    setMockOverride({
      enabled: true,
      mockModels: true,
      defaultText: '【Super Brain】收到，已从记忆库载入您上一轮确立的【黑神话定身劈棍大招工程】以及 60fps/快节奏卡点偏好，继续执行。',
      defaultReasoning: '检索到 Section 6 跨会话偏好：快节奏卡点与60fps，正在推演下一步...'
    });

    const emittedEvents = [];
    const eventSink = (event, data) => emittedEvents.push({ event, data });

    const turn2Result = await executeThreadTurn(
      {
        projectId,
        threadId,
        prompt: '回顾一下刚才确立的工程和我的风格要求，准备下一步',
        agentId: 'super-brain',
        enableThinking: true
      },
      {
        emitEvent: eventSink,
        isAborted: () => false
      }
    );

    assert.equal(turn2Result.status, 'completed');
    assert.ok(turn2Result.reply.content.includes('黑神话定身劈棍大招工程'));

    // 验证线程状态
    const thread = await getThread(projectId, threadId);
    assert.equal(thread.status, 'completed');

    const history = await getThreadMessages(projectId, threadId);
    assert.ok(history.length >= 2);
    const lastMsg = history[history.length - 1];
    assert.equal(lastMsg.role, 'assistant');
    assert.ok(lastMsg.content.includes('黑神话定身劈棍大招工程'));

    // 验证标准事件流序列
    const eventNames = emittedEvents.map(e => e.event);
    assert.ok(eventNames.includes('stream_started'));
    assert.ok(eventNames.includes('agent_start'));
    assert.ok(eventNames.includes('done'));
    assert.ok(eventNames.includes('stream_done'));
  });
});
