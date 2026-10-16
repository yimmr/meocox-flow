use std::path::Path;
use std::sync::Arc;
use uuid::Uuid;
use crate::blackboard::falser::{ContinuityFalser, MAX_FALSER_RETRIES};
use crate::blackboard::types::{
    AuditLogEntry, DagEdge, SceneStatus, StoryboardSceneNode,
};
use crate::blackboard::Blackboard;
use crate::orchestrator::types::TurnSteerPayload;
use crate::orchestrator::workers::{AudioWorker, VisualWorker};
use crate::storage::StorageManager;

/// 导演编排器核心 (Director)
pub struct Director;

impl Director {
    /// 拆解分镜剧本大纲并初始化中央黑板
    pub async fn orchestrate_storyboard(
        prompt: &str,
        style_id: Option<&str>,
        blackboard: &Blackboard,
    ) -> Result<(), String> {
        let is_cyberpunk = prompt.contains("赛博") || prompt.contains("未来") || prompt.contains("科技");
        let is_cinematic = prompt.contains("电影") || prompt.contains("悬疑") || prompt.contains("雨夜");

        let (style_name, lighting) = if is_cyberpunk {
            ("赛博未来主义 (Cyberpunk Future)", "冷暖光对冲、全息霓虹、雨幕漫反射")
        } else if is_cinematic {
            ("新黑色悬疑电影 (Neo-Noir)", "强烈侧逆光、深邃阴影、丁达尔光束")
        } else {
            ("现代商业大片质感", "柔和自然采光、高宽容度胶片颗粒")
        };

        // 更新黑板 StyleBible
        let mut snapshot = blackboard.get_snapshot().await;
        snapshot.bible.style.style_id = style_id.unwrap_or("custom_style").to_string();
        snapshot.bible.style.name = style_name.to_string();
        snapshot.bible.style.lighting = lighting.to_string();
        blackboard.update_style_bible(snapshot.bible.style).await;

        // 拆解生成 3 幕经典镜头节点
        let scene1_id = format!("scn_{}", Uuid::now_v7());
        let scene2_id = format!("scn_{}", Uuid::now_v7());
        let scene3_id = format!("scn_{}", Uuid::now_v7());

        let scenes = vec![
            StoryboardSceneNode {
                id: scene1_id.clone(),
                scene_num: 1,
                shot_type: "全景 (Wide)".to_string(),
                camera_movement: "移镜 (Tracking)".to_string(),
                prompt: format!("宏大环境交代：{}，广角镜头纵深拉伸，远景建筑巍峨林立", prompt),
                duration_sec: 4.0,
                visual_asset_id: None,
                audio_asset_id: None,
                status: SceneStatus::Pending,
                retry_count: 0,
                battle_branches: None,
            },
            StoryboardSceneNode {
                id: scene2_id.clone(),
                scene_num: 2,
                shot_type: "中景 (Medium)".to_string(),
                camera_movement: "推镜 (Push-In)".to_string(),
                prompt: format!("主体动态聚焦：核心角色缓步向前，细节丰富，{}", lighting),
                duration_sec: 3.5,
                visual_asset_id: None,
                audio_asset_id: None,
                status: SceneStatus::Pending,
                retry_count: 0,
                battle_branches: None,
            },
            StoryboardSceneNode {
                id: scene3_id.clone(),
                scene_num: 3,
                shot_type: "特写 (Close-Up)".to_string(),
                camera_movement: "静止 (Static)".to_string(),
                prompt: format!("眼神与关键道具高潮定格：微妙神情起伏，极浅景深，情绪张力饱满"),
                duration_sec: 3.0,
                visual_asset_id: None,
                audio_asset_id: None,
                status: SceneStatus::Pending,
                retry_count: 0,
                battle_branches: None,
            },
        ];

        let edges = vec![
            DagEdge {
                from_scene_id: scene1_id,
                to_scene_id: scene2_id.clone(),
            },
            DagEdge {
                from_scene_id: scene2_id,
                to_scene_id: scene3_id,
            },
        ];

        blackboard.update_scenes(scenes, edges).await;
        blackboard
            .append_audit_entry(AuditLogEntry {
                entry_id: format!("audit_{}", Uuid::now_v7()),
                scene_id: "global".to_string(),
                action: "DIRECTOR_ORCHESTRATED".to_string(),
                details: format!("导演基于指令成功拆解 3 幕分镜 DAG: {}", prompt),
                checks: vec![],
                timestamp: chrono::Utc::now().timestamp_millis() as f64,
            })
            .await;

        Ok(())
    }

