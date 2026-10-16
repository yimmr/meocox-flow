//! L3 剧组共享黑板 (Creative Blackboard)
//! 承载角色设定、视觉圣经、Scene DAG、多轨时间轴、候选资产池与证伪审计日志。
//! 严禁子智能体之间自由群聊，所有协同均围绕中央黑板读写。

pub mod falser;
pub mod types;

pub use falser::{ContinuityFalser, MAX_FALSER_RETRIES};
pub use types::*;

use tokio::sync::RwLock;
use crate::orchestrator::types::AssetId;

/// 剧组中央黑板容器
pub struct Blackboard {
    state: RwLock<BlackboardState>,
}

impl Blackboard {
    pub fn new(project_name: impl Into<String>) -> Self {
        let default_state = BlackboardState {
            project_name: project_name.into(),
            bible: CharacterAndStyleBible::default(),
            scene_dag: SceneBeatDag::default(),
            timeline: MultiTrackTimeline::default(),
            candidate_assets: Vec::new(),
            audit_log: Vec::new(),
        };
        Self {
            state: RwLock::new(default_state),
        }
    }

    /// 获取黑板完整只读快照
    pub async fn get_snapshot(&self) -> BlackboardState {
        self.state.read().await.clone()
    }

    /// 原子替换或更新分镜 DAG
    pub async fn update_scenes(&self, scenes: Vec<StoryboardSceneNode>, edges: Vec<DagEdge>) {
        let mut state = self.state.write().await;
        state.scene_dag.scenes = scenes;
        state.scene_dag.edges = edges;
    }

    /// 更新特定分镜节点状态
    pub async fn update_scene_status(&self, scene_id: &str, status: SceneStatus, retry_count: Option<u32>) -> bool {
        let mut state = self.state.write().await;
        if let Some(node) = state.scene_dag.scenes.iter_mut().find(|s| s.id == scene_id) {
            node.status = status;
            if let Some(r) = retry_count {
                node.retry_count = r;
            }
            true
        } else {
            false
        }
    }

    /// 绑定分镜的视觉或音频资产（无借用冲突）
    pub async fn bind_scene_assets(
        &self,
        scene_id: &str,
        visual_asset: Option<AssetId>,
        audio_asset: Option<AssetId>,
    ) -> bool {
        let mut state = self.state.write().await;
        if let Some(ref va) = visual_asset {
            if !state.candidate_assets.contains(va) {
                state.candidate_assets.push(va.clone());
            }
        }
        if let Some(ref aa) = audio_asset {
            if !state.candidate_assets.contains(aa) {
                state.candidate_assets.push(aa.clone());
            }
        }
        if let Some(node) = state.scene_dag.scenes.iter_mut().find(|s| s.id == scene_id) {
            if let Some(va) = visual_asset {
                node.visual_asset_id = Some(va);
            }
            if let Some(aa) = audio_asset {
                node.audio_asset_id = Some(aa);
            }
            true
        } else {
            false
        }
    }

    /// 记录变体竞技场分支 (Battle Mode)
    pub async fn set_battle_branches(&self, scene_id: &str, branches: Vec<BattleBranch>) -> bool {
        let mut state = self.state.write().await;
        for b in &branches {
            if !state.candidate_assets.contains(&b.asset_id) {
                state.candidate_assets.push(b.asset_id.clone());
            }
        }
        if let Some(node) = state.scene_dag.scenes.iter_mut().find(|s| s.id == scene_id) {
            node.battle_branches = Some(branches);
            node.status = SceneStatus::BattleActive;
            true
        } else {
            false
        }
    }

    /// 裁决变体竞技场胜出者，并将参数原子回写至黑板设定集
    pub async fn resolve_battle_winner(&self, scene_id: &str, winner_branch_id: &str) -> Result<BlackboardState, String> {
        let mut state = self.state.write().await;
        let mut winner_prompt = None;
        let mut winner_asset = None;

        if let Some(node) = state.scene_dag.scenes.iter_mut().find(|s| s.id == scene_id) {
            if let Some(branches) = &mut node.battle_branches {
                for b in branches.iter_mut() {
                    if b.branch_id == winner_branch_id {
                        b.is_winner = true;
                        winner_prompt = Some(b.prompt_variant.clone());
                        winner_asset = Some(b.asset_id.clone());
                    } else {
                        b.is_winner = false;
                    }
                }
            }
            if let Some(asset) = winner_asset {
                node.visual_asset_id = Some(asset);
                node.status = SceneStatus::Approved;
            }
        }

        // 胜出参数回写设定集 StyleBible
        if let Some(p) = winner_prompt {
            state.bible.style.lighting = format!("{} (来源于竞技场胜出分镜 #{})", state.bible.style.lighting, scene_id);
            state.audit_log.push(AuditLogEntry {
                entry_id: format!("audit_{}", uuid::Uuid::now_v7()),
                scene_id: scene_id.to_string(),
                action: "BATTLE_WINNER_RESOLVED".to_string(),
                details: format!("竞技场胜出分支: {}, 提示词参数已原子回写设定集: {}", winner_branch_id, p),
                checks: vec![],
                timestamp: chrono::Utc::now().timestamp_millis() as f64,
            });
        }

        Ok(state.clone())
    }

    /// 追加证伪审计日志
    pub async fn append_audit_entry(&self, entry: AuditLogEntry) {
        let mut state = self.state.write().await;
        state.audit_log.push(entry);
    }

    /// 更新视觉圣经 StyleBible
    pub async fn update_style_bible(&self, style: StyleBible) {
        let mut state = self.state.write().await;
        state.bible.style = style;
    }
}
