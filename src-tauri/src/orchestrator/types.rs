use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

/// 全链路唯一资产句柄（强制采用 UUIDv7 单调时序标识）
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq, Hash)]
pub struct AssetId(pub String);

impl AssetId {
    pub fn new_v7() -> Self {
        Self(format!("ast_{}", Uuid::now_v7()))
    }
}

/// 标准防错时间码区间（HH:MM:SS.mmm，避免模型心算帧偏移）
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TimecodeRange {
    pub start: String,
    pub end: String,
}

/// 生成中途非阻塞动态切轨指令（TurnSteer 控制帧）
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TurnSteerPayload {
    pub session_id: String,
    pub steer_instruction: String,
    pub preserve_completed_scenes: bool,
}

/// 媒体资产元数据（纯轻量句柄元数据，严禁附带 Base64 或原始媒体字节流）
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AssetMetadata {
    pub id: AssetId,
    pub name: String,
    pub media_type: String, // "video" | "audio" | "image"
    pub local_path: String,
    pub asset_url: String, // 对应的 asset:// 零拷贝流式协议映射 URL
    pub duration_ms: Option<f64>,
    pub summary: String,
    pub created_at: f64,
}

/// 守护进程运行状态
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DaemonStatus {
    pub active_tasks_count: u32,
    pub is_rendering: bool,
    pub uptime_seconds: u32,
}

/// 持久化检查点记录（非线性时间轴时光机）
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CheckpointRecord {
    pub checkpoint_id: String,
    pub step_name: String,
    pub state_json: String,
    pub created_at: f64,
}
