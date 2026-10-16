use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;
use crate::blackboard::types::BlackboardState;

/// 跨会话审美记忆条目（带 Citation 溯源证据）
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AestheticMemoryRecord {
    pub id: String,
    pub category: String, // "visual_style" | "camera_pacing" | "sound_preference"
    pub preference: String,
    pub confidence: f32,
    pub evidence: String, // 溯源证据（例如引用某会话的 TurnSteer 或 Style 决策）
    pub created_at: f64,
}

/// 跨会话审美记忆提炼器 (Aesthetic Memory Distiller)
pub struct AestheticMemoryDistiller;

impl AestheticMemoryDistiller {
    /// 从当前黑板快照及人类交互历史中提炼审美偏好
    pub fn distill_from_blackboard(bb: &BlackboardState) -> Vec<AestheticMemoryRecord> {
        let mut records = Vec::new();
        let now = chrono::Utc::now().timestamp_millis() as f64;

        // 1. 提炼 StyleBible 选型偏好
        let style = &bb.bible.style;
        records.push(AestheticMemoryRecord {
            id: format!("mem_{}", Uuid::now_v7()),
            category: "visual_style".to_string(),
            preference: format!("偏好「{}」基调，色板以 {} 为主，光影注重「{}」", style.name, style.palette.join(", "), style.lighting),
            confidence: 0.92,
            evidence: format!("基于项目「{}」设定的视觉风格圣经", bb.project_name),
            created_at: now,
        });

        // 2. 从审计日志中提炼竞技场胜出偏好与质检纠偏
        for audit in &bb.audit_log {
            if audit.action == "BATTLE_WINNER_RESOLVED" {
                records.push(AestheticMemoryRecord {
                    id: format!("mem_{}", Uuid::now_v7()),
                    category: "battle_decision".to_string(),
                    preference: format!("在分镜 #{} 竞技场盲测中，胜出方案更具张力: {}", audit.scene_id, audit.details),
                    confidence: 0.88,
                    evidence: format!("审计日志引用: [{}] {}", audit.entry_id, audit.details),
                    created_at: now,
                });
            } else if audit.action == "TURN_STEER_INJECTED" {
                records.push(AestheticMemoryRecord {
                    id: format!("mem_{}", Uuid::now_v7()),
                    category: "turn_steer_feedback".to_string(),
                    preference: format!("中途切轨偏好纠偏: {}", audit.details),
                    confidence: 0.95,
                    evidence: format!("用户实时注入切轨指令: {}", audit.details),
                    created_at: now,
                });
            }
        }

        records
    }
}
