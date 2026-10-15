---
name: doc-perception
title: 文档与长文本结构化大纲提炼技能
description: 解析本地文本、Markdown、文档资料，提取核心大纲、章节结构与关键实体列表
category: perception
tags: [document, text, outline, markdown, summary]
---

# 文档与长文本结构化大纲提炼技能 (Document Perception SOP)

本技能供内容感知专员专职使用，负责快速提炼外部输入的长文本文档、脚本资料或规则说明，生成紧凑的结构化知识大纲，防止海量文本直接撑爆主脑上下文。

---

## 1. 核心解析维度
1. **层次化大纲提取**：章节标题、层级结构。
2. **核心实体与词条提取**：角色名称、关卡地点、核心机制术语。
3. **内容要点提炼**：去除冗长套话，按 300~500 字摘要输出。

## 2. 结构化输出规范
输出为《文档大纲事实卡片》：
```json
{
  "assetPath": "D:/assets/story_draft.md",
  "wordCount": 3500,
  "outline": [
    { "chapter": 1, "title": "开局伏笔", "keyEvents": ["主角苏醒", "遭遇强敌"] },
    { "chapter": 2, "title": "首战告捷", "keyEvents": ["释放终结技", "获得神器"] }
  ],
  "entities": ["孙悟空", "金箍棒", "黑风山"],
  "briefSummary": "本篇讲述主角在黑风山遭遇初期考验并击溃头目的完整流程。"
}
```
