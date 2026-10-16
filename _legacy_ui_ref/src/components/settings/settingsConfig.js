import {
  Folder,
  FolderTree,
  FolderKanban,
  Cpu,
  Bot,
  Sparkles,
  Wrench,
  HardDrive,
  Info
} from 'lucide-react';

export const SETTINGS_GROUPS = [
  {
    id: 'ai',
    label: 'AI 智能引擎',
    items: [
      {
        id: 'models',
        label: '模型',
        icon: Cpu,
        description: '内置推理模型与 API 端点',
        scope: '全局',
        scopeColor: 'text-gray-400 bg-dark-700/60 border-dark-600'
      },
      {
        id: 'agents',
        label: '智能体',
        icon: Bot,
        description: '角色人设、驱动模型与权限',
        scope: '全局',
        scopeColor: 'text-gray-400 bg-dark-700/60 border-dark-600'
      },
      {
        id: 'skills',
        label: '技能',
        icon: Sparkles,
        description: '剪辑规约手册与领域技能',
        scope: '全局',
        scopeColor: 'text-gray-400 bg-dark-700/60 border-dark-600'
      },
      {
        id: 'tools',
        label: '工具',
        icon: Wrench,
        description: '原子工具与外部 MCP 扩展',
        scope: '全局',
        scopeColor: 'text-gray-400 bg-dark-700/60 border-dark-600'
      }
    ]
  },
  {
    id: 'system',
    label: '系统与资源',
    items: [
      {
        id: 'directories',
        label: '系统偏好',
        icon: FolderKanban,
        description: '工程沙箱、产物导出与偏好记忆',
        scope: '全局',
        scopeColor: 'text-gray-400 bg-dark-700/60 border-dark-600'
      },
      {
        id: 'storage',
        label: '储存空间',
        icon: HardDrive,
        description: 'CAS 感知缓存与构件管理',
        scope: '系统',
        scopeColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
      },
      {
        id: 'about',
        label: '关于',
        icon: Info,
        description: '版本信息与系统运行环境',
        scope: '系统',
        scopeColor: 'text-gray-400 bg-dark-700/60 border-dark-600'
      }
    ]
  }
];

export function getTabConfig(tabId) {
  const normalizedId = tabId === 'mcp' ? 'tools' : tabId;
  for (const group of SETTINGS_GROUPS) {
    const item = group.items.find(i => i.id === normalizedId);
    if (item) return { ...item, groupLabel: group.label };
  }
  return {
    id: tabId,
    label: '设置',
    description: '系统与项目设置',
    icon: Folder,
    scope: '全局',
    scopeColor: 'text-gray-400 bg-dark-700/60 border-dark-600'
  };
}
