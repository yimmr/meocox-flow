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
- [x] **阶段三：导演控制平面（恢复三栏 Codex 控制台、A2UI 声明式卡片、TurnSteer 动态切轨与多模态产物画板）** 🏁 *已全量达成*
  - [x] 废弃 React Flow 节点图，全面恢复【左栏项目资产池 + 中栏导演指挥流 + 右栏自适应产物抽屉】经典三栏布局 (已完成)
  - [x] 底层全量对接阶段一/二 Rust 核心，全面采用 React 19 + TypeScript 纯净架构，数据流彻底绑定 `src/bindings/` 强类型契约与 `asset://` 零拷贝协议 (已完成)
  - [x] 落地三大类 Codex 导演交互能力：
    - [x] 对话内嵌声明式卡片 (A2UI <= 500px)：`StoryboardConfirmCard`、`StyleSelectorCard`、`QuotaApprovalCard`、`CheckpointRecoveryCard` (已完成)
    - [x] 右侧 Codex 风格产物预览画板 (Artifacts Drawer)：分镜视觉资产 `asset://` 预览、16-bit PCM 原生音效播放器 (`ProceduralAudio`) 与剪映 Pro 草稿一键导出 (`CapCutDraftExporter`) (已完成)
    - [x] 生成中途动态切轨 (TurnSteer)：输入框运行态无损切轨控制帧注入与状态机检查点联动 (已完成)
- [x] **阶段四：工业级多智能体壁垒（剧组共享黑板、Continuity Falser 连贯性证伪者、变体竞技场与渐进式生态）** 🏁 *已全量达成*
  - [x] 落地 Rust 剧组共享黑板（`src-tauri/src/blackboard/`）：维护设定集 Bible、分镜 Beat DAG、多轨时间轴与候选资产池，物理杜绝子智能体群聊 (已完成)
  - [x] 落地编排引擎与 Workers（`src-tauri/src/orchestrator/`）：Director 统筹拆解、Visual/Audio Worker 并发生成落盘、运行态无损切轨控制帧消费 (已完成)
  - [x] 落地知觉连贯性证伪者（`ContinuityFalser`）：四维知觉自动化门禁（完整性、时长对齐、PCM 削波、风格防漂移），支持局部自愈与硬性重试上限 (MaxRetries = 3) (已完成)
  - [x] 落地审美变体竞技场（Battle Mode）：重点分镜并发派生双分支，前端推送 `BattleCard` 盲测对决，胜出参数原子回写设定集 (已完成)
  - [x] 落地三级渐进式技能加载器（`ProgressiveSkillLoader`）：L1 微索引（50 Token/项）常驻主脑路由，命中按需加载完整 SOP (已完成)
  - [x] 落地跨会话审美记忆提炼器（`AestheticMemoryDistiller`）：提取人类偏好并带 Citation 证据链持久化至 SQLite WAL (已完成)
  - [x] 前端三栏 UI 彻底打通：新增 `BattleCard` A2UI 卡片、增强 `StoryboardConfirmCard`、右栏扩展黑板 DAG/证伪审计/审美 DNA 三重视窗、左栏挂载技能微索引 (已完成)

## 二、 核心数据契约登记表（已落地的全局类型与表结构）

| 契约 / 模块名称 | 所在代码路径 | 状态 | 备注 |
| :--- | :--- | :--- | :--- |
| `AssetId` (UUIDv7) | `src-tauri/src/orchestrator/types.rs` & `src/bindings/index.ts` | 已落地 | 全链路唯一媒体句柄，强制单调时序，通过 `tauri-specta` 自动导出 TS 绑定 |
| `TimecodeRange` | `src-tauri/src/orchestrator/types.rs` | 已就绪 | 标准防错时间码区间 (`HH:MM:SS.mmm`) |
| `TurnSteerPayload` | `src-tauri/src/orchestrator/types.rs` | 已就绪 | 生成中途非阻塞动态切轨控制帧，已保全前序分镜 |
| `ProceduralAudio` (GEM-02) | `src-tauri/src/pipeline/procedural_audio.rs` | 已落地 | 纯数学 16-bit PCM 原生免版税音效生成器 (Whoosh, Chime, Lo-Fi BGM) |
| `CapCutDraftExporter` (GEM-01) | `src-tauri/src/pipeline/capcut.rs` | 已落地 | 剪映 Pro 工业级草稿组装引擎 (多轨视频/字幕/微秒时间戳) |
| `QuotaGuardian` | `src-tauri/src/sandbox/quota.rs` | 已落地 | 算力与费用预算防线，超额自动触发零资源挂起门禁与人工审批提示 |
| `Checkpointer` (时光机) | `src-tauri/src/storage/mod.rs` | 已落地 | 单项目 SQLite WAL 检查点持久化快照，支持无损回滚与分叉 |
| `DaemonState` | `src-tauri/src/daemon/mod.rs` & `src-tauri/src/lib.rs` | 已落地 | 拦截 `RunEvent::ExitRequested`，常驻后台伪守护并持有共享黑板 |
| `StorageManager` (WAL) | `src-tauri/src/storage/mod.rs` | 已落地 | 单项目 `.flow/project.db`，存储媒体元数据、检查点与审美记忆 |
| `BlackboardState` | `src-tauri/src/blackboard/types.rs` | 已落地 | 剧组中央黑板，容纳设定集、Scene DAG、多轨时间轴、候选资产池与审计日志 |
| `ContinuityFalser` | `src-tauri/src/blackboard/falser.rs` | 已落地 | 四维知觉证伪者：完整性、时长对齐、PCM 削波与风格一致性检验 |
| `BattleCard` | `src/components/gen-ui/BattleCard.tsx` | 已落地 | 声明式 A2UI 盲测对决卡片（<=500px），支持双分支裁决并原子回写设定集 |
| `ProgressiveSkillLoader` | `src-tauri/src/orchestrator/skill_loader.rs` | 已落地 | 三级渐进式技能加载器：Level 1 常驻微索引 -> Level 2 SOP -> Level 3 用后即焚 |
| `AestheticMemoryDistiller` | `src-tauri/src/orchestrator/memory.rs` | 已落地 | 跨会话审美记忆提炼器，从 Style 选择、TurnSteer 与盲测中提取偏好并带 Citation 溯源 |
| `DirectorWorkspace` | `src/components/director/DirectorWorkspace.tsx` | 已落地 | 经典三栏 Codex 风格控制台，连接资产抽屉、对话流与产物画板 |
| `Multimodal Artifacts Drawer` | `src/components/artifacts/` | 已落地 | 多模态画板：包含视觉预览、PCM 音效、剪映草稿、黑板 DAG、证伪审计与审美 DNA |
| `ArchGuard` | `scripts/arch_guard.py` & `.mjs` | 已就绪 | 静态红线秒级检查哨兵（防止旧代码反模式渗透，当前 0 违规） |