    /// 执行单个分镜的全闭环生成与证伪流程
    pub async fn execute_single_scene(
        scene_id: &str,
        derived_root: &Path,
        blackboard: &Blackboard,
        storage: &Arc<StorageManager>,
    ) -> Result<AuditLogEntry, String> {
        let snapshot = blackboard.get_snapshot().await;
        let scene = snapshot
            .scene_dag
            .scenes
            .iter()
            .find(|s| s.id == scene_id)
            .cloned()
            .ok_or_else(|| format!("Scene not found: {scene_id}"))?;

        // 1. Visual Worker 生成视觉帧
        let visual_meta = VisualWorker::render_scene_visual(
            derived_root,
            &scene,
            &snapshot.bible.style,
            storage,
        )
        .await?;

        // 2. Audio Worker 生成 PCM 原生免版税音效
        let audio_meta = AudioWorker::render_scene_audio(derived_root, &scene, storage).await?;

        // 3. 绑定黑板候选句柄
        blackboard
            .bind_scene_assets(
                scene_id,
                Some(visual_meta.id.clone()),
                Some(audio_meta.id.clone()),
            )
            .await;

        // 4. Continuity Falser 四维知觉证伪
        let mut audit = ContinuityFalser::falsify_scene(
            &scene,
            &snapshot.bible.style,
            Some(&visual_meta.local_path),
            Some(&audio_meta.local_path),
            Some(&audio_meta),
        )
        .await;

        let passed = audit.checks.iter().all(|c| c.passed);
        if passed {
            blackboard
                .update_scene_status(scene_id, SceneStatus::Approved, None)
                .await;
        } else {
            // 自动重试自愈闭环（硬性上限 3 次）
            if scene.retry_count < MAX_FALSER_RETRIES {
                let next_retry = scene.retry_count + 1;
                blackboard
                    .update_scene_status(scene_id, SceneStatus::Falsifying, Some(next_retry))
                    .await;
                audit.details = format!(
                    "{} (已触发第 {}/{} 次自愈重试)",
                    audit.details, next_retry, MAX_FALSER_RETRIES
                );
            } else {
                blackboard
                    .update_scene_status(scene_id, SceneStatus::Rejected, None)
                    .await;
                audit.details = format!("{} (已达最大重试上限，挂起等待导演决策)", audit.details);
            }
        }

        blackboard.append_audit_entry(audit.clone()).await;
        Ok(audit)
    }

    /// 消费 TurnSteer 控制帧队列，执行无损切轨重排
    pub async fn apply_turn_steer(
        payload: &TurnSteerPayload,
        blackboard: &Blackboard,
    ) -> Result<(), String> {
        let mut snapshot = blackboard.get_snapshot().await;

        for scene in snapshot.scene_dag.scenes.iter_mut() {
            // 若开启了保全已完成分镜，则跳过 Approved 节点
            if payload.preserve_completed_scenes && scene.status == SceneStatus::Approved {
                continue;
            }

            // 对待办或未拍板的镜头应用纠偏指令
            scene.prompt = format!("{} [切轨指导: {}]", scene.prompt, payload.steer_instruction);
            scene.status = SceneStatus::Pending;
            scene.retry_count = 0;
        }

        blackboard
            .update_scenes(snapshot.scene_dag.scenes, snapshot.scene_dag.edges)
            .await;
        blackboard
            .append_audit_entry(AuditLogEntry {
                entry_id: format!("audit_{}", Uuid::now_v7()),
                scene_id: "turn_steer".to_string(),
                action: "TURN_STEER_INJECTED".to_string(),
                details: format!(
                    "无损切轨控制帧消费完成: {} (保全前序分镜: {})",
                    payload.steer_instruction, payload.preserve_completed_scenes
                ),
                checks: vec![],
                timestamp: chrono::Utc::now().timestamp_millis() as f64,
            })
            .await;

        Ok(())
    }
}
