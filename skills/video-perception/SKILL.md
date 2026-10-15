---
name: video-perception
title: 视频多模态结构化透镜技能
description: 将本地物理视频切分场景、探测时长、景别与运动特征，输出结构化事实卡片并利用CAS强缓存
category: perception
tags: [video, lens, scene-detection, probe, cas-cache]
---

# 视频多模态结构化透镜技能 (Video Perception SOP)

本技能供内容感知专员（Perception Specialist）专职使用，负责以绝对物理路径读取本地视频文件，提取纯粹的视听事实，严禁参与任何上层业务创意或剧本决策。

---

## 1. 核心流程与 CAS 强缓存策略
1. **计算资产指纹**：依据目标视频文件的路径与物理哈希值生成 CAS Key。
2. **命中缓存判断**：优先查询本地持久化缓存（`get_perception_cache`）。若已存在分析事实，立即直接复用，0 Token / 0 耗时完成。
3. **未命中时调用原生探针**：
   - 调用底层探针工具（`probe_video_content` / `inspect_video_content`）；
   - 获取客观物理信息：文件格式、时长、分辨率、编码、帧率（FPS）。
   - 提取场景硬切点时间戳序列与镜头段落。

## 2. 结构化输出规范
提取结果必须严格打包为《视频客观感知卡片》：
```json
{
  "assetPath": "D:/assets/clip.mp4",
  "specs": {
    "durationSec": 45.2,
    "resolution": "1920x1080",
    "fps": 60,
    "codec": "h264"
  },
  "scenes": [
    { "index": 1, "startSec": 0.0, "endSec": 3.5, "shotType": "Close-Up", "motion": "high" },
    { "index": 2, "startSec": 3.5, "endSec": 12.0, "shotType": "Wide Shot", "motion": "medium" }
  ],
  "visualTags": ["游戏战斗", "暗色调", "UI血条存在", "特效粒子丰富"]
}
```

## 3. 严格边界约束
- **绝对客观**：只描述画面中“有什么、什么在运动、转场点在哪里”；
- **禁止脑补**：严禁给出“建议剪辑成爆款短视频”等任何主观创意建议。
