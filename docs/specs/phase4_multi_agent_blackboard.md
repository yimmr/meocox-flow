# 特性规格与契约说明书：阶段四 工业级多智能体壁垒 (Phase 4 Spec)

> **文档版本**：v1.0.0  
> **制定时间**：2026-10-16  
> **依据规范**：`AGENTS.md`、`.gemini/skills/crew-blackboard-pattern/SKILL.md`、`.gemini/skills/media-pipeline-and-aci/SKILL.md`、`.gemini/workflows/01-scaffold-mvp-feature.md`

---

## 1. 特性概述与所属架构层级

- **模块名称**：剧组共享黑板、知觉连贯性证伪者、审美变体竞技场与渐进式技能生态
- **所属层级**：
  - L2 批处理媒体管线与 ACI 防错层（`src-tauri/src/pipeline/`）
  - L3 剧组共享黑板与持久化时钟（`src-tauri/src/blackboard/` & `storage/`）
  - L4 确定性编排与专职 Worker 引擎（`src-tauri/src/orchestrator/`）
  - L5 知觉连贯性证伪者与竞技场（`src-tauri/src/blackboard/falser.rs`）
  - L6 渐进式技能加载与跨会话审美记忆（`src-tauri/src/orchestrator/skill_loader.rs` & `memory.rs`）
  - L1 前端三栏控制台与 A2UI 卡片（`src/components/gen-ui/` & `director/`）
- **核心铁律遵循**：
  1. **最低必要自主性**：分镜拆解、音效合成与格式门禁采用确定性工作流；质检重绘与变体对决设硬性重试上限（≤3 次）。
  2. **绝对禁止子智能体群聊**：所有 Worker 独立运行于空白上下文，统一读写结构化黑板状态。
  3. **全链路 Handle-Only 句柄流转**：全流程流转轻量 `AssetId`（UUIDv7），媒体落盘至 `.flow/derived/`，前端通过 `asset://` 协议加载。
  4. **生成中途无损切轨 (TurnSteer)**：消费控制帧队列，已生成镜头 100% 保持，下游动态增量重排。

---

## 2. 共享黑板与核心数据模型 (`src-tauri/src/blackboard/`)

### 2.1 角色与视觉风格设定集 (`CharacterAndStyleBible`)

```rust
use serde::{Deserialize, Serialize};
use specta::Type;
use crate::orchestrator::types::AssetId;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CharacterAnchor {
    pub id: String,
    pub name: String,
    pub description: String,
    pub anchor_asset_id: Option<AssetId>,
    pub seed: u64,
    pub prompt_modifiers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct StyleBible {
    pub style_id: String,
    pub name: String,
    pub palette: Vec<String>,
    pub lighting: String,
    pub aspect_ratio: String,
    pub negative_prompt: String,
    pub aesthetic_score_threshold: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CharacterAndStyleBible {
    pub characters: Vec<CharacterAnchor>,
    pub style: StyleBible,
}
```

