import { callModel, callTool, callSkill, runAgent, getCapabilities } from '../src/engine/index.js';

async function testFunctionalEngine() {
  console.log('⚡ 开始测试无类绑定、纯函数直调的 Engine 极简接口...\n');

  // 1. 测试直接调用能力盘点 (零 new，自动初始化)
  const caps = await getCapabilities();
  console.log('📋 [1. getCapabilities()] 已自动感知全量资产:');
  console.log(`- 智能体: ${caps.agents.length} 个`);
  console.log(`- 技能库: ${caps.skills.length} 个`);
  console.log(`- 工具库: ${caps.tools.length} 个 (${caps.tools.map(t => t.name).join(', ')})`);

  // 2. 测试直接调用工具 (只需传工具名和参数)
  console.log('\n🔧 [2. callTool("system_info", params)]:');
  const toolRes = await callTool('system_info', { detailLevel: 'full' });
  console.log('工具执行结果 (标准 Envelope):', JSON.stringify(toolRes, null, 2));

  // 3. 测试直接调用技能 (只需传技能名)
  console.log('\n📖 [3. callSkill("beat-sync")]:');
  const skillRes = await callSkill('beat-sync');
  console.log('技能调用结果 (已剥离 YAML，返回干净提示词):');
  console.log(`- 名称: ${skillRes.data?.name}`);
  console.log(`- SOP 正文片段: ${skillRes.data?.promptGuide?.slice(0, 100)}...`);

  // 4. 测试直接运行智能体 (只需指定谁来干活和任务内容)
  console.log('\n🤖 [4. runAgent("director", { task })]:');
  const agentRes = await runAgent('director', { task: '帮我规划一个短视频方案' });
  console.log('智能体产出 Envelope:');
  console.log(JSON.stringify(agentRes, null, 2));

  // 5. 测试直接调用底层模型 (可随意指定模型、传消息，还可直接挂载工具名称)
  console.log('\n🧠 [5. callModel({ model, messages, tools: ["system_info"] })]:');
  const modelRes = await callModel({
    model: 'gemini-3.8-flash',
    messages: [{ role: 'user', content: '查看系统环境' }],
    tools: ['system_info'] // 外部只传工具名，底座自动找 Schema
  });
  console.log('直接调用模型产出:');
  console.log(JSON.stringify(modelRes, null, 2));

  if (toolRes.success && skillRes.success && agentRes.success && modelRes.success) {
    console.log('\n🎉🎉🎉 [SUCCESS] 纯函数直调底座全面打通！真正实现了零样板代码！');
  } else {
    console.error('\n❌ [FAIL] 校验失败');
    process.exit(1);
  }
}

testFunctionalEngine().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
