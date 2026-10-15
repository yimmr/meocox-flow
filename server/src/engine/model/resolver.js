import { storage } from '../../storage/index.js';
import { config as appConfig } from '../../config.js';

/**
 * 确定性模型网关解析器 (Deterministic Model Resolver)
 * 
 * 核心架构原则：
 * 1. 提供商拓扑优先：所有模型天然归属于 Provider（应用模型 provider_installed 或 API 厂商）。
 * 2. 链路确定性寻址：
 *    - 显式命名空间 (如 "prov_ollama/qwen2.5:14b")：直接 O(1) 命中指定 Provider；
 *    - "auto" / "default"：直接使用系统当前激活的主力模型与 Provider；
 *    - 纯模型名 (如 "qwen3-vl-4b", "deepseek-chat")：
 *      优先在当前激活的 Provider (activeProviderId) 中查找；
 *      若未命中，在其余已配置的 Providers 中查找归属；
 *    - 环境变量兜底 (appConfig.ai)。
 * 3. 彻底杜绝玄学打分 (calculateScore) 与 URL 嗅探猜想 (isLocalApiEndpoint)。
 */
export async function resolveModelConfig(requestedModelId = null) {
  if (!requestedModelId || typeof requestedModelId !== 'string' || !requestedModelId.trim()) {
    throw {
      code: 'MODEL_REQUIRED',
      message: '必须显式指定目标模型 ID (model 参数不可为空)。系统遵循确定性工程原则，禁止任何隐式缺省回退。'
    };
  }

  const rawTarget = requestedModelId.trim();

  let providersConfig = null;
  try {
    providersConfig = await storage.getProvidersConfig();
  } catch (err) {
    console.warn('[ModelResolver] 读取 providers.json 失败:', err.message);
  }

  const providers = providersConfig?.providers || [];
  const activeProviderId = providersConfig?.activeProviderId;
  const activeModelId = providersConfig?.activeModelId;

  let explicitProviderId = null;
  let targetModelId = rawTarget;

  // 1. 解析 'auto' 或 'default' 关键字
  if (rawTarget.toLowerCase() === 'auto' || rawTarget.toLowerCase() === 'default') {
    if (activeModelId) {
      targetModelId = activeModelId;
    } else if (providers[0]?.models?.[0]) {
      const firstM = providers[0].models[0];
      targetModelId = firstM.id || firstM.rawId;
    } else if (appConfig.ai?.model) {
      targetModelId = appConfig.ai.model;
    }
  }

  // 2. 显式 Provider 前缀解析 (如 "prov_ollama/qwen2.5-coder:14b")
  if (targetModelId.includes('/') && !targetModelId.startsWith('installed:')) {
    const slashIdx = targetModelId.indexOf('/');
    const possibleProvId = targetModelId.slice(0, slashIdx);
    if (providers.some(p => p.id === possibleProvId)) {
      explicitProviderId = possibleProvId;
      targetModelId = targetModelId.slice(slashIdx + 1);
    }
  }

  // 辅助函数：匹配 Provider 是否包含目标模型
  function matchModelInProvider(prov, searchId) {
    for (const m of prov.models || []) {
      const mId = m.id || m.rawId;
      if (!mId) continue;
      if (mId === searchId || m.rawId === searchId) return m;
      if (prov.type === 'installed') {
        const normSearch = searchId.replace(/^installed:/i, '');
        const normModel = (m.rawId || mId).replace(/^installed:/i, '');
        if (normSearch === normModel) return m;
      }
    }
    return null;
  }

  let matchedProvider = null;
  let matchedModelDef = null;

  // 3. 确定性链路寻址
  if (explicitProviderId) {
    // 3.1 显式指定了 Provider：O(1) 精确命中
    matchedProvider = providers.find(p => p.id === explicitProviderId);
    if (matchedProvider) {
      matchedModelDef = matchModelInProvider(matchedProvider, targetModelId);
    }
  } else {
    // 3.2 优先在当前激活的 Provider (activeProviderId) 中寻找
    if (activeProviderId) {
      const activeProv = providers.find(p => p.id === activeProviderId);
      if (activeProv) {
        matchedModelDef = matchModelInProvider(activeProv, targetModelId);
        if (matchedModelDef) {
          matchedProvider = activeProv;
        }
      }
    }

    // 3.3 若激活 Provider 未包含该模型，在其余 Provider 列表中寻找
    if (!matchedProvider) {
      for (const prov of providers) {
        if (prov.id === activeProviderId) continue;
        const m = matchModelInProvider(prov, targetModelId);
        if (m) {
          matchedProvider = prov;
          matchedModelDef = m;
          break;
        }
      }
    }

    // 3.4 若仍未命中，检查应用内置模型提供商
    if (!matchedProvider) {
      const installedProv = providers.find(p => p.type === 'installed' || p.id === 'provider_installed');
      if (installedProv) {
        const m = matchModelInProvider(installedProv, targetModelId);
        if (m) {
          matchedProvider = installedProv;
          matchedModelDef = m;
        }
      }
    }
  }

  // 4. 若在配置中成功定位到 Provider
  if (matchedProvider) {
    const isInstalled = matchedProvider.type === 'installed' || (matchedModelDef?.id || targetModelId).startsWith('installed:');
    const finalModelId = matchedModelDef?.id || targetModelId;

    return {
      model: finalModelId,
      type: isInstalled ? 'installed' : 'api',
      providerId: matchedProvider.id,
      providerName: matchedProvider.name,
      baseUrl: isInstalled ? '' : (matchedProvider.baseUrl || appConfig.ai?.baseUrl || '').trim(),
      apiKey: isInstalled ? '' : (matchedProvider.apiKey || appConfig.ai?.apiKey || '').trim(),
      source: 'providers.json'
    };
  }

  // 5. 检查环境变量默认兜底配置
  const isDefaultConfigModel = targetModelId === appConfig.ai?.model;
  if (isDefaultConfigModel && appConfig.ai?.baseUrl) {
    return {
      model: targetModelId,
      type: 'api',
      baseUrl: appConfig.ai.baseUrl.trim(),
      apiKey: (appConfig.ai.apiKey || '').trim(),
      source: 'env_default',
      providerName: '系统默认配置'
    };
  }

  // 6. 确定性异常：未找到已配置模型
  const allAvailableModels = [];
  for (const prov of providers) {
    for (const m of prov.models || []) {
      const id = m.id || m.rawId;
      if (id) allAvailableModels.push(id);
    }
  }

  throw {
    code: 'MODEL_NOT_FOUND',
    message: `调用的大模型 "${rawTarget}" 未在系统配置中找到。当前已配置的可用模型: [${allAvailableModels.join(', ')}]`,
    availableModels: allAvailableModels
  };
}
