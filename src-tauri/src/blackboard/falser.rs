use std::path::Path;
use uuid::Uuid;
use crate::blackboard::types::{AuditLogEntry, FalserCheckResult, StoryboardSceneNode, StyleBible};
use crate::orchestrator::types::AssetMetadata;

pub const MAX_FALSER_RETRIES: u32 = 3;

/// 知觉连贯性证伪者 (Continuity Falser)
/// 专职刺探成片破绽：资产损坏、音画脱节、PCM 削波与特征漂移
pub struct ContinuityFalser;

impl ContinuityFalser {
    /// 探针 1：资产物理完整性与非空校验
    pub async fn check_asset_integrity(path_str: &str) -> FalserCheckResult {
        let path = Path::new(path_str);
        match tokio::fs::metadata(path).await {
            Ok(meta) => {
                let size = meta.len();
                if size == 0 {
                    FalserCheckResult {
                        passed: false,
                        probe_name: "AssetIntegrity".to_string(),
                        message: format!("资产文件为空 (0 字节): {path_str}"),
                        score: 0.0,
                    }
                } else {
                    FalserCheckResult {
                        passed: true,
                        probe_name: "AssetIntegrity".to_string(),
                        message: format!("资产物理校验正常 (文件大小: {} 字节)", size),
                        score: 1.0,
                    }
                }
            }
            Err(e) => FalserCheckResult {
                passed: false,
                probe_name: "AssetIntegrity".to_string(),
                message: format!("资产文件不存在或无法读取: {e}"),
                score: 0.0,
            },
        }
    }

    /// 探针 2：音画时长对齐与容差校验 (阈值 <= 250ms)
    pub fn check_duration_sync(expected_sec: f32, audio_meta: Option<&AssetMetadata>) -> FalserCheckResult {
        if let Some(audio) = audio_meta {
            if let Some(audio_ms) = audio.duration_ms {
                let expected_ms = (expected_sec * 1000.0) as f64;
                let diff_ms = (audio_ms - expected_ms).abs();
                let tolerance_ms = 250.0;

                if diff_ms <= tolerance_ms {
                    FalserCheckResult {
                        passed: true,
                        probe_name: "DurationSync".to_string(),
                        message: format!("音画时长精确对齐 (偏差: {:.1}ms <= {:.1}ms)", diff_ms, tolerance_ms),
                        score: 1.0 - (diff_ms / tolerance_ms) as f32 * 0.2,
                    }
                } else {
                    FalserCheckResult {
                        passed: false,
                        probe_name: "DurationSync".to_string(),
                        message: format!("音画时长脱节 (分镜画面: {:.1}ms, 音频轨: {:.1}ms, 偏差: {:.1}ms > 阈值 {:.1}ms)", expected_ms, audio_ms, diff_ms, tolerance_ms),
                        score: (1.0 - (diff_ms / 1000.0).min(1.0)) as f32,
                    }
                }
            } else {
                FalserCheckResult {
                    passed: true,
                    probe_name: "DurationSync".to_string(),
                    message: "音频时长元数据未定义，跳过硬性对齐".to_string(),
                    score: 0.9,
                }
            }
        } else {
            FalserCheckResult {
                passed: true,
                probe_name: "DurationSync".to_string(),
                message: "当前分镜无独立音频轨，通过对齐".to_string(),
                score: 1.0,
            }
        }
    }

