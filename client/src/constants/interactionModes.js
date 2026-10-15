/**
 * 通用多智能体系统交互模式与通信契约常量
 * 
 * 单一真相源：定义工作区中间栏输入与交互的三种运转形态
 * 1. COPILOT (默认主脑态): 与全局参谋总长自由探讨创意或下达宏观任务
 * 2. HITL_FOCUS (事件中断焦点态): 挂起节点直接响应，输入作为决策载荷恢复工作流
 * 3. DIRECT_MENTION (专家直通态): 键入 @ 直接呼叫特定专家单兵作业，绕过主脑调度
 */

export const INTERACTION_MODES = Object.freeze({
  COPILOT: 'copilot',
  HITL_FOCUS: 'hitl_focus',
  DIRECT_MENTION: 'direct_mention'
});

export const DEFAULT_SUPER_BRAIN_ID = 'super-brain';
export const MENTION_TRIGGER_CHAR = '@';

export const MODE_METADATA = Object.freeze({
  [INTERACTION_MODES.COPILOT]: {
    id: INTERACTION_MODES.COPILOT,
    name: '系统主脑',
    roleTag: '参谋总长',
    placeholder: '与主脑探讨创意、检索工程，或键入 @ 呼叫特定专家...',
    themeClass: 'from-indigo-600/20 to-purple-600/20 border-indigo-500/30 text-indigo-300',
    badgeClass: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
  },
  [INTERACTION_MODES.HITL_FOCUS]: {
    id: INTERACTION_MODES.HITL_FOCUS,
    name: '决策焦点',
    roleTag: '工作流对讲',
    placeholder: '正在直接向该节点反馈，发送即可裁决解冻并恢复执行...',
    themeClass: 'from-amber-600/20 to-orange-600/20 border-amber-500/30 text-amber-300',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  },
  [INTERACTION_MODES.DIRECT_MENTION]: {
    id: INTERACTION_MODES.DIRECT_MENTION,
    name: '专家直通',
    roleTag: '单兵直连',
    placeholder: '直连该专家进行点对点作业，产物将实时登记全局黑板...',
    themeClass: 'from-emerald-600/20 to-teal-600/20 border-emerald-500/30 text-emerald-300',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  }
});
