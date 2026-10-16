/**
 * 工作区预设需求与运行时轮询常量
 */

export const THREAD_POLL_INTERVAL_MS = 3000;

export const DEFAULT_QUICK_DEMANDS = Object.freeze([
  {
    id: 'demand_code_motion',
    title: '架构与代码动效解说',
    prompt: '请针对核心技术架构或算法原理，策划并装配一套代码终端与拓扑图表的动效解说视频（Remotion 直出）。'
  },
  {
    id: 'demand_replicate',
    title: '视频镜头分析与复刻',
    prompt: '请分析参考视频的分镜节奏、镜头运镜与视觉风格，并输出复刻方案与关键镜头脚本。'
  },
  {
    id: 'demand_storyboard',
    title: '分镜脚本与概念设计',
    prompt: '请根据故事创意策划一套完整的分镜脚本，包含景别、运镜、画面描述及提示词。'
  }
]);
