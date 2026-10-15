/**
 * 把 server 打包成 Windows 单文件可执行程序（Node SEA）。
 *
 * 产物: src-tauri/binaries/meocox-backend-<target-triple>[.exe]
 * 运行时资源: src-tauri/resources/  (agents / skills / config / assets / server/utils)
 *
 * 打包后 Rust 侧需注入 MEOCOX_APP_ROOT=<resources 目录>，
 * 否则 config.js 无法定位 agents/skills（SEA 里 __dirname 不可靠）。
 *
 * 用法: node scripts/build-sea.mjs
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SERVER_DIR, '..');
const TAURI_DIR = path.join(REPO_ROOT, 'src-tauri');
const BIN_DIR = path.join(TAURI_DIR, 'binaries');
const RES_DIR = path.join(TAURI_DIR, 'resources');
const BUILD_DIR = path.join(SERVER_DIR, '.sea-build');

/** 与本机 Rust target 保持一致（Tauri externalBin 要求带 target triple） */
function detectTargetTriple() {
  try {
    const out = execFileSync('rustc', ['-vV'], { encoding: 'utf-8' });
    const host = out.match(/host:\s*(\S+)/)?.[1];
    if (host) return host;
  } catch {
    /* rustc 不可用时回退到常见默认值 */
  }
  return process.platform === 'win32' ? 'x86_64-pc-windows-msvc' : `${process.arch}-unknown-linux-gnu`;
}

const TARGET = detectTargetTriple();
const IS_WIN = TARGET.includes('windows');
const BIN_NAME = `meocox-backend-${TARGET}${IS_WIN ? '.exe' : ''}`;
const OUT_EXE = path.join(BIN_DIR, BIN_NAME);

function log(msg) {
  console.log(`[sea] ${msg}`);
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

/** 复制目录（递归，跳过 node_modules / dist 等重内容） */
async function copyDir(src, dest, filter = () => true) {
  if (!fs.existsSync(src)) {
    log(`跳过（不存在）: ${path.relative(REPO_ROOT, src)}`);
    return false;
  }
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (!filter(e.name, e)) continue;
    if (e.isDirectory()) await copyDir(s, d, filter);
    else if (e.isFile()) await fsp.copyFile(s, d);
  }
  return true;
}

