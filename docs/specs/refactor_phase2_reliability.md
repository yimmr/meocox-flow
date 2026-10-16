# 阶段二：可靠工程底座规格说明书 (refactor_phase2_reliability.md)

> **对齐日期**：2026-10-16  
> **所属工作流**：`04-audit-and-refactor-legacy.md` (Step 4) & `02-add-media-pipeline-aci.md`  
> **重构策略**：【路径 B：净室剥离移植 (Clean-Room Extraction)】  
> **目标工程**：`d:\apps\meocox-flow`  

---

## 1. 特性/重构模块概述与所属阶段

- **模块名称**：阶段二 可靠工程底座（素材只读防线、确定性批处理媒体管线、Quota Guardian 预算守卫与 Checkpointer 状态机）
- **所属架构层级**：
  - **L4 媒体管线 (Pipeline & ACI)**：纯数学程序化音效合成器 (`procedural_audio.rs`)、剪映/CapCut Pro 工业级草稿组装引擎 (`capcut.rs`)
  - **L5 安全沙箱 (Sandbox)**：Quota Guardian 算力预算拦截器与零凭证代理
  - **L6 记忆与存储 (Storage & Checkpointer)**：用户素材物理只读隔离 (`raw/` vs `derived/`)、基于 SQLite WAL 的非破坏性检查点时光机 (`checkpointer.rs`)
- **交互介入模态**：`Instructive 局部精修` (支持单步音效与剪映导出) + `Collaborative 导演规划` (算力超标自动中断审批)

---

## 2. 共享黑板与数据契约 (`src-tauri/src/pipeline/` & `sandbox/`)

### 2.1 批处理合成与音效参数契约
```rust
/// 程序化音效类型
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum SoundEffectType {
    Whoosh,
    Chime,
    TechAmbient,
}

/// 剪映分镜轨道段落
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CapCutClip {
    pub asset_id: AssetId,
    pub start_time: String, // "00:00:00.000"
    pub duration_ms: f64,
    pub subtitle: Option<String>,
}

/// 预算核算结果
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct QuotaEstimate {
    pub estimated_cost_cents: u64,
    pub remaining_daily_budget_cents: u64,
    pub requires_approval: bool,
    pub reason: String,
}

/// 持久化检查点
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CheckpointRecord {
    pub checkpoint_id: String,
    pub step_name: String,
    pub state_json: String,
    pub created_at: f64,
}
```

### 2.2 物理只读素材池隔离规范
- 用户导入的原片锁定于只读目录：`assets/raw/`；
- 所有程序化音效、转码代理、剪映草稿工程统一写入：`assets/derived/`；
- 严禁覆写原始素材。
