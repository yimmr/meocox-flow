---
name: tauri-rust-react-stack
description: React 19 + Tauri v2 + Rust + Tailwind CSS 桌面端 AIGC 智能体技术栈工程规范。当规划工程目录结构、编写 Tauri IPC 强类型契约（tauri-specta）、实现后台托盘伪守护进程、调用 FFmpeg Sidecar 或集成 Yjs/yrs 与 SQLite 时调用。
---

# React + Tauri v2 + Rust + Tailwind 桌面端 AIGC 工程规范

## 一、 工程目录脚手架标准（Monorepo Workspace）

项目严格采用前端视图层（`src/`）与 Rust 核心守护层（`src-tauri/`）物理分层结构：

```text
project-root/
├── AGENTS.md                        # 全局架构与技术栈红线
├── .gemini/                         # Antigravity 技能、工作流、钩子与审查子智能体
├── src/                             # [L1 表现外壳] React 19 + TypeScript + Tailwind CSS
│   ├── bindings/                    # 由 tauri-specta 自动生成的强类型 TS 契约（严禁手改）
│   ├── components/
│   │   ├── gen-ui/                  # 声明式生成式 UI 原子组件库（shadcn/ui，高度预算 <=500px）
│   │   ├── canvas/                  # 右侧双栏工作区：多轨时间轴、React Flow 分镜 DAG 画布
│   │   └── control-stream/          # 左侧指挥流、TurnSteer 动态切轨输入框、轨迹折叠面板
│   ├── stores/                      # Zustand 轻量 UI 视图状态 + Yjs CRDT 前端文档绑定
│   └── lib/                         # Tauri Channel 订阅封装与 asset:// 本地媒体流 URL 转换
└── src-tauri/                       # [L2-L6 守护核心] Rust + Tauri v2 + tokio
    ├── binaries/                    # Tauri Sidecar 外部二进制（ffmpeg-<target-triple>）
    ├── capabilities/                # Tauri v2 最小权限声明（严格限制原始素材目录只读）
    └── src/
        ├── daemon/                  # 拦截 ExitRequested 保持托盘常驻、全局任务调度队列
        ├── orchestrator/            # L2 导演编排器、Plan Gate、混合工作流、TurnSteer 控制帧队列
        ├── blackboard/              # L3 剧组共享黑板（设定集、Scene DAG、OTIO 结构、Continuity Falser）
        ├── pipeline/                # L4 防错型 ACI 工具集、FFmpeg Sidecar 批处理合成器、rmcp 客户端
        ├── sandbox/                 # L5 Quota Guardian 算力预算核算、Shadow Preview、keyring 密钥代理
        └── storage/                 # L6 单项目独立 SQLite (WAL)、UUIDv7 生成器、yrs CRDT 引擎、Checkpointer
```

## 二、 五大核心工程实现铁律

1. **强契约驱动（Contract-First via `tauri-specta`）**：
   - 所有跨进程通信的结构体必须派生 `#[derive(serde::Serialize, serde::Deserialize, specta::Type)]`，所有 Tauri 命令必须标注 `#[tauri::command]` 与 `#[specta::specta]`。
   - 严禁使用弱类型的 `serde_json::Value` 传递核心业务状态；修改 Rust 接口后自动触发导出最新的 `src/bindings/index.ts`。
2. **高吞吐流式推送与零拷贝媒体预览**：
   - 进度流、思维链更新、黑板增量变动一律通过 `tauri::ipc::Channel<AgentStreamEvent>` 推送，禁止前端高频轮询。
   - 本地媒体存储池中的图片、音频、代理视频在前端展示时，必须使用 Tauri 的 `convertFileSrc(asset_path, "asset")` 走原生流协议，**严禁将任何多媒体二进制编码为 Base64 通过 IPC 返回**。
3. **Tauri 托盘伪守护模式（Prevent Premature Exit）**：
   - 在 `tauri::Builder` 的 `.build().run(|app_handle, event| ...)` 中拦截 `tauri::RunEvent::ExitRequested`：当 `daemon::has_active_tasks()` 为真时，调用 `api.prevent_exit()` 仅隐藏主窗口并驻留系统托盘，确保长耗时 AIGC 视频生成绝不因关窗而夭折。
4. **跨平台 WebView 媒体兼容性规范**：
   - 考虑到 Windows (WebView2) 与 macOS (WKWebView) 解码器差异，所有由 `FFmpeg Sidecar` 产出的前端预览代理媒体（Proxy Media），统一编码为 `-c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart` 的标准 `.mp4` 格式。
5. **Rust 异步并发安全**：
   - 跨 `.await` 边界共享黑板或队列状态时，使用 `tokio::sync::RwLock` 或 `mpsc` Actor 消息通道；若使用同步锁（`parking_lot::RwLock`），必须在进入 `.await` 前显式释放锁守卫（Drop Guard）。

> 具体的 Rust/Tauri 代码骨架模板与 CRDT 同步范例，请读取 `references/project-scaffolding-and-patterns.md`。
