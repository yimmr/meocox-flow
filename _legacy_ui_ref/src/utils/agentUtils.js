/**
 * 角色显示与命名辅助函数
 * 规范：角色名称不包含括号，分成「角色名称」与「职位」，格式化显示为：名称(职位)
 */

export function formatAgentDisplayName(agent) {
  if (!agent) return '';
  let name = typeof agent === 'string' ? agent : (agent.name || agent.id || '');
  let title = typeof agent === 'object' ? (agent.title || '') : '';

  // 如果没有显式设置 title，尝试从 name 中解析已有括号内容
  if (!title && (name.includes('(') || name.includes('（'))) {
    const match = name.match(/^(.*?)\s*[\(（](.*?)[\)）]$/);
    if (match) {
      name = match[1].trim();
      title = match[2].trim();
    }
  }

  // 剔除名称中可能残留的任何括号注释
  name = name.replace(/[\(（].*?[\)）]/g, '').trim();

  if (title) {
    return `${name}(${title})`;
  }
  return name;
}

export function splitAgentNameAndTitle(agent) {
  if (!agent) return { name: '', title: '' };
  let name = agent.name || agent.id || '';
  let title = agent.title || '';

  if (!title && (name.includes('(') || name.includes('（'))) {
    const match = name.match(/^(.*?)\s*[\(（](.*?)[\)）]$/);
    if (match) {
      name = match[1].trim();
      title = match[2].trim();
    }
  }

  name = name.replace(/[\(（].*?[\)）]/g, '').trim();
  return { name, title };
}
