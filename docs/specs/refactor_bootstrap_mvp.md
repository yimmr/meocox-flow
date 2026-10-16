# 阶段一 MVP 底座构建与净室移植契约规格说明书 (refactor_bootstrap_mvp.md)

> **对齐日期**：2026-10-16  
> **所属工作流**：`04-audit-and-refactor-legacy.md` (Step 3) & `00-bootstrap-project.md` (Step 1~5)  
> **重构策略**：【路径 B：净室剥离移植 (Clean-Room Extraction)】  
> **目标工程**：`d:\apps\meocox-flow`  

---

## 1. 特性/重构模块概述与所属阶段

- **模块名称**：阶段一 MVP 基础底座构建（打通“脑壳分离”与 `AssetId` 句柄流转最小闭环）
- **所属架构层级**：
  - **L1 表现外壳 (Presentation Shell)**：React 19 + TypeScript + Vite + Tailwind CSS 双栏控制平面
  - **L2 编排中枢 (Orchestrator)**：`AssetId` (UUIDv7)、`TimecodeRange`、`TurnSteerPayload` 强类型定义
  - **L6 记忆与存储 (Storage & Daemon)**：后台常驻伪守护机制（拦截 `RunEvent::ExitRequested`）、单项目 SQLite WAL 存储池、自定义 `asset://` 协议
- **交互介入模态**：`Instructive 局部精修` 与 `Collaborative 全局导演规划` 基础框架

---

## 2. 共享黑板与存储 Schema 契约 (`src-tauri/src/orchestrator/types.rs` & `storage/`)

### 2.1 强类型跨进程契约（派生 `specta::Type`）
彻底废除旧代码中的 Base64/裸绝对路径，统一采用时序自增的 `AssetId` (UUIDv7)：

```rust
use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

/// 全链路唯一资产句柄（底层强制采用 UUIDv7 单调时序标识）
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq, Hash)]
pub struct AssetId(pub String);

impl AssetId {
    pub fn new_v7() -> Self {
        Self(format!("ast_{}", Uuid::now_v7()))
    }
}

/// 标准防错时间码区间（HH:MM:SS.mmm）
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TimecodeRange {
    pub start: String,
    pub end: String,
}

/// 生成中途非阻塞动态切轨指令（TurnSteer）
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TurnSteerPayload {
    pub session_id: String,
    pub steer_instruction: String,
    pub preserve_completed_scenes: bool,
}

/// 媒体资产元数据（纯元数据，不携带大二进制）
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AssetMetadata {
    pub id: AssetId,
    pub name: String,
    pub media_type: String,       // "video" | "audio" | "image"
    pub local_path: String,
    pub asset_url: String,        // "asset://..." 零拷贝协议 URL
    pub duration_ms: Option<u64>,
    pub summary: String,
    pub created_at: i64,
}

/// 守护进程运行状态
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DaemonStatus {
    pub active_tasks_count: usize,
    pub is_rendering: bool,
    pub uptime_seconds: u64,
}
```

### 2.2 SQLite 表结构设计 (`src-tauri/src/storage/schema.sql`)
单项目独立 `.flow/project.db`，强制启用 `PRAGMA journal_mode=WAL;`：

```sql
CREATE TABLE IF NOT EXISTS assets (
    asset_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    media_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    summary TEXT,
    duration_ms INTEGER,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS checkpoints (
    checkpoint_id TEXT PRIMARY KEY,
    step_name TEXT NOT NULL,
    state_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
```

---

## 3. 跨进程 IPC 命令与宿主权限 (`src-tauri/src/daemon/` & `capabilities/`)

### 3.1 新增 Tauri Commands (注册进 `tauri-specta` 自动导出)
- `ping_daemon_status() -> Result<DaemonStatus, String>`：检查后台守护状态与活跃任务；
- `register_local_asset(path: String, summary: Option<String>) -> Result<AssetMetadata, String>`：导入本地媒体文件，分配 UUIDv7 `AssetId`，记录入 SQLite，返回前端安全的 `asset://` 映射；
- `list_assets() -> Result<Vec<AssetMetadata>, String>`：轻量查询项目资产元数据清单（严禁附带 Base64）。

### 3.2 权限与托盘配置 (`src-tauri/capabilities/default.json` & `tauri.conf.json`)
- 启用 `core:default` 与 `core:event:default`；
- 注册 `asset:` 自定义安全协议作用域（限制仅读取用户指定资产池）；
- 开启系统托盘（System Tray）支持，窗口关闭拦截 `RunEvent::ExitRequested`，当有任务活跃时执行 `api.prevent_exit()`。

---

## 4. 前端双栏画布与表现外壳 (`src/`)

- **技术栈**：React 19 + TypeScript + Vite + Tailwind CSS + Lucide Icons；
- **目录结构**：
  - `src/bindings/index.ts`：由 `tauri-specta` 自动生成的强类型调用函数与类型声明（严禁手动修改）；
  - `src/components/control-stream/`：左栏对话控制流、TurnSteer 切轨指令输入卡；
  - `src/components/canvas/`：右栏工作区（`@xyflow/react` 节点图插槽与素材时间轴面板）；
  - `src/lib/asset.ts`：封装 `asset://` 协议转换与轻量 IPC 契约调用。
