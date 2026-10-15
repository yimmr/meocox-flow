import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTurnMemoryFacts,
  mergeMemoryMarkdown,
  triggerAutoMemoryConvergence
} from '../../src/services/autoMemoryExtractor.js';
import { createProject, deleteProject } from '../../src/engine/index.js';
import { storage } from '../../src/storage/index.js';
import { createEnvelope } from '../../src/engine/tool/envelope.js';

describe('Auto Memory Convergence (P2 Level)', () => {
  let testProjectId;

  before(async () => {
    const projRes = await createProject({ title: 'MemoryConvergenceTestProject' });
    testProjectId = projRes.data.id;
  });

  after(async () => {
    if (testProjectId) {
      await deleteProject(testProjectId).catch(() => {});
    }
  });

  it('1. extractTurnMemoryFacts should harvest empirical tool facts and user preferences', () => {
    const mockEnvelope = createEnvelope({
      success: true,
      summary: '分镜与剪映导出完成',
      data: {
        toolExecutions: [
          {
            tool: 'update_storyboard',
            envelope: createEnvelope({
              success: true,
              summary: '分镜已确立',
              data: { count: 6 }
            })
          },
          {
            tool: 'export_jianying_draft',
            envelope: createEnvelope({
              success: true,
              summary: '剪映草稿已导出',
              data: {
                draftName: '黑神话悟空实机精剪',
                segmentsCount: 8,
                durationSec: 45
              }
            })
          },
          {
            tool: 'synthesize_cosyvoice',
            envelope: createEnvelope({
              success: true,
              summary: '配音已生成',
              data: {
                voice: 'geek_male',
                totalDurationSec: 42.5
              }
            })
          }
        ]
      }
    });

    const prompt = '以后渲染统一采用 60fps，画幅设为 9:16，风格为快节奏卡点，旁白喜欢 geek_male';

    const { projectFacts, userPreferences } = extractTurnMemoryFacts({
      prompt,
      envelope: mockEnvelope
    });

    assert.equal(projectFacts.length, 3);
    assert.ok(projectFacts.some(f => f.includes('分镜时间轴方案 (共 6 幕)')));
    assert.ok(projectFacts.some(f => f.includes('已成功导出剪映草稿工程【黑神话悟空实机精剪】')));
    assert.ok(projectFacts.some(f => f.includes('项目选用旁白配音音色「geek_male」')));

    assert.equal(userPreferences.length, 4);
    assert.ok(userPreferences.some(p => p.includes('60 FPS')));
    assert.ok(userPreferences.some(p => p.includes('9:16 (竖屏短视频)')));
    assert.ok(userPreferences.some(p => p.includes('快节奏卡点')));
    assert.ok(userPreferences.some(p => p.includes('geek_male')));
  });

  it('2. mergeMemoryMarkdown should deduplicate and merge into targeted markdown sections', () => {
    const existing = `# 项目备忘录\n\n## 项目核心事实与资产状态\n- [2026-10-01] 旧分镜方案已确立 (共 3 幕)\n- 既有资产 A 已就位\n\n## 其他备注\n- 不要动这里`;

    const newItems = [
      '[2026-10-10] 已成功导出剪映草稿工程【大圣归来】',
      '[2026-10-10] 旧分镜方案已确立 (共 3 幕)' // 重复项，日期更新
    ];

    const merged = mergeMemoryMarkdown(existing, newItems, '## 项目核心事实与资产状态');

    assert.ok(merged.includes('## 项目核心事实与资产状态'));
    assert.ok(merged.includes('## 其他备注'));
    assert.ok(merged.includes('不要动这里'));
    assert.ok(merged.includes('既有资产 A 已就位'));
    assert.ok(merged.includes('[2026-10-10] 已成功导出剪映草稿工程【大圣归来】'));
    // 验证更新了重复条目而不是无脑追加
    const occurrences = merged.split('旧分镜方案已确立').length - 1;
    assert.equal(occurrences, 1);
  });

  it('3. triggerAutoMemoryConvergence should write project facts and user preferences into storage', async () => {
    const mockEnvelope = createEnvelope({
      success: true,
      summary: '渲染完成',
      data: {
        toolExecutions: [
          {
            tool: 'render_video_mp4',
            envelope: createEnvelope({
              success: true,
              summary: '视频已直出',
              data: {
                fileName: 'final_epic.mp4',
                fps: 60,
                durationSec: 30
              }
            })
          }
        ]
      }
    });

    const prompt = '以后默认使用 60fps，风格为极简极客';

    const convergenceRes = await triggerAutoMemoryConvergence({
      projectId: testProjectId,
      threadId: 'th_test_123',
      prompt,
      envelope: mockEnvelope
    });

    assert.equal(convergenceRes.success, true);
    assert.equal(convergenceRes.updated, true);
    assert.ok(convergenceRes.projectFactsCount >= 1);
    assert.ok(convergenceRes.userPreferencesCount >= 1);

    // 验证读取召回
    const recalledMemory = await storage.getMemory(testProjectId);
    assert.ok(recalledMemory.projectMemory);
    assert.ok(recalledMemory.projectMemory.includes('final_epic.mp4'));
    assert.ok(recalledMemory.userMemory.includes('极简极客'));
    assert.ok(recalledMemory.combinedText.includes('final_epic.mp4'));
  });
});
