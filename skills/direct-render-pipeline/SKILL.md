---
name: direct-render-pipeline
title: Remotion 确定性直接出片与硬件加速压制法则
description: 脱离剪映直接输出 1080P/4K 60fps MP4、FFmpeg 硬件加速压制、多轨道动态混音与画质标准
category: render
tags: [remotion, direct-render, ffmpeg, no-jianying, 60fps, hw-accel]
---

# Remotion 确定性直接出片法则 (Direct Render SOP)

本技能由 Render Officer (直接渲染出片总监) 专职执行，目标是**彻底摆脱外部剪映软件的繁琐导入流程，一键在本地输出工业级 MP4 最终成片**。

---

### 1. 核心渲染哲学
1. **零外部剪辑软件依赖**：直接在应用内完成音视频合成压制，用户无需安装、打开剪映或手动对轨。
2. **硬件加速优先 (NVENC / QSV / AMF)**：调用本地高性能 FFmpeg 8.x 硬件编解码器，大幅缩短压制时间。
3. **音轨动态混音 (Audio Ducking)**：
   - 主人声旁白（CosyVoice 2 输出）置于主声道，保证清晰度。
   - UI 动效音效（按键、点击、弹窗）在发生动作时即时触发。
   - 背景音乐（BGM）在有人声说话时自动衰减 -8dB，人声停顿时平滑回升。

---

### 2. 标准导出规格矩阵
- **标准横屏 (B站/YouTube/技术演播)**：`1920x1080` 或 `3840x2160 (4K)`，帧率 `60fps`，视频码率 `8000k~16000k`，音频码率 `320k` AAC。
- **竖屏短视频 (抖音/小红书/Shorts)**：`1080x1920`，帧率 `60fps`。
- **色彩空间**：`yuv420p`，色彩矩阵 `bt709`，保证全平台播放设备不偏色、不发灰。
