import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  HARNESS_SYSTEM_PROMPT,
  OUTPUT_PRESETS,
  buildProjectRulesTier,
  buildDynamicRemindersTier,
  buildLeadOrchestratorPrompt,
  buildSplitOrchestratorPrompt,
  createLeanPackage,
  buildSubagentExecutionMessages,
  dehydrateSubagentResult,
  pruneToolOutputs,
  condenseConversationHistory,
  shouldTriggerBatchCompaction,
  compactSessionMessages,
  LeadOrchestrator
} from '../src/engine/orchestrator/index.js';
import { getOrchestrator, runAgent, getAgent, callTool } from '../src/engine/index.js';
import { ToolRegistry } from '../src/engine/tool/registry.js';
import { wrapExecution } from '../src/engine/tool/envelope.js';

describe('Lead Orchestrator Architecture & Engineering Specification', () => {
  // ── 1. 4-Tier System Prompt Hierarchy & Prompt Caching Prefix ──
  describe('1. 4-Tier System Prompt Architecture', () => {
    it('Tier 1: Harness prompt must enforce zero-copy local asset paths and orchestrator contract', () => {
      assert.ok(HARNESS_SYSTEM_PROMPT.includes('Lead Orchestrator'));
      assert.ok(HARNESS_SYSTEM_PROMPT.includes('DESKTOP-FIRST ZERO-COPY ASSET HANDLING'));
      assert.ok(HARNESS_SYSTEM_PROMPT.includes('AUTONOMOUS END-TO-END EXECUTION'));
      assert.ok(HARNESS_SYSTEM_PROMPT.includes('LEAN CONTEXT PACKAGING'));
    });

    it('Tier 2: Presets must enforce explicit <think> chain of thought and technical brevity', () => {
      assert.ok(OUTPUT_PRESETS.includes('<think>'));
      assert.ok(OUTPUT_PRESETS.includes('TECHNICAL BREVITY'));
      assert.ok(OUTPUT_PRESETS.includes('Eliminate conversational sycophancy'));
    });

    it('Tier 3: Project rules tier must inject local absolute paths, storyboard and worker pool', () => {
      const mockProject = {
        id: 'proj_hero_01',
        title: '黑神话劈棍高光集锦',
        projectDir: 'D:/Videos/MeocoxFlow/proj_hero_01'
      };
      const mockAssets = [
        { id: 'a1', name: 'wukong_boss_01.mp4', path: 'D:/Videos/Raw/wukong_boss_01.mp4', duration: '12s' }
      ];
      const mockStoryboard = [
        { order: 1, title: '卡点钩子', durationSec: 3.5, scriptText: '3秒打出硬直！' }
      ];
      const mockAgents = [
        { id: 'director', name: 'Director', role: '总编导' }
      ];

      const tier3 = buildProjectRulesTier({
        project: mockProject,
        assets: mockAssets,
        storyboard: mockStoryboard,
        registeredAgents: mockAgents
      });

      assert.ok(tier3.includes('黑神话劈棍高光集锦'));
      assert.ok(tier3.includes('D:/Videos/Raw/wukong_boss_01.mp4'), 'Must output absolute physical file path');
      assert.ok(tier3.includes('卡点钩子'));
      assert.ok(tier3.includes('总编导'));
    });

    it('Tier 4: Dynamic reminders must carry decision and perception context without global modes', () => {
      const tier = buildDynamicRemindersTier({
        pendingDecision: { decisionId: 'decision_1' },
        activePerception: { filename: 'clip.mp4', filePath: 'D:/clip.mp4' }
      });
      assert.ok(tier.includes('PENDING DECISION ALERT'));
      assert.ok(tier.includes('LATEST VIDEO PERCEPTION PROBE OUTPUT'));
      assert.ok(!tier.includes('PLAN_MODE'));
      assert.ok(!tier.includes('ACT_MODE'));
    });

    it('Prompt Caching Breakpoint: Static prefix remains invariant while runtime reminders change', () => {
      const params = {
        project: { id: 'p1', title: '测试' },
        assets: [{ id: 'a1', path: 'D:/test.mp4' }]
      };

      const splitBase = buildSplitOrchestratorPrompt(params);
      const splitWithDecision = buildSplitOrchestratorPrompt({
        ...params,
        pendingDecision: { decisionId: 'decision_1' }
      });

      // The static prefix (Tier 1 + 2 + 3) must be 100% identical for KV Cache hit
      assert.equal(splitBase.staticPrefix, splitWithDecision.staticPrefix);
      assert.notEqual(splitBase.dynamicSuffix, splitWithDecision.dynamicSuffix);
    });
  });

  // ── 2. Lean Context Packaging & Dehydration ──
  describe('2. Lean Context Packaging & Dehydration', () => {
    it('createLeanPackage should construct lean payload with absolute physical paths', () => {
      const leanPkg = createLeanPackage({
        task: '对本地视频进行切片分析',
        targetAgentId: 'vision-scout',
        localAssets: [
          { id: 'vid1', filename: 'clip.mp4', path: 'D:/media/clip.mp4', duration: 15 }
        ],
        constraints: ['不得使用云端接口', '只分析前10秒'],
        project: { id: 'p123', title: '剪辑项目' }
      });

      assert.ok(leanPkg.taskId.startsWith('task_'));
      assert.equal(leanPkg.targetAgentId, 'vision-scout');
      assert.equal(leanPkg.localAssets[0].path, 'D:/media/clip.mp4');
      assert.equal(leanPkg.constraints.length, 2);
    });

    it('buildSubagentExecutionMessages should produce isolated single-turn briefing', () => {
      const leanPkg = createLeanPackage({
        task: '规划5个爆款分镜',
        targetAgentId: 'director',
        project: { id: 'p1', title: '短视频' }
      });

      const msgs = buildSubagentExecutionMessages(leanPkg, { name: 'Director', role: '总编导' });
      assert.equal(msgs.length, 1);
      assert.equal(msgs[0].role, 'user');
      assert.ok(msgs[0].content.includes('超级主脑委派任务书'));
      assert.ok(msgs[0].content.includes('规划5个爆款分镜'));
    });

    it('dehydrateSubagentResult should strip verbose traces and summarize outputs', () => {
      const rawResult = {
        summary: '<think>这是子智能体的推导过程...</think>已成功编排分镜',
        data: {
          draftPath: 'D:/Drafts/output_draft',
          storyboard: [{ order: 1, title: '镜1' }]
        }
      };
      const leanPkg = { taskId: 'task_001', targetAgentId: 'timeline-editor' };

      const dehydrated = dehydrateSubagentResult(rawResult, leanPkg);
      assert.equal(dehydrated.success, true);
      assert.equal(dehydrated.taskId, 'task_001');
      assert.equal(dehydrated.summary, '已成功编排分镜');
      assert.equal(dehydrated.artifacts.length, 2);
      assert.equal(dehydrated.artifacts[0].path, 'D:/Drafts/output_draft');
    });

    it('pruneToolOutputs should fold large historical tool calls while keeping recent calls intact', () => {
      const largeContent = JSON.stringify({ hugeData: 'x'.repeat(1000) });
      const messages = [
        { role: 'user', content: '查看视频' },
        { role: 'tool', content: largeContent }, // older tool output -> should fold
        { role: 'user', content: '继续查看' },
        { role: 'tool', content: JSON.stringify({ status: 'ok', data: 'recent 1' }) }, // recent 2 -> keep
        { role: 'assistant', content: '完成' },
        { role: 'tool', content: JSON.stringify({ status: 'ok', data: 'recent 2' }) } // recent 1 -> keep
      ];

      const pruned = pruneToolOutputs(messages, { maxOutputLength: 200, keepRecentToolCount: 2 });
      assert.equal(pruned.length, 6);

      const parsedOld = JSON.parse(pruned[1].content);
      assert.equal(parsedOld._pruned, true);
      assert.equal(parsedOld.status, 'folded');

      // Recent tool output must not be pruned
      assert.ok(pruned[3].content.includes('recent 1'));
    });

    it('condenseConversationHistory should summarize early conversation when threshold exceeded', () => {
      const longConversation = [];
      for (let i = 0; i < 30; i++) {
        longConversation.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `轮次 ${i}: 讨论视频节奏和剪辑点`
        });
      }

      const condensed = condenseConversationHistory(longConversation, {
        maxThreshold: 20,
        preserveRecentCount: 6
      });

      assert.equal(condensed[0].role, 'system');
      assert.ok(condensed[0].content.includes('SYSTEM SUMMARY OF PREVIOUS TURNS'));
      assert.equal(condensed.length, 7); // 1 summary + 6 recent
    });
  });

  // ── 3. Tool execution verification ──
  describe('3. Tool execution verification', () => {
    it('Empirical verification must reject nonexistent physical artifact paths', async () => {
      const orchestrator = new LeadOrchestrator();

      const ghostResult = {
        success: true,
        data: { draftPath: 'D:/NonExistentPath/ghost_draft_12345' }
      };

      const verification = await orchestrator.verifyResult('export_jianying_draft', ghostResult);
      assert.equal(verification.verified, false);
      assert.ok(verification.reason.includes('不存在'));

      // Real temporary file verification
      const tmpFile = path.join(os.tmpdir(), `test_artifact_${Date.now()}.json`);
      fsSync.writeFileSync(tmpFile, '{}', 'utf-8');

      const realResult = {
        success: true,
        data: { draftPath: tmpFile }
      };
      const realVerification = await orchestrator.verifyResult('export_jianying_draft', realResult);
      assert.equal(realVerification.verified, true);

      fsSync.unlinkSync(tmpFile);
    });
  });

  // ── 4. Facade Engine Integration ──
  describe('4. Engine Facade Singleton & System Prompt Integration', () => {
    it('getOrchestrator should return initialized LeadOrchestrator singleton', async () => {
      const orch = await getOrchestrator();
      assert.ok(orch instanceof LeadOrchestrator);
    });

    it('super-brain agent must exist and expose Lead Orchestrator prompt with Tier 1~4 structure', async () => {
      const brain = await getAgent('super-brain');
      assert.ok(brain);
      assert.equal(brain.name, 'Super Brain');
      assert.equal(brain.title, '参谋总长');

      // Verify that running super-brain passes through 4-Tier prompt
      const orch = await getOrchestrator();
      const compiledPrompt = orch.buildPrompt({
        project: { id: 'test_p1', title: '测试工程' },
        assets: [{ id: 'a1', path: 'D:/test.mp4', name: 'test.mp4' }]
      });

      assert.ok(compiledPrompt.includes('Lead Orchestrator'));
      assert.ok(compiledPrompt.includes('DESKTOP-FIRST ZERO-COPY ASSET HANDLING'));
      assert.ok(compiledPrompt.includes('测试工程'));
      assert.ok(compiledPrompt.includes('D:/test.mp4'));
      assert.ok(compiledPrompt.includes('DYNAMIC RUNTIME REMINDERS'));
      assert.ok(!compiledPrompt.includes('PLAN_MODE'));
      assert.ok(!compiledPrompt.includes('ACT_MODE'));
    });
  });

  // ── 5. Blueprint Iteration 1: Anti-Starvation Contract, Cache-Aware Compaction, Inbound Pruning & Gate 1 Security ──
  describe('5. Architecture Blueprint Iteration 1 Enhancements', () => {
    it('createLeanPackage and buildSubagentExecutionMessages should preserve inheritedConstraints, inputArtifacts, acceptanceCriteria, and accessMode', () => {
      const pkg = createLeanPackage({
        task: '生成架构拓扑动效场景',
        targetAgentId: 'code-motion-engineer',
        accessMode: 'isolated_write',
        inheritedConstraints: ['画面比例锁定 9:16', '使用极客暗色主题'],
        constraints: ['画面比例锁定 9:16', '帧率 60fps'],
        inputArtifacts: [
          { refType: 'local_path', uriOrId: 'D:/assets/arch_spec.md', digestSummary: '系统架构规范文档' }
        ],
        acceptanceCriteria: ['包含至少 3 个节点', '所有时长大于 0']
      });

      assert.equal(pkg.accessMode, 'isolated_write');
      assert.equal(pkg.inheritedConstraints.length, 3);
      assert.equal(pkg.acceptanceCriteria.length, 2);
      assert.equal(pkg.inputArtifacts.length, 1);
      assert.equal(pkg.inputArtifacts[0].path, 'D:/assets/arch_spec.md');

      const [briefingMsg] = buildSubagentExecutionMessages(pkg, { name: 'Code Motion Engineer' });
      assert.ok(briefingMsg.content.includes('isolated_write'));
      assert.ok(briefingMsg.content.includes('画面比例锁定 9:16'));
      assert.ok(briefingMsg.content.includes('包含至少 3 个节点'));
      assert.ok(briefingMsg.content.includes('系统架构规范文档'));
    });

    it('compactSessionMessages should leave history 100% untouched below watermark to preserve KV Cache prefix', () => {
      const normalMessages = [
        { role: 'user', content: '分析视频' },
        { role: 'tool', content: JSON.stringify({ data: 'x'.repeat(800) }) },
        { role: 'assistant', content: '已完成分析' }
      ];

      assert.equal(shouldTriggerBatchCompaction(normalMessages, { watermarkChars: 10000, watermarkMessageCount: 10 }), false);
      const untouched = compactSessionMessages(normalMessages, { watermarkChars: 10000, watermarkMessageCount: 10 });
      // Reference equality guarantees zero mutation of historical messages before watermark
      assert.strictEqual(untouched, normalMessages);

      // When watermark is reached, batch compaction triggers both pruning and condensation
      assert.equal(shouldTriggerBatchCompaction(normalMessages, { watermarkChars: 500, watermarkMessageCount: 10 }), true);
      const compacted = compactSessionMessages(normalMessages, {
        watermarkChars: 500,
        watermarkMessageCount: 2,
        maxOutputLength: 200,
        keepRecentToolCount: 0,
        preserveRecentCount: 1
      });
      assert.equal(compacted[0].role, 'system');
      assert.equal(compacted[0]._condensed, true);
    });

    it('wrapExecution should automatically prune oversized inbound tool strings', async () => {
      const hugeLog = 'A'.repeat(20000);
      const env = await wrapExecution(async () => ({
        logOutput: hugeLog,
        normalField: 'ok'
      }), '测试超长输出', { maxStringLength: 1000 });

      assert.equal(env.success, true);
      assert.equal(env._inboundPruned, true);
      assert.ok(env.data.logOutput.length < 1100);
      assert.ok(env.data.logOutput.includes('[Inbound Pruned: original 20000 chars]'));
      assert.equal(env.data.normalField, 'ok');
    });

    it('ToolRegistry Gate 1 should block path traversal (..) and outside-root paths', async () => {
      const registry = new ToolRegistry({ mcpHub: null });
      registry.register({
        name: 'read_local_asset',
        handler: async ({ filePath }) => ({ read: filePath })
      });

      const traversalRes = await registry.execute('read_local_asset', {
        filePath: 'D:/projects/demo/../../Windows/System32/cmd.exe'
      });
      assert.equal(traversalRes.success, false);
      assert.equal(traversalRes.error.code, 'PATH_SECURITY_VIOLATION');

      const outOfRootRes = await registry.execute(
        'read_local_asset',
        { filePath: 'D:/OtherSecretFolder/secret.txt' },
        { allowedRoots: ['D:/AllowedWorkspace'] }
      );
      assert.equal(outOfRootRes.success, false);
      assert.equal(outOfRootRes.error.code, 'PATH_SECURITY_VIOLATION');

      const validRes = await registry.execute(
        'read_local_asset',
        { filePath: 'D:/AllowedWorkspace/media/clip.mp4' },
        { allowedRoots: ['D:/AllowedWorkspace'] }
      );
      assert.equal(validRes.success, true);
    });

    it('inspect_system_capabilities should support on-demand Tier-3 tool schema hydration via toolNames', async () => {
      const res = await callTool('inspect_system_capabilities', {
        toolNames: ['dispatch_agent']
      });
      assert.equal(res.success, true);
      assert.ok(Array.isArray(res.data.hydratedToolSchemas));
      assert.equal(res.data.hydratedToolSchemas.length, 1);
      assert.equal(res.data.hydratedToolSchemas[0].function.name, 'dispatch_agent');
    });
  });
});
