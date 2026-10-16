# 工作流 00：从零初始化 React + Tauri v2 + Rust 项目底座 (Day-0 Bootstrap)

当你首次在空目录启动 AIGC 智能体项目开发时，严格按照以下 5 步执行冷启动初始化，构建符合“第一阶段 MVP”要求的最小可运行骨架：

## Step 1: 初始化 Tauri v2 + React 19 + TypeScript + Tailwind 脚手架
- 使用 `pnpm` 初始化前端（React 19 + Vite + TypeScript + Tailwind CSS）与 `src-tauri/`（Tauri v2）。
- 安装前端核心依赖：`zustand`、`@xyflow/react`、`yjs`、`lucide-react` 并初始化 `shadcn/ui` 基础配置。

## Step 2: 配置 Rust 核心依赖与六层物理目录 (`src-tauri/Cargo.toml`)
- 在 `src-tauri/Cargo.toml` 中引入核心 Crate：
  - 异步与序列化：`tokio = { version = "1", features = ["full"] }`、`serde = { version = "1", features = ["derive"] }`、`serde_json = "1"`
  - 强类型契约：`specta = { version = "=2.0.0-rc.22", features = ["derive", "uuid"] }`、`tauri-specta = { version = "=2.0.0-rc.21", features = ["derive", "typescript"] }`
  - 时序标识与存储：`uuid = { version = "1", features = ["v7", "serde"] }`、`rusqlite = { version = "0.32", features = ["bundled"] }`
  - 协同与安全：`yrs = "0.21"`、`keyring = "3"`
- 在 `src-tauri/src/` 下创建物理分层目录：`daemon/`、`orchestrator/`、`blackboard/`、`pipeline/`、`sandbox/`、`storage/`。

## Step 3: 落地后台伪守护进程与 SQLite WAL 初始化
- 在 `src-tauri/src/daemon/` 中实现任务活跃状态追踪，并在 `main.rs` / `lib.rs` 中拦截 `RunEvent::ExitRequested`（当后台有任务时阻止进程退出并驻留托盘）。
- 在 `src-tauri/src/storage/` 中初始化单项目 SQLite 数据库（执行 `PRAGMA journal_mode=WAL;`），创建核心资产句柄表 `assets (asset_id TEXT PRIMARY KEY, media_type TEXT, file_path TEXT, summary TEXT, created_at INTEGER)`。

## Step 4: 跑通第一条强类型 IPC 与 `AssetId` 句柄闭环
- 定义 `AssetId`（UUIDv7）结构体与测试命令 `ping_daemon_status`，通过 `tauri-specta` 自动生成 `src/bindings/index.ts`。
- 在前端搭建“左侧控制流 + 右侧多模态画布”双栏基础布局，调用强类型绑定验证前后端通信全绿。

## Step 5: 更新工程进度账本 (`ARCHITECTURE_STATE.md`)
- 运行 `cargo check` 与 `pnpm tsc --noEmit` 确认零报错后，将当前里程碑状态写入根目录 `ARCHITECTURE_STATE.md`。
