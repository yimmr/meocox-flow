import React, { useState } from 'react';
import {
  Check,
  Terminal,
  Layers,
  AlertCircle,
  CheckCircle2,
  FileCode,
  Sparkles,
  SlidersHorizontal
} from 'lucide-react';
import { toast } from '@/components/ui/sonner.jsx';

const MACRO_TAGS = [
  { tag: '${APP_ROOT}', label: '应用目录' },
  { tag: '${PROJECTS_ROOT}', label: '工程根目录' },
  { tag: '${ASSETS_DIR}', label: '素材目录' }
];

export default function ToolProviderEditorPanel({
  provider = null,
  onSave,
  onCancel,
  isSaving = false
}) {
  const isEditing = Boolean(provider && provider.id && provider.id !== 'builtin');

  const [formData, setFormData] = useState({
    serverId: provider?.id || '',
    command: provider?.command || '',
    args: Array.isArray(provider?.args) ? provider.args.join(' ') : (provider?.args || ''),
    env: typeof provider?.env === 'object' ? JSON.stringify(provider.env, null, 2) : (provider?.env || ''),
    disabled: Boolean(provider?.disabled || (provider?.enabled === false))
  });

  const [jsonError, setJsonError] = useState(null);

  const handleEnvChange = (val) => {
    setFormData(prev => ({ ...prev, env: val }));
    if (!val.trim()) {
      setJsonError(null);
      return;
    }
    try {
      JSON.parse(val.trim());
      setJsonError(null);
    } catch (err) {
      setJsonError(err.message);
    }
  };

  const handleFormatJson = () => {
    if (!formData.env.trim()) return;
    try {
      const parsed = JSON.parse(formData.env.trim());
      setFormData(prev => ({
        ...prev,
        env: JSON.stringify(parsed, null, 2)
      }));
      setJsonError(null);
      toast.success('JSON 已格式化');
    } catch (err) {
      toast.error('JSON 语法错误，无法格式化');
    }
  };

  const handleInsertMacro = (macro) => {
    setFormData(prev => ({
      ...prev,
      args: prev.args ? `${prev.args} ${macro}` : macro
    }));
    toast.success(`已追加参数宏 ${macro}`);
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    const cleanId = formData.serverId.trim();
    if (!cleanId) {
      toast.warning('请填写服务ID (Server ID)');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(cleanId)) {
      toast.warning('服务ID仅支持英文字母、数字、下划线及中划线');
      return;
    }
    if (!formData.command.trim()) {
      toast.warning('请填写执行程序命令 (Command)');
      return;
    }

    let parsedEnv = {};
    if (formData.env.trim()) {
      try {
        parsedEnv = JSON.parse(formData.env.trim());
      } catch (err) {
        toast.warning('环境变量请保持合法 JSON 格式 (例如 {"API_KEY": "xxx"})');
        return;
      }
    }

    const argsArray = formData.args
      ? formData.args.split(/\s+/).filter(Boolean)
      : [];

    onSave?.({
      serverId: cleanId,
      command: formData.command.trim(),
      args: argsArray,
      env: parsedEnv,
      disabled: formData.disabled
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full space-y-4 animate-in fade-in duration-200">
      <div className="flex-1 flex flex-col space-y-4 min-h-0 overflow-y-auto pr-1">
        {/* Card 1: Main Process Configuration */}
        <div className="rounded-2xl bg-dark-900 border border-dark-700/80 p-5 shadow-sm space-y-4 shrink-0">
          <div className="flex items-center space-x-2 text-xs font-bold text-white border-b border-dark-800 pb-2.5">
            <Terminal className="w-4 h-4 text-teal-400" />
            <span>MCP 服务进程通信配置 (Stdio 协议)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-medium text-gray-300 block mb-1">
                服务ID (Server ID) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                disabled={isEditing}
                value={formData.serverId}
                onChange={e => setFormData({ ...formData, serverId: e.target.value })}
                placeholder="例如: comfyui 或 filesystem"
                className={`w-full bg-dark-800 border rounded-xl px-3 py-2 text-xs text-white font-mono transition ${
                  isEditing
                    ? 'border-dark-700 opacity-60 cursor-not-allowed bg-dark-850'
                    : 'border-dark-700 focus:border-teal-500/60 focus:outline-none'
                }`}
              />
              <span className="text-[10px] text-gray-500 mt-1 block">
                {isEditing
                  ? '服务ID已固定，作为导出的原子工具调用前缀'
                  : '仅支持英文字母、数字与中划线，创建后不可修改，将作为工具前缀 (如 comfyui__generate_image)'}
              </span>
            </div>

            <div>
              <label className="text-[11px] font-medium text-gray-300 block mb-1">
                执行程序命令 (Command) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.command}
                onChange={e => setFormData({ ...formData, command: e.target.value })}
                placeholder="例如: python, npx, node, uvx"
                className="w-full bg-dark-800 border border-dark-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-teal-500/60 focus:outline-none transition"
              />
              <span className="text-[10px] text-gray-500 mt-1 block">
                系统 PATH 中可执行的二进制程序名称或可执行文件绝对路径
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-gray-300">
                启动参数 (Arguments)
              </label>
              <div className="flex items-center space-x-1.5 text-[10px]">
                <span className="text-gray-500">点击追加参数宏:</span>
                {MACRO_TAGS.map(m => (
                  <button
                    key={m.tag}
                    type="button"
                    onClick={() => handleInsertMacro(m.tag)}
                    className="px-1.5 py-0.5 rounded bg-dark-800 hover:bg-dark-750 text-teal-300 border border-dark-700 hover:border-teal-500/40 font-mono transition cursor-pointer"
                    title={`追加 ${m.label} 参数宏`}
                  >
                    {m.tag}
                  </button>
                ))}
              </div>
            </div>
            <input
              type="text"
              value={formData.args}
              onChange={e => setFormData({ ...formData, args: e.target.value })}
              placeholder="以空格分隔的参数，例如: -m comfyui_mcp_server --port 8188 或 ${PROJECTS_ROOT}"
              className="w-full bg-dark-800 border border-dark-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-teal-500/60 focus:outline-none transition"
            />
          </div>

          {/* Service Enabled Switch */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-dark-800/60 border border-dark-750">
            <div>
              <div className="text-xs font-semibold text-white">服务启用状态</div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                启用后，智能体可自动检索并调用该 MCP 服务导出的工具能力
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, disabled: !prev.disabled }))}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                !formData.disabled ? 'bg-teal-500' : 'bg-dark-700'
              }`}
              title={!formData.disabled ? '已启用该服务' : '已停用该服务'}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  !formData.disabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Card 2: Environment Variables */}
        <div className="rounded-2xl bg-dark-900 border border-dark-700/80 p-5 shadow-sm space-y-3 shrink-0">
          <div className="flex items-center justify-between border-b border-dark-800 pb-2.5">
            <div className="flex items-center space-x-2 text-xs font-bold text-white">
              <FileCode className="w-4 h-4 text-teal-400" />
              <span>进程环境变量 (JSON 格式，可选)</span>
            </div>
            {formData.env.trim() && (
              <button
                type="button"
                onClick={handleFormatJson}
                className="px-2 py-0.5 rounded text-[10px] font-medium bg-dark-800 hover:bg-dark-750 text-gray-300 hover:text-white border border-dark-700 transition cursor-pointer"
              >
                格式化 JSON
              </button>
            )}
          </div>

          <textarea
            rows={4}
            value={formData.env}
            onChange={e => handleEnvChange(e.target.value)}
            placeholder={`{\n  "COMFYUI_URL": "http://127.0.0.1:8188",\n  "API_TIMEOUT": "60000"\n}`}
            className="w-full bg-dark-950 border border-dark-800 rounded-xl p-3 text-xs text-teal-300 font-mono resize-none focus:outline-none focus:border-teal-500/60 transition"
          />

          <div className="flex items-center justify-between text-[10px]">
            {jsonError ? (
              <span className="text-rose-400 flex items-center space-x-1">
                <AlertCircle className="w-3 h-3" />
                <span>JSON 格式有误: {jsonError}</span>
              </span>
            ) : formData.env.trim() ? (
              <span className="text-emerald-400 flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>JSON 格式合法有效</span>
              </span>
            ) : (
              <span className="text-gray-500">未配置额外环境变量</span>
            )}
            <span className="text-gray-500">用于向服务进程注入连接凭据或配置项</span>
          </div>
        </div>

        {/* Card 3: Exported Tools Preview Card (if editing and has tools) */}
        {isEditing && provider?.tools && provider.tools.length > 0 && (
          <div className="rounded-2xl bg-dark-900 border border-dark-700/80 p-5 shadow-sm space-y-3 flex-1 flex flex-col min-h-[200px]">
            <div className="flex items-center justify-between border-b border-dark-800 pb-2">
              <div className="flex items-center space-x-2 text-xs font-bold text-white">
                <Layers className="w-4 h-4 text-teal-400" />
                <span>当前导出的原子工具清单</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-500/10 text-teal-300 border border-teal-500/30">
                  {provider.tools.length} 个原子能力
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {provider.tools.map(tool => (
                <div key={tool.fullName || tool.name} className="p-2.5 rounded-xl bg-dark-800/80 border border-dark-700/80 space-y-1">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-mono text-xs text-teal-300 font-semibold">{tool.name}</span>
                  </div>
                  {tool.description && (
                    <p className="text-[10px] text-gray-400 line-clamp-2 leading-relaxed">
                      {tool.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Editor Footer Actions (Right Aligned) */}
      <div className="pt-3 border-t border-dark-800 flex items-center justify-between shrink-0">
        <span className="text-xs text-gray-500 font-mono">
          {isEditing ? `正在修改 MCP 服务: ${formData.serverId}` : '正在接入外部 MCP 协议服务'}
        </span>
        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-dark-800 hover:bg-dark-750 text-xs font-medium text-gray-300 hover:text-white border border-dark-700 transition cursor-pointer"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-xs font-semibold text-white shadow-md shadow-teal-500/20 transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSaving ? '正在保存并连接...' : (isEditing ? '保存修改' : '接入并连接')}</span>
          </button>
        </div>
      </div>
    </form>
  );
}
