import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { defaultAgentSystem } from '../src/runtime/agentLoader.js';
import { defaultMCPHub } from '../src/runtime/mcpHub.js';
import { registerLocalVideoTools } from '../src/runtime/registerLocalTools.js';
import { storage } from '../src/storage/index.js';

test('Super Brain to Code Motion Engineer E2E Delegation Suite', async (t) => {
  await defaultAgentSystem.loadFromDisk();
  registerLocalVideoTools(defaultMCPHub);

  const testProjectId = `test_motion_delegation_${Date.now()}`;
  await storage.saveProject({
    id: testProjectId,
    title: 'Redis 高性能架构代码动效解说',
    category: '技术'
  });

  t.after(async () => {
    await storage.deleteProject(testProjectId).catch(() => {});
  });

  await t.test('1. code-motion-engineer 角色及其核心动效工具配置核验', async () => {
    const engineer = defaultAgentSystem.getAgent('code-motion-engineer');
    assert.ok(engineer, 'code-motion-engineer 智能体必须已注册');
    assert.equal(engineer.name, 'Code Motion Engineer');

    // 核验必须挂载的工具
    assert.ok(engineer.tools.includes('synthesize_motion_scenes'), '必须包含 synthesize_motion_scenes');
    assert.ok(engineer.tools.includes('get_motion_components_catalog'), '必须包含 get_motion_components_catalog');
    assert.ok(engineer.tools.includes('render_video_mp4'), '必须包含 render_video_mp4');

    // 编译提示词核验
    const prompt = defaultAgentSystem.buildAgentPrompt('code-motion-engineer', {
      project: { id: testProjectId, title: 'Redis 架构' },
      storyboard: []
    });
    assert.ok(prompt.includes('确定性代码动效架构师'), '提示词应包含角色核心定位');
  });

  await t.test('2. dispatch_agent 应能将动效任务委派至 code-motion-engineer 并立项', async () => {
    const dispatchResult = await defaultMCPHub.callTool(
      'dispatch_agent',
      {
        targetAgentId: 'code-motion-engineer',
        mandate: '依据 Redis 架构设计 3 幕动效场景：包含客户端请求、内存缓存命中拓扑与持久化终端命令。',
        contextRefs: { projectId: testProjectId }
      },
      { projectId: testProjectId }
    );

    assert.ok(dispatchResult.success, '派发必须成功');
    assert.equal(dispatchResult.delegatedTo, 'code-motion-engineer');
    assert.ok(dispatchResult.allowedTools.includes('synthesize_motion_scenes'));

    // 验证目标分轨中是否已写入委派工单消息
    const messages = await storage.getMessages(testProjectId, 'code-motion-engineer');
    assert.ok(messages.length > 0, '目标分轨应包含消息');
    const briefMsg = messages.find((m) => m.content?.includes('超级主脑委派任务书'));
    assert.ok(briefMsg, '目标分轨应包含超级主脑委派任务书');
  });

  await t.test('3. code-motion-engineer 调用 synthesize_motion_scenes 装配真实架构动效场景', async () => {
    const sampleStoryboard = [
      {
        order: 1,
        title: 'Redis 极速内存架构',
        scriptText: '客户端请求直达内存字典，单线程事件循环实现微秒级极速响应。',
        durationSec: 4.0,
        componentType: 'ArchitectureFlow',
        props: {
          title: 'Redis Memory Architecture',
          nodes: [
            { id: 'client', label: 'Client App', x: 15, y: 50, color: 'emerald' },
            { id: 'redis', label: 'Redis In-Memory Key-Value', x: 50, y: 50, color: 'rose' },
            { id: 'db', label: 'Primary DB', x: 85, y: 50, color: 'blue' }
          ],
          connections: [
            { from: 'client', to: 'redis', label: 'Cache Hit (0.2ms)', active: true },
            { from: 'redis', to: 'db', label: 'Async Sync', active: false }
          ]
        }
      },
      {
        order: 2,
        title: '终端实测压测命令',
        scriptText: '执行 redis-benchmark，每秒处理突破十万次操作。',
        durationSec: 3.5,
        componentType: 'TechTerminal',
        props: {
          title: 'redis-benchmark -q -n 100000',
          command: 'redis-benchmark -t set,get -q -n 100000',
          codeLines: [
            'SET: 125000.00 requests per second, p50=0.231 msec',
            'GET: 132000.00 requests per second, p50=0.198 msec',
            'Summary: 100,000 requests finished in 0.78 seconds'
          ],
          highlightLine: 1
        }
      }
    ];

    const synthesisResult = await defaultMCPHub.callTool(
      'synthesize_motion_scenes',
      { storyboard: sampleStoryboard, fps: 30, width: 1920, height: 1080 },
      { projectId: testProjectId, threadId: 'code-motion-engineer' }
    );

    assert.ok(synthesisResult.success);
    assert.ok(synthesisResult.artifacts);
    assert.equal(synthesisResult.artifacts[0].type, 'motion_manifest');

    const manifest = synthesisResult.artifacts[0].data;
    assert.equal(manifest.scenes.length, 2);
    assert.equal(manifest.scenes[0].componentType, 'ArchitectureFlow');
    assert.equal(manifest.scenes[1].componentType, 'TechTerminal');
    assert.equal(manifest.fps, 30);
  });
});
