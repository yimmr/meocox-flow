# 特性规格与重构契约说明书模板 (Step 0: Spec & Contract Mining)

> **使用规则**：在重构旧项目模块或编写任何新业务代码（进入 Step 1）之前，主控智能体（Conductor）必须先与开发者对齐以下 4 项轻量规格，并保存为 `docs/specs/<feature_or_module_name>.md`。

---

## 1. 特性/重构模块概述与所属阶段
- **模块名称**：`[例如：从 meocox-flow 迁移画布节点状态与定妆照生成]`
- **重构策略**：`[绞杀榕渐进替换 (Strangler Fig) / 净室剥离移植 (Clean-Room Extraction)]`
- **所属架构层级**：`[例如：L1 声明式 GenUI + L3 共享黑板 + L4 美术子智能体]`
- **交互介入模态**：`[Passive 潜意识辅助 / Instructive 局部精修 / Collaborative 全局导演规划]`

## 2. 共享黑板与存储 Schema 变更 (`src-tauri/src/blackboard/`)
- **新增或重构的 Rust Struct / Enum**：
  ```rust
  // 示例：必须标记 #[derive(Serialize, Deserialize, specta::Type)]
  // 彻底废除旧代码中的 Base64/原始文件绝对路径，统一改用 AssetId (UUIDv7)
  ```
- **SQLite 表结构变更 (`src-tauri/src/storage/`)**：
  - 是否需要新增表或字段？是否涉及 `checkpoints` 快照序列化？

## 3. 跨进程 IPC 命令与宿主权限 (`src-tauri/src/ipc/` & `capabilities/`)
- **新增或替换的 `#[tauri::command]` 列表**：
  - 替换旧有的松散/阻塞接口，定义强类型参数与返回值；是否需要 `tauri::ipc::Channel<T>` 流式推送？
- **Tauri v2 Capabilities 权限与 Sidecar 变更**：
  - 是否需要修改 `src-tauri/capabilities/default.json`？是否需要限制旧素材目录为物理只读（`assetScope`）？

## 4. 前端双栏画布与声明式 GenUI 展现 (`src/components/`)
- **左栏（对话流与 GenUI 卡片）**：
  - 旧有繁琐的弹出层或文本追问如何重构为声明式 GenUI 卡片？（限高 <= 500px，使用宿主 CSS 变量）
- **右栏（鲜活画布 Living Canvas）**：
  - 旧有的 React Flow / 画布节点如何接入新架构下的 `AssetId` 与 `yrs/Yjs` CRDT 同步？
