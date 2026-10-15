import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolRegistry } from '../src/engine/tool/registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_TOOLS_DIR = path.resolve(__dirname, '../../tools');

async function test() {
  console.log('🧪 开始测试 Engine 基础工具底座...');
  console.log('📂 扫描工具目录:', ROOT_TOOLS_DIR);

  const registry = new ToolRegistry({ toolsDir: ROOT_TOOLS_DIR });
  const loaded = await registry.loadFromDirectory();

  console.log('✅ 成功加载工具列表:', loaded);

  // 1. 测试模型导出规范 (Function Calling Schemas)
  const schemas = registry.getSchemas();
  console.log('\n📋 导出的大模型 Function Calling Schema:');
  console.log(JSON.stringify(schemas, null, 2));

  // 2. 测试正常执行并返回标准 Envelope
  console.log('\n🚀 测试执行 system_info (参数 detailLevel: full):');
  const resSuccess = await registry.execute('system_info', { detailLevel: 'full' });
  console.log('📦 统一输出封套 (Envelope):');
  console.log(JSON.stringify(resSuccess, null, 2));

  // 3. 测试错误隔离 (调用不存在的工具)
  console.log('\n⚠️ 测试调用未知工具:');
  const resNotFound = await registry.execute('non_existent_tool', {});
  console.log('📦 错误隔离封套 (Envelope):');
  console.log(JSON.stringify(resNotFound, null, 2));

  if (resSuccess.success === true && resNotFound.success === false) {
    console.log('\n🎉 [PASS] 工具底座基础骨架验证通过！');
  } else {
    console.error('\n❌ [FAIL] 结果不符合预期');
    process.exit(1);
  }
}

test().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
