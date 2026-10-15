import { resolveModelConfig } from '../src/engine/model/resolver.js';

async function testSmartGateway() {
  console.log('🌐 开始测试 [确定性模型网关: Provider 拓扑寻址与透明分流]...\n');

  // ─────────────────────────────────────────────────────────────
  // 1. 测试应用内置本地模型的识别
  // ─────────────────────────────────────────────────────────────
  console.log('📌 [测试 1] 识别应用内置模型 (直接传模型名 "qwen3-vl-4b"，不加任何 installed: 前缀):');
  const installedMeta = await resolveModelConfig('qwen3-vl-4b');
  console.log('解析结果:');
  console.log(`- 目标模型: ${installedMeta.model}`);
  console.log(`- 决策类型 (type): ${installedMeta.type} (In-App 本地引擎)`);
  console.log(`- 归属厂商 (provider): ${installedMeta.providerName}`);

  if (installedMeta.type === 'installed') {
    console.log('✅ 测试 1 通过！传入纯净名 "qwen3-vl-4b"，底座自动通过 providers.json 识别为内置模型。\n');
  } else {
    console.error('❌ 测试 1 失败！未识别为 installed');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. 测试配置的 API 模型 (gemini-3.8-flash-high)
  // ─────────────────────────────────────────────────────────────
  console.log('📌 [测试 2] 识别主力 API 模型 (gemini-3.8-flash-high):');
  const geminiMeta = await resolveModelConfig('gemini-3.8-flash-high');
  console.log('解析结果:');
  console.log(`- 目标模型: ${geminiMeta.model}`);
  console.log(`- 决策类型 (type): ${geminiMeta.type} (HTTP API 端点)`);
  console.log(`- 归属厂商 (provider): ${geminiMeta.providerName}`);
  console.log(`- Base URL: ${geminiMeta.baseUrl}`);

  if (geminiMeta.type === 'api' && geminiMeta.providerId === 'prov_yimmr') {
    console.log('✅ 测试 2 通过！成功确定性解析到 API 提供商链路。\n');
  } else {
    console.error('❌ 测试 2 失败！未正确识别 API 属性');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────
  // 3. 测试其他 Provider 的 API 模型 (deepseek-v4.1-flash:free)
  // ─────────────────────────────────────────────────────────────
  console.log('📌 [测试 3] 识别其他提供商 API 模型 (deepseek-v4.1-flash:free):');
  const deepseekMeta = await resolveModelConfig('deepseek-v4.1-flash:free');
  console.log('解析结果:');
  console.log(`- 目标模型: ${deepseekMeta.model}`);
  console.log(`- 决策类型 (type): ${deepseekMeta.type}`);
  console.log(`- 归属厂商 (provider): ${deepseekMeta.providerName}`);

  if (deepseekMeta.type === 'api' && deepseekMeta.providerId === 'prov_harbor') {
    console.log('✅ 测试 3 通过！成功跨 Provider 拓扑定位模型归属。\n');
  } else {
    console.error('❌ 测试 3 失败！未正确跨 Provider 定位');
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. 测试显式 Provider 前缀精准寻址语法 (prov_harbor/...)
  // ─────────────────────────────────────────────────────────────
  console.log('📌 [测试 4] 测试显式 Provider 强锁定语法 (prov_harbor/deepseek-v4.1-flash:free):');
  const explicitMeta = await resolveModelConfig('prov_harbor/deepseek-v4.1-flash:free');
  console.log(`- 锁定 Provider: ${explicitMeta.providerId} (${explicitMeta.providerName})`);

  if (explicitMeta.providerId === 'prov_harbor') {
    console.log('✅ 测试 4 通过！显式前缀锁定准确无误。\n');
  } else {
    console.error('❌ 测试 4 失败！未正确按显式前缀锁定');
    process.exit(1);
  }

  console.log('🎉🎉🎉 [SUCCESS] 确定性模型网关：拓扑寻址与透明分流全部验证通过！');
}

testSmartGateway().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
