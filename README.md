# 🎬 Meocox Flow

> **AI 原生多媒体创作工作台 (AI-Native Multi-Agent Creative Studio)**
> 视频创作是当前已有的主要场景之一；平台目标是以通用任务、产物与编排能力逐步扩展到图片、音频、文档和自动化创作工作流。

## 🧭 开发与扩展

- 新增创作或自动化业务前，请先阅读[业务扩展开发指引](./业务扩展开发指引.md)：按契约实现所需智能体、技能、工具、本地模型能力及可选产物组件，不把业务流程耦合进通用任务运行时或对话 UI。
- 项目级代码约定见 [AGENTS.md](./AGENTS.md)；任务事件与界面解耦的演进计划见[任务信息流架构计划](./docs/architecture/task-event-presentation-plan.md)。

---

## 🏛️ 架构分层设计

Meocox Flow 正在从现有视频工作流向通用多媒体工作台演进。目标执行底座以 **契约 - 事件 - 产物 - 调度** 为主线，角色、技能和工具作为可组合的能力来源；视频、图片和音频处理属于可替换的领域算子，不应成为内核状态模型的前提。

当前仍处于迁移期：`server/src/core/` 已有通用 Run/Task 内核，但主工作区聊天仍使用 Thread 流程，旧视频流水线也尚未全部通过内核调度。不要把新内核的存在等同于所有业务已完成统一接入。

```text
┌──────────────────────────────────────────────────────────────┐
│ 1. 产品能力层                                                 │
│    - 角色层: agents/<agent-id>/                                │
│    - 技能层: skills/<skill-id>/                                │
│    - 工具层: tools/ + MCP Hub                                  │
├──────────────────────────────────────────────────────────────┤
│ 2. 执行内核 (server/src/core/)                                │
│    - 契约、Run/Task、DAG 调度、事件日志、产物与策略             │
│    - 目标边界: API 与 UI 通过 Run / Artifact / Event 协议交互  │
├──────────────────────────────────────────────────────────────┤
│ 3. 领域引擎与适配器 (server/src/engine/, pipeline/, services/) │
│    - 模型、Agent、Skill、Tool 运行时与多媒体领域算子            │
│    - 剪映等桌面软件集成保持在领域适配器中                       │
└──────────────────────────────────────────────────────────────┘

```

---

## 📂 项目目录结构规范

```text
meocox-flow/
├── agents/                           # 【角色库】纯文本声明式智能体
│   └── <agent-id>/                   # 智能体唯一标识目录
│       ├── agent.yml                 # 角色配置 (元数据、模型、工具白名单、技能依赖)
│       └── agent.md                  # 角色系统提示词与人设指南
│
├── skills/                           # 【技能库】扁平化模块技能规约与执行器
│   └── <skill-id>/                   # 技能唯一标识目录
│       ├── SKILL.md                  # 技能 SOP 规约 (Frontmatter 元数据 + Markdown 指南)
│       └── handler.ts                # (可选) 确定性执行逻辑代码 (TS/JS 运行时)
│
├── config/                           # App 自带的只读默认配置
│   └── mcp_servers.default.json      # 默认 MCP 服务清单；用户覆盖项存于用户数据目录
│
├── client/                           # 【前端工作台】Web / 桌面 UI
│   ├── src/                          # React 19 + Tailwind CSS 组件源码
│   ├── public/                       # 静态资源
│   └── package.json                  # 前端依赖与 Vite 编译配置
│
├── server/                           # 【后端服务】核心业务调度引擎
│   ├── src/
│   │   ├── core/                    # 通用执行内核 (contracts / runs / events / artifacts / policy)
│   │   ├── engine/                  # Agent、Skill、模型、工具与项目运行时
│   │   ├── runtime/                  # 核心运行时 (AgentLoader, MCPHub, ActionParser)
│   │   ├── routes/                   # RESTful API 端点
│   │   ├── services/                 # 媒体分析、剪映草稿协议组装等核心服务
│   │   └── storage/                  # 本地 JSON 原子文件持久化存储层
│   ├── tests/                        # 自动化单元测试与集成测试套件
│   └── package.json                  # 后端依赖配置 (Node.js 22 ESM)
│
├── src-tauri/                        # 【桌面运行时】Tauri 2.0 原生窗口与系统能力封装
│   ├── tauri.conf.json               # Tauri 应用配置 (窗口尺寸、安全边界、联运指令)
│   └── Cargo.toml                    # Rust 依赖与核心配置
│
├── scripts/                          # 【独立 CLI 工具】底层辅助脚本
└── package.json                      # 项目根配置 (统一开发脚本与多包协调)
```

---

## 🗂️ 桌面端存储分层与沙箱目录规范 (Storage Tiering & Sandbox Layout)

