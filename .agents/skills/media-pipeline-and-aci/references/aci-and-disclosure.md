# ACI 防错设计正反例与渐进式披露实现细则

## 一、 AIGC 工具接口（ACI）防错设计正反例对比

| 设计场景 | 糟糕的工具接口设计（诱发模型幻觉与调用失败） | 优秀的防错型 ACI 设计（Poka-yoke 黄金标准） |
| :--- | :--- | :--- |
| **音视频片段裁切** | 要求模型传入起止采样帧号（`start_frame: 1440, end_frame: 3600`）与本地相对路径 `../temp/v1.mp4`。模型极易因帧率换算错误切偏位置。 | 接收 `asset_id: "ast_019..."` 与标准时间码 `start_timecode: "00:00:05.000", duration_sec: 3.5`，由底层工具自动根据素材原生帧率精准对齐关键帧。 |
| **多轨人声避让混音** | 提供底层的 `apply_eq`、`set_compressor_threshold`、`split_audio_channel` 等十几个琐碎音频 DSP 原语，让模型分十步调用。 | 提供高层语义化管线原语 `mix_voice_and_bgm(voice_asset_id, bgm_asset_id, ducking_db=-12, target_lufs=-14)` 或一次性接收完整的多轨混音管线描述单。 |
| **局部重绘（Inpainting）** | 要求模型在纯文本参数中手写多边形遮罩的数十个像素坐标点数组 `polygon_points: [[x1,y1], ...]`。 | 结合前端选区交互，前端框选后直接生成遮罩句柄 `mask_asset_id` 传入上下文，模型只需指定目标 `asset_id`、`mask_asset_id` 与重绘提示词。 |

## 二、 领域专业技能包（Agent Skills）拆解建议

在开发具体 AIGC 业务时，建议将视听专业知识按以下颗粒度封装为 `.gemini/skills/` 下的业务技能包：
- `cinematography-lighting`：三点布光、逆光轮廓、色温情绪映射与镜头焦段词典。
- `editing-montage-rhythm`：动作顺剪（Cut on Action）、J-Cut / L-Cut 声画错位转场、短视频黄金前 3 秒留存节奏规范。
- `audio-mastering-sop`：BGM 情绪配器表、Foley 拟音叠加规范、LUFS 响度标准化与人声侧链避让准则。
- `character-consistency-anchor`：角色三视图设定规范、固定 Seed 锁定策略与局部重绘修复流程。
