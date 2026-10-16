---
name: aigc-system-topology
description: AIGC 智能体六层解耦系统架构、脑壳分离（Daemon-First）守护引擎与端到端数据流设计规范。当规划系统模块划分、前后端通信拓扑或新业务全链路流转时调用。
---

# AIGC 智能体六层解耦架构与守护引擎设计规范

## 一、 核心设计思想：大模型是 CPU，Harness 是操作系统

构建 AIGC 智能体应用时，绝不能将其设计成“前端聊天框直接调大模型 API”。系统必须被设计为一套围绕多模态大模型运转的**智能体运行框架（Agentic Harness）与人机控制平面（Control Plane）**。

## 二、 脑壳分离（Daemon-First）物理拓扑准则

1. **独立常驻守护进程（Core Daemon）**：
   - 负责维护会话状态机、多模态渲染任务队列、共享黑板数据、本地媒体存储池索引与外部 MCP 连接。
   - 守护进程独立于 UI 窗口存活。前端崩溃、窗口关闭或网络闪断时，后台正在排队的视频生成与转码任务继续平稳执行。
2. **轻量表现外壳（Presentation Shell）**：
   - 仅负责渲染双栏协同画布、声明式生成式 UI 卡片（A2UI）、低延迟预览流，并通过流式 RPC 协议（带分块背压控制 Backpressure）与后台守护进程同步状态。
   - 重新打开窗口时，通过单调递增的会话与步骤标识（UUIDv7）瞬时续接进度。

## 三、 六层解耦职责边界

系统自顶向下严格划分为六个解耦层级，严禁跨层硬编码耦合：
1. **L1 交互控制平面层（Creative Control Plane）**：三级介入入口、双栏画布、声明式 GenUI 卡片、中途动态切轨（TurnSteer）。
2. **L2 导演编排中枢层（Director & Orchestrator）**：先验规划门禁（Plan Gate）、确定性/动态混合编排器、端云算力分级路由器。
3. **L3 剧组专职角色层（Creative Crew & Blackboard）**：多模态共享黑板、隔离上下文的专职生成角色、连贯性证伪者（Falser）、审美竞技场。
4. **L4 技能与媒体管线层（Skills, MCP & Pipelines）**：三级渐进式 `SKILL.md`、MCP 标准总线、防错型原子接口（ACI）、批处理媒体合成管线。
5. **L5 安全护栏与沙箱层（Safety, Quota & Sandbox）**：原始资产物理只读防线、算力预算守卫（Quota Guardian）、影子预演区、零凭证隔离沙箱。
6. **L6 时间轴与世界观记忆层（Timeline State & Worldview）**：UUIDv7 状态机、OpenTimelineIO 非线性时间轴快照、设定集与异步审美基因提炼。

> 详细的六层输入/输出契约矩阵与端到端创作流转推演，请读取本技能目录下的 `references/six-layer-dataflow.md`。