Meocox Flow 采用严格的**“系统数据 - 全局资产缓存 - 工程沙箱 - 最终产物”**四层隔离存储架构，彻底解决多项目绑定共享资料库时的缓存复用、外部磁盘只读安全以及跨盘存储管理问题：

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 1. 应用数据与运行时配置 (App Data Tier)                                  │
│    %LOCALAPPDATA%\MeocoxFlow\                                          │
│    ├── settings.json                   # 系统偏好设置 (目录、模型、服务) │
│    ├── providers.json                  # AI 模型与推理网关凭据          │
│    ├── models/                         # 本地 GGUF / ONNX 模型权重池     │
│    └── logs/                           # 桌面运行日志                   │
├────────────────────────────────────────────────────────────────────────┤
│ 2. 全局多媒体 CAS 感知数据库 (Global Media CAS Storage Tier)              │
│    %LOCALAPPDATA%\MeocoxFlow\storage\assets\<media_fingerprint>\        │
│    ├── meta.json                       # 规格参数 (时长、分辨率、编码)   │
│    ├── perception.json                 # 专职智能体提取的镜头客观特征   │
│    ├── artifacts/                      # 永久衍生构件 (切片关键帧/OCR)  │
│    └── search_index.json               # 全局语义搜索倒排索引表         │
│    * 特性: 基于文件大小+修改时间+内容采样快速生成指纹 (<5ms)；           │
│      外部挂载资料库 100% 保持只读零污染；跨项目绑定同一视频瞬间秒级命中。 │
│    * 区别: storage 沉淀高价值大模型分析结果；cache 专管易失计算碎片。     │
├────────────────────────────────────────────────────────────────────────┤
│ 3. 项目工程沙箱区 (Project Sandboxes)                                   │
│    %LOCALAPPDATA%\MeocoxFlow\projects\<project-id>\ (或自定义工作区根)   │
│    ├── project.json                    # 核心元数据 (标题、绑定资料库)   │
│    ├── state/                          # 规范化运行时状态 (内部管理)     │
│    │   ├── storyboard.json             # 分镜/步骤编排时间轴            │
│    │   ├── pipeline.json               # 流水线阶段与运行进度           │
│    │   └── assets.json                 # 项目引用资产映射表             │
│    ├── threads/                        # 对话与思考流分轨               │
│    │   ├── main.json                   # 主会话历史与推理日志           │
│    │   └── topic_<id>.json             # 派生子任务会话                 │
│    ├── artifacts/                      # 阶段性交付物 (脑图、调研文档)   │
│    ├── outputs/<thread-id>/            # [规则 A: 默认产物存放区]       │
│    └── .cache/                         # 项目私有临时计算中间件         │
├────────────────────────────────────────────────────────────────────────┤
│ 4. 最终用户交付物导出区 (Artifacts & Outputs Routing)                   │
│    由底层 outputManager 统一路由解析，支持任意物理盘符自定义：          │
│                                                                        │
│    【规则 A: 全局未设置 customOutputDir 时 (默认)】                     │
│      └─► <projectDir>/outputs/<thread-id>/                             │
│                                                                        │
│    【规则 B: 全局设置了 customOutputDir 时 (如 D:\MeocoxOutputs)】       │
│      └─► <customOutputDir>/<项目标题>/<thread-id>/                     │
│           ├── tutorial_60fps.mp4        # 动效成片直出                  │
│           ├── jianying_draft/           # 注入剪映的草稿工程包          │
│           └── mindmap_export.json       # 导出的脑图/结构化文件         │
└────────────────────────────────────────────────────────────────────────┘
```

* **目录路径配置优先级**：
  * **项目沙箱根**：优先读取 `settings.json` 的 `defaultProjectsRoot`，或环境变量 `MEOCOX_PROJECTS_ROOT`；缺省默认回退至 `%LOCALAPPDATA%\MeocoxFlow\projects`。
  * **最终产物根**：由 `settings.json` 的 `customOutputDir` 驱动，可在前端「设置 -> 目录设置」中通过原生文件夹对话框任意选取；留空则自动按会话落盘在项目内部 `outputs/<对话ID>/`。
* **向后兼容性保证**：存储层具备自愈机制，读取分镜或流水线时若 `state/` 尚未生成，自动兼容项目根目录下的历史平铺 JSON 文件。

---

## 📋 文件规范与协议契约

### 1. 智能体规范 (`agents/<agent-id>/`)

每个智能体由一个专属目录构成，且必须包含两个核心文件：

#### `agent.yml` (配置契约)
采用 YAML 格式定义角色的属性约束与访问边界：

```yaml
id: <agent-id>                        # 智能体唯一 ID (小写字母、数字、连字符)
name: "<显示名称>"                    # 在 UI 与会话中展示的名称
model: "gemini-3.8-flash-high"        # 指定首选大语言模型 (缺省时使用全局默认模型)
skills:                               # 挂载的专业技能 ID 列表
  - <skill-id-1>
  - <skill-id-2>
tools:                                # 允许调用的工具权限白名单 (支持通配符 ['*'])
  - <tool-name>
  - mcp:<server-name>:<tool-name>
