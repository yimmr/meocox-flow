---
name: code-as-video-catalog
title: 确定性代码动效组件库规范与 Schema
description: Remotion 4 大原子动效组件 (科技终端/数据图表/架构拓扑/动态文字) 的结构化参数与组装契约
category: motion
tags: [remotion, components, schema, tech-terminal, charts, architecture]
---

# 确定性代码动效组件库规范 (Code-as-Video Component Catalog)

Code Motion Engineer 智能体在组装分镜动效时，必须严格遵守本目录定义的 4 大原子组件及其参数 Schema。

---

## 1. `TechTerminal` (科技 CLI 终端与代码演进)
适用于：软件教程、架构部署、命令行实操、技术解析。

```json
{
  "componentType": "TechTerminal",
  "props": {
    "title": "系统部署与执行",
    "fileName": "pipeline.config.ts",
    "command": "pnpm meocox build:sea",
    "codeLines": [
      "import { LeadOrchestrator } from '@meocox/core';",
      "const orchestrator = new LeadOrchestrator();",
      "await orchestrator.runPipeline();"
    ],
    "highlightLine": 2,
    "output": "✔ 渲染完成: 4K 60fps 动效已导出 (1.8s)",
    "theme": "dark"
  }
}
```

---

## 2. `DataChart` (高精数据图表与效能对比)
适用于：参数测评、性能跑分、商业泛知识、前后对比。

```json
{
  "componentType": "DataChart",
  "props": {
    "chartType": "bar",
    "title": "全链路渲染确定性与准确率",
    "subtitle": "代码驱动动效 vs 纯文生视频模型",
    "data": [
      { "label": "文字排版准确率", "value": 100, "compareValue": 32, "unit": "%" },
      { "label": "数据图表真实度", "value": 100, "compareValue": 18, "unit": "%" },
      { "label": "按帧微调自由度", "value": 100, "compareValue": 5, "unit": "%" }
    ]
  }
}
```

---

## 3. `ArchitectureFlow` (架构拓扑与状态机流转)
适用于：技术架构原理、业务流转、DAG 任务状态、机制解析。

```json
{
  "componentType": "ArchitectureFlow",
  "props": {
    "title": "双模工作流状态机",
    "flowType": "horizontal",
    "nodes": [
      { "id": "1", "label": "Plan Mode", "role": "只读意图与拓扑推演", "status": "completed" },
      { "id": "2", "label": "HITL Gate", "role": "人机审批卡片", "status": "active" },
      { "id": "3", "label": "Act Mode", "role": "原子化执行与验证", "status": "pending" },
      { "id": "4", "label": "Verification", "role": "物理快照与自愈闭环", "status": "pending" }
    ]
  }
}
```

---

## 4. `KineticTypography` (动态大字概念排版)
适用于：黄金 3 秒开篇 Hook、痛点强调、金句提炼、知识小结。

```json
{
  "componentType": "KineticTypography",
  "props": {
    "hookText": "别再被 AI 视频变形所困扰",
    "highlightWord": "确定性渲染",
    "caption": "代码驱动动效 · 毫秒级字音对齐 · 零幻觉",
    "tags": ["React 19", "Remotion", "TypeScript", "Deterministic"]
  }
}
```
