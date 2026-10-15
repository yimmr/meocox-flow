import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../src/engine/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

async function testFacade() {
  console.log('🚪 开始测试 AgentEngine 统一对外门面入口...\n');

  // 1. 初始化引擎
  const engine = await createEngine({
    rootDir: ROOT_DIR,
    modelConfig: {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '', // 留空测试未配置 Key 时的优雅降级
      model: 'gpt-4o'
    }
  });

  console.log('✅ 引擎初始化成功！');

  // 2. 测试一键能力盘点
  const capabilities = engine.getCapabilities();
  console.log('\n📊 [1. 能力感知接口 getCapabilities()]:');
  console.log(`- 发现智能体: ${capabilities.agents.length} 个 (${capabilities.agents.map(a => a.name).join(', ')})`);
  console.log(`- 发现技能库: ${capabilities.skills.length} 个`);
  console.log(`- 发现可用工具: ${capabilities.tools.length} 个 (${capabilities.tools.map(t => t.name).join(', ')})`);

  // 3. 测试通用工具调用入口
  console.log('\n🔧 [2. 通用工具调用接口 callTool("system_info")]:');
  const toolResult = await engine.callTool('system_info', { detailLevel: 'full' });
  console.log('执行结果 Envelope:', JSON.stringify(toolResult, null, 2));

  // 4. 测试通用技能执行入口
  console.log('\n📖 [3. 通用技能调用接口 runSkill("beat-sync")]:');
  const skillResult = await engine.runSkill('beat-sync', {});
  console.log('执行结果 Envelope:', JSON.stringify(skillResult, null, 2));

  // 5. 测试智能体对话/任务接口
  console.log('\n🤖 [4. 统一智能体任务调度接口 chat()]:');
  const chatResult = await engine.chat({
    agentId: 'director',
    messages: [
      { role: 'user', content: '请帮我检查当前宿主环境' }
    ],
    onStep: (stepInfo) => {
      console.log(`  [Step ${stepInfo.step}] 调度了工具 ${stepInfo.tool}:`, stepInfo.result.summary);
    }
  });
  console.log('最终产出 Envelope:', JSON.stringify(chatResult, null, 2));

  if (toolResult.success && skillResult.success && chatResult.success) {
    console.log('\n🎉🎉🎉 [SUCCESS] 统一对外门面 (AgentEngine Facade) 验证全部通过！');
  } else {
    console.error('\n❌ [FAIL] 结果不符合预期');
    process.exit(1);
  }
}

testFacade().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