### 2.2 分镜 DAG 与多轨时间轴 (`SceneBeatDag` & `MultiTrackTimeline`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
pub enum SceneStatus {
    Pending,
    VisualReady,
    AudioReady,
    Falsifying,
    Approved,
    Rejected,
    BattleActive,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct StoryboardSceneNode {
    pub id: String,
    pub scene_num: u32,
    pub shot_type: String,
    pub camera_movement: String,
    pub prompt: String,
    pub duration_sec: f32,
    pub visual_asset_id: Option<AssetId>,
    pub audio_asset_id: Option<AssetId>,
    pub status: SceneStatus,
    pub retry_count: u32,
    pub battle_branches: Option<Vec<BattleBranch>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BattleBranch {
    pub branch_id: String,
    pub label: String,
    pub asset_id: AssetId,
    pub prompt_variant: String,
    pub is_winner: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DagEdge {
    pub from_scene_id: String,
    pub to_scene_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SceneBeatDag {
    pub beats: Vec<String>,
    pub scenes: Vec<StoryboardSceneNode>,
    pub edges: Vec<DagEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TimelineClip {
    pub clip_id: String,
    pub scene_id: String,
    pub asset_id: AssetId,
    pub track_type: String, // "video" | "voice" | "sfx" | "bgm"
    pub start_time_ms: u64,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct MultiTrackTimeline {
    pub clips: Vec<TimelineClip>,
    pub total_duration_ms: u64,
}
```

### 2.3 候选资产池与证伪质检审计日志 (`CandidatePool` & `AuditLog`)

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FalserCheckResult {
    pub passed: bool,
    pub probe_name: String,
    pub message: String,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AuditLogEntry {
    pub entry_id: String,
    pub scene_id: String,
    pub action: String,
    pub details: String,
    pub checks: Vec<FalserCheckResult>,
    pub timestamp: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BlackboardState {
    pub project_name: String,
    pub bible: CharacterAndStyleBible,
    pub scene_dag: SceneBeatDag,
    pub timeline: MultiTrackTimeline,
    pub candidate_assets: Vec<AssetId>,
    pub audit_log: Vec<AuditLogEntry>,
}
```

---

## 3. 知觉连贯性证伪者 (Continuity Falser) 核心算法与竞技场

### 3.1 四维知觉质检探针设计
1. **完整性探针 (Integrity Probe)**：异步探测文件物理存在、非 0 字节与格式头部。
2. **时长容差探针 (Duration Sync Probe)**：比对分镜预期时长与音频时长，超出 250ms 拦截。
3. **音频削波探针 (Audio Clipping Probe)**：解析 16-bit PCM 波形，峰值 > 0.98FS 标记过载削波。
4. **特征防漂移探针 (Consistency Probe)**：比对角色 Seed、镜头提示词特征词匹配度。

### 3.2 变体竞技场 (Battle Mode) 逻辑流
- 对重点镜头派生 Branch A (经典美学) 与 Branch B (先锋超现实)。
- 两组生成落盘分配独立 `AssetId`，在黑板标记 `SceneStatus::BattleActive`。
- 向前端推送 `BattleCard`，用户拍板后，胜出分支参数自动原子回写至黑板 `StyleBible`。

---

## 4. 三级渐进式技能加载器与跨会话审美记忆

### 4.1 渐进式技能加载 (Progressive Skill Loader)
- **Level 1 (常驻微索引)**：启动时仅扫描技能描述，将 ≤ 50 Token 的微索引注册至内存。
- **Level 2 (按需挂载 SOP)**：意图命中时异步读取完整 `SKILL.md` 正文及 ACI 工具 Schema。
- **Level 3 (用后即焚)**：中间临时色表与调试信息随任务完成立即卸载。

### 4.2 跨会话审美记忆提炼 (Aesthetic Memory Distiller)
- 会话归档时，自动挖掘 `StyleSelectorCard` 最终采纳项、`TurnSteer` 纠偏提示词与 `BattleCard` 盲测裁决。
- 提取结构化记录：
```rust
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AestheticMemoryRecord {
    pub id: String,
    pub category: String,
    pub preference: String,
    pub confidence: f32,
    pub evidence: String,
    pub created_at: f64,
}
```
- 持久化至单项目 SQLite WAL 的 `aesthetic_memories` 表。

---

## 5. 跨进程 IPC 契约与 Command 签名

```rust
// 获取全局共享黑板快照
pub async fn get_blackboard_state(state: State<'_, Arc<DaemonState>>) -> Result<BlackboardState, String>;

// 导演主导的分镜拆解与初始化
pub async fn orchestrate_storyboard(prompt: String, style_id: Option<String>, state: State<'_, Arc<DaemonState>>) -> Result<BlackboardState, String>;

// 确认分镜并启动并行渲染流水线
pub async fn start_pipeline_execution(scene_ids: Vec<String>, state: State<'_, Arc<DaemonState>>) -> Result<BlackboardState, String>;

// 注入生成中途动态切轨控制帧 (TurnSteer)
pub async fn inject_turn_steer_frame(payload: TurnSteerPayload, state: State<'_, Arc<DaemonState>>) -> Result<BlackboardState, String>;

// 对特定镜头开启审美竞技场双分支 (Battle Mode)
pub async fn start_battle_mode(scene_id: String, state: State<'_, Arc<DaemonState>>) -> Result<BlackboardState, String>;

// 裁决竞技场胜出分支
pub async fn resolve_battle_winner(scene_id: String, winner_branch_id: String, state: State<'_, Arc<DaemonState>>) -> Result<BlackboardState, String>;

// 执行连贯性证伪质检
pub async fn verify_scene_continuity(scene_id: String, state: State<'_, Arc<DaemonState>>) -> Result<AuditLogEntry, String>;

// 查询渐进式技能微索引 (Level 1)
pub async fn list_skill_indexes(state: State<'_, Arc<DaemonState>>) -> Result<Vec<SkillIndexItem>, String>;

// 按需读取完整技能 SOP (Level 2)
pub async fn load_skill_content(skill_name: String, state: State<'_, Arc<DaemonState>>) -> Result<String, String>;

// 查询跨会话审美记忆沉淀
pub async fn list_aesthetic_memories(state: State<'_, Arc<DaemonState>>) -> Result<Vec<AestheticMemoryRecord>, String>;
```

---

## 6. 前端三栏 UI 打通方案

1. **左栏 (Project Sidebar)**：
   - 资产池实时显示黑板 `candidate_assets`，并标注是由哪个分镜/分支生成。
2. **中栏 (Director Workspace & Conversation Stream)**：
   - 渲染新增的 `BattleCard.tsx`（盲测对决卡，限高 ≤ 500px）；
   - 渲染增强版 `StoryboardConfirmCard.tsx`（支持镜头状态徽标、质检结果及局部重绘触发）；
   - `TurnSteerInputBar.tsx` 直连 `inject_turn_steer_frame`，实现生成运行态零资源切轨。
3. **右栏 (Artifacts Drawer)**：
   - 扩展顶部 Tab，新增：
     - `分镜视窗 (Scene DAG)`：可视化镜头状态机拓扑；
     - `质检审计 (Falser Audit)`：四维探针通过率与重试日志；
     - `审美记忆 (Aesthetic DNA)`：跨会话偏好溯源沉淀。
