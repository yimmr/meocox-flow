//! 剪映 / CapCut Pro 工业级草稿组装引擎 (GEM-01 移植)
//! 生成符合剪映专业版最新规范的草稿工程目录（含 draft_content.json 与 draft_meta_info.json）。

use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use serde_json::json;
use specta::Type;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CapCutClipInput {
    pub name: String,
    pub file_path: String,
    pub duration_ms: f64,
    pub subtitle: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CapCutExportResult {
    pub draft_dir: String,
    pub draft_name: String,
    pub total_duration_ms: f64,
    pub clip_count: u32,
}

/// 毫秒转微秒 (1 ms = 1,000 us)
fn ms_to_us(ms: f64) -> i64 {
    (ms * 1000.0).round() as i64
}

/// 构造剪映字幕内部样式 JSON 字符串
fn format_jianying_text(text: &str) -> String {
    let payload = json!({
        "styles": [
            {
                "fill": {
                    "alpha": 1.0,
                    "content": {
                        "render_type": "solid",
                        "solid": {
                            "alpha": 1.0,
                            "color": [1.0, 1.0, 1.0]
                        }
                    }
                },
                "font": {
                    "id": "",
                    "path": ""
                },
                "range": [0, text.chars().count()],
                "size": 9.0
            }
        ],
        "text": text
    });
    payload.to_string()
}

/// 将视频剪辑列表组装导出为剪映 Pro 草稿工程
pub async fn export_capcut_draft(
    target_base_dir: &Path,
    draft_name: &str,
    clips: &[CapCutClipInput],
) -> Result<CapCutExportResult, String> {
    if clips.is_empty() {
        return Err("No clips provided for CapCut draft".to_string());
    }

    let draft_id = format!("draft_{}", Uuid::now_v7());
    let draft_dir: PathBuf = target_base_dir.join(&draft_id);

    tokio::fs::create_dir_all(&draft_dir)
        .await
        .map_err(|e| format!("Failed to create draft directory: {e}"))?;

    let now_us = chrono::Utc::now().timestamp_micros();
    let mut total_duration_us: i64 = 0;

    let mut video_materials = Vec::new();
    let mut text_materials = Vec::new();
    let mut speeds = Vec::new();
    let mut canvases = Vec::new();

    let mut video_segments = Vec::new();
    let mut subtitle_segments = Vec::new();

    // 默认速度配置 (1.0x 正常速度)
    let speed_id = Uuid::now_v7().to_string();
    speeds.push(json!({
        "curve_speed": null,
        "id": speed_id,
        "mode": 0,
        "speed": 1.0,
        "type": "speed"
    }));

    // 默认画布 (16:9 横屏，1080p)
    let canvas_id = Uuid::now_v7().to_string();
    canvases.push(json!({
        "album_image": "",
        "blur": 0.0,
        "color": "",
        "id": canvas_id,
        "image": "",
        "image_id": "",
        "ratio": "16:9",
        "type": "canvas_color"
    }));

    for clip in clips {
        let clip_dur_us = ms_to_us(clip.duration_ms);
        let mat_video_id = Uuid::now_v7().to_string();
        let seg_video_id = Uuid::now_v7().to_string();

        // 规范化文件路径 (斜杠统一)
        let normalized_path = clip.file_path.replace('\\', "/");

        // 1. 视频物料
        video_materials.push(json!({
            "category_id": "",
            "category_name": "local",
            "check_flag": 63487,
            "crop": {
                "lower_left_x": 0.0,
                "lower_left_y": 1.0,
                "lower_right_x": 1.0,
                "lower_right_y": 1.0,
                "upper_left_x": 0.0,
                "upper_left_y": 0.0,
                "upper_right_x": 1.0,
                "upper_right_y": 0.0
            },
            "duration": clip_dur_us,
            "extra_type": "option_default",
            "height": 1080,
            "id": mat_video_id,
            "material_name": clip.name,
            "path": normalized_path,
            "type": "video",
            "width": 1920
        }));

        // 2. 视频轨道片段
        video_segments.push(json!({
            "caption_info": null,
            "cartoon": false,
            "clip": {
                "alpha": 1.0,
                "flip": { "horizontal": false, "vertical": false },
                "rotation": 0.0,
                "scale": { "x": 1.0, "y": 1.0 },
                "transform": { "x": 0.0, "y": 0.0 }
            },
            "enable_adjust": true,
            "enable_color_curves": true,
            "enable_color_wheels": true,
            "enable_lut": true,
            "extra_material_refs": [speed_id, canvas_id],
            "id": seg_video_id,
            "material_id": mat_video_id,
            "render_index": 0,
            "speed": 1.0,
            "target_timerange": {
                "duration": clip_dur_us,
                "start": total_duration_us
            },
            "template_id": "",
            "track_attribute": 0,
            "track_render_index": 0,
            "visible": true,
            "volume": 1.0
        }));

        // 3. 字幕片段 (若存在)
        if let Some(sub_text) = &clip.subtitle {
            if !sub_text.trim().is_empty() {
                let mat_text_id = Uuid::now_v7().to_string();
                let seg_text_id = Uuid::now_v7().to_string();

                text_materials.push(json!({
                    "content": format_jianying_text(sub_text),
                    "id": mat_text_id,
                    "type": "text",
                    "typesetting": 0
                }));

                subtitle_segments.push(json!({
                    "clip": {
                        "alpha": 1.0,
                        "flip": { "horizontal": false, "vertical": false },
                        "rotation": 0.0,
                        "scale": { "x": 1.0, "y": 1.0 },
                        "transform": { "x": 0.0, "y": -0.8 } // 居中偏下
                    },
                    "enable_adjust": false,
                    "id": seg_text_id,
                    "material_id": mat_text_id,
                    "render_index": 1,
                    "speed": 1.0,
                    "target_timerange": {
                        "duration": clip_dur_us,
                        "start": total_duration_us
                    },
                    "visible": true,
                    "volume": 1.0
                }));
            }
        }

        total_duration_us += clip_dur_us;
    }

    // 组装 tracks 轨道
    let mut tracks = Vec::new();

    // 视频主轨
    tracks.push(json!({
        "attribute": 0,
        "flag": 0,
        "id": Uuid::now_v7().to_string(),
        "is_default_name": true,
        "name": "Video Track",
        "segments": video_segments,
        "type": "video"
    }));

    // 字幕轨
    if !subtitle_segments.is_empty() {
        tracks.push(json!({
            "attribute": 0,
            "flag": 0,
            "id": Uuid::now_v7().to_string(),
            "is_default_name": true,
            "name": "Subtitle Track",
            "segments": subtitle_segments,
            "type": "text"
        }));
    }

    // 组装 draft_content.json
    let draft_content = json!({
        "canvas_config": {
            "height": 1080,
            "ratio": "16:9",
            "width": 1920
        },
        "duration": total_duration_us,
        "fps": 30.0,
        "materials": {
            "audio_balances": [],
            "audio_effects": [],
            "audio_fades": [],
            "audios": [],
            "canvases": canvases,
            "chromas": [],
            "color_curves": [],
            "drafts": [],
            "effects": [],
            "masks": [],
            "material_animations": [],
            "material_colors": [],
            "placeholders": [],
            "speeds": speeds,
            "stickers": [],
            "tail_leaders": [],
            "texts": text_materials,
            "transitions": [],
            "video_effects": [],
            "video_trackings": [],
            "videos": video_materials,
            "vocal_separations": []
        },
        "mutable_config": null,
        "name": draft_name,
        "new_version": "100.0.0",
        "relationships": [],
        "tracks": tracks,
        "version": 360000
    });

    let content_json_path = draft_dir.join("draft_content.json");
    tokio::fs::write(&content_json_path, draft_content.to_string())
        .await
        .map_err(|e| format!("Failed to write draft_content.json: {e}"))?;

    // 组装 draft_meta_info.json
    let draft_meta = json!({
        "draft_fold_path": draft_dir.to_string_lossy().replace('\\', "/"),
        "draft_id": draft_id,
        "draft_name": draft_name,
        "tm_draft_create": now_us,
        "tm_draft_modified": now_us,
        "tm_duration": total_duration_us
    });

    let meta_json_path = draft_dir.join("draft_meta_info.json");
    tokio::fs::write(&meta_json_path, draft_meta.to_string())
        .await
        .map_err(|e| format!("Failed to write draft_meta_info.json: {e}"))?;

    Ok(CapCutExportResult {
        draft_dir: draft_dir.to_string_lossy().to_string(),
        draft_name: draft_name.to_string(),
        total_duration_ms: (total_duration_us as f64) / 1000.0,
        clip_count: clips.len() as u32,
    })
}
