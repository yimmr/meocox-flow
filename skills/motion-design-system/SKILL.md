---
name: motion-design-system
title: 全领域动效设计系统与视听规约
description: 确立 60fps/30fps 确定性代码动效视听法则、缓动曲线、配色网格与画音时序对齐规约
category: motion
tags: [motion, remotion, code-as-video, design-system, timing]
---

# 全领域动效设计系统与视听规约 (Motion Design System SOP)

本技能由 Motion Director 与 Code Motion Engineer 共同遵循，用于确保“代码即视频 (Code-as-Video)”具备工业级的视觉质感与微秒级音画同步。

---

## 1. 核心设计哲学：100% 确定性与零幻觉

传统文生视频模型在处理文字、图表、UI 时存在不可克服的变形与幻觉。本系统坚决贯彻：
- **像素级坐标与高保真矢量**：文字排版 100% 清晰，代码缩进 100% 精确，图表数值 100% 真实。
- **时间轴纯函数映射**：画面状态由当前帧序号 `frame` 决定，即 `State = f(frame)`，杜绝时序漂移。
- **参数与内容解耦**：视觉组件由结构化 JSON Props 驱动，文案与数据修改毫秒级生效，无需重新生成整片。

---

## 2. 动效视听三大定律

1. **黄金 3 秒视觉锚点 (Hook Law)**：
   - 视频前 3 秒禁止静态等待或冗长铺垫。
   - 必须使用 `KineticTypography` 词级弹入或 `TechTerminal` 命令爆破，配合重音音效瞬间锁定受众注意力。
2. **知识密度与时序留白 (Pacing Law)**：
   - 教程与科技解说语速标准：**4.0 ~ 4.5 字/秒**。
   - 单幕动效持续时间控制在 **3 ~ 6 秒** 之间，超过 6 秒受众注意力显著下降，必须切换镜头视角或组件动效。
3. **物理缓动与有机运动 (Spring & Easing Law)**：
   - 严禁机械匀速运动（Linear Motion）。
   - 弹入动画必须采用弹性物理阻尼（Remotion `spring`：`damping: 12, mass: 0.5, stiffness: 100`）。
   - 位移与淡入淡出采用三次方缓动曲线（`easeInOutCubic`）。

---

## 3. 标准色彩与设计规范 (Design Tokens)

- **科技极客暗黑主题 (Default Geek Dark)**：
  - 背景基底：`#090D16` / `#06080D`
  - 强调主色：`#0EA5E9` (Cyan 500) / `#38BDF8` (Sky 400)
  - 成功/执行高亮：`#10B981` (Emerald 500)
  - 警告/对比强调：`#F59E0B` (Amber 500) / `#EC4899` (Pink 500)
  - 文本层级：主标题 `#F8FAFC`，正文 `#94A3B8`，代码 `#E2E8F0`
- **栅格系统**：1920x1080 (16:9 横屏) 与 1080x1920 (9:16 竖屏短视频) 自适应。
