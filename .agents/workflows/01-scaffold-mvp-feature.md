# 工作流 01：契约先行（Contract-First）开发 AIGC 新业务模块

当在 Antigravity 中新增任何一项 AIGC 业务功能（如“分镜剧本拆解”、“多轨节拍对齐”或“变体竞技场对决”）时，严格按以下 5 步确定性工作流推进：

## Step 1: 规格对齐与架构红线预检
- 参考 `docs/specs/00_feature_spec_template.md` 模板编写轻量特性规格书（明确黑板 Struct、IPC 命令、Capabilities 权限与 GenUI 形态），保存至 `docs/specs/<feature_name>.md`。
- 按需阅读 `.gemini/skills/tauri-rust-react-stack/SKILL.md` 及对应子系统设计技能包。
- 明确该功能属于**确定性工作流（Workflow）**还是**动态智能体环路（Agent Loop）**，确认输入输出均使用 `AssetId`（UUIDv7）句柄。

## Step 2: 定义 Rust 强类型契约与黑板状态（Contract-First）
- 在 `src-tauri/src/` 对应模块下定义输入参数、黑板状态切片与流式事件结构体，统一标注 `#[derive(Serialize, Deserialize, specta::Type)]`。
- 定义 `#[tauri::command]` 与 `#[specta::specta]` 接口签名，导出前端 TypeScript 绑定至 `src/bindings/`。

## Step 3: 实现 Rust 守护核心逻辑与影子预检
- 在 `src-tauri/` 中实现后台处理逻辑：
  - 若涉及高成本外部 API 生成，前置接入 `Quota Guardian` 预算预估与 `interrupt` 挂起检查点。
  - 若涉及状态变更，同步写入单项目 SQLite（WAL）时间轴快照。
- 运行 `cargo check --manifest-path src-tauri/Cargo.toml` 与单元测试，确保后端零警告编译通过。

## Step 4: 实现 React 双栏画布与交互组件
- 在 `src/` 下使用自动生成的 TS 契约绑定调用 Tauri Command 或订阅 `Channel<T>` 流。
- 使用 `shadcn/ui` + Tailwind CSS 实现前端交互视图，媒体预览统一通过 `convertFileSrc` 走 `asset://` 协议。
- 运行 `pnpm tsc --noEmit` 确保前端类型完全对齐。

## Step 5: 红线静态扫描与双重独立子智能体挑刺审查（Gate Merger）
- 首先运行秒级静态红线检查：`python scripts/arch_guard.py`（或 `node scripts/arch_guard.mjs`），拦截阻塞 I/O、裸 unwrap、any 类型与 Base64 泄露。
- 依次唤醒 `architecture-auditor`（审查六层架构与反模式合规性）与 `rust-tauri-falser`（刺探并发死锁与跨平台隐患），全绿通过后更新 `ARCHITECTURE_STATE.md` 方可合并交付。