    /// 探针 3：16-bit PCM 音频削波检测 (Audio Clipping Probe)
    /// 检测音频最大采样振幅，若峰值超过 0.98 FS (即 32111) 标记过载削波
    pub async fn check_audio_clipping(audio_path_str: &str) -> FalserCheckResult {
        let path = Path::new(audio_path_str);
        let bytes = match tokio::fs::read(path).await {
            Ok(b) => b,
            Err(e) => {
                return FalserCheckResult {
                    passed: false,
                    probe_name: "AudioClipping".to_string(),
                    message: format!("无法读取音频文件以分析波形: {e}"),
                    score: 0.0,
                }
            }
        };

        // 简易 WAV 采样解析：跳过 44 字节头部，读取 16-bit 小端 PCM
        if bytes.len() > 44 {
            let data_bytes = &bytes[44..];
            let mut max_abs_sample: i16 = 0;
            for chunk in data_bytes.chunks_exact(2) {
                let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
                let abs_val = sample.saturating_abs();
                if abs_val > max_abs_sample {
                    max_abs_sample = abs_val;
                }
            }

            let peak_ratio = (max_abs_sample as f32) / 32767.0;
            if peak_ratio >= 0.98 {
                FalserCheckResult {
                    passed: false,
                    probe_name: "AudioClipping".to_string(),
                    message: format!("检测到音频严重削波/破音 (峰值电平: {:.3} FS >= 0.980 FS 门禁)", peak_ratio),
                    score: (1.0 - peak_ratio).max(0.0),
                }
            } else {
                FalserCheckResult {
                    passed: true,
                    probe_name: "AudioClipping".to_string(),
                    message: format!("音频动态范围合规 (峰值电平: {:.3} FS < 0.980 FS)", peak_ratio),
                    score: 1.0,
                }
            }
        } else {
            FalserCheckResult {
                passed: true,
                probe_name: "AudioClipping".to_string(),
                message: "未检测到足够数据块，默认合规".to_string(),
                score: 0.9,
            }
        }
    }

    /// 探针 4：视觉风格与特征词一致性校验 (Consistency Probe)
    pub fn check_style_consistency(scene: &StoryboardSceneNode, style: &StyleBible) -> FalserCheckResult {
        let prompt_lower = scene.prompt.to_lowercase();
        let mut score: f32 = 1.0;
        let mut notes = Vec::new();

        // 负面词检测
        let negative_terms: Vec<&str> = style.negative_prompt.split([',', '，']).map(|s| s.trim()).collect();
        for neg in negative_terms {
            if !neg.is_empty() && prompt_lower.contains(&neg.to_lowercase()) {
                score -= 0.3;
                notes.push(format!("命中负面关键词: {}", neg));
            }
        }

        if score >= 0.7 {
            FalserCheckResult {
                passed: true,
                probe_name: "StyleConsistency".to_string(),
                message: format!("视觉特征与 StyleBible 一致性合规 (得分: {:.2})", score),
                score,
            }
        } else {
            FalserCheckResult {
                passed: false,
                probe_name: "StyleConsistency".to_string(),
                message: format!("视觉提示词风格漂移: {}", notes.join("; ")),
                score,
            }
        }
    }

    /// 针对特定分镜节点执行全维度证伪质检
    pub async fn falsify_scene(
        scene: &StoryboardSceneNode,
        style: &StyleBible,
        visual_path: Option<&str>,
        audio_path: Option<&str>,
        audio_meta: Option<&AssetMetadata>,
    ) -> AuditLogEntry {
        let mut checks = Vec::new();

        // 1. 视觉资产物理完整性
        if let Some(v_path) = visual_path {
            checks.push(Self::check_asset_integrity(v_path).await);
        }

        // 2. 音频资产物理完整性与削波检测
        if let Some(a_path) = audio_path {
            checks.push(Self::check_asset_integrity(a_path).await);
            checks.push(Self::check_audio_clipping(a_path).await);
        }

        // 3. 音画时长对齐
        checks.push(Self::check_duration_sync(scene.duration_sec, audio_meta));

        // 4. 风格一致性
        checks.push(Self::check_style_consistency(scene, style));

        let all_passed = checks.iter().all(|c| c.passed);
        let action = if all_passed {
            "FALSER_PASSED".to_string()
        } else {
            "FALSER_REJECTED".to_string()
        };

        let details = if all_passed {
            format!("分镜 #{} 知觉证伪四维质检全部通过", scene.scene_num)
        } else {
            let failed_msgs: Vec<String> = checks
                .iter()
                .filter(|c| !c.passed)
                .map(|c| format!("[{}] {}", c.probe_name, c.message))
                .collect();
            format!("分镜 #{} 质检失败: {}", scene.scene_num, failed_msgs.join(" | "))
        };

        AuditLogEntry {
            entry_id: format!("audit_{}", Uuid::now_v7()),
            scene_id: scene.id.clone(),
            action,
            details,
            checks,
            timestamp: chrono::Utc::now().timestamp_millis() as f64,
        }
    }
}
