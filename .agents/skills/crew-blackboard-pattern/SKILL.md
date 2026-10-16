---
name: crew-blackboard-pattern
description: AIGC 混合编排法则、剧组共享黑板模式（Creative Blackboard）、知觉连贯性证伪者（Continuity Falser）与审美变体竞技场（Battle Mode）设计规范。当设计多智能体分工、状态共享或成片质量控制机制时调用。
---

# 混合编排、“剧组共享黑板制”与审美对抗设计规范

## 一、 混合编排第一准则：确定性骨架 + 局部动态环路

1. **优先使用确定性工作流（Workflows）**：
   - **提示词链（Chaining）**：大纲 → 分场剧本 → 分镜提示词，步骤间设程序化格式校验门禁（Gate）。
   - **端云分级路由（Routing）**：高频低延迟感知（语音转写、静音粗筛、帧特征提取）路由至端侧小模型（SLM）；复杂叙事拆解与跨模态审美评判路由至云端旗舰模型。
   - **切片并行化（Parallelization）**：互不依赖的多个分镜底图或多轨配音并发执行。
2. **克制使用动态智能体（Agents）**：
   - 仅在未知复杂任务拆解（Orchestrator-Workers）或“生成-挑刺重绘闭环（Evaluator-Optimizer）”时放权给模型，且**必须设置硬性最大重试次数上限（Cap Iterations，通常 ≤ 3 次）**以防死循环消耗算力。

## 二、 剧组共享黑板制（Creative Crew Blackboard）

严禁让多个子智能体在聊天框中互相发自然语言讨论。所有专职子智能体（运行在各自隔离的空白上下文窗口中）围绕一块结构化的**中央共享黑板**读写：
- **黑板四大核心结构**：
  1. `Character & Style Bible`（世界观、角色三视图锚点、色板、固定 Seed 与风格权重）
  2. `Scene / Beat DAG`（分镜有向无环图、叙事时长预算、台词与依赖状态）
  3. `Multi-track Timeline`（基于 OpenTimelineIO 的多轨时间轴非破坏性切点）
  4. `Asset Pool & Audit Log`（候选媒体 `asset_id` 句柄列表及证伪质检记录）
- **五大核心剧组角色**：`Director`（导演统筹）、`Visual Stylist`（视觉分镜生成）、`Audio Designer`（配乐音效与卡点）、`Timeline Assembler`（多轨剪辑合成）、`Continuity Falser`（连贯性对抗证伪者）。

## 三、 知觉证伪者（Continuity Falser）与变体竞技场（Battle Mode）

1. **Continuity Falser（守住质量底线）**：专门以“破坏者”视角刺探成片破绽（跨镜头人脸/服装漂移、手部畸变、视线跳轴、字幕与人声波形脱节）。发现破绽直接在黑板上标记 `REJECTED` 并附带局部重绘坐标。
2. **Aesthetic Battle Mode（攻克主观审美）**：针对核心高潮镜头，在隔离分支中派生 2~3 个不同美学方向的变体，由前端分镜面板并排呈现供人类一键盲测对决，胜出方案的参数自动回写至黑板设定集。

> 详细的五种编排模式选型表与黑板状态流转细节，请读取 `references/blackboard-and-falser.md`。
