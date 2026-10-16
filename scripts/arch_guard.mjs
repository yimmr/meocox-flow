#!/usr/bin/env node
/**
 * Antigravity AIGC Architecture Red-Line Static Guard (arch_guard.mjs)
 * Node.js 原生版：秒级扫描 src-tauri/ 与 src/ 源码，拦截违反 AGENTS.md 架构红线的反模式代码。
 * 旧项目重构专防：严防旧代码中的同步 I/O、裸 unwrap、any、Base64 与随机 UUID 渗透进新模块。
 */
import fs from 'node:fs';
import path from 'node:path';

const RED_LINES_RUST = [
  [/\bstd::fs::/, '[红线违规 - 阻塞 I/O] Rust 异步上下文中严禁使用同步阻塞的 `std::fs`，请改用 `tokio::fs`。'],
  [/\bstd::thread::sleep\b/, '[红线违规 - 阻塞线程] 严禁使用 `std::thread::sleep` 阻塞 Tokio 线程，请改用 `tokio::time::sleep`。'],
  [/\.unwrap\(\)/, '[代码质量警告 - Panic 风险] 生产环境 Rust 代码禁止裸调 `.unwrap()`，请使用 `?` 操作符配合 `thiserror` 传递错误。'],
  [/data:image\/[a-zA-Z]+;base64/, '[红线违规 - Handle-Only 铁律] 严禁在后端拼接或传递 Base64 图像字符串，请落盘至 media/ 并传递 UUIDv7 句柄。'],
  [/Uuid::new_v4\(\)/, '[红线违规 - 时序主键铁律] 严禁使用随机的 `Uuid::new_v4()`，全系统主键必须使用单调递增的 `Uuid::now_v7()`。'],
];

const RED_LINES_TS = [
  [/:\s*any\b/, '[红线违规 - 强类型契约] 前端 TypeScript 严禁使用裸 `any` 类型，请从 `@/bindings` 导入 Rust 生成的强类型。'],
  [/data:(image|audio|video)\/[a-zA-Z0-9+.-]+;base64/, '[红线违规 - 零拷贝预览铁律] 前端严禁使用 Base64 DataURL 渲染多媒体，请使用 Tauri `convertFileSrc()` 走 `asset://` 协议。'],
  [/\b(h-screen|min-h-screen|100vh)\b/, '[注意 - GenUI 高度预算] 请确认该全屏样式仅用于主画布容器；对话流内嵌 GenUI 卡片高度严禁超过 500px。'],
];

function scanFile(filepath, rules) {
  const issues = [];
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const stripped = line.trim();
      if (stripped.startsWith('//') || stripped.startsWith('/*') || stripped.startsWith('*')) {
        return;
      }
      for (const [pattern, msg] of rules) {
        if (pattern.test(line)) {
          issues.push(`  ${filepath}:${idx + 1} -> ${msg}\n      代码片段: {stripped}`);
        }
      }
    });
  } catch (err) {
    // ignore unreadable files
  }
  return issues;
}

function walkDir(dir, filterFn, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, filterFn, fileList);
    } else if (filterFn(entry.name)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function main() {
  const root = process.cwd();
  const allIssues = [];

  const rustDir = path.join(root, 'src-tauri', 'src');
  if (fs.existsSync(rustDir)) {
    const rustFiles = walkDir(rustDir, fn => fn.endsWith('.rs') && !fn.endsWith('_test.rs'));
    for (const f of rustFiles) {
      allIssues.push(...scanFile(f, RED_LINES_RUST));
    }
  }

  const tsDir = path.join(root, 'src');
  if (fs.existsSync(tsDir)) {
    const tsFiles = walkDir(tsDir, fn => (fn.endsWith('.ts') || fn.endsWith('.tsx')) && fn !== 'bindings.ts')
      .filter(f => !f.includes(path.sep + 'bindings' + path.sep));
    for (const f of tsFiles) {
      allIssues.push(...scanFile(f, RED_LINES_TS));
    }
  }

  if (allIssues.length > 0) {
    console.log('=== [Arch Guard] 检测到以下架构红线或代码规范预警 ===');
    for (const iss of allIssues) {
      console.log(iss);
    }
    process.exit(1);
  } else {
    console.log('=== [Arch Guard] 架构红线静态扫描通过 (0 违规) ===');
    process.exit(0);
  }
}

main();
