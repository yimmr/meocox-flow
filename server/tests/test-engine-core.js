import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolRegistry } from '../src/engine/tool/registry.js';
import { SkillLoader } from '../src/engine/skill/loader.js';
import { AgentLoader } from '../src/engine/agent/loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');

async function testCoreTriad() {
  console.log('🏛️ 开始测试 Engine 三位一体底座 (Tools + Skills + Agents)...\n');

  // 1. 初始化并加载工具库
  const toolRegistry = new ToolRegistry({ toolsDir: path.join(ROOT_DIR, 'tools') });
  const loadedTools = await toolRegistry.loadFromDirectory();
  console.log(`🔧 [1/3 Tools] 已加载工具 (${loadedTools.length} 个):`, loadedTools);

  // 2. 初始化并加载技能库
  const skillLoader = new SkillLoader({ skillsDir: path.join(ROOT_DIR, 'skills') });
  const loadedSkills = await skillLoader.loadFromDirectory();
  console.log(`📖 [2/3 Skills] 已加载技能 (${loadedSkills.length} 个):`, loadedSkills);
  console.log('   精炼技能摘要 (供模型感知):', skillLoader.getManifests().slice(0, 2));

  // 3. 初始化并加载智能体库
  const agentLoader = new AgentLoader({
    agentsDir: path.join(ROOT_DIR, 'agents'),
    skillLoader,
    toolRegistry
  });
  const loadedAgents = await agentLoader.loadFromDirectory();
  console.log(`🤖 [3/3 Agents] 已加载智能体 (${loadedAgents.length} 个):`, loadedAgents);

  // 4. 验证装配：以 director 为例检查组装后的 Prompt 与授权工具
  console.log('\n🔍 [验证智能体动态装配: director]');
  const systemPrompt = agentLoader.buildSystemPrompt('director');
  const toolSchemas = agentLoader.getAuthorizedToolSchemas('director');

  console.log('--- 动态生成的 System Prompt 片段 (前 300 字符) ---');
  console.log(systemPrompt.slice(0, 300) + '...\n');

  console.log('--- 授权给该智能体的工具 Schemas 数量 ---');
  console.log(`共授权可用工具数: ${toolSchemas.length}`);

  // 5. 验证工具统一 Envelope 调用
  const execResult = await toolRegistry.execute('system_info', { detailLevel: 'basic' });
  console.log('\n📦 [验证工具统一 Envelope 输出]:');
  console.log(JSON.stringify(execResult, null, 2));

  if (loadedTools.length > 0 && loadedSkills.length > 0 && loadedAgents.length > 0 && execResult.success) {
    console.log('\n🎉🎉🎉 [SUCCESS] 三位一体通用底层骨架联调全部通过！');
  } else {
    console.error('\n❌ [FAIL] 校验失败');
    process.exit(1);
  }
}

testCoreTriad().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
