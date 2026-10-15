import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeAgentAction } from '../src/services/agentTools.js';
import { storage } from '../src/storage/index.js';
import { buildGroundedSystemPrompt } from '../src/services/ai.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('E2E Agent Workflow Test', () => {
  const e2eProjId = 'proj_e2e_verify_full';

  it('should run complete cycle: init -> prompt ground -> update storyboard -> export draft', async () => {
    await storage.init();
    await storage.saveProject({
      id: e2eProjId,
      title: 'E2E全链路自动化验证项目',
      game: '黑神话：悟空',
      category: '攻略教学'
    });

    const mockAssets = [
      {
        id: 'clip_e2e_01',
        name: 'boss_parry.mp4',
        duration: '00:04',
        durationSec: 4.0,
        tags: ['Boss战', '弹刀', '高能']
      },
      {
        id: 'clip_e2e_02',
        name: 'talent_tree.mp4',
        duration: '00:06',
        durationSec: 6.0,
        tags: ['加点教学', '天赋']
      }
    ];
    await storage.saveAssets(e2eProjId, mockAssets);

    // 1. Verify Grounding Prompt accurately incorporates real assets
    const prompt = buildGroundedSystemPrompt({
      project: await storage.getProject(e2eProjId),
      assets: await storage.getAssets(e2eProjId),
      storyboard: []
    });
    assert.ok(prompt.includes('clip_e2e_01'));
    assert.ok(prompt.includes('boss_parry.mp4'));
    assert.ok(prompt.includes('E2E全链路自动化验证项目'));

    // 2. Simulate Agent autonomous action: update_storyboard
    const actionResult = await executeAgentAction(e2eProjId, 'update_storyboard', {
      items: [
        {
          order: 1,
          title: '【黄金钩子】卡关痛点引流',
          scriptText: '卡关3小时打不过？学会这招无伤弹刀打法！',
          matchedClipId: 'clip_e2e_01',
          durationSec: 4.0,
          transition: '重低音冲击'
        },
        {
          order: 2,
          title: '【加点配置】符文洗点',
          scriptText: '劈棍二阶贯通直接点满，伤害直接翻倍。',
          matchedClipId: 'clip_e2e_02',
          durationSec: 6.0,
          transition: '滑动转场'
        }
      ]
    });

    assert.equal(actionResult.success, true);
    assert.equal(actionResult.count, 2);

    // 3. Verify Storyboard saved and calculated
    const savedStoryboard = await storage.getStoryboard(e2eProjId);
    assert.equal(savedStoryboard.length, 2);
    assert.equal(savedStoryboard[0].timeRange, '00:00 - 00:04');
    assert.equal(savedStoryboard[1].timeRange, '00:04 - 00:10');

    // 4. Verify Pipeline stage 3 was automatically advanced
    const pipeline = await storage.getPipeline(e2eProjId);
    const step3 = pipeline.stages.find(s => s.id === 'step_3');
    assert.equal(step3.status, 'completed');
    assert.equal(step3.progress, 100);

    // 5. Test export draft
    const draftExportResult = await executeAgentAction(e2eProjId, 'export_jianying_draft', {
      draftName: 'E2E草稿工程'
    });
    assert.equal(draftExportResult.success, true);
    assert.ok(draftExportResult.draftPath);

    // Verify backup files exist on disk
    const contentRaw = await fs.readFile(path.join(draftExportResult.outputDirectory, 'draft_content.json'), 'utf-8');
    const metaRaw = await fs.readFile(path.join(draftExportResult.outputDirectory, 'draft_meta_info.json'), 'utf-8');
    const contentJson = JSON.parse(contentRaw);
    const metaJson = JSON.parse(metaRaw);

    assert.ok(contentJson.tracks.length >= 2, 'Should create at least 2 tracks (video + subtitles)');
    assert.equal(metaJson.draft_name, 'E2E草稿工程');

    // 6. Clean up
    await storage.deleteProject(e2eProjId);
    try {
      await fs.rm(draftExportResult.outputDirectory, { recursive: true, force: true });
      if (draftExportResult.jianyingDraftDir) {
        await fs.rm(draftExportResult.jianyingDraftDir, { recursive: true, force: true });
      }
    } catch {}
  });
});
