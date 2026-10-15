/**
 * 工业级通用多智能体协同 — 标准通信与数据契约规范 (2026 通用版)
 * 
 * 核心哲学：
 * 纯框架层，对具体业务领域（视频剪辑、代码生成、投研分析、日常助理）零耦合。
 * 一切产物皆自描述，一切步骤皆结构化，一切动作皆可插拔。
 */

export const STREAM_EVENT_TYPES = {
  // ── 智能体生命周期 ──
  AGENT_START: 'agent_start',           // 某个智能体接手任务
  AGENT_HANDOFF: 'agent_handoff',       // 智能体将任务交接给下一个智能体

  // ── 细粒度执行步骤 (思考 / 技能 / 工具) ──
  STEP_START: 'step_start',             // 步骤开始 (入参绑定)
  STEP_LOG: 'step_log',                 // 类 CMD 终端实时流式日志分片
  STEP_END: 'step_end',                 // 步骤结束 (出参交付、耗时统计)

  // ── 正文内容流 ──
  TEXT_DELTA: 'text_delta',

  // ── 产物总线 (支持任意领域的结构化成果) ──
  ARTIFACT_PUBLISH: 'artifact_publish', // 发布或更新侧边栏产物

  // ── 人机协同 (HITL) 决策挂起与恢复 ──
  DECISION_REQUEST: 'decision_request', // 引擎挂起，向信息流抛出决策卡片
  DECISION_RESOLVE: 'decision_resolve', // 用户决策完成，恢复执行
  DECISION_REOPEN: 'decision_reopen',   // 创作者重新打开已决决策进行变更调整

  // ── 系统级诊断与干预 ──
  SYSTEM_ALERT: 'system_alert',         // 诊断建议、安全护栏、重试或降级提示

  // ── 会话终态 ──
  STREAM_DONE: 'stream_done',           // 全流程圆满交付
  STREAM_ERROR: 'stream_error'          // 执行异常熔断
};

/**
 * 通用步骤类型
 */
export const STEP_TYPES = {
  THINKING: 'thinking', // 深度思维推演 (Reasoning chain)
  SKILL: 'skill',       // 复合技能/SOP调用 (如检索分析、节拍计算、代码静态检查)
  TOOL: 'tool'          // 底层沙箱指令/API执行 (如 bash, curl, docker, mcp)
};

/**
 * 通用产物渲染器类型 (对具体业务完全解耦)
 */
export const ARTIFACT_TYPES = {
  DOCUMENT: 'document', // 通用 Markdown 文本文档 (如：调研报告、剧本大纲、技术规格说明)
  DATA: 'data',         // 结构化键值/JSON/表格数据 (如：分析矩阵、指标清单、配置项)
  CARDS: 'cards',       // 卡片瀑布流/切片池 (如：故事板分镜卡片、高光切片、任务看板)
  CODE: 'code',         // 代码文件/脚本/Diff 差分
  CUSTOM: 'custom'      // 开放式自定义组件
};

/**
 * 创建标准格式的事件对象辅助函数
 */
export function createStreamEvent(type, payload = {}) {
  return {
    type,
    timestamp: Date.now(),
    ...payload
  };
}
