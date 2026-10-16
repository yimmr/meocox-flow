# 工作流 03：新增声明式生成式 UI（A2UI）多模态参数推导卡片

当智能体在创作中途需要人类确认风格、色板、构图、配乐情绪或审批算力预算时，严禁使用纯文本多轮追问，按以下流程构建声明式交互卡片：

## Step 1: 定义强类型推导契约（Elicitation Schema）
- 查阅 `.gemini/skills/generative-ui-and-hitl/SKILL.md`。
- 在 Rust 端定义该卡片的声明式数据结构（如 `ColorPaletteElicitation`、`StoryboardBattleCard`、`QuotaApprovalCard`），通过 `specta` 导出至前端。

## Step 2: 编写受控原子 UI 组件（500px 高度预算铁律）
- 在 `src/components/gen-ui/` 下基于 `shadcn/ui` 与 Tailwind 主题变量（`bg-card`、`text-foreground`、`border-border`）构建 React 组件。
- **严格遵守高度预算**：内嵌于左侧对话流的卡片最大高度不得超过 `500px`，禁止使用 `h-screen` 或刺眼的硬编码色值。

## Step 3: 绑定状态机唤醒与 TurnSteer 切轨
- 用户在卡片上点选方案或拖动滑块点击确认后，前端直接将强类型 JSON 结果通过 `resume_checkpoint` 或 `turn_steer` 命令回传给 Rust 守护进程。
- 在右侧画布（CRDT / OTIO）上实时响应参数变更并刷新预览。
