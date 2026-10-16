use serde::{Deserialize, Serialize};
use specta::Type;
use crate::orchestrator::types::AssetId;

/// 角色三视图与外观锚点
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CharacterAnchor {
    pub id: String,
    pub name: String,
    pub description: String,
    pub anchor_asset_id: Option<AssetId>,
    pub seed: u64,
    pub prompt_modifiers: Vec<String>,
}

/// 视觉风格圣经 (Style Bible)
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

impl Default for StyleBible {
    fn default() -> Self {
        Self {
            style_id: "cinematic_neo_noir".to_string(),
            name: "新黑色电影 (Cinematic Neo-Noir)".to_string(),
            palette: vec!["#0F172A".to_string(), "#1E293B".to_string(), "#38BDF8".to_string(), "#F43F5E".to_string()],
            lighting: "高对比度侧逆光，赛博冷暖色交织，丁达尔光束".to_string(),
            aspect_ratio: "16:9".to_string(),
            negative_prompt: "低分辨率，模糊，穿模，手部畸变，过度曝光".to_string(),
            aesthetic_score_threshold: 0.85,
        }
    }
}

/// 设定集：角色与视觉风格
#[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
pub struct CharacterAndStyleBible {
    pub characters: Vec<CharacterAnchor>,
    pub style: StyleBible,
}

/// 分镜状态机
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

/// 变体竞技场分支
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BattleBranch {
    pub branch_id: String,
    pub label: String,
    pub asset_id: AssetId,
    pub prompt_variant: String,
    pub is_winner: bool,
}

/// 分镜 DAG 节点
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

/// DAG 边（分镜前驱后继依赖）
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DagEdge {
    pub from_scene_id: String,
    pub to_scene_id: String,
}

/// 分镜有向无环图与节奏点
#[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
pub struct SceneBeatDag {
    pub beats: Vec<String>,
    pub scenes: Vec<StoryboardSceneNode>,
    pub edges: Vec<DagEdge>,
}

/// 多轨时间轴片段
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TimelineClip {
    pub clip_id: String,
    pub scene_id: String,
    pub asset_id: AssetId,
    pub track_type: String, // "video" | "voice" | "sfx" | "bgm"
    pub start_time_ms: u64,
    pub duration_ms: u64,
}

/// 多轨时间轴
#[derive(Debug, Clone, Serialize, Deserialize, Type, Default)]
pub struct MultiTrackTimeline {
    pub clips: Vec<TimelineClip>,
    pub total_duration_ms: u64,
}

/// 知觉证伪探针校验结果
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FalserCheckResult {
    pub passed: bool,
    pub probe_name: String,
    pub message: String,
    pub score: f32,
}

/// 审计日志条目
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AuditLogEntry {
    pub entry_id: String,
    pub scene_id: String,
    pub action: String,
    pub details: String,
    pub checks: Vec<FalserCheckResult>,
    pub timestamp: f64,
}

/// 共享黑板全量状态
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BlackboardState {
    pub project_name: String,
    pub bible: CharacterAndStyleBible,
    pub scene_dag: SceneBeatDag,
    pub timeline: MultiTrackTimeline,
    pub candidate_assets: Vec<AssetId>,
    pub audit_log: Vec<AuditLogEntry>,
}
