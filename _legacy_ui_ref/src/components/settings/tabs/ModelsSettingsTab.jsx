import React, { useState } from 'react';
import {
  Layers,
  Sparkles,
  Plus,
  Trash2,
  Edit3,
  Globe,
  Key,
  Cpu,
  Zap,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
  Eye,
  EyeOff
} from 'lucide-react';
import LocalEngineSection from './LocalEngineSection.jsx';
import { toast } from '@/components/ui/sonner.jsx';
import { useConfirm } from '@/components/ui/confirm-dialog.jsx';
import { apiFetch } from '@/lib/apiClient.js';
import { API_MODES, PRESET_PROVIDERS, getPresetByKey } from '@/constants/providerPresets.js';

export function ProviderIcon({ providerKey, className = "w-4 h-4" }) {
  const key = String(providerKey || '').toLowerCase();
  if (key.includes('google') || key.includes('gemini')) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none">
        <path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" fill="url(#gemini-sparkle)" />
        <defs>
          <linearGradient id="gemini-sparkle" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38BDF8" />
            <stop offset="0.5" stopColor="#818CF8" />
            <stop offset="1" stopColor="#C084FC" />
          </linearGradient>
        </defs>
      </svg>
    );
  }
  if (key.includes('claude') || key.includes('anthropic')) {
    return (
      <svg viewBox="0 0 24 24" className={`${className} text-amber-400`} fill="currentColor">
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2v2.8M12 19.2V22M2 12h2.8M19.2 12H22M4.93 4.93l2 2M17.07 17.07l2 2M4.93 19.07l2-2M17.07 6.93l2-2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (key.includes('openai') || key.includes('gpt')) {
    return (
      <svg viewBox="0 0 24 24" className={`${className} text-emerald-400`} fill="currentColor">
        <path d="M20.5 10.3a5.2 5.2 0 0 0-.4-4 5.3 5.3 0 0 0-4.7-2.6h-.7A5.3 5.3 0 0 0 10.1 2a5.3 5.3 0 0 0-5 3.5 5.2 5.2 0 0 0-2.8 3.5 5.3 5.3 0 0 0 .8 5.7 5.2 5.2 0 0 0 .4 4 5.3 5.3 0 0 0 4.7 2.6h.7a5.3 5.3 0 0 0 4.6 1.7 5.3 5.3 0 0 0 5-3.5 5.2 5.2 0 0 0 2.8-3.5 5.3 5.3 0 0 0-.8-5.7zM12 13.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
      </svg>
    );
  }
  if (key.includes('deepseek')) {
    return (
      <svg viewBox="0 0 24 24" className={`${className} text-cyan-400`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 14c2.5-3 6-4 9-3 3-3 7-4 7-4s-1 4-4 7c1 3 0 6.5-3 9-3 1-6.5-.5-9-9z" />
        <path d="M12 9c-1-2-3-3-5-3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={`${className} text-purple-400`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

export default function ModelsSettingsTab({
  providers = [],
  activeProviderId,
  activeModelId,
  onSaveProviders,
  onSelectActive
}) {
  const confirm = useConfirm();
  const [modelCategoryTab, setModelCategoryTab] = useState('installed'); // 'installed' | 'api'
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState(null);
  const [activePresetKey, setActivePresetKey] = useState('google');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    type: 'api',
    preset: 'google',
    baseUrl: '',
    apiMode: 'auto',
    apiKey: '',
    models: []
  });

  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');

  // 打开指定预设的新增表单
  const handleSelectPresetToAdd = (presetKey) => {
    const preset = getPresetByKey(presetKey);
    const existingCount = providers.filter(p => p.id?.startsWith(preset.idPrefix)).length;
    const autoId = existingCount > 0 ? `${preset.idPrefix}_${existingCount + 1}` : preset.idPrefix;

    setActivePresetKey(presetKey);
    setShowApiKey(false);
    setTestResult(null);
    setNewModelId('');
    setNewModelName('');
    setEditingProviderId(null);

    setFormData({
      id: autoId,
      name: preset.key === 'custom' ? '自定义提供商' : preset.name,
      type: 'api',
      preset: preset.key,
      baseUrl: preset.baseUrl,
      apiMode: preset.apiMode || 'auto',
      apiKey: '',
      models: preset.models ? [...preset.models] : []
    });

    setIsFormOpen(true);
  };

  // 编辑已有提供商
  const handleOpenEdit = (p) => {
    const detectedPresetKey = p.preset || (
      p.id?.includes('google') ? 'google' :
      p.id?.includes('claude') ? 'claude' :
      p.id?.includes('openai') ? 'openai' :
      p.id?.includes('deepseek') ? 'deepseek' : 'custom'
    );

    setActivePresetKey(detectedPresetKey);
    setEditingProviderId(p.id);
    setShowApiKey(false);
    setTestResult(null);
    setNewModelId('');
    setNewModelName('');

    setFormData({
      id: p.id,
      name: p.name || '',
      type: 'api',
      preset: detectedPresetKey,
      baseUrl: p.baseUrl || '',
      apiMode: p.apiMode || 'auto',
      apiKey: p.apiKey || '',
      models: Array.isArray(p.models)
        ? p.models.map(m => (typeof m === 'string' ? { id: m, name: m } : m))
        : []
    });

    setIsFormOpen(true);
  };

  // 切换预设模板 (仅新建时)
  const handleSwitchPresetInForm = (newKey) => {
    if (editingProviderId) return;
    const preset = getPresetByKey(newKey);
    const existingCount = providers.filter(p => p.id?.startsWith(preset.idPrefix)).length;
    const autoId = existingCount > 0 ? `${preset.idPrefix}_${existingCount + 1}` : preset.idPrefix;

    setActivePresetKey(newKey);
    setFormData(prev => ({
      ...prev,
      id: autoId,
      name: preset.key === 'custom' ? '自定义提供商' : preset.name,
      preset: preset.key,
      baseUrl: preset.baseUrl,
      apiMode: preset.apiMode || 'auto',
      models: preset.models ? [...preset.models] : []
    }));
  };

  // 删除提供商
  const handleDeleteProvider = async (id) => {
    const apiProviders = providers.filter(p => p.type !== 'installed' && p.id !== 'provider_installed');
    if (apiProviders.length <= 1) {
      toast.warning('至少需要保留一个 API 提供商');
      return;
    }
    const target = providers.find(p => p.id === id);
    const ok = await confirm({
      title: '删除模型提供商',
      description: `确定要删除提供商「${target?.name || id}」吗？`,
      confirmText: '删除',
      variant: 'destructive',
    });
    if (!ok) return;

    const filtered = providers.filter(p => p.id !== id);
    onSaveProviders(filtered);
    toast.success('已删除提供商');
    if (activeProviderId === id) {
      const remainingApi = filtered.filter(p => p.type !== 'installed' && p.id !== 'provider_installed');
      if (remainingApi.length > 0) {
        onSelectActive(remainingApi[0].id, remainingApi[0].models?.[0]?.id || '');
      }
    }
  };

  // 添加模型
  const handleAddModel = () => {
    const id = newModelId.trim();
    if (!id) {
      toast.warning('请输入模型 ID');
      return;
    }
    if (formData.models.some(m => m.id === id)) {
      toast.warning(`模型 ID "${id}" 已存在`);
      return;
    }
    const modelItem = {
      id,
      name: newModelName.trim() || id
    };
    setFormData({
      ...formData,
      models: [...formData.models, modelItem]
    });
    setNewModelId('');
    setNewModelName('');
  };

  // 移除模型
  const handleDeleteModel = (index) => {
    const updated = formData.models.filter((_, i) => i !== index);
    setFormData({ ...formData, models: updated });
  };

  // 自动从端点拉取模型列表
  const handleFetchUpstreamModels = async () => {
    if (!formData.baseUrl) {
      toast.warning('请先填写 Base URL');
      return;
    }
    setIsFetchingModels(true);
    try {
      const res = await apiFetch('/api/settings/providers/detect-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          apiKey: formData.apiKey
        })
      });
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.models) && data.models.length > 0) {
        const existingIds = new Set(formData.models.map(m => m.id));
        const newModels = data.models.filter(m => !existingIds.has(m.id));
        setFormData({
          ...formData,
          models: [...formData.models, ...newModels]
        });
        toast.success(`成功探测到 ${data.models.length} 个模型`);
      } else {
        toast.error(data.error || '该端点未返回模型列表，请手动输入');
      }
    } catch (e) {
      toast.error(`探测失败: ${e.message}`);
    } finally {
      setIsFetchingModels(false);
    }
  };

  // 测试连通性
  const handleTestConnection = async () => {
    const testModelId = formData.models[0]?.id || newModelId.trim();
    if (!testModelId) {
      toast.warning('请在模型列表中添加至少一个模型后再测试');
      return;
    }
    if (!formData.baseUrl.trim()) {
      toast.warning('请配置有效的 API Base URL');
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await apiFetch('/api/settings/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: formData.baseUrl,
          apiKey: formData.apiKey,
          model: testModelId,
          apiMode: formData.apiMode || 'auto'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ success: true, latency: data.latency, model: data.model });
      } else {
        setTestResult({ success: false, error: data.error || '连接未通过' });
      }
    } catch (e) {
      setTestResult({ success: false, error: e.message });
    } finally {
      setIsTesting(false);
    }
  };

  // 保存表单
  const handleSaveForm = () => {
    const cleanId = (formData.id || '').trim();
    const cleanName = (formData.name || '').trim();
    const cleanUrl = (formData.baseUrl || '').trim();

    if (!cleanId) {
      toast.warning('提供商 ID 不可为空');
      return;
    }
    if (!cleanUrl) {
      toast.warning('API Base URL 不可为空');
      return;
    }
    if (!formData.models || formData.models.length === 0) {
      toast.warning('请至少添加一个模型');
      return;
    }

    const payload = {
      ...formData,
      id: cleanId,
      name: cleanName || cleanId,
      baseUrl: cleanUrl,
      type: 'api',
      apiMode: formData.apiMode || 'auto'
    };

    let updated = [];
    if (editingProviderId) {
      updated = providers.map(p => (p.id === editingProviderId ? payload : p));
    } else {
      updated = [...providers, payload];
    }

    onSaveProviders(updated);
    toast.success('提供商已保存');

    if (activeProviderId === payload.id) {
      const exists = payload.models.some(m => m.id === activeModelId);
      if (!exists && payload.models[0]) {
        onSelectActive(payload.id, payload.models[0].id);
      }
    } else if (!activeProviderId) {
      onSelectActive(payload.id, payload.models[0].id);
    }

    setIsFormOpen(false);
  };

  const currentPreset = getPresetByKey(activePresetKey);
  const isCustomMode = activePresetKey === 'custom';
  const apiProviders = (providers || []).filter(p => p.type !== 'installed' && p.id !== 'provider_installed');

  return (
    <div className="space-y-4 font-sans text-slate-200">
      {/* 顶部分类切换：应用模型 VS API 端点 */}
      <div className="flex items-center space-x-1 p-1 bg-[#090D15] border border-white/[0.08] rounded-xl select-none">
        <button
          type="button"
          onClick={() => {
            setModelCategoryTab('installed');
            setIsFormOpen(false);
          }}
          className={`flex-1 py-1.5 px-3 rounded-lg text-fluid-sm font-medium transition cursor-pointer ${
            modelCategoryTab === 'installed'
              ? 'bg-white/[0.1] text-white shadow-xs border border-white/10'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
          }`}
        >
          应用模型
        </button>

        <button
          type="button"
          onClick={() => setModelCategoryTab('api')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-fluid-sm font-medium transition cursor-pointer ${
            modelCategoryTab === 'api'
              ? 'bg-white/[0.1] text-white shadow-xs border border-white/10'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
          }`}
        >
          API 端点
        </button>
      </div>

      {/* 1. 应用模型视窗 */}
      {modelCategoryTab === 'installed' && (
        <LocalEngineSection
          providers={providers}
          activeProviderId={activeProviderId}
          activeModelId={activeModelId}
          onSelectActive={onSelectActive}
          onLibraryChange={() => {
            apiFetch('/api/settings/providers')
              .then(r => r.json())
              .then(data => {
                if (data?.providers) onSaveProviders(data.providers);
              })
              .catch(() => {});
          }}
        />
      )}

      {/* 2. API 端点视窗 */}
      {modelCategoryTab === 'api' && (
        !isFormOpen ? (
          <div className="space-y-4">
            {/* 预设与自定义卡片栏 (玻璃卡片 + 品牌图标) */}
            <div>
              <div className="text-fluid-sm font-medium text-slate-400 mb-2.5">添加提供商</div>
              <div className="grid grid-cols-5 gap-2.5">
                {PRESET_PROVIDERS.map(preset => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => handleSelectPresetToAdd(preset.key)}
                    className="flex flex-col items-center justify-center p-3 rounded-xl bg-[#101522]/80 hover:bg-[#101522] border border-white/[0.08] hover:border-white/20 transition-all duration-150 group cursor-pointer text-center"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                      <ProviderIcon providerKey={preset.key} className="w-4 h-4" />
                    </div>
                    <span className="text-fluid-sm font-medium text-slate-300 group-hover:text-white transition tracking-tight">
                      {preset.shortName}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 已配置的提供商列表 */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-fluid-title font-semibold text-slate-300">已配置的提供商</span>
                <span className="text-fluid-xs text-slate-500">点击卡片编辑 · 点击模型标签激活</span>
              </div>

              {apiProviders.length === 0 ? (
                <div className="p-8 rounded-xl border border-white/[0.07] bg-[#101522]/50 text-center text-fluid-sm text-slate-400">
                  暂无已配置的 API 提供商。点击上方预设或自定义卡片快速添加。
                </div>
              ) : (
                <div className="space-y-2.5">
                  {apiProviders.map(p => {
                    const isProviderActive = p.id === activeProviderId;
                    const models = Array.isArray(p.models) ? p.models : [];
                    const presetDef = PRESET_PROVIDERS.find(pr => pr.key === p.preset);

                    return (
                      <div
                        key={p.id}
                        onClick={() => handleOpenEdit(p)}
                        className={`rounded-xl border p-4 transition-all duration-150 cursor-pointer group select-none ${
                          isProviderActive
                            ? 'bg-[#121929] border-indigo-500/40 shadow-xs'
                            : 'bg-[#101522]/60 hover:bg-[#101522] border-white/[0.07] hover:border-white/[0.15]'
                        }`}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0 group-hover:border-white/20 transition-colors">
                              <ProviderIcon providerKey={p.preset || p.id} className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold text-fluid-base text-white group-hover:text-indigo-300 transition-colors tracking-tight">{p.name || p.id}</span>
                                <span className={`text-fluid-xs px-2 py-0.5 rounded-full font-mono border ${
                                  presetDef?.badgeColor || 'text-slate-400 bg-white/[0.04] border-white/10'
                                }`}>
                                  {presetDef?.shortName || (p.preset === 'custom' ? '自定义' : 'API')}
                                </span>
                              </div>
                              <div className="text-fluid-xs text-slate-400 font-mono truncate max-w-[340px] mt-0.5">
                                {p.baseUrl}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEdit(p);
                              }}
                              className="p-1.5 text-slate-400 hover:text-white hover:bg-white/[0.06] border border-transparent hover:border-white/10 rounded-xl transition cursor-pointer"
                              title="编辑配置"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteProvider(p.id);
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-white/[0.06] border border-transparent hover:border-rose-500/20 rounded-xl transition cursor-pointer"
                              title="删除提供商"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Models */}
                        <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                          {models.map(m => {
                            const isCurrentActive = isProviderActive && m.id === activeModelId;
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelectActive(p.id, m.id);
                                }}
                                className={`px-2.5 py-1 rounded-xl text-fluid-xs font-mono transition flex items-center space-x-1.5 cursor-pointer ${
                                  isCurrentActive
                                    ? 'bg-indigo-600 text-white font-medium border border-indigo-400 shadow-sm shadow-indigo-500/25'
                                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/10'
                                }`}
                              >
                                <span>{m.name || m.id}</span>
                                {isCurrentActive && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-xs" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* 表单视窗：新增 / 编辑提供商 (玻璃大卡片) */
          <div className="space-y-4 bg-white/[0.025] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-5 shadow-2xl shadow-black/40">
            {/* 表单头部：提供商图标 + 预设微胶囊切换 */}
            <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.06]">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0 shadow-inner">
                  <ProviderIcon providerKey={currentPreset.key} className="w-4 h-4" />
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-white tracking-tight">
                    {editingProviderId ? '编辑提供商' : '新增提供商'}
                  </span>
                  <span className={`text-[10px] px-2 py-0.2 rounded-full font-mono border ${currentPreset.badgeColor}`}>
                    {currentPreset.shortName}
                  </span>
                </div>
              </div>

              {!editingProviderId && (
                <div className="flex items-center space-x-1 p-1 bg-black/40 border border-white/[0.08] backdrop-blur-md rounded-xl">
                  {PRESET_PROVIDERS.map(pr => (
                    <button
                      key={pr.key}
                      type="button"
                      onClick={() => handleSwitchPresetInForm(pr.key)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg transition cursor-pointer flex items-center space-x-1 ${
                        activePresetKey === pr.key
                          ? 'bg-white/[0.08] text-white shadow-xs font-semibold border border-white/15'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <ProviderIcon providerKey={pr.key} className="w-3 h-3" />
                      <span>{pr.shortName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 字段 1 & 2: 提供商 ID 与 显示名称 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">提供商 ID</label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={e => setFormData({ ...formData, id: e.target.value })}
                  placeholder="如 prov_openai"
                  className="w-full bg-black/40 border border-white/[0.08] focus:border-indigo-400/70 focus:bg-black/60 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder:text-slate-500 transition-all outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">显示名称 (可选)</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder={currentPreset.name}
                  className="w-full bg-black/40 border border-white/[0.08] focus:border-indigo-400/70 focus:bg-black/60 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-500 transition-all outline-none"
                />
              </div>
            </div>

            {/* 字段 3 & 4: API Base URL 与 API 密钥 并排同一行 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">API Base URL *</label>
                <input
                  type="text"
                  value={formData.baseUrl}
                  onChange={e => setFormData({ ...formData, baseUrl: e.target.value })}
                  placeholder={currentPreset.baseUrl || 'https://api.openai.com/v1'}
                  className="w-full bg-black/40 border border-white/[0.08] focus:border-indigo-400/70 focus:bg-black/60 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder:text-slate-500 transition-all outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">API 密钥</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={formData.apiKey}
                    onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder={currentPreset.keyPlaceholder}
                    className="w-full bg-black/40 border border-white/[0.08] focus:border-indigo-400/70 focus:bg-black/60 rounded-xl px-3.5 py-2 pr-9 text-xs text-white font-mono placeholder:text-slate-500 transition-all outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* 字段 5: API 模式 Segmented Control */}
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">API 模式</label>
              <div className="flex items-center p-1 bg-black/40 border border-white/[0.08] backdrop-blur-md rounded-xl select-none">
                {API_MODES.map(mode => {
                  const isSelected = (formData.apiMode || 'auto') === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, apiMode: mode.id })}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition cursor-pointer text-center ${
                        isSelected
                          ? 'bg-white/[0.08] text-white font-semibold shadow-xs border border-white/15'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.03]'
                      }`}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 模型列表 (玻璃质感，移除无意义冗余文字) */}
            <div className="bg-black/30 border border-white/[0.07] backdrop-blur-md rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">模型列表</span>
                <button
                  type="button"
                  onClick={handleFetchUpstreamModels}
                  disabled={isFetchingModels}
                  className="px-2.5 py-1 text-xs rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/10 transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFetchingModels ? 'animate-spin text-sky-400' : ''}`} />
                  <span>{isFetchingModels ? '探测中...' : '自动探测模型'}</span>
                </button>
              </div>

              {/* 追加模型输入行 */}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newModelId}
                  onChange={e => setNewModelId(e.target.value)}
                  placeholder="模型实际 ID"
                  className="flex-1 bg-black/40 border border-white/[0.08] focus:border-indigo-400/70 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder:text-slate-500 transition-all outline-none"
                />
                <input
                  type="text"
                  value={newModelName}
                  onChange={e => setNewModelName(e.target.value)}
                  placeholder="别名 (选填)"
                  className="w-1/3 bg-black/40 border border-white/[0.08] focus:border-indigo-400/70 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-500 transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddModel}
                  className="px-3.5 py-2 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-xl text-xs font-medium border border-white/15 transition cursor-pointer"
                >
                  添加
                </button>
              </div>

              {/* 当前模型列表胶囊 (空状态保持干净，不放多余文字) */}
              {formData.models.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {formData.models.map((m, idx) => (
                    <div
                      key={idx}
                      className="flex items-center space-x-1.5 px-2.5 py-1 bg-white/[0.04] rounded-lg border border-white/10 text-xs"
                    >
                      <span className="font-mono text-slate-200">{m.id}</span>
                      {m.name && m.name !== m.id && (
                        <span className="text-[10px] text-slate-400">({m.name})</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteModel(idx)}
                        className="text-slate-400 hover:text-rose-400 ml-1 transition cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 测试连通性提示 (玻璃提示条) */}
            {testResult && (
              <div className={`p-3 rounded-xl border text-xs flex items-center justify-between backdrop-blur-md ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <div className="flex items-center space-x-2">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  )}
                  <span>
                    {testResult.success
                      ? `连通测试通过！延迟: ${testResult.latency}ms (${testResult.model})`
                      : `连通失败: ${testResult.error}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setTestResult(null)}
                  className="text-slate-400 hover:text-white text-xs ml-2 cursor-pointer"
                >
                  关闭
                </button>
              </div>
            )}

            {/* 底部操作栏：返回按钮必须在最下面左侧 */}
            <div className="flex items-center justify-between pt-3.5 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>返回列表</span>
              </button>

              <div className="flex items-center space-x-2.5">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-all flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Zap className={`w-3.5 h-3.5 text-amber-400 ${isTesting ? 'animate-bounce' : ''}`} />
                  <span>{isTesting ? '测试中...' : '测试连通性'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveForm}
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-500/25 transition-all cursor-pointer"
                >
                  保存提供商
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
