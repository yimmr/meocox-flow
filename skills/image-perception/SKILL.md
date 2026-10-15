---
name: image-perception
title: 图像视觉风格与OCR文字感知技能
description: 解析本地静态图片的主体构图、色调风格、画风类型及画面内嵌入的OCR文字
category: perception
tags: [image, vision, ocr, style, composition]
---

# 图像视觉风格与OCR文字感知技能 (Image Perception SOP)

本技能供内容感知专员专职使用，负责解析静态图片（如插画、截图、海报、纹理），将其特征转化为纯文本结构化描述。

---

## 1. 核心解析维度
1. **构图与主体**：画面中心主体（人物、道具、场景）、景深、三分线布局。
2. **色彩与风格**：主色调（暖色/冷色/高对比）、画风类别（超写实、动漫二次元、赛博朋克、古风水墨）。
3. **屏幕文字 (OCR)**：提取画面中显式出现的标题、字幕或UI文字，并记录大致坐标范围。

## 2. 结构化输出规范
输出为《图像视觉特征卡片》：
```json
{
  "assetPath": "D:/assets/cover.png",
  "dimensions": { "width": 1920, "height": 1080, "aspectRatio": "16:9" },
  "style": {
    "genre": "暗黑奇幻写实",
    "dominantColors": ["#1a1a2e", "#e94560"],
    "lighting": "高对比侧逆光"
  },
  "subjects": ["身披金甲的战士", "巨大的战斧"],
  "ocrText": ["第一章：大圣归来"]
}
```
