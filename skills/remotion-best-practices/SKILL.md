---
name: remotion-best-practices
description: "Remotion 官方开源 Agent 视频制作技能准则 (基于 remotion-dev/skills MIT 规范)。涵盖动画防闪烁、CSS 竞态切断、确定性帧插值、音频侧链避让与字音微秒级对齐等核心铁律。"
---

# Remotion Best Practices (官方开源动效开发规范)

本技能源自 Remotion 官方开源 Agent 准则库 (`remotion-dev/skills`，MIT 开源协议，支持商业免版权自由使用与修改)。在 Meocox Flow 的 Code-as-Video 流水线中，所有动效代码编写智能体 (`code-motion-engineer`) 与审查智能体必须严格遵循本规范。

---

## 一、动画核心铁律：绝对禁止 CSS 过渡与动画 (Zero CSS Transitions)

### 1. 致命缺陷根因
在无头 Chromium 离线逐帧渲染中：
- 渲染器按照**虚拟帧**（Virtual Frame 0, 1, 2...）一帧一帧抓取画布；
- CSS `transition: all 0.3s`、`transition-property` 以及 CSS `@keyframes`（如 Tailwind 的 `animate-spin`、`animate-pulse`）依赖的是**操作系统的真实时钟**（Wall Clock）；
- 当渲染每一帧时，真实时钟与虚拟帧不同步，导致捕获到的每一帧出现随机跳变，肉眼呈现为**高频闪动、抽搐、乱飞**。

### 2. 规范要求
1. **严禁使用任何 `transition-*` 类名**：
   - 错误：`<div className="transition-all duration-300">`
   - 正确：使用 Remotion 内置数学插值计算样式 `style={{ transform: \`scale(${scale})\`, opacity }}`
2. **严禁使用 CSS `@keyframes` 动画**：
   - 错误：`<Loader2 className="animate-spin" />`
   - 正确：使用 Remotion 帧计算 `style={{ transform: \`rotate(${(frame * 6) % 360}deg)\` }}`
3. **全局样式反闪烁屏障 (Anti-Flicker Barrier)**：
   在渲染入口根组件强制同步注入样式，禁止一切未被 Remotion 驱动的 CSS 补间：
   ```css
   *, *::before, *::after {
     transition: none !important;
     animation: none !important;
   }
   ```

---

## 二、确定性时间与弹簧物理插值 (Deterministic Motion)

1. **统一帧率与时间基准**：
   - 始终通过 `useCurrentFrame()` 与 `useVideoConfig()` 获取当前帧号和帧率（通常为 60fps 或 30fps）；
   - 杜绝使用 `Date.now()`、`performance.now()`、`Math.random()`（若需随机性，使用确定性伪随机种子 `random(seed)`）。
2. **弹簧动画配置规范 (`spring()`)**：
   - 标准 UI 入场弹簧：`damping: 14, mass: 0.5, stiffness: 120`；
   - 避免过小的阻尼 (`damping < 8`) 导致刚体持续余震抖动；
   - 弹簧超帧夹取：对透明度或超出边界的属性，配合 `clamp` 进行安全约束。
3. **线性插值规范 (`interpolate()`)**：
   - 必须显式声明边界行为：`{ extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }`，防止倒播或超时后数值溢出。

---

## 三、音频分轨与智能避让规范 (Audio & Ducking)

1. **多轨分工架构**：
   - **Voiceover Track (人声轨道)**：音量归一化至 `1.0` (0dB)，主导叙事；
   - **SFX Track (UI 动作音效)**：毫秒级吸附动作触发帧（Whoosh, Click, Chime），音量 `0.6 ~ 0.8`；
   - **BGM Track (背景音乐)**：科技极客氛围底音，必须实现**侧链避让 (Audio Ducking)**。
2. **动态避让算法**：
   - 当检测到人声配音正在播讲时，BGM 瞬时衰减至 `0.12 ~ 0.18` (-16dB)，烘托氛围同时确保字字清晰；
   - 当分镜留白或说话间歇，BGM 平滑上浮回弹至 `0.35`；
   - 结尾淡出：在视频结束前 1.5 秒应用指数衰减至 0。

---

## 四、字体与样式表同步注入 (Synchronous Layout & FOUC Prevention)

1. **杜绝异步 `useEffect` 注入样式**：
   - 在 Remotion 渲染环境中，`useEffect` 发生在组件首帧挂载之后，会导致 Frame 0 捕获到无样式的裸 DOM（FOUC 闪白）。
   - 必须通过 `<style dangerouslySetInnerHTML=... />` 在 JSX 树中同步输出样式。
2. **系统字体与安全字体回退栈**：
   - 优先使用操作系统预装的高级字体栈：`Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif`。
