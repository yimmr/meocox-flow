use std::path::Path;
use std::sync::Arc;
use crate::blackboard::types::{BattleBranch, StoryboardSceneNode, StyleBible};
use crate::orchestrator::types::{AssetId, AssetMetadata};
use crate::pipeline::SoundEffectType;
use crate::storage::StorageManager;

/// 专职视觉生成工 (Visual Worker)
pub struct VisualWorker;

impl VisualWorker {
    /// 为指定分镜生成视觉资产并落盘至 .flow/derived/visual/
    pub async fn render_scene_visual(
        derived_root: &Path,
        scene: &StoryboardSceneNode,
        style: &StyleBible,
        storage: &Arc<StorageManager>,
    ) -> Result<AssetMetadata, String> {
        let visual_dir = derived_root.join("visual");
        if !visual_dir.exists() {
            tokio::fs::create_dir_all(&visual_dir)
                .await
                .map_err(|e| format!("Failed to create visual dir: {e}"))?;
        }

        let asset_id = AssetId::new_v7();
        let filename = format!("{}.svg", asset_id.0);
        let out_path = visual_dir.join(&filename);

        // 生成高精度的分镜代理矢量渲染帧 (Handle-Only 本地落盘)
        let primary_color = style.palette.first().cloned().unwrap_or_else(|| "#0F172A".to_string());
        let accent_color = style.palette.get(2).cloned().unwrap_or_else(|| "#38BDF8".to_string());

        let svg_content = format!(
            r###"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{primary_color}" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)"/>
  <rect x="40" y="40" width="1200" height="640" fill="none" stroke="{accent_color}" stroke-opacity="0.3" stroke-width="2" stroke-dasharray="10 5"/>
  <circle cx="640" cy="360" r="180" fill="none" stroke="{accent_color}" stroke-opacity="0.2" stroke-width="1"/>
  <text x="80" y="100" fill="#94A3B8" font-family="sans-serif" font-size="20" letter-spacing="2">SCENE #{scene_num} | {shot_type}</text>
  <text x="80" y="140" fill="#F8FAFC" font-family="sans-serif" font-size="28" font-weight="bold">{camera_movement}</text>
  <rect x="80" y="180" width="1120" height="2" fill="{accent_color}" opacity="0.6"/>
  <text x="80" y="240" fill="#E2E8F0" font-family="sans-serif" font-size="22" max-width="1000">PROMPT: {prompt}</text>
  <text x="80" y="600" fill="#64748B" font-family="sans-serif" font-size="16">STYLE: {style_name} | LIGHTING: {lighting}</text>
  <text x="80" y="640" fill="{accent_color}" font-family="sans-serif" font-size="14">ASSET_ID: {asset_id_str}</text>
</svg>"###,
            primary_color = primary_color,
            accent_color = accent_color,
            scene_num = scene.scene_num,
            shot_type = scene.shot_type,
            camera_movement = scene.camera_movement,
            prompt = scene.prompt,
            style_name = style.name,
            lighting = style.lighting,
            asset_id_str = asset_id.0
        );

        tokio::fs::write(&out_path, svg_content)
            .await
            .map_err(|e| format!("Failed to write visual asset: {e}"))?;

        let now = chrono::Utc::now().timestamp_millis() as f64;
        let meta = AssetMetadata {
            id: asset_id.clone(),
            name: format!("镜头 #{} 视觉关键帧", scene.scene_num),
            media_type: "image".to_string(),
            local_path: out_path.to_string_lossy().to_string(),
            asset_url: format!("asset://localhost/{}", asset_id.0),
            duration_ms: Some((scene.duration_sec * 1000.0) as f64),
            summary: format!("分镜 #{} 视觉代理帧: {}", scene.scene_num, scene.prompt),
            created_at: now,
        };

        storage.insert_asset(&meta)?;
        Ok(meta)
    }

