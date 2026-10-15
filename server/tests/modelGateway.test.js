import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ModelGateway, MODEL_TYPE } from '../src/services/ai/modelGateway.js';

describe('ModelGateway (总关 - 模型分类与职责分流)', () => {
  it('should accurately determine model types based on configuration', () => {
    const gateway = new ModelGateway();

    // 1. Explicitly installed type
    assert.equal(
      gateway.determineType({ type: 'installed', model: 'qwen3-vl-4b' }),
      MODEL_TYPE.INSTALLED
    );

    // 2. Prefixed with installed:
    assert.equal(
      gateway.determineType({ model: 'installed:qwen3-vl-8b' }),
      MODEL_TYPE.INSTALLED
    );

    // 3. Provider ID provider_installed
    assert.equal(
      gateway.determineType({ providerId: 'provider_installed', model: 'any-model' }),
      MODEL_TYPE.INSTALLED
    );

    // 4. API endpoint with baseUrl
    assert.equal(
      gateway.determineType({ baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' }),
      MODEL_TYPE.API
    );

    // 5. Local daemon port (Ollama, LM Studio) is also API type
    assert.equal(
      gateway.determineType({ baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5-coder' }),
      MODEL_TYPE.API
    );
  });

  it('should dispatch to installedRunner when configured model is an in-app installed model', async () => {
    let installedRunnerCalled = false;
    let apiRunnerCalled = false;

    const mockInstalled = {
      async chat(opts) {
        installedRunnerCalled = true;
        assert.equal(opts.modelId, 'installed:qwen3-vl-4b');
        return { choices: [{ message: { content: 'from_installed_scheme_a' } }] };
      }
    };

    const mockApi = {
      async chat() {
        apiRunnerCalled = true;
        return { choices: [{ message: { content: 'from_api' } }] };
      }
    };

    const gateway = new ModelGateway({ api: mockApi, installed: mockInstalled });

    const res = await gateway.chat({
      messages: [{ role: 'user', content: 'hello' }],
      modelConfig: {
        type: 'installed',
        model: 'installed:qwen3-vl-4b'
      }
    });

    assert.equal(installedRunnerCalled, true, 'Expected installedRunner (Scheme A) to be called');
    assert.equal(apiRunnerCalled, false, 'apiRunner should NOT be called for installed models');
    assert.equal(res.choices[0].message.content, 'from_installed_scheme_a');
  });

  it('should dispatch to apiRunner when configured model is an API endpoint', async () => {
    let installedRunnerCalled = false;
    let apiRunnerCalled = false;

    const mockInstalled = {
      async chat() {
        installedRunnerCalled = true;
        return {};
      }
    };

    const mockApi = {
      async chat(opts) {
        apiRunnerCalled = true;
        assert.equal(opts.baseUrl, 'https://ai.yimmx.xyz/v1');
        assert.equal(opts.model, 'gemini-3.8-flash-high');
        return { choices: [{ message: { content: 'from_api_cloud' } }] };
      }
    };

    const gateway = new ModelGateway({ api: mockApi, installed: mockInstalled });

    const res = await gateway.chat({
      messages: [{ role: 'user', content: 'hello' }],
      modelConfig: {
        baseUrl: 'https://ai.yimmx.xyz/v1',
        apiKey: 'test-key',
        model: 'gemini-3.8-flash-high'
      }
    });

    assert.equal(apiRunnerCalled, true, 'Expected apiRunner to be called for API endpoint');
    assert.equal(installedRunnerCalled, false, 'installedRunner should NOT be called for API endpoint');
    assert.equal(res.choices[0].message.content, 'from_api_cloud');
  });

  it('should dispatch streaming to the correct dedicated runner', async () => {
    let installedStreamCalled = false;
    let apiStreamCalled = false;

    const mockInstalled = {
      async stream() {
        installedStreamCalled = true;
      }
    };

    const mockApi = {
      async stream() {
        apiStreamCalled = true;
      }
    };

    const gateway = new ModelGateway({ api: mockApi, installed: mockInstalled });

    // Stream to API
    await gateway.streamChat({
      messages: [{ role: 'user', content: 'test' }],
      modelConfig: { baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen' }
    });
    assert.equal(apiStreamCalled, true);
    assert.equal(installedStreamCalled, false);

    // Stream to Installed
    await gateway.streamChat({
      messages: [{ role: 'user', content: 'test' }],
      modelConfig: { type: 'installed', model: 'installed:qwen3-vl-4b' }
    });
    assert.equal(installedStreamCalled, true);
  });
});
