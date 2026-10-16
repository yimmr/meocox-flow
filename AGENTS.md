# AIGC 多模态智能体项目全局架构与技术栈宪章 (Global Rules)

你正在协助架构和开发一款工业级桌面端 **AIGC 多模态创意智能体应用**（涵盖视觉、音频、视频、数字资产与剧本创作）。在任何架构设计、接口定义与代码编写中，必须严格遵守以下全局红线与技术栈规范：

## 一、 锁定技术栈基线（Tech Stack Baseline）

- **桌面宿主与后端核心**：**Tauri v2 + Rust (`tokio` 异步运行时)**
  - 跨进程强类型契约：`tauri-specta` + `specta`（Rust 结构体/Command 自动生成前端 TS 类型）
  - 流式通信与媒体预览：Tauri `Channel<T>`（流式状态推送） + 自定义 `asset://` 协议（零 IPC 拷贝加载本地大体积音视频）
  - 扩展协议与协同：`rmcp`（官方 Rust MCP SDK） + `yrs`（Rust 端 Yjs CRDT 引擎）
  - 持久化与时光机：`rusqlite` / `sqlx`（SQLite WAL 模式，单项目独立 `.db`） + `uuid`（强制开启 `v7` 特性）
  - 媒体计算与安全：Tauri `Sidecar`（封装独立 `ffmpeg` / `ffprobe` 二进制） + `keyring`（系统原生钥匙串存储 API Key）
- **前端控制平面与画布**：**React 19 + TypeScript + Tailwind CSS + Vite**
  - 组件与状态：`shadcn/ui`（构建声明式 A2UI 参数推导卡） + `Zustand`（轻量视图状态）
  - 多模态画布：`@xyflow/react`（React Flow 分镜 DAG 节点图） + `Yjs`（与后端 `yrs` 双向无锁同步时间轴/剧本）

## 二、 三大顶层架构铁律（绝对红线）

1. **最低必要自主性铁律（Least Autonomy First）**
   - 凡是流程固定、可预测的环节（如字幕对齐、画幅裁切、响度标准化），**必须设计为确定性 Rust 工作流并设程序化门禁**；仅在开放式创意探索或知觉挑刺时启用动态智能体环路。
2. **脑壳分离与 Tauri 伪守护模式（Daemon-First Decoupling）**
   - 核心状态机、渲染队列与黑板必须常驻于 Rust 后端服务；**必须在 Tauri 中拦截 `RunEvent::ExitRequested` 并配合系统托盘（System Tray）**——当后台仍有 AIGC 任务运行时，关闭窗口仅销毁 WebView 释放显存，绝不杀死后台 Rust 渲染队列。
3. **全链路句柄流转铁律（Handle-Only Context）**
   - **严禁将图像 Base64、原始音频流、视频二进制塞进大模型 Prompt 或 Tauri `invoke` JSON 载荷**；上下文与 IPC 仅流转轻量的 `asset_id`（UUIDv7）、标准时间码（`HH:MM:SS.mmm`）与百字内摘要。

## 三、 五大架构与编码反模式禁令（Ban List）

- **禁止多智能体自由群聊**：多角色协同必须围绕 Rust 端结构化的**共享黑板（Blackboard：设定集、分镜 DAG、OTIO 时间轴）**按需读写。
- **禁止无证伪直接交付与跨平台编码裸奔**：关键产出需经 `Continuity Falser` 挑刺；前端预览代理视频必须由 `ffmpeg` Sidecar 统一转码为兼容 Windows WebView2 与 macOS WKWebView 的标准 `H.264 MP4 / WebM`。
- **禁止覆写原始素材（Raw Asset Immutability）**：用户导入的原始素材目录在 Tauri FS Scope 中锁定为物理只读，一切编辑均为非破坏性虚拟元数据或衍生文件。
- **禁止单步工具高频往返处理媒体**：必须采用**批处理媒体管线模式（Media Pipeline Mode）**，由 Rust 拼装完整 `ffmpeg` 滤镜图一次性跑完。
- **禁止在 Rust 异步上下文中持有阻塞锁**：严禁跨 `.await` 持有 `std::sync::Mutex`，严禁同步阻塞人工审批（必须用 Checkpointer + `interrupt` 零资源挂起）。

## 四、 按需挂载技能包与标准工作流索引

- **架构与技术栈技能（`.gemini/skills/`）**：
  - `tauri-rust-react-stack`：编写 Rust/Tauri/React 代码、配置脚手架、IPC 契约或 FFmpeg Sidecar 时调用。
  - `aigc-system-topology` / `crew-blackboard-pattern` / `media-pipeline-and-aci` / `generative-ui-and-hitl` / `timeline-state-and-memory`：设计对应子系统时按需调用。
- **标准化编码与重构工作流（`.gemini/workflows/`）**：
  - `00-bootstrap-project.md`（Day-0 从零初始化工程骨架）
  - `01-scaffold-mvp-feature.md`（契约先行开发新模块）
  - `02-add-media-pipeline-aci.md`（新增媒体管线工具）
  - `03-add-declarative-genui-card.md`（新增 A2UI 交互卡片）
  - `04-audit-and-refactor-legacy.md`（旧项目架构诊断与绞杀榕/净室演进重构）
- **工程静态哨兵与规格模板**：
  - `scripts/arch_guard.py` & `.mjs`：秒级物理阻断同步 I/O、裸 unwrap、any 类型与 Base64 泄露
  - `docs/specs/00_feature_spec_template.md`：新特性动工与旧模块重构前的契约先行对齐模板
- **跨会话进度与架构账本（`ARCHITECTURE_STATE.md`）**：每次开启新会话先读取该文件了解当前阶段，每完成一个里程碑自动更新该文件。
- **独立审查子智能体（`.gemini/subagents/`）**：
  - `legacy-spec-miner.md`（旧项目只读勘探、可复用资产与架构负债诊断）
  - `architecture-auditor.md`（六层架构解耦与反模式合规审查）
  - `rust-tauri-falser.md`（Rust/Tauri 并发死锁与边界反例对抗证伪）

