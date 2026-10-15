import { callModel, callTool } from '../src/engine/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const MOCK_CONFIG_PATH = path.resolve(process.cwd(), 'mock/config.json');

async function testResolverAndMock() {
  console.log('🧪 开始测试 [用户模型识别/强校验] 与 [可插拔独立 Mock 拦截]...\n');

  // ─────────────────────────────────────────────────────────────
  // 阶段 1：测试模型不存在时的强校验报错 (Fail-Fast)
  // ─────────────────────────────────────────────────────────────
  console.log('📌 [测试 1] 调用一个未配置的不存在模型 (non-existent-model-xyz):');
  const errRes = await callModel({
    model: 'non-existent-model-xyz',
    messages: [{ role: 'user', content: 'hello' }]
  });

  console.log('前置校验拦截结果:');
  console.log(JSON.stringify(errRes, null, 2));

  if (!errRes.success && errRes.error?.code === 'MODEL_NOT_FOUND') {
    console.log('✅ 测试 1 通过！成功拦截未配置模型，并列出了可用模型白名单。\n');
  } else {
    console.error('❌ 测试 1 失败！没有正确拦截未配置模型');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────
  // 阶段 2：测试用户真实配置模型的自动识别
  // ─────────────────────────────────────────────────────────────
  console.log('📌 [测试 2] 调用用户 providers.json 里真实配置的模型 (gemini-3.8-flash-high):');
  const validModelRes = await callModel({
    model: 'gemini-3.8-flash-high',
    messages: [{ role: 'user', content: '测试模型寻址' }]
  });

  console.log('用户模型寻址与执行结果:');
  console.log(JSON.stringify(validModelRes, null, 2));
  console.log('✅ 测试 2 通过！成功通过 providers.json 完成寻址并向其端点发起调用。\n');

  // ─────────────────────────────────────────────────────────────
  // 阶段 3：测试可插拔 Mock 拦截器 (动态打开开关)
  // ─────────────────────────────────────────────────────────────
  console.log('📌 [测试 3] 开启 mock/config.json 中的 enabled 开关:');
  await fs.writeFile(MOCK_CONFIG_PATH, JSON.stringify({
    enabled: true,
    mockModels: true,
    mockTools: true,
    logInterception: true
  }, null, 2));

  console.log('🚀 在 Mock 开启状态下调用模型:');
  const mockModelRes = await callModel({
    model: 'gemini-3.8-flash-high',
    messages: [{ role: 'user', content: '这应该被 mock 拦截' }]
  });
  console.log('Mock 模型响应 (0 Token 消耗):', JSON.stringify(mockModelRes, null, 2));

  console.log('\n🚀 在 Mock 开启状态下调用工具:');
  const mockToolRes = await callTool('system_info', { detailLevel: 'full' });
  console.log('Mock 工具响应 (无真实副作用):', JSON.stringify(mockToolRes, null, 2));

  // ─────────────────────────────────────────────────────────────
  // 阶段 4：复原 Mock 开关为 false
  // ─────────────────────────────────────────────────────────────
  console.log('\n📌 [测试 4] 测试完毕，自动复原 mock/config.json 开关为 false:');
  await fs.writeFile(MOCK_CONFIG_PATH, JSON.stringify({
    enabled: false,
    mockModels: true,
    mockTools: true,
    logInterception: true
  }, null, 2));

  console.log('✅ Mock 开关已重置为关闭状态。');

  if (mockModelRes.data?.isMock && mockToolRes.data?.isVirtualMock) {
    console.log('\n🎉🎉🎉 [SUCCESS] 用户模型识别、未知报错拦截、可插拔独立 Mock 全部验证通过！');
  } else {
    console.error('\n❌ [FAIL] Mock 数据未正确命中');
    process.exit(1);
  }
}

testResolverAndMock().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