    /// 为重点分镜派生双分支（Battle Mode 竞技场变体）
    pub async fn render_battle_branches(
        derived_root: &Path,
        scene: &StoryboardSceneNode,
        _style: &StyleBible,
        storage: &Arc<StorageManager>,
    ) -> Result<Vec<BattleBranch>, String> {
        let visual_dir = derived_root.join("visual").join("battle");
        if !visual_dir.exists() {
            tokio::fs::create_dir_all(&visual_dir)
                .await
                .map_err(|e| format!("Failed to create battle dir: {e}"))?;
        }

        // Branch A: 经典电影调色
        let asset_a = AssetId::new_v7();
        let path_a = visual_dir.join(format!("{}_branch_a.svg", asset_a.0));
        let svg_a = format!(
            r###"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#0B132B"/>
  <text x="640" y="320" fill="#E0FBFC" font-size="36" text-anchor="middle" font-weight="bold">BRANCH A: 经典电影暖调</text>
  <text x="640" y="380" fill="#64748B" font-size="20" text-anchor="middle">细腻肤色 / 柔和自然逆光 / 35mm胶片颗粒</text>
  <text x="640" y="440" fill="#38BDF8" font-size="16" text-anchor="middle">ASSET: {}</text>
</svg>"###,
            asset_a.0
        );
        tokio::fs::write(&path_a, svg_a).await.map_err(|e| e.to_string())?;

        storage.insert_asset(&AssetMetadata {
            id: asset_a.clone(),
            name: format!("镜头 #{} 变体 A (电影暖调)", scene.scene_num),
            media_type: "image".to_string(),
            local_path: path_a.to_string_lossy().to_string(),
            asset_url: format!("asset://localhost/{}", asset_a.0),
            duration_ms: Some((scene.duration_sec * 1000.0) as f64),
            summary: "变体 A: 经典电影柔和逆光胶片质感".to_string(),
            created_at: chrono::Utc::now().timestamp_millis() as f64,
        })?;

        // Branch B: 赛博高对比度霓虹
        let asset_b = AssetId::new_v7();
        let path_b = visual_dir.join(format!("{}_branch_b.svg", asset_b.0));
        let svg_b = format!(
            r###"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#1C0028"/>
  <text x="640" y="320" fill="#F43F5E" font-size="36" text-anchor="middle" font-weight="bold">BRANCH B: 赛博霓虹先锋调</text>
  <text x="640" y="380" fill="#E2E8F0" font-size="20" text-anchor="middle">冷暖色冲突 / 强烈丁达尔光束 / 超现实光晕</text>
  <text x="640" y="440" fill="#F43F5E" font-size="16" text-anchor="middle">ASSET: {}</text>
</svg>"###,
            asset_b.0
        );
        tokio::fs::write(&path_b, svg_b).await.map_err(|e| e.to_string())?;

        storage.insert_asset(&AssetMetadata {
            id: asset_b.clone(),
            name: format!("镜头 #{} 变体 B (赛博霓虹)", scene.scene_num),
            media_type: "image".to_string(),
            local_path: path_b.to_string_lossy().to_string(),
            asset_url: format!("asset://localhost/{}", asset_b.0),
            duration_ms: Some((scene.duration_sec * 1000.0) as f64),
            summary: "变体 B: 赛博霓虹先锋色调".to_string(),
            created_at: chrono::Utc::now().timestamp_millis() as f64,
        })?;

        Ok(vec![
            BattleBranch {
                branch_id: "branch_a".to_string(),
                label: "方案 A：经典电影暖调 (柔和逆光)".to_string(),
                asset_id: asset_a,
                prompt_variant: format!("{}, 35mm film, warm cinematic lighting, natural bokeh", scene.prompt),
                is_winner: false,
            },
            BattleBranch {
                branch_id: "branch_b".to_string(),
                label: "方案 B：赛博霓虹先锋 (冷暖冲突)".to_string(),
                asset_id: asset_b,
                prompt_variant: format!("{}, cyberpunk neon, anamorphic flare, intense contrast, volumetric rays", scene.prompt),
                is_winner: false,
            },
        ])
    }
}

/// 专职音频工 (Audio Worker)
pub struct AudioWorker;

impl AudioWorker {
    /// 为分镜生成程序化音效并落盘至 .flow/derived/audio/
    pub async fn render_scene_audio(
        derived_root: &Path,
        scene: &StoryboardSceneNode,
        storage: &Arc<StorageManager>,
    ) -> Result<AssetMetadata, String> {
        let audio_dir = derived_root.join("audio");
        if !audio_dir.exists() {
            tokio::fs::create_dir_all(&audio_dir)
                .await
                .map_err(|e| format!("Failed to create audio dir: {e}"))?;
        }

        let asset_id = AssetId::new_v7();
        let filename = format!("{}.wav", asset_id.0);
        let out_path = audio_dir.join(&filename);

        // 根据运镜或时长智能选择 PCM 合成类型
        let (sound_type, dur) = if scene.duration_sec >= 5.0 {
            (SoundEffectType::TechAmbient, scene.duration_sec)
        } else if scene.camera_movement.contains("推") || scene.camera_movement.contains("移") {
            (SoundEffectType::Whoosh, scene.duration_sec.min(0.8))
        } else {
            (SoundEffectType::Chime, scene.duration_sec.min(1.2))
        };

        match sound_type {
            SoundEffectType::Whoosh => {
                crate::pipeline::generate_whoosh_wav(&out_path, Some(dur)).await?;
            }
            SoundEffectType::Chime => {
                crate::pipeline::generate_chime_wav(&out_path, Some(dur)).await?;
            }
            SoundEffectType::TechAmbient => {
                crate::pipeline::generate_tech_ambient_bgm(&out_path, Some(dur)).await?;
            }
        }

        let now = chrono::Utc::now().timestamp_millis() as f64;
        let meta = AssetMetadata {
            id: asset_id.clone(),
            name: format!("镜头 #{} 音频配合", scene.scene_num),
            media_type: "audio".to_string(),
            local_path: out_path.to_string_lossy().to_string(),
            asset_url: format!("asset://localhost/{}", asset_id.0),
            duration_ms: Some((dur * 1000.0) as f64),
            summary: format!("分镜 #{} 纯数学 16-bit PCM 合成音效", scene.scene_num),
            created_at: now,
        };

        storage.insert_asset(&meta)?;
        Ok(meta)
    }
}
