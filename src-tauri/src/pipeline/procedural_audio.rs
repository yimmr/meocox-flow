//! 零依赖 16-bit PCM 原生免版税音效生成器 (GEM-02 移植)
//! 支持毫秒级生成场景转场 Whoosh、成功提示音 Chime 及科技氛围 Lo-Fi BGM。

use std::f32::consts::PI;
use std::path::Path;
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub enum SoundEffectType {
    Whoosh,
    Chime,
    TechAmbient,
}

/// 写入标准 16-bit PCM WAV 文件（44 字节标准 RIFF 头，无外部依赖）
pub async fn write_wav_file(
    file_path: &Path,
    samples: &[f32],
    sample_rate: u32,
    num_channels: u16,
) -> Result<(), String> {
    if let Some(parent) = file_path.parent() {
        if !parent.exists() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create parent dir: {e}"))?;
        }
    }

    let bytes_per_sample: u16 = 2; // 16-bit
    let block_align: u16 = num_channels * bytes_per_sample;
    let byte_rate: u32 = sample_rate * (block_align as u32);
    let data_size: u32 = (samples.len() as u32) * (bytes_per_sample as u32);
    let total_file_size: u32 = 36 + data_size;

    let mut buffer = Vec::with_capacity(44 + (data_size as usize));

    // RIFF Header
    buffer.extend_from_slice(b"RIFF");
    buffer.extend_from_slice(&total_file_size.to_le_bytes());
    buffer.extend_from_slice(b"WAVE");

    // fmt subchunk
    buffer.extend_from_slice(b"fmt ");
    buffer.extend_from_slice(&16u32.to_le_bytes()); // Subchunk1Size for PCM
    buffer.extend_from_slice(&1u16.to_le_bytes());  // AudioFormat = 1 (PCM)
    buffer.extend_from_slice(&num_channels.to_le_bytes());
    buffer.extend_from_slice(&sample_rate.to_le_bytes());
    buffer.extend_from_slice(&byte_rate.to_le_bytes());
    buffer.extend_from_slice(&block_align.to_le_bytes());
    buffer.extend_from_slice(&16u16.to_le_bytes()); // BitsPerSample

    // data subchunk
    buffer.extend_from_slice(b"data");
    buffer.extend_from_slice(&data_size.to_le_bytes());

    // 16-bit Signed PCM Samples
    for &sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let val = if clamped < 0.0 {
            (clamped * 32768.0).round() as i16
        } else {
            (clamped * 32767.0).round() as i16
        };
        buffer.extend_from_slice(&val.to_le_bytes());
    }

    tokio::fs::write(file_path, &buffer)
        .await
        .map_err(|e| format!("Failed to write wav file: {e}"))?;

    Ok(())
}

/// 简单确定性线性同余随机数发生器（避免外部 rand crate 依赖）
struct FastRng(u32);
impl FastRng {
    fn new(seed: u32) -> Self {
        Self(seed)
    }
    fn next_f32(&mut self) -> f32 {
        self.0 = self.0.wrapping_mul(1664525).wrapping_add(1013904223);
        (self.0 as f32) / (u32::MAX as f32) * 2.0 - 1.0
    }
}

/// 生成场景转场 Whoosh 音效 (默认 0.45s, 44.1kHz, 立体声)
pub async fn generate_whoosh_wav(file_path: &Path, duration_sec: Option<f32>) -> Result<(), String> {
    let duration = duration_sec.unwrap_or(0.45);
    let sample_rate = 44100u32;
    let total_samples = (duration * (sample_rate as f32)) as usize;
    let mut stereo_samples = vec![0.0f32; total_samples * 2];
    let mut rng = FastRng::new(42);

    for i in 0..total_samples {
        let t = (i as f32) / (total_samples as f32); // 0.0 to 1.0
        let env = (t * PI).sin().powi(2);
        let freq = 200.0 + (t * PI).sin() * 600.0;
        let phase = 2.0 * PI * freq * ((i as f32) / (sample_rate as f32));
        let sine = phase.sin() * 0.4;
        let noise = rng.next_f32() * 0.35;
        let sample = (sine + noise) * env * 0.8;

        stereo_samples[i * 2] = sample * (1.0 - t * 0.3);
        stereo_samples[i * 2 + 1] = sample * (0.7 + t * 0.3);
    }

    write_wav_file(file_path, &stereo_samples, sample_rate, 2).await
}

/// 生成成功提示音 Chime / Ding (默认 0.8s, 44.1kHz, 立体声)
pub async fn generate_chime_wav(file_path: &Path, duration_sec: Option<f32>) -> Result<(), String> {
    let duration = duration_sec.unwrap_or(0.8);
    let sample_rate = 44100u32;
    let total_samples = (duration * (sample_rate as f32)) as usize;
    let mut stereo_samples = vec![0.0f32; total_samples * 2];

    let base_freq1 = 659.25f32; // E5
    let base_freq2 = 987.77f32; // B5

    for i in 0..total_samples {
        let t = (i as f32) / (sample_rate as f32);
        let env = (-t * 4.5).exp();
        let s1 = (2.0 * PI * base_freq1 * t).sin() * 0.4;
        let s2 = (2.0 * PI * base_freq2 * t).sin() * 0.3;
        let harmonic = (2.0 * PI * base_freq1 * 2.0 * t).sin() * 0.15;
        let sample = (s1 + s2 + harmonic) * env * 0.7;

        stereo_samples[i * 2] = sample;
        stereo_samples[i * 2 + 1] = sample;
    }

    write_wav_file(file_path, &stereo_samples, sample_rate, 2).await
}

/// 生成科技感 Lo-Fi 背景音乐 (默认 16s 循环)
pub async fn generate_tech_ambient_bgm(file_path: &Path, duration_sec: Option<f32>) -> Result<(), String> {
    let duration = duration_sec.unwrap_or(16.0);
    let sample_rate = 44100u32;
    let total_samples = (duration * (sample_rate as f32)) as usize;
    let mut stereo_samples = vec![0.0f32; total_samples * 2];

    let chords: [[f32; 3]; 4] = [
        [146.83, 220.00, 329.63], // Dm
        [130.81, 196.00, 261.63], // C
        [116.54, 174.61, 261.63], // Bb
        [130.81, 196.00, 293.66], // C
    ];

    let chord_dur = 4.0f32;

    for i in 0..total_samples {
        let t = (i as f32) / (sample_rate as f32);
        let chord_idx = ((t / chord_dur) as usize) % chords.len();
        let current_chord = chords[chord_idx];

        let lfo = 0.8 + 0.2 * (2.0 * PI * 0.25 * t).sin();
        let mut chord_signal = 0.0f32;
        for &f in current_chord.iter() {
            chord_signal += (2.0 * PI * f * t).sin() * 0.12;
        }

        let beat_time = t % 1.0;
        let kick = if beat_time < 0.1 {
            (2.0 * PI * (60.0 - beat_time * 300.0) * beat_time).sin() * (-beat_time * 30.0).exp() * 0.25
        } else {
            0.0
        };

        let mut master_env = 1.0f32;
        if t < 1.0 {
            master_env = t;
        } else if t > duration - 1.5 {
            master_env = ((duration - t) / 1.5).max(0.0);
        }

        let val = (chord_signal * lfo + kick) * master_env * 0.6;
        stereo_samples[i * 2] = val;
        stereo_samples[i * 2 + 1] = val;
    }

    write_wav_file(file_path, &stereo_samples, sample_rate, 2).await
}
