import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createProject,
  deleteProject,
  updateProject
} from '../../src/engine/index.js';
import { storage } from '../../src/storage/index.js';
import { triggerAutoMemoryConvergence } from '../../src/services/autoMemoryExtractor.js';
import { config } from '../../src/config.js';

describe('Global Memory Switch & Project Memory Policy Suite', () => {
  let projectId;
  let initialGlobalSettings;

  before(async () => {
    // 备份初始全局设置
    initialGlobalSettings = await storage.getSystemSettings();

    // 创建测试项目
    const projRes = await createProject({
      title: 'MemoryPolicyTestProject',
      category: '游戏攻略'
    });
    projectId = projRes.data.id;

    // 播种项目记忆与全局偏好
    await storage.saveMemory('- 预置项目记忆事实 A', {
      projectId,
      scope: 'project',
      append: false
    });
    await storage.saveMemory('- 预置全局偏好: 60 FPS', {
      scope: 'user',
      append: false
    });
  });

  after(async () => {
    // 恢复全局设置
    if (initialGlobalSettings) {
      await storage.saveSystemSettings(initialGlobalSettings);
    }
    if (projectId) {
      await deleteProject(projectId).catch(() => {});
    }
  });

  it('1. Default state: inherit policy with global memory enabled should yield combined memory', async () => {
    // 确保全局开启
    await storage.saveSystemSettings({ enableMemory: true });

    const mem = await storage.getMemory(projectId);
    assert.ok(mem.projectMemory.includes('预置项目记忆事实 A'));
    assert.ok(mem.userMemory.includes('预置全局偏好: 60 FPS'));
    assert.ok(mem.combinedText.includes('预置项目记忆事实 A'));
    assert.ok(mem.combinedText.includes('预置全局偏好: 60 FPS'));
  });

  it('2. Global memory disabled: should filter out userMemory even if project inherits', async () => {
    const origGet = storage.getSystemSettings;
    storage.getSystemSettings = async () => ({ enableMemory: false });

    try {
      const settings = await storage.getSystemSettings();
      assert.equal(settings.enableMemory, false);

      const mem = await storage.getMemory(projectId);
      // 项目专属记忆依然保留
      assert.ok(mem.projectMemory.includes('预置项目记忆事实 A'));
      // 全局偏好被过滤
      assert.equal(mem.userMemory, '');
      assert.ok(mem.combinedText.includes('预置项目记忆事实 A'));
      assert.ok(!mem.combinedText.includes('预置全局偏好: 60 FPS'));

      // 尝试在全局关闭时沉淀偏好，不应写入全局文件
      await triggerAutoMemoryConvergence({
        projectId,
        threadId: 'th_01',
        prompt: '以后默认使用 120fps，风格为快节奏卡点',
        envelope: { success: true, summary: '执行成功' }
      });

      const userMem = await storage.getMemory();
      assert.ok(!userMem.userMemory.includes('120 FPS'));
    } finally {
      storage.getSystemSettings = origGet;
    }
  });

  it('3. Project policy = project_only: should isolate global user preferences even when global is enabled', async () => {


    // 更新项目策略为 project_only
    await updateProject(projectId, { memoryPolicy: 'project_only' });

    const mem = await storage.getMemory(projectId);
    assert.ok(mem.projectMemory.includes('预置项目记忆事实 A'));
    assert.equal(mem.userMemory, '', 'project_only 必须隔离全局用户偏好');

    // 沉淀新轮次：项目事实应写入，全局偏好不应写回
    const res = await triggerAutoMemoryConvergence({
      projectId,
      threadId: 'th_01',
      prompt: '以后渲染采用 90fps',
      envelope: {
        success: true,
        summary: '分镜已确立',
        data: {
          toolExecutions: [
            {
              tool: 'update_storyboard',
              envelope: { success: true, data: { count: 5 } }
            }
          ]
        }
      }
    });

    assert.equal(res.success, true);
    assert.equal(res.userPreferencesCount, 0, 'project_only 策略下不得写回全局偏好');

    // 检查项目记忆成功沉淀
    const updatedMem = await storage.getMemory(projectId);
    assert.ok(updatedMem.projectMemory.includes('分镜时间轴方案 (共 5 幕)'));
  });

  it('4. Project policy = disabled: should completely suppress memory retrieval and convergence', async () => {
    // 开启全局，但将项目策略设为 disabled
    await storage.saveSystemSettings({ enableMemory: true });
    await updateProject(projectId, { memoryPolicy: 'disabled' });

    const mem = await storage.getMemory(projectId);
    assert.equal(mem.projectMemory, '');
    assert.equal(mem.userMemory, '');
    assert.equal(mem.combinedText, '');

    // 尝试触发沉淀，应被直接跳过
    const res = await triggerAutoMemoryConvergence({
      projectId,
      threadId: 'th_01',
      prompt: '以后渲染采用 60fps',
      envelope: {
        success: true,
        summary: '分镜已确立',
        data: {
          toolExecutions: [
            {
              tool: 'update_storyboard',
              envelope: { success: true, data: { count: 8 } }
            }
          ]
        }
      }
    });

    assert.equal(res.success, true);
    assert.equal(res.updated, false);
    assert.equal(res.reason, 'MEMORY_DISABLED_BY_PROJECT_POLICY');
  });
});
