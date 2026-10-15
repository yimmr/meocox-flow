/**
 * 运行单元测试 / 集成测试。
 * 自动将 MEOCOX_PROJECTS_ROOT 隔离到操作系统临时目录，
 * 彻底防止测试生成的临时项目写入用户的真实工作区目录（%USERPROFILE%\\Videos\\Meocox Flow）。
 * 测试结束后自动清理临时目录。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testsDir = path.join(__dirname, '..', 'tests');

const files = [];
for await (const f of glob('**/*.test.js', { cwd: testsDir })) {
  files.push(path.join(testsDir, f));
}

if (files.length === 0) {
  console.error('未找到任何测试文件');
  process.exit(1);
}

const tmpProjectsRoot = path.join(os.tmpdir(), `meocoxflow_test_projects_${Date.now()}`);
await fs.mkdir(tmpProjectsRoot, { recursive: true });

const child = spawn(process.execPath, ['--test', ...files], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: {
    ...process.env,
    MEOCOX_PROJECTS_ROOT: tmpProjectsRoot
  }
});

child.on('exit', async (code) => {
  await fs.rm(tmpProjectsRoot, { recursive: true, force: true }).catch(() => {});
  process.exit(code ?? 1);
});
