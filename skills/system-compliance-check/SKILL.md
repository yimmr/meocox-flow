---
name: system-compliance-check
title: 系统扩展合规自检清单规约
description: 系统进化专家在注册新智能体或技能前强制执行的自动化静态检查与合规性审查SOP
category: audit
tags: [compliance, audit, validation, quality-gate]
---

# 系统扩展合规自检清单规约 (System Compliance Check SOP)

本技能定义了系统进化专家（Evolution Specialist）在向系统注册任何新 Agent、新 Skill 或新 Tool 之前，必须在思维链中逐项比对并核准通过的硬性门禁清单。

---

## 一、 自检流程阶段

```
[起草新配置草案]
       │
       ▼
【Step 1: 格式与语法静态审查 (Syntax & Schema)】
       │
       ▼
【Step 2: 依赖资产真实性核查 (Dependency Integrity)】
       │
       ▼
【Step 3: 架构宪章与红线排查 (Charter Compliance)】
       │
       ▼
【Step 4: 结果裁决】 ──[任一项未达标]──► 就地修正并重审
       │
       ▼ [全部通过]
【准予调用注册工具物理落盘】
```

---

## 二、 智能体 (Agent) 强制自检清单

在执行 `register_dynamic_agent` 之前，必须在 `<think>` 中明确核对以下 5 项：

- [ ] **1. ID 与命名合法性**：ID 必须采用全小写英文字母、数字和短横线（`^[a-z0-9_-]+$`），禁止包含空格或特殊字符。
- [ ] **2. 依赖工具存在性**：声明的所有 `tools`，必须已存在于系统工具库中（通过 `inspect_system_capabilities` 比对确认），严禁挂载虚构工具。
- [ ] **3. 依赖技能存在性**：声明的所有 `skills`，必须已在系统技能库中存在或作为当前批次同步注册。
- [ ] **4. 单一职责与否定约束**：`agent.md` 中必须包含明确的否定约束（例如明确界定它**不能**做什么、**不拥有**哪些权限），防止该智能体越权退化为单体巨石。
- [ ] **5. 零拷贝资产原则**：Prompt 指令中严禁引导用户上传公网 URL 或索要 Base64，必须严格基于操作系统绝对物理路径。

---

## 三、 技能规约 (Skill) 强制自检清单

在执行 `register_dynamic_skill` 之前，必须明确核对以下 4 项：

- [ ] **1. Frontmatter 结构合法性**：必须包含合法的 `name`, `title`, `description` 字段。
- [ ] **2. SOP 操作步骤明确性**：正文必须包含结构化的输入参数说明、专业执行步骤与产物交付质量要求。
- [ ] **3. 确定性脚本语法检查**：若附带 `handler.js/ts` 脚本代码，必须经过语法静态检查，导出标准的 `execute` 或 `run` 纯函数。
- [ ] **4. 标准返回格式契约**：必须遵循标准信封 `{ success, data, error, summary }` 输出格式。

---

## 四、 违规处理与自我修正协议

若自检过程中发现任何一项未通过：
1. **禁止直接调用落盘工具**；
2. 在思考链中明确指出违规项（如：“检测到工具 `non_existent_tool` 不存在，违背自检第 2 条”）；
3. 从备选系统合法工具池中替换或调整为通用原子工具；
4. 重新执行完整自检，直到全绿（All Pass）后方可放行。