## 三、 架构决策记录（ADR Log）

- **ADR-001（桌面框架与后端选型）**：选用 `Tauri v2 + Rust + React 19 + Tailwind CSS`，以最小化宿主内存/显存占用，将硬件资源让渡给多模态渲染与本地预览。
- **ADR-002（媒体处理分工）**：Rust 专注做安全调度、状态机与黑板管理；重度音视频编解码统一通过 `Tauri Sidecar` 调用独立打包的 `ffmpeg` / `ffprobe` 执行（`Media Pipeline Mode`）。
- **ADR-003（双层红线门禁与规格先行）**：吸纳 v1 核心工程成果，确立“规格先行（Step 0 对齐）+ 秒级静态扫描（`scripts/arch_guard`）+ 独立子智能体证伪（`subagents/`）”的三重防线体系。
- **ADR-004（旧项目演进重构与防污染策略）**：引入 `legacy-spec-miner` 在独立只读上下文中清查旧代码（严禁污染主脑上下文）；确立绞杀榕（Strangler Fig）与净室剥离（Clean-Room）双轨重构路径；每次改动由 `arch_guard` 物理阻断旧代码病灶渗入。
- **ADR-005（重构路径正式拍板：净室剥离移植）**：经人类决策拍板，弃用同技术栈修补的“绞杀榕”方案，全面采纳【路径 B：净室剥离移植 (Clean-Room Extraction)】。先调用 `00-bootstrap-project.md` 立起纯净的 `Tauri v2 + Rust (tokio) + React 19 + TypeScript` 原生底座与 `AssetId` (UUIDv7) 强类型契约，再将旧库中的 8 类自包含高价值资产（Prompt、SOP、CapCut JSON 算法、PCM 合成等）清洗后逐一迁入。
- **ADR-006（阶段二可靠工程底座与批处理媒体管线落地）**：将旧代码中分散的 PCM 音效（GEM-02）移植为 Rust 零依赖原生算法（`pipeline/procedural_audio.rs`）；将剪映 CapCut Pro 导出（GEM-01）移植为 Rust 确定性批处理引擎（`pipeline/capcut.rs`）；落地 Quota Guardian 算力预算守卫（`sandbox/quota.rs`），超出阈值自动触发零资源挂起门禁；落地非线性时间轴时光机（`storage/mod.rs`），基于 SQLite WAL 与 UUIDv7 实现无损检查点快照；原始素材锁定只读，生成物完全隔离于 `.flow/derived/`。
- **ADR-007（阶段三导演控制平面前端重构与三大 Codex 交互能力落地）**：废弃拖拽节点图，全面恢复【左侧项目资产库 + 中间主对话流 + 右侧自适应产物抽屉】的三栏 VS Code / 类 Codex 核心交互形态；全量换芯对接阶段一/二 Rust 后端，组件 100% 采用 React 19 + TypeScript 净室编写；落地四大 A2UI 声明式卡片（分镜确认、风格选择、预算拦截与时光机回滚，严格遵守 <=500px 高度预算）；落地右侧多模态产物预览画板（`asset://` 零拷贝图片/视频渲染、16-bit PCM 原生免版税音效试听播放器与一键剪映 Pro 工程导出）；落地生成中途 TurnSteer 动态切轨输入中枢，实现后台任务不中断、已生成资产 100% 保全与控制帧注入。
- **ADR-008（阶段四剧组黑板制、知觉证伪、变体竞技场与跨会话审美记忆落地）**：
  1. 严格贯彻“最低必要自主性”铁律，确定性工作流负责分镜拓扑、PCM 合成与文件门禁；禁止子智能体群聊，中央黑板（`Arc<RwLock<BlackboardState>>`）为唯一协同状态源；
  2. 建立 `ContinuityFalser` 独立闭环，内置物理完整性、时长对齐（容差 <=250ms）、16-bit PCM 削波（Peak >= 0.98FS）与风格特征防漂移四维探针，硬性重试上限设为 3 次；
  3. 落地审美变体竞技场（Battle Mode），并发生成双分支并推送 A2UI 盲测卡（限高 <= 500px），胜出分支参数原子回写设定集；
  4. 落地三级渐进式技能加载器（Level 1 50 Token 内存微索引 -> Level 2 SOP 正文 -> Level 3 用后即焚）与跨会话审美记忆提炼器（带 Citation 证据链存入 SQLite WAL）。
