---
name: timeline-state-and-memory
description: AIGC 原始资产物理只读防线、算力预算守卫（Quota Guardian）、零资源挂起状态机（interrupt & Checkpointer）、非线性时间轴时光机（UUIDv7 + OpenTimelineIO）以及跨会话双轨审美记忆提炼规范。当设计状态存储、撤销重做、安全审批或用户画像记忆时调用。
---

# 安全护栏、非线性时间轴时光机与长期记忆规范

## 一、 资产韧性与算力防线：只读铁律、预算守卫与零凭证沙箱

1. **原始素材物理只读（Raw Asset Immutability）**：用户导入的原始音视频/图像文件仅授予只读权限；所有剪辑、调色、重绘均作为**非破坏性元数据覆写**或独立衍生资产保存，支持随时一键还原。
2. **算力与预算守卫（Quota Guardian）**：批量调用昂贵的视频生成或语音克隆 API 前，自动预估 Token 与算力费用；超出阈值时强制触发中断门禁，向人类弹出成本明细卡确认。
3. **影子预演（Shadow Preview）与零凭证沙箱**：合成结果先在后台影子区完成静态与知觉自检再呈现给前端；执行沙箱内严禁留存明文 API Key，所有外部鉴权由沙箱外宿主代理动态注入。

## 二、 零资源挂起状态机（Pause-Resume Interrupt）

当遇到高成本审批或长周期人工确认时，严禁使用同步阻塞线程等待：
- 调用 `interrupt(payload)` 原语，将完整运行状态与待执行参数序列化写入本地持久化检查点（Checkpointer），**立即释放全部后台计算线程（零资源挂起）**。
- 严格保证 `interrupt()` 之前代码的**幂等性（Idempotency）**（无重复扣费或重复写文件副作用），并在数小时后恢复执行前先行校验外部 OAuth/API 凭证是否仍在有效期内。

## 三、 非线性时间轴时光机（UUIDv7 + OpenTimelineIO）

- **全链路 UUIDv7 单调时序标识**：所有会话、步骤（Step）与资产句柄均采用内嵌毫秒时间戳的 UUIDv7，消除本地 SQLite 索引分裂颠簸。
- **双快照同步绑定**：每个检查点同时绑定**对话逻辑快照**与 **OpenTimelineIO (OTIO) 多轨时间轴快照**，支持一键无损回滚（Revert）至任意历史步，或从某一步分叉（Fork）出平行创意支线。
- **单会话/单项目独立数据库（One SQLite per Session）**：物理隔离各项目的状态库与伴生资产目录，彻底消除并发写入锁争抢，打包分享或删除项目零碎片开销。

## 四、 双轨世界观与异步审美提炼（Memory Consolidation）

1. **显式设定集（Project Bible / `AGENTS.md`）**：维护当前项目的角色特征锚点、固定音色与标准色板。
2. **后台异步审美提炼**：会话归档时，由专职记忆提炼子智能体过滤中间调试噪音，从人类的 `TurnSteer` 纠偏与竞技场选择中提炼**声明式审美事实（Declarative Facts，带引用溯源 Citation）**，跨项目继承创作者的独特风格基因。

> 详细的 L0-L3 风险分级表与状态机恢复避坑准则，请读取 `references/safety-state-memory.md`。
