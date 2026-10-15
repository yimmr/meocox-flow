---
name: audio-sfx-director
description: "免版权商业程序化音频与音效导演技能。规范纯代码数学合成 (Procedural Web Audio/WAV)、CC0 极客 UI 音效布设、多轨音频侧链避让混流等技术实践，保证 100% 商业免版权与影视级音画体验。"
---

# Audio & SFX Director (免版权商业音频导演规范)

本技能定义了 Meocox Flow 在 Code-as-Video 流水线中的音频工程标准。核心宗旨是：**在实现类似 Apple / Linear 顶级产品发布会音画质感的同时，保持 100% 纯代码生成与 CC0 协议，永久杜绝一切外部音频商用侵权风险**。

---

## 一、免版权商业音频生成体系 (100% Royalty-Free)

外部商业音频库（如 AudioJungle、Epidemic Sound）常存在商用授权限制、二次剪辑权纠纷或云端 API 付费计费。本项目采用**纯代码算法程序化生成（Procedural Audio Synthesis）与 CC0 极客音频包**双轨制：

1. **纯数学算法音频生成 (`proceduralAudioService.js`)**：
   - 使用 Node.js 内存字节流直接计算标准 16-bit 44.1kHz PCM WAV；
   - **转场呼啸音 (`Whoosh`)**：钟形曲线包络 + 200Hz~800Hz 动态频移正弦波 + 柔和白噪声带通滤波；
   - **终端敲击音 (`Key Click`)**：15ms 快速指数衰减脉冲方波 + 轻微高频共振，模拟机械键盘青轴清脆打字质感；
   - **成功结清音 (`Chime / Ding`)**：双正弦基频 (E5/B5) + 二次谐波衰减，呈现科技任务编译通过质感；
   - **极客氛围 BGM (`Tech Ambient Drone / Lo-Fi`)**：基于 Dm9 / C / Bb 和弦进行，0.25Hz 超低频 LFO 缓慢调制，配合每秒微低频底鼓脉冲。
   - **版权属性**：100% 数学代码即时生成，无任何录音制品版权问题，完全公有领域 (Public Domain / CC0)，可自由商用。

---

## 二、音效触发与分镜关键帧毫秒级吸附 (Action-SFX Binding)

音效智能体 (`sound-designer`) 会在场景装配阶段根据分镜组件与动作元数据自动布设音效触发点：

| 组件 / 动作类型 | 推荐音效 | 触发帧定位 | 声学特征与音量 |
| :--- | :--- | :--- | :--- |
| **场景切换 (Scene Cut)** | `whoosh.wav` | 各分镜 `startFrame` 前后 2 帧 | 立体声扫频，音量 `0.6` |
| **TechTerminal 代码输入** | `key_click.wav` | 打字机每递增 2~3 字符触发 | 极短脉冲 (15ms)，音量 `0.4` |
| **TechTerminal 编译完成** | `chime.wav` | `outputStartFrame` 弹出瞬间 | 明亮清脆谐波，音量 `0.7` |
| **DataChart 柱状图冲顶** | `chime.wav` | 进度条加载到 100% 帧 | 延迟 10 帧触发，音量 `0.65` |
| **ArchitectureFlow 节点点亮** | `node_pop.wav` | 拓扑节点依次弹入瞬间 | 轻快弹力音，音量 `0.5` |

---

## 三、多轨智能避让混音 (Sidechain Ducking Pipeline)

混流阶段调用系统级 FFmpeg 过滤器完成广播级音质合并：

```bash
ffmpeg -y -i video.mp4 -i voiceover.wav -i bgm.wav \
  -filter_complex "[1:a]volume=1.0[v];[2:a]volume=0.15,aloop=loop=-1:size=2e+09[b];[v][b]amix=inputs=2:duration=first:dropout_transition=2[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart output.mp4
```

- **人声优先**：保持 100% 原声清澈度，频段保留完整；
- **环境垫乐**：BGM 自适应恒定压限至 -16dB，避免吞字；
- **防爆音淡入淡出**：音轨首尾设置 50ms 软拐点包络，杜绝咔哒爆音 (Clicks & Pops)。
