---
name: system-blueprint-guide
title: Meocox Flow 系统架构与扩展开发指南
description: 规定桌面端优先、资产零拷贝、智能体与技能标准布局、统一数据信封及强制安全红线的系统开发法典
tags: [architecture, blueprint, specification, zero-copy, standard]
---

# Meocox Flow 系统架构与扩展开发指南 (System Blueprint Guide)

本指南是系统进化专家（Evolution Specialist）设计、编写与扩展新智能体（Agent）、专业技能（Skill）以及工具（Tool）时的最高工程宪章与必须严格遵守的物理法则。

---

## 一、 核心定位与技术底座

- **架构底座**：Tauri v2 (Rust) + Node.js SEA (单可执行文件后端) + React 19 + Tailwind CSS v4。
- **运行环境**：高性能桌面端原生环境，运行在用户本机操作系统上。
- **三大基石角色的职责分离**：
  1. **Super Brain（超级主脑）**：统领全局战略、意图对齐、DAG 编排、模式门禁、最终物理验收。绝不直接解析多模态大文件，绝不直接手搓业务正文。
  2. **Perception Specialist（内容感知专员）**：专职将视频/音频/图片/文档等非文本资产降维转化为结构化语义文本与特征大纲，结合 CAS 本地缓存。绝对不承担具体业务逻辑。
  3. **Evolution Specialist（系统进化专家）**：专职根据主脑提出的能力缺口，依据本指南设计新 Agent、新 Skill、新 Tool，并在独立沙盒执行合规自检后安全注册。

---

## 二、 本地物理资产零拷贝红线 (Zero-Copy Local Assets)

- **物理绝对路径优先**：用户素材、剪映工程文件（`draft_content.json`）、产物均位于本地磁盘。在传递与处理资产时，**必须直接使用操作系统绝对物理路径**（例如 `D:/assets/game.mp4`）。
- **红线禁令**：
  - 严禁把大型本地媒体转为 Base64、Blob 或虚假公网 URL 在上下文或网络中传递。
  - 严禁让主脑接收原始媒体二进制流。媒体仅能通过绝对路径交由原生探针（FFmpeg / Node 算子）在本地处理。

---

## 三、 智能体目录与文件规范 (Agent Specification)

新建智能体必须落盘为独立目录，包含以下两份核心文件：

### 1. `agent.yml` (智能体元数据契约)
```yaml
id: agent-unique-id       # 必填：全小写中划线标识，如 video-director
name: Agent Display Name  # 必填：展示名称
title: 专业职务职称       # 必填：如 创意总监、分镜编导
role: 一句话定位与核心职责 # 必填
model: auto               # 默认 auto（由底座网关按需路由）
skills:                   # 绑定的专业规约列表（必须已存在于系统技能库中）
  - viral-hook-rules
tools:                    # 授予的工具白名单（必须在系统工具库中真实存在）
  - update_storyboard
  - export_jianying_draft
```

### 2. `agent.md` (系统人设与行为守则)
必须包含以下四个层级结构：
1. **身份定位与使命 (Identity & Mandate)**：清晰的一阶职责。
2. **单一职责原则 (SRP) 与明确边界**：只负责其垂直领域，禁止越权。
3. **否定约束与安全红线 (Negative Constraints)**：明确指出“你绝不能做什么”（例如禁止捏造未存在的素材路径、禁止输出口头承诺）。
4. **输出规范与错误恢复契约 (Output Schemas & Error Handling)**：必须严格输出结构化 JSON 或标准化验收字段。

---

## 四、 技能规约目录与文件规范 (Skill Specification)

新建技能必须落盘为独立目录，包含 `SKILL.md`（可选附带确定性执行脚本 `handler.js/ts`）：

### 1. `SKILL.md` 结构
```markdown
---
name: skill-unique-id
title: 技能中文名称
description: 技能功能简述，供大模型意图索引时识别
category: capability
tags: [tag1, tag2]
---

# 技能详细操作手册 (SOP)
## 1. 适用场景与触发条件
## 2. 输入参数与上下文要求
## 3. 逐步骤专业执行规范与标准阈值 (如时间戳精度、字数限制、卡点BPM)
## 4. 输出格式与交付物质量核验清单
```

---

## 五、 数据通信信封统一契约 (Standard Envelope Contract)

所有工具、技能以及智能体对外交付的结果，必须封装为标准信封对象：
```typescript
{
  success: boolean,                 // 执行是否成功
  summary: string,                  // 极简概括（供主脑快速了解进度）
  data?: any,                       // 结构化有效载荷或产物路径
  error?: {                         // 失败时的标准化错误对象
    code: string,                   // 机器可读错误码，如 ASSET_NOT_FOUND
    message: string                 // 诊断信息
  }
}
```

---

## 六、 强制自检门禁 (Self-Inspection Mandate)

系统进化专家在调用任何物理注册工具（`register_dynamic_agent` / `register_dynamic_skill`）前，**必须执行 `skill: system-compliance-check` 中的自检清单**，确保：
1. YAML 与 Markdown 无语法解析错误；
2. 依赖的工具在系统清单中 100% 存在；
3. 人设具备否定约束；
4. 未违反零拷贝和绝对路径红线。
自检未通过的草案必须就地修复，严禁将未经验收的半成品注入系统。