async function main() {
  const started = Date.now();
  log(`target triple = ${TARGET}`);

  // ── 0. 清理 ────────────────────────────────────────────────
  rmrf(BUILD_DIR);
  rmrf(RES_DIR);
  await fsp.mkdir(BUILD_DIR, { recursive: true });
  await fsp.mkdir(BIN_DIR, { recursive: true });

  // ── 0.5 拷贝运行时资源（后端启动时会读取这些目录）────────────
  log('0/5 拷贝运行时资源 -> src-tauri/resources');
  const resourceMap = [
    ['agents', 'agents'],
    ['skills', 'skills'],
    ['config', 'config'],
    ['assets', 'assets']
  ];
  for (const [src, dest] of resourceMap) {
    const ok = await copyDir(path.join(REPO_ROOT, src), path.join(RES_DIR, dest));
    if (ok) log(`   ✓ ${src}/`);
  }
  // pickFolder.ps1：设置页的文件夹选择弹窗
  // 注意：实际位置是 server/src/utils/（且未被 git 跟踪，属历史遗留）
  const utilsSrc = path.join(SERVER_DIR, 'src', 'utils');
  const utilsDest = path.join(RES_DIR, 'server', 'utils');
  await fsp.mkdir(utilsDest, { recursive: true });
  if (fs.existsSync(path.join(utilsSrc, 'pickFolder.ps1'))) {
    await fsp.copyFile(path.join(utilsSrc, 'pickFolder.ps1'), path.join(utilsDest, 'pickFolder.ps1'));
    log('   ✓ server/utils/pickFolder.ps1');
  } else {
    log('   · pickFolder.ps1 未找到（设置页目录选择将不可用）');
  }
  if (fs.existsSync(path.join(utilsSrc, 'folderPicker.exe'))) {
    await fsp.copyFile(path.join(utilsSrc, 'folderPicker.exe'), path.join(utilsDest, 'folderPicker.exe'));
    log('   ✓ server/utils/folderPicker.exe');
  }
  // bin/llama（若本机已下载）
  const llamaSrc = path.join(REPO_ROOT, 'bin', 'llama');
  if (fs.existsSync(llamaSrc)) {
    await copyDir(llamaSrc, path.join(RES_DIR, 'bin', 'llama'));
    log('   ✓ bin/llama/');
  } else {
    log('   · bin/llama/ 未找到（本地推理不可用，属正常）');
  }

  // ── 1. esbuild: ESM 源码 → 单文件 CJS ───────────────────────
  // SEA 对 ESM 入口支持不稳，强制转 CJS 并把依赖全部内联
  log('1/5 esbuild 打包 (ESM → CJS, deps inlined)');
  const bundledJs = path.join(BUILD_DIR, 'bundle.cjs');
  await build({
    entryPoints: [path.join(SERVER_DIR, 'src', 'index.js')],
    outfile: bundledJs,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    minify: false,           // 保留可读栈，便于排障
    sourcemap: false,
    logLevel: 'info',
    // SEA 里没有 require 运行时，这些全部内联
    external: [],
    banner: {
      // 某些 CJS 依赖会探测 import.meta，在 CJS 下会语法报错
      js: "var import_meta_url = require('url').pathToFileURL(__filename).href;" +
          "var import_meta = { url: import_meta_url };"
    }
  });
  log(`   bundle: ${(fs.statSync(bundledJs).size / 1024 / 1024).toFixed(1)} MB`);

  // ── 2. 生成 sea-config.json ────────────────────────────────
  log('2/5 生成 sea-config.json');
  const seaConfigPath = path.join(BUILD_DIR, 'sea-config.json');
  await fsp.writeFile(
    seaConfigPath,
    JSON.stringify(
      {
        main: bundledJs,
        output: path.join(BUILD_DIR, 'sea-prep.blob'),
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: true
      },
      null,
      2
    ),
    'utf-8'
  );

  // ── 3. 生成 blob ──────────────────────────────────────────
  log('3/5 生成 SEA blob');
  execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], {
    stdio: 'inherit'
  });
  const blobPath = path.join(BUILD_DIR, 'sea-prep.blob');
  if (!fs.existsSync(blobPath)) throw new Error('SEA blob 未生成');
  log(`   blob: ${(fs.statSync(blobPath).size / 1024 / 1024).toFixed(1)} MB`);

  // ── 4. postject 注入 ──────────────────────────────────────
  log('4/5 postject 注入 blob → 可执行文件');
  const nodeExe = process.execPath;               // 当前 node.exe
  const sentinel = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

  // 先复制一份 node.exe 作为基底
  fs.copyFileSync(nodeExe, OUT_EXE);

  // 找 postject CLI
  const postjectBin = path.join(SERVER_DIR, 'node_modules', '.bin', IS_WIN ? 'postject.cmd' : 'postject');
  if (!fs.existsSync(postjectBin)) {
    throw new Error(`找不到 postject: ${postjectBin}`);
  }
  execFileSync(postjectBin, [
    OUT_EXE,
    'NODE_SEA_BLOB',
    blobPath,
    '--sentinel-fuse',
    sentinel
  ], { stdio: 'inherit', shell: IS_WIN });

  // 清理临时目录（保留 binary）
  rmrf(BUILD_DIR);

  const finalSize = fs.statSync(OUT_EXE).size;
  log(`✅ 完成: ${path.relative(REPO_ROOT, OUT_EXE)}  ${(finalSize / 1024 / 1024).toFixed(1)} MB`);
  log(`   用时 ${((Date.now() - started) / 1000).toFixed(1)}s`);
  log('');
  log(`⚠️  运行时必须设置 MEOCOX_APP_ROOT=src-tauri\\resources`);
  log(`   例: $env:MEOCOX_APP_ROOT="${RES_DIR}"`);
}

main().catch((err) => {
  console.error('[sea] ❌ 构建失败:', err);
  process.exit(1);
});
