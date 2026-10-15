import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dehydrateSubagentResult,
  formatDehydratedFactCard,
  createLeanPackage
} from '../../src/engine/orchestrator/contextPackager.js';
import { createEnvelope } from '../../src/engine/tool/envelope.js';

describe('Super Brain Multi-Agent Dehydration & Convergence Specification', () => {
  it('1. dehydrateSubagentResult should sanitize thinking tags and cap summary length', () => {
    const rawResult = createEnvelope({
      success: true,
      summary: '<think>这是专员内部的巨量推理过程，不应泄露到主脑上下文</think>已完成视频关键帧探测与硬切点提取。',
      data: {
        text: '<thought>中间推导过程</thought>正式文本结论'
      }
    });

    const leanPackage = {
      taskId: 'task_001',
      targetAgentId: 'perception-specialist'
    };

    const dehydrated = dehydrateSubagentResult(rawResult, leanPackage);

    assert.equal(dehydrated.success, true);
    assert.equal(dehydrated.agentId, 'perception-specialist');
    assert.ok(!dehydrated.summary.includes('<think>'));
    assert.ok(!dehydrated.summary.includes('巨量推理过程'));
    assert.ok(dehydrated.summary.includes('已完成视频关键帧探测与硬切点提取。'));
  });

  it('2. dehydrateSubagentResult should harvest artifacts and structured facts from toolExecutions and deduplicate them', () => {
    const rawResult = {
      success: true,
      summary: '感知专员分析完毕',
      data: {
        toolExecutions: [
          {
            tool: 'probe_video_content',
            args: { filePath: 'D:/videos/boss_fight.mp4' },
            envelope: {
              success: true,
              summary: '探针探测成功',
              data: {
                specs: { durationSec: 62.5, resolution: '3840x2160', fps: 60 },
                scenes: [
                  { index: 1, startSec: 0, endSec: 15.2, shotType: 'Wide Shot', description: '开场对峙' },
                  { index: 2, startSec: 15.2, endSec: 30.0, shotType: 'Close-Up', description: '暴击定身' }
                ],
                facts: ['玩家使用劈棍识破击破Boss韧性', '转阶段触发金色雷电粒子'],
                highlights: ['15.2s 处识破瞬间极具冲击力']
              },
              artifacts: [
                { id: 'art_probe_1', type: 'video_meta', title: '视频元数据' }
              ]
            }
          },
          {
            tool: 'export_jianying_draft',
            args: {},
            envelope: {
              success: true,
              summary: '剪映草稿生成完毕',
              data: {
                draftPath: 'D:/Jianying/Drafts/boss_fight_cut'
              },
              artifacts: [
                { id: 'art_probe_1', type: 'video_meta', title: '视频元数据' }, // duplicate id
                { id: 'art_draft_2', type: 'jianying_draft', title: '草稿工程', path: 'D:/Jianying/Drafts/boss_fight_cut' }
              ]
            }
          }
        ]
      }
    };

    const leanPkg = createLeanPackage({
      task: '提取高光切片并注入剪映草稿',
      targetAgentId: 'perception-specialist',
      localAssets: ['D:/videos/boss_fight.mp4']
    });

    const dehydrated = dehydrateSubagentResult(rawResult, leanPkg);

    // 结构化事实检验
    assert.ok(dehydrated.factCard, 'Must contain structuredFact');
    assert.deepEqual(dehydrated.factCard.specs, { durationSec: 62.5, resolution: '3840x2160', fps: 60 });
    assert.equal(dehydrated.factCard.scenes.length, 2);
    assert.equal(dehydrated.factCard.facts.length, 2);
    assert.equal(dehydrated.factCard.highlights.length, 1);

    // 产物去重与提取检验 (草稿 + 产物列表去重后应有 video_meta, draftPath, jianying_draft 资产)
    const artifactIds = dehydrated.artifacts.map(a => a.id || a.type);
    assert.ok(artifactIds.includes('art_probe_1'));
    assert.ok(artifactIds.includes('art_draft_2'));
    // art_probe_1 不应出现两次
    const probeCount = dehydrated.artifacts.filter(a => a.id === 'art_probe_1').length;
    assert.equal(probeCount, 1, 'Artifacts must be deduplicated');
  });

  it('3. formatDehydratedFactCard should render standardized Markdown fact card for Lead Orchestrator', () => {
    const dehydrated = {
      success: true,
      taskId: 'task_002',
      agentId: 'code-motion-engineer',
      summary: '已根据技术架构生成代码终端与拓扑图表的动效场景。',
      factCard: {
        facts: ['完成 3 个核心拓扑动效场景组装', '总渲染时长为 24 秒'],
        highlights: ['内存池释放场景动效表现流畅'],
        specs: { compositionWidth: 1920, compositionHeight: 1080, fps: 30 }
      },
      artifacts: [
        { type: 'remotion_bundle', id: 'bundle_1', title: 'Remotion 动效工程清单' }
      ]
    };

    const formatted = formatDehydratedFactCard(dehydrated, '动效代码架构师');

    assert.ok(formatted.includes('【动效代码架构师（code-motion-engineer）交付结果】:'));
    assert.ok(formatted.includes('已根据技术架构生成代码终端与拓扑图表的动效场景。'));
    assert.ok(formatted.includes('【关键业务事实清单】:'));
    assert.ok(formatted.includes('- [1] 完成 3 个核心拓扑动效场景组装'));
    assert.ok(formatted.includes('【重点提炼】:'));
    assert.ok(formatted.includes('- [1] 内存池释放场景动效表现流畅'));
    assert.ok(formatted.includes('【规格参数】:'));
    assert.ok(formatted.includes('compositionWidth: 1920'));
    assert.ok(formatted.includes('【已生成/更新产物引用】:'));
    assert.ok(formatted.includes('产物[remotion_bundle]: Remotion 动效工程清单'));
  });
});
