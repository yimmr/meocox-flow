---
name: cosyvoice-voiceover
title: CosyVoice 2 本地人声与逐字时间戳对齐法则
description: 阿里开源 CosyVoice 2 (0.5B) 本地语音合成、情感语调控制、零样本音色克隆与 CTC 微秒级字音锁帧规约
category: audio
tags: [cosyvoice, local-tts, voice-cloning, ctc-alignment, timestamps]
---

# CosyVoice 2 本地人声与逐字时间戳对齐法则 (CosyVoice SOP)

本技能由 Voice Scout (本地音频与时间戳专员) 严格遵循，用于完全在本地离线运行广播级旁白生成，拒绝廉价机械音与云端依赖。

---

### 1. 核心定位与原则
- **100% 本地离线**：调度本地 CosyVoice 2 (0.5B) 神经语音大模型，绝不发起第三方不可靠网络 TTS 请求。
- **逐字毫秒锁帧**：输出每一个字的起止毫秒序列 (`words: [{ word, startSec, endSec, startFrame, endFrame }]`)，为后续 Remotion 动效提供精准打击点。
- **4.2 字/秒黄金语速**：严密保持科技教程的最佳信息密度，过慢导致完播率断崖下滑，过快导致受众认知过载。

---

### 2. 情感与声线预设 (Voice Profiles)
1. **`geek_male` (极客科技男声)**：沉稳、自信、节奏明快，适合技术拆解、系统架构与终端实操。
2. **`clarity_female` (知性干练女声)**：清晰、严谨、穿透力强，适合泛知识科普、数据指标与评测对比。
3. **`custom_clone` (3秒自定义克隆)**：使用创作者本地提供的 3~10 秒清晰干音参考音频，直接复刻频道专属声线。

---

### 3. 字音输出协议结构规范
生成的结构化时间轴必须严格对齐如下契约：
```json
{
  "engine": "CosyVoice 2 (Local Open-Source SOTA)",
  "totalDurationSec": 18.5,
  "words": [
    { "word": "还", "startSec": 0.100, "endSec": 0.338, "startFrame": 3, "endFrame": 10 },
    { "word": "在", "startSec": 0.338, "endSec": 0.576, "startFrame": 10, "endFrame": 17 },
    { "word": "忍", "startSec": 0.576, "endSec": 0.814, "startFrame": 17, "endFrame": 24 },
    { "word": "受", "startSec": 0.814, "endSec": 1.052, "startFrame": 24, "endFrame": 32 }
  ]
}
```
Remotion 动效引擎将读取 `startFrame`，实现音画完全锁死，杜绝时序漂移。
