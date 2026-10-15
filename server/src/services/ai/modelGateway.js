import { apiRunner } from './apiRunner.js';
import { installedRunner } from './installedRunner.js';
import { config as appConfig } from '../../config.js';
import { storage } from '../../storage/index.js';
import { inspectModelPreset, MODEL_PRESETS } from '../perception/localEngine/paths.js';
import { getLibraryModelById } from '../perception/localEngine/modelLibrary.js';

export const MODEL_TYPE = {
  INSTALLED: 'installed',
  API: 'api'
};

export class ModelGateway {
  constructor({ api = apiRunner, installed = installedRunner } = {}) {
    this.api = api;
    this.installed = installed;
  }

  /**
   * Determine model category: 'installed' (In-App Model run by Scheme A) or 'api' (HTTP Endpoint)
   */
  determineType(resolvedConfig) {
    if (!resolvedConfig) return MODEL_TYPE.API;

    const rawType = (resolvedConfig.type || '').toLowerCase();
    const modelStr = String(resolvedConfig.model || resolvedConfig.modelId || '').trim();

    // 1. Explicitly marked as installed
    if (rawType === 'installed' || resolvedConfig.providerId === 'provider_installed') {
      return MODEL_TYPE.INSTALLED;
    }

    // 2. Prefixed with installed: (e.g. 'installed:qwen3-vl-4b')
    if (modelStr.toLowerCase().startsWith('installed:')) {
      return MODEL_TYPE.INSTALLED;
    }

    // 3. Model ID matches any defined in-app model preset or library model (e.g. 'qwen3-vl-4b')
    const cleanId = modelStr.toLowerCase().replace(/^installed:/, '');
    if (MODEL_PRESETS.some(p => p.id === cleanId) || Boolean(getLibraryModelById(cleanId))) {
      return MODEL_TYPE.INSTALLED;
    }

    // 4. Everything else with a baseUrl (cloud or local daemon port) or custom provider is API
    return MODEL_TYPE.API;
  }

  /**
   * Resolve effective model configuration from passed config or user/system active selection
   */
  async resolveConfig(customConfig = {}) {
    // If caller provided full explicit configuration with model
    if (customConfig && customConfig.model && (customConfig.baseUrl || customConfig.type === 'installed')) {
      return {
        type: this.determineType(customConfig),
        model: customConfig.model,
        baseUrl: customConfig.baseUrl || '',
        apiKey: customConfig.apiKey || '',
        providerId: customConfig.providerId || null
      };
    }

    // Otherwise load user's currently configured active provider and active model
    let providersConfig = null;
    try {
      providersConfig = await storage.getProvidersConfig();
    } catch {}

    const activeProviderId = customConfig.providerId || providersConfig?.activeProviderId;
    const activeModelId = customConfig.model || customConfig.modelId || providersConfig?.activeModelId;

    const activeProvider = (providersConfig?.providers || []).find(p => p.id === activeProviderId);

    // If active selection points to an installed model
    const candidateModelId = activeModelId || customConfig.model || appConfig.ai.model;
    const isInstalled = this.determineType({
      type: customConfig.type || activeProvider?.type,
      model: candidateModelId,
      providerId: activeProviderId
    }) === MODEL_TYPE.INSTALLED;

    if (isInstalled) {
      return {
        type: MODEL_TYPE.INSTALLED,
        model: candidateModelId,
        baseUrl: '',
        apiKey: '',
        providerId: activeProviderId || 'provider_installed'
      };
    }

    // API endpoint (Cloud or Local daemon)
    return {
      type: MODEL_TYPE.API,
      model: candidateModelId,
      baseUrl: (customConfig.baseUrl || activeProvider?.baseUrl || appConfig.ai.baseUrl || '').trim(),
      apiKey: (customConfig.apiKey || activeProvider?.apiKey || appConfig.ai.apiKey || '').trim(),
      providerId: activeProviderId || activeProvider?.id || 'provider_custom'
    };
  }

  /**
   * Main non-streaming chat entry point ("总关")
   */
  async chat({ messages, modelConfig = {}, temperature = 0.2, max_tokens = null, response_format = null, timeout = 60000 }) {
    const effective = await this.resolveConfig(modelConfig);

    // 分流 1: 程序内置安装模型 -> 专门调用方案 A 执行器 (installedRunner)
    if (effective.type === MODEL_TYPE.INSTALLED) {
      console.log(`\n📦 [ModelGateway 总关] 判定类型: 程序内置安装模型 (方案 A) -> 模型: ${effective.model}`);
      return await this.installed.chat({
        modelId: effective.model,
        messages,
        temperature,
        max_tokens,
        response_format
      });
    }

    // 分流 2: API 地址 (云端或本机已有端口) -> 专门调用 API 执行器 (apiRunner)
    console.log(`\n🌐 [ModelGateway 总关] 判定类型: API 地址 -> 端点: ${effective.baseUrl} | 模型: ${effective.model}`);
    return await this.api.chat({
      baseUrl: effective.baseUrl,
      apiKey: effective.apiKey,
      model: effective.model,
      messages,
      temperature,
      max_tokens,
      response_format,
      timeout
    });
  }

  /**
   * Main streaming chat entry point ("总关")
   */
  async streamChat({ messages, modelConfig = {}, temperature = 0.7, max_tokens = null, timeout = 60000, onChunk, onComplete, onError }) {
    const effective = await this.resolveConfig(modelConfig);

    // 分流 1: 程序内置安装模型 -> 专门调用方案 A 执行器 (installedRunner)
    if (effective.type === MODEL_TYPE.INSTALLED) {
      console.log(`\n📦 [ModelGateway 总关流式] 判定类型: 程序内置安装模型 (方案 A) -> 模型: ${effective.model}`);
      return await this.installed.stream({
        modelId: effective.model,
        messages,
        temperature,
        max_tokens,
        onChunk,
        onComplete,
        onError
      });
    }

    // 分流 2: API 地址 (云端或本机已有端口) -> 专门调用 API 执行器 (apiRunner)
    console.log(`\n🌐 [ModelGateway 总关流式] 判定类型: API 地址 -> 端点: ${effective.baseUrl} | 模型: ${effective.model}`);
    return await this.api.stream({
      baseUrl: effective.baseUrl,
      apiKey: effective.apiKey,
      model: effective.model,
      messages,
      temperature,
      max_tokens,
      timeout,
      onChunk,
      onComplete,
      onError
    });
  }
}

export const modelGateway = new ModelGateway();
