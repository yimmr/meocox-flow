# 工作流 02：新增防错型 ACI 工具与 FFmpeg 批处理媒体管线

当需要为智能体扩展新的多媒体处理能力（如视频切片拼接、音画卡点合成、字幕烧录、局部重绘遮罩合成）时，遵循以下防错工作流：

## Step 1: 设计防错型 ACI 参数契约（Poka-yoke Schema）
- 查阅 `.gemini/skills/media-pipeline-and-aci/SKILL.md`。
- 定义接收 `AssetId` 句柄与直观时间码（`HH:MM:SS.mmm`）的 Rust 参数结构体，绝不让大模型心算帧数或传入原始文件路径。
- 编写详尽的 Docstring 注释（说明工具边界、正反调用示例），供 MCP 或工具搜索按需披露。

## Step 2: 编写批处理管线合成器（Media Pipeline Builder）
- 在 `src-tauri/src/pipeline/` 中将高层语义参数编译为单次执行的 `FFmpeg Sidecar` 滤镜图（`-filter_complex`）或批处理任务单，避免让模型分多步往返调用。
- 强制校验：输入文件仅从只读素材池读取，输出文件生成全新的 `AssetId` 写入衍生媒体池（`derived/`），并强制附带跨平台兼容编码参数（`-c:v libx264 -pix_fmt yuv420p`）。

## Step 3: 影子工作区静默自检（Shadow Verification）
- 管线执行完毕后，在后台自动用 `ffprobe` Sidecar 校验输出文件是否存在、时长是否匹配、音轨是否削波无声。
- 自检通过后将新 `AssetId` 及百字以内的知觉摘要注册至项目 SQLite 资产表，仅向模型上下文返回句柄与摘要。
