#!/usr/bin/env python3
"""
Antigravity AIGC Architecture Red-Line Static Guard (arch_guard.py)
秒级扫描 src-tauri/ 与 src/ 源码，拦截违反 AGENTS.md 架构红线的反模式代码。
旧项目重构专防：严防旧代码中的同步 I/O、裸 unwrap、any、Base64 与随机 UUID 渗透进新模块。
"""
import os
import re
import sys

RED_LINES_RUST = [
    (r"\bstd::fs::", "[红线违规 - 阻塞 I/O] Rust 异步上下文中严禁使用同步阻塞的 `std::fs`，请改用 `tokio::fs`。"),
    (r"\bstd::thread::sleep\b", "[红线违规 - 阻塞线程] 严禁使用 `std::thread::sleep` 阻塞 Tokio 线程，请改用 `tokio::time::sleep`。"),
    (r"\.unwrap\(\)", "[代码质量警告 - Panic 风险] 生产环境 Rust 代码禁止裸调 `.unwrap()`，请使用 `?` 操作符配合 `thiserror` 传递错误。"),
    (r"data:image/[a-zA-Z]+;base64", "[红线违规 - Handle-Only 铁律] 严禁在后端拼接或传递 Base64 图像字符串，请落盘至 media/ 并传递 UUIDv7 句柄。"),
    (r"Uuid::new_v4\(\)", "[红线违规 - 时序主键铁律] 严禁使用随机的 `Uuid::new_v4()`，全系统主键必须使用单调递增的 `Uuid::now_v7()`。"),
]

RED_LINES_TS = [
    (r":\s*any\b", "[红线违规 - 强类型契约] 前端 TypeScript 严禁使用裸 `any` 类型，请从 `@/bindings` 导入 Rust 生成的强类型。"),
    (r"data:(image|audio|video)/[a-zA-Z0-9+.-]+;base64", "[红线违规 - 零拷贝预览铁律] 前端严禁使用 Base64 DataURL 渲染多媒体，请使用 Tauri `convertFileSrc()` 走 `asset://` 协议。"),
    (r"\b(h-screen|min-h-screen|100vh)\b", "[注意 - GenUI 高度预算] 请确认该全屏样式仅用于主画布容器；对话流内嵌 GenUI 卡片高度严禁超过 500px。"),
]

def scan_file(filepath, rules):
    issues = []
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()
        for idx, line in enumerate(lines, start=1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
                continue
            for pattern, msg in rules:
                if re.search(pattern, line):
                    issues.append(f"  {filepath}:{idx} -> {msg}\n      代码片段: {stripped}")
    except Exception:
        pass
    return issues

def main():
    root = os.getcwd()
    all_issues = []

    rust_dir = os.path.join(root, "src-tauri", "src")
    if os.path.exists(rust_dir):
        for dirpath, _, filenames in os.walk(rust_dir):
            for fn in filenames:
                if fn.endswith(".rs") and not fn.endswith("_test.rs"):
                    all_issues.extend(scan_file(os.path.join(dirpath, fn), RED_LINES_RUST))

    ts_dir = os.path.join(root, "src")
    if os.path.exists(ts_dir):
        for dirpath, _, filenames in os.walk(ts_dir):
            if f"{os.sep}bindings" in dirpath:
                continue
            for fn in filenames:
                if fn.endswith((".ts", ".tsx")) and fn != "bindings.ts":
                    all_issues.extend(scan_file(os.path.join(dirpath, fn), RED_LINES_TS))

    if all_issues:
        print("=== [Arch Guard] 检测到以下架构红线或代码规范预警 ===")
        for iss in all_issues:
            print(iss)
        sys.exit(1)
    else:
        print("=== [Arch Guard] 架构红线静态扫描通过 (0 违规) ===")
        sys.exit(0)

if __name__ == "__main__":
    main()
