# AIGC 智能体项目演进状态与架构决策账本 (Living Architecture State)

> **用途说明**：本文件是跨会话的“工程接力记忆棒”。`AGENTS.md` 负责定义不可逾越的静态红线，而本文件记录**当前所处的研发阶段、已落地的模块状态与关键架构决策（ADR）**。每完成一个工作流里程碑，主智能体必须同步更新本文件。

## 一、 当前所处演进阶段（四阶段路线图追踪）

- [x] **阶段一：MVP 基础底座（打通“脑壳分离”与 `AssetId` 句柄流转最小闭环）** 🏁 *已全量达成*
  - [x] 旧项目诊断：由 `legacy-spec-miner` 输出 `REFACTOR_PLAN.md` 资产与病灶清单 (已完成)
  - [x] 完成 `00-bootstrap-project.md` 脚手架初始化与 `tauri-specta` 强类型绑定 (已完成)
  - [x] 落地 `RunEvent::ExitRequested` 托盘伪守护模式与 SQLite WAL 单项目存储 (已完成)
  - [x] 跑通首个确定性工作流与本地媒体存储池 `asset://` 预览闭环 (已完成)
- [x] **阶段二：可靠工程底座（原始素材只读防线、OTIO 时间轴快照、Quota Guardian 与 `interrupt` 挂起）** 🏁 *已全量达成*
  - [x] GEM-01 移植：将旧项目 `jianying.js`（CapCut 专业版草稿引擎）清洗重构为 Rust 确定性批处理工具 (已完成)
  - [x] GEM-02 移植：将旧项目 `proceduralAudioService.js`（PCM 程序化音效合成）重构为 Rust 原生免版税音效生成器 (已完成)
  - [x] 安全防线落地：在 Tauri FS Scope 中锁定用户原始素材只读防线（Raw Asset Immutability），并建立 Quota Guardian 算力预算守卫与 `interrupt()` 挂起状态机 (已完成)
- [ ] **阶段三：导演控制平面（双栏画布、三级介入模态、TurnSteer 动态切轨与 A2UI 参数推导卡）** ⬅️ *当前准备进入此阶段*
- [ ] **阶段四：工业级多智能体壁垒（剧组共享黑板、Continuity Falser 连贯性证伪者、变体竞技场与渐进式生态）**

## 二、 核心数据契约登记表（已落地的全局类型与表结构）

| 契约 / 模块名称 | 所在代码路径 | 状态 | 备注 |
| :--- | :--- | :--- | :--- |
| `AssetId` (UUIDv7) | `src-tauri/src/orchestrator/types.rs` & `src/bindings/index.ts` | 已落地 | 全链路唯一媒体句柄，强制单调时序，通过 `tauri-specta` 自动导出 TS 绑定 |
| `TimecodeRange` | `src-tauri/src/orchestrator/types.rs` | 已就绪 | 标准防错时间码区间 (`HH:MM:SS.mmm`) |
| `TurnSteerPayload` | `src-tauri/src/orchestrator/types.rs` | 已就绪 | 生成中途非阻塞动态切轨控制帧 |
| `ProceduralAudio` (GEM-02) | `src-tauri/src/pipeline/procedural_audio.rs` | 已落地 | 纯数学 16-bit PCM 原生免版税音效生成器 (Whoosh, Chime, Lo-Fi BGM) |
| `CapCutDraftExporter` (GEM-01) | `src-tauri/src/pipeline/capcut.rs` | 已落地 | 剪映 Pro 工业级草稿组装引擎 (多轨视频/字幕/微秒时间戳) |
| `QuotaGuardian` | `src-tauri/src/sandbox/quota.rs` | 已落地 | 算力与费用预算防线，超额自动触发零资源挂起门禁与人工审批提示 |
| `Checkpointer` (时光机) | `src-tauri/src/storage/mod.rs` | 已落地 | 单项目 SQLite WAL 检查点持久化快照，支持无损回滚与分叉 |
| `DaemonState` | `src-tauri/src/daemon/mod.rs` & `src-tauri/src/lib.rs` | 已落地 | 拦截 `RunEvent::ExitRequested`，常驻后台伪守护 |
| `StorageManager` (WAL) | `src-tauri/src/storage/mod.rs` | 已落地 | 单项目 `.flow/project.db`，SQLite WAL 模式存储媒体元数据与检查点 |
| `LivingCanvas & ControlStream` | `src/components/canvas/` & `src/components/control-stream/` | 已落地 | 双栏 ReactFlow DAG 画布 + `asset://` 零拷贝流式媒体池 + TurnSteer 输入卡 |
| `LegacyRefactorPlan` | `REFACTOR_PLAN.md` | 已就绪 | 由 `legacy-spec-miner` 扫描产出（坚决拍板路径 B 净室剥离移植） |
| `FeatureSpecTemplate` | `docs/specs/00_feature_spec_template.md` | 已就绪 | Step 0 新特性动工与旧模块重构契约对齐模板 |
| `ArchGuard` | `scripts/arch_guard.py` & `.mjs` | 已就绪 | 静态红线秒级检查哨兵（防止旧代码反模式渗透，当前 0 违规） |

## 三、 架构决策记录（ADR Log）

- **ADR-001（桌面框架与后端选型）**：选用 `Tauri v2 + Rust + React 19 + Tailwind CSS`，以最小化宿主内存/显存占用，将硬件资源让渡给多模态渲染与本地预览。
- **ADR-002（媒体处理分工）**：Rust 专注做安全调度、状态机与黑板管理；重度音视频编解码统一通过 `Tauri Sidecar` 调用独立打包的 `ffmpeg` / `ffprobe` 执行（`Media Pipeline Mode`）。
- **ADR-003（双层红线门禁与规格先行）**：吸纳 v1 核心工程成果，确立“规格先行（Step 0 对齐）+ 秒级静态扫描（`scripts/arch_guard`）+ 独立子智能体证伪（`subagents/`）”的三重防线体系。
- **ADR-004（旧项目演进重构与防污染策略）**：引入 `legacy-spec-miner` 在独立只读上下文中清查旧代码（严禁污染主脑上下文）；确立绞杀榕（Strangler Fig）与净室剥离（Clean-Room）双轨重构路径；每次改动由 `arch_guard` 物理阻断旧代码病灶渗入。
- **ADR-005（重构路径正式拍板：净室剥离移植）**：经人类决策拍板，弃用同技术栈修补的“绞杀榕”方案，全面采纳【路径 B：净室剥离移植 (Clean-Room Extraction)】。先调用 `00-bootstrap-project.md` 立起纯净的 `Tauri v2 + Rust (tokio) + React 19 + TypeScript` 原生底座与 `AssetId` (UUIDv7) 强类型契约，再将旧库中的 8 类自包含高价值资产（Prompt、SOP、CapCut JSON 算法、PCM 合成等）清洗后逐一迁入。
- **ADR-006（阶段二可靠工程底座与批处理媒体管线落地）**：将旧代码中分散的 PCM 音效（GEM-02）移植为 Rust 零依赖原生算法（`pipeline/procedural_audio.rs`）；将剪映 CapCut Pro 导出（GEM-01）移植为 Rust 确定性批处理引擎（`pipeline/capcut.rs`）；落地 Quota Guardian 算力预算守卫（`sandbox/quota.rs`），超出阈值自动触发零资源挂起门禁；落地非线性时间轴时光机（`storage/mod.rs`），基于 SQLite WAL 与 UUIDv7 实现无损检查点快照；原始素材锁定只读，生成物完全隔离于 `.flow/derived/`。

