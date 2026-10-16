# 工作流 04：旧项目（如 meocox-flow）架构诊断与演进式重构五步法

当你面对一个半成品、存在架构缺陷的同类型旧项目（如 `meocox-flow`），希望按照《2026 AIGC 六层架构蓝图》与 `React + Tauri v2 + Rust + Tailwind` 技术栈进行重构时，严禁让主智能体直接盲目修改旧代码。请严格执行以下 5 步重构工作流：

## Step 1: 隔离上下文勘探与“资产/负债”盘点（调用 `legacy-spec-miner`）
- 主智能体**不要**在主窗口直接读取成百上千行旧代码（防止旧项目的错误设计污染主上下文）。
- 唤醒只读子智能体 `.gemini/subagents/legacy-spec-miner.md` 扫描旧项目目录，输出一份结构化的《旧项目重构诊断书（`REFACTOR_PLAN.md`）》，将旧代码严格归为三类：
  1. **可复用高价值资产（Reuse）**：如已打磨好的 React Flow 节点 UI、有效的提示词模板、已调通的第三方 API 鉴权逻辑。
  2. **违背六层铁律的架构负债（Refactor）**：如将 Base64 塞入上下文、UI 渲染进程与耗时生成耦合、缺少 `AssetId`（UUIDv7）句柄、直接覆盖用户原始素材。
  3. **半成品死代码（Deprecate）**：直接标记废弃，不予迁移。

## Step 2: 人类拍板重构策略（绞杀榕渐进替换 vs. 净室剥离迁移）
- 主智能体根据 `REFACTOR_PLAN.md` 向用户弹出声明式决策卡，确认采用哪种重构路径：
  - **路径 A（同技术栈：绞杀榕渐进重构 Strangler Fig）**：若旧项目已是 Tauri/React，则在 Git 独立分支/Worktree 下保留现有前端壳层，先在 `src-tauri/` 建立六层解耦目录与 `AssetId` 强类型契约，逐个替换旧接口。
  - **路径 B（跨技术栈或底座重度腐化：净室剥离移植 Clean-Room Extraction）**：若旧项目底座混乱，先调用 `00-bootstrap-project.md` 建立全新干净的 `React 19 + Tauri v2 + Rust` 底座，再将旧项目中的“第 1 类可复用资产”按新契约清洗后逐一迁入。

## Step 3: 规格先行与契约改造（立起 `AssetId` 与共享黑板）
- 结合 `docs/specs/00_feature_spec_template.md` 针对当前重构切片编写规格书，保存至 `docs/specs/refactor_<module_name>.md`。
- 无论选路径 A 还是 B，重构的第一刀永远是**切断旧代码中直接传递大对象/裸路径的耦合**：
  - 在 Rust 端建立 `AssetId`（UUIDv7）、`TimecodeRange` 与 SQLite WAL 资产池。
  - 用 `tauri-specta` 导出强类型 TS 绑定，替换前端旧的松散 API 调用。

## Step 4: 模块级微创迁移与静态红线防御（基于 Git Worktree）
- 每次只迁移或重构 **1 个独立子模块**（例如：先重构“画布节点状态同步”，再重构“媒体生成队列”）。
- **静态红线拦截防御**：每次改动后首先运行 `python scripts/arch_guard.py`（或 `node scripts/arch_guard.mjs`），秒级拦截旧代码习惯性残留的 `std::fs` 同步阻塞、裸 `.unwrap()`、前端 `any` 或 Base64 载荷。
- 随后执行 `cargo check` 与 `pnpm tsc --noEmit` 确保全栈零警告通过。

## Step 5: 双子智能体回归挑刺与账本更新
- 唤醒 `architecture-auditor` 确认旧项目的架构缺陷（如 Base64 传图、UI 阻塞）已彻底清除。
- 唤醒 `rust-tauri-falser` 刺探新 Rust/React 代码的并发死锁与跨平台兼容性。
- 将已完成重构的模块同步更新至根目录 `ARCHITECTURE_STATE.md`。