```

#### `agent.md` (提示词契约)
纯 Markdown 文本，定义智能体的背景人设、叙事职责、输入输出规范及边界约束。系统在构建 System Prompt 时会自动将其与项目上下文、绑定技能的 SOP 进行组装。

---

### 2. 技能规约 (`skills/<skill-id>/`)

技能定义行业知识、剪辑规范或特定领域的 SOP 规约，支持纯 Prompt 指南或配合确定性代码执行。

#### `SKILL.md` (SOP 规约)
文件顶部必须包含 Frontmatter 元数据块：

```markdown
---
name: <skill-id>                      # 技能唯一标识
title: "<技能中文名称>"                # 技能展示标题
description: "<核心功能与应用场景描述>" # 触发条件说明
tools: [<tool-name-1>, ...]           # 该技能推荐使用的工具清单 (可选)
parameters:                           # 业务量化参数约束 (可选)
  targetDuration: "1.5s - 3.0s"
---

# 技能作业规约

## 1. 触发场景
明确指出在处理何种内容或用户提出何种需求时应用此规范。

## 2. 核心量化指标
- 详细规则 1
- 详细规则 2
```

#### `handler.ts` / `handler.js` (可选确定性执行器)
若技能包含数学量化、节拍吸附、格式转换等确定性计算，可在技能目录下放置处理函数：

```typescript
/**
 * 确定性计算入口
 * @param context 执行上下文参数 (由 Agent 或流水线传入)
 */
export async function execute(context: Record<string, any>): Promise<Record<string, any>> {
  // 确定性算法计算逻辑
  return {
    success: true,
    data: { /* 计算产物 */ }
  };
}
```

---

### 3. MCP 外部扩展契约

App 自带默认清单位于 `config/mcp_servers.default.json`，随应用只读分发。用户新增或覆盖服务应通过设置界面写入用户数据目录中的 `mcp_servers.json`，不要直接修改默认清单作为个人配置。服务定义基于 Model Context Protocol：

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "<可执行程序路径或命令>",
      "args": ["<启动参数1>", "<启动参数2>"],
      "env": {
        "<环境变量名>": "<值>"
      }
    }
  }
}
```
默认清单与用户清单会按运行时规则合并；可用工具还受服务状态和智能体权限白名单约束。不要假设某个 MCP 工具在所有安装中都可用。

---

### 4. 项目运行时数据存储规范 (`data/`)

项目数据采用纯本地文件系统原子持久化，每个项目拥有独立的命名空间目录：

| 文件路径 | 格式 | 职责说明 |
| :--- | :--- | :--- |
| `data/settings.json` | JSON | 全局配置（默认工程存放路径、应用偏好） |
| `data/providers.json` | JSON | 模型厂商连接配置（BaseURL、API Key 凭证、模型白名单） |
| `data/storage/assets/<mediaId>/` | JSON/Files | 全局 CAS 内容寻址存储：包含 `meta.json` 媒体参数、`perception.json` 多模态感知报告与 `artifacts/` 关键帧衍生品，跨项目免二次分析且绝不污染用户原素材目录 |
| `data/cache/assets/` | JSON | 基于文件大小与特征哈希构成的复合媒体指纹库，避免重复抽帧与探针分析 |
| `data/projects/<id>/project.json` | JSON | 项目 ID、标题、所属分类、工程工作目录、绑定的本地素材库目录 |
| `data/projects/<id>/pipeline.json` | JSON | 5 步流水线中各阶段的执行状态（`pending`/`running`/`completed`/`failed`）、耗时、结构化输出与日志流 |
| `data/projects/<id>/assets.json` | JSON | 经探针解析出的本地切片素材元数据（路径、时长、分辨率、帧率、音频轨、标签与特征评分） |
| `data/projects/<id>/storyboard.json` | JSON | 编排后的分镜脚本序列（微秒级入出点、对齐文案、转场、匹配素材关联） |
| `data/projects/<id>/messages.json` | JSON | 对话记录池，自动对内部执行结果做提纯处理，确保上下文安全性 |

---

### 5. 剪映工程直连规范

系统具备直接与本机剪映专业版（Jianying Pro）双向同步的能力：

1. **草稿路径检测**：探测本机 `%LOCALAPPDATA%\JianyingPro\User Data\Projects\com.lveditor.draft\`。
2. **微秒级时间线对齐**：视频切片与音频字幕轨道时间参数统一采用微秒（Microseconds, `1s = 1,000,000μs`）高精度计算。
3. **全局索引注入**：工程生成后自动向剪映的 `root_meta_info.json` 注册草稿唯一 ID 与物理路径，创作者打开剪映客户端无需手动导入即可在草稿列表中立即查看与二次剪辑。
4. **独立包备份**：同时在 `outputs/<项目名称>_<时间戳>/` 导出便携式工程备份包。

---

## 🛠️ 研发与构建命令

```bash
# 启动原生桌面客户端（Tauri 桌面应用，自动并行拉起后端与前端服务）
npm run dev

# 启动纯 Web 网页开发模式（并发启动后端 3001 端口与前端 5173 端口）
npm run dev:web

# 桌面端显式启动命令
npm run dev:desktop

# 构建原生桌面安装包
npm run build

# 构建前端静态资源包
npm run build:web

# 运行后端全量自动化测试套件
npm --prefix server test
```

---

## 📄 License

MIT License. Designed for AI-driven modern video production.
