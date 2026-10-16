/**
 * 主流大模型 API 模式规范
 */
export const API_MODES = [
  { id: 'auto', label: '自动检测' },
  { id: 'chat_completions', label: 'Chat Completions' },
  { id: 'responses', label: 'Responses API' },
  { id: 'anthropic_messages', label: 'Anthropic Messages' },
];

/**
 * 主流提供商预设配置清单 (Presets)
 * 
 * 核心设计原则：
 * 1. 预设提供商由底层自动动态补齐 Base URL、API 模式与主流模型；
 * 2. 界面针对预设默认隐藏已知技术细节（支持折叠展开高级选项）；
 * 3. 自定义提供商 (custom) 开放全字段自由配置。
 */
export const PRESET_PROVIDERS = [
  {
    key: 'google',
    idPrefix: 'prov_google',
    name: 'Google Gemini',
    shortName: 'Google',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiMode: 'auto',
    keyPlaceholder: 'AIzaSy...',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' }
    ]
  },
  {
    key: 'claude',
    idPrefix: 'prov_claude',
    name: 'Anthropic Claude',
    shortName: 'Claude',
    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    baseUrl: 'https://api.anthropic.com/v1',
    apiMode: 'anthropic_messages',
    keyPlaceholder: 'sk-ant-...',
    models: [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' }
    ]
  },
  {
    key: 'openai',
    idPrefix: 'prov_openai',
    name: 'OpenAI',
    shortName: 'OpenAI',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    baseUrl: 'https://api.openai.com/v1',
    apiMode: 'chat_completions',
    keyPlaceholder: 'sk-...',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3-mini', name: 'o3-mini' }
    ]
  },
  {
    key: 'deepseek',
    idPrefix: 'prov_deepseek',
    name: 'DeepSeek',
    shortName: 'DeepSeek',
    badgeColor: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
    baseUrl: 'https://api.deepseek.com/v1',
    apiMode: 'chat_completions',
    keyPlaceholder: 'sk-...',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek-V3' },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1' }
    ]
  },
  {
    key: 'custom',
    idPrefix: 'prov_custom',
    name: '自定义提供商',
    shortName: '自定义',
    badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    baseUrl: '',
    apiMode: 'auto',
    keyPlaceholder: 'API 密钥（若服务端需要）',
    models: []
  }
];

export function getPresetByKey(key) {
  return PRESET_PROVIDERS.find(p => p.key === key) || PRESET_PROVIDERS[PRESET_PROVIDERS.length - 1];
}
