/**
 * 运行需要真实外部 MCP 的测试（会拉起 Chrome 窗口，耗时较长）。
 * 跨平台设置环境变量，避免依赖 cross-env 之类的额外依赖。
 *
 *   npm run test:mcp
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testsDir = path.join(__dirname, 'tests');

const files = (await glob('**/*.test.js', { cwd: testsDir }))
  .map((f) => path.join(testsDir, f));

if (files.length === 0) {
  console.error('未找到任何测试文件');
  process.exit(1);
}

console.log(`🧪 运行含真实 MCP 的测试（${files.length} 个文件，可能拉起浏览器窗口）...\n`);

const child = spawn(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  env: { ...process.env, MEOCOX_RUN_MCP_TESTS: '1' }
});

child.on('exit', (code) => process.exit(code ?? 1));
