---
name: audio-perception
title: 音频声学特征与节奏卡点感知技能
description: 分析本地音频文件的声学特征、ASR台词字幕、BGM节奏节拍点(Beat Grid)与静音区段
category: perception
tags: [audio, acoustic, asr, bpm, beat-sync]
---

# 音频声学特征与节奏卡点感知技能 (Audio Perception SOP)

本技能供内容感知专员专职使用，负责解析音频/视频文件中的音轨数据，提取客观声学特征，为后续剪辑对齐提供物理基准。

---

## 1. 核心解析维度
1. **基础声学参数**：采样率、声道数、比特率、总时长。
2. **节奏与节拍网络 (Beat Grid)**：
   - 估算主曲速（BPM，如 128 BPM）；
   - 提取强拍（Downbeat）与能量峰值时间戳（毫秒级对齐点）。
3. **语音识别与字幕 (ASR Transcript)**：
   - 将有效人声提取为逐句文本与起止时间区间（`startSec` ~ `endSec`）；
   - 识别静音停顿区间（Silence Ranges，供切片剪辑参考）。

## 2. 结构化输出规范
输出必须封装为《音频声学特征卡片》：
```json
{
  "assetPath": "D:/assets/bgm.mp3",
  "specs": {
    "durationSec": 64.0,
    "sampleRate": 44100,
    "channels": 2
  },
  "rhythm": {
    "bpm": 128,
    "peakTimePointsSec": [0.0, 3.75, 7.5, 11.25, 15.0]
  },
  "transcript": [
    { "text": "欢迎来到本次战役复盘", "startSec": 1.2, "endSec": 3.4 }
  ],
  "silenceRanges": [
    { "startSec": 3.5, "endSec": 5.1 }
  ]
}
```

## 3. 严格边界
- 严禁评估音频好听与否；
- 严禁擅自裁剪音频，只负责输出客观声学切点与时间戳。
