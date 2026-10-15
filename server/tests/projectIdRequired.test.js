import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { storage, requireProjectId } from '../src/storage/index.js';
import { requireProjectIdMiddleware } from '../src/runtime/requireProjectId.js';

/**
 * projectId 必填化回归测试
 *
 * 历史上大量使用 `projectId || 'proj_wukong_01'` 兜底：漏传时会静默把数据
 * 写进同一个魔法项目，掩盖调用缺陷。这里锁定「缺失即报错、不静默兜底」。
 */
describe('projectId must be explicitly provided', () => {
  const testProjectId = `test_require_pid_${Date.now()}`;

  before(async () => {
    await storage.saveProject({ id: testProjectId, title: '必填校验测试项目' });
  });

  after(async () => {
    await storage.deleteProject(testProjectId).catch(() => {});
  });

  describe('requireProjectId()', () => {
    it('should return the trimmed id when provided', () => {
      assert.equal(requireProjectId('  proj_abc  '), 'proj_abc');
    });

    it('should throw for undefined / null / empty / whitespace', () => {
      for (const bad of [undefined, null, '', '   ', 0, false, {}, []]) {
        assert.throws(
          () => requireProjectId(bad, 'unit-test'),
          /projectId 为必填参数/,
          `should reject ${JSON.stringify(bad)}`
        );
      }
    });

    it('should include the caller context in the error message', () => {
      assert.throws(
        () => requireProjectId(undefined, 'operator:mediaScan'),
        /operator:mediaScan/
      );
    });
  });

  describe('storage methods reject missing projectId', () => {
    const methods = [
      'getMessages', 'saveMessages', 'getPipeline', 'savePipeline',
      'getAssets', 'saveAssets', 'getStoryboard', 'saveStoryboard',
      'getProjectWorkDir'
    ];

    for (const name of methods) {
      it(`storage.${name}() should throw when projectId is missing`, async () => {
        await assert.rejects(
          async () => storage[name](undefined),
          /projectId 为必填参数/,
          `${name} must not silently fall back to a default project`
        );
      });
    }

    it('should still work normally with a valid projectId', async () => {
      const assets = await storage.getAssets(testProjectId);
      assert.ok(Array.isArray(assets));
    });
  });

  describe('express middleware', () => {
    function runMiddleware(source, req) {
      let nextCalled = false;
      let response = null;
      const res = {
        status(code) { this._code = code; return this; },
        json(payload) { response = { code: this._code, payload }; return this; }
      };
      const mw = requireProjectIdMiddleware(source, '/test');
      mw(req, res, () => { nextCalled = true; });
      return { nextCalled, response };
    }

    it('should pass through and set req.projectId when provided', () => {
      const req = { query: { projectId: 'proj_ok' } };
      const { nextCalled, response } = runMiddleware('query', req);
      assert.equal(nextCalled, true);
      assert.equal(response, null);
      assert.equal(req.projectId, 'proj_ok');
    });

    it('should respond 400 with missingParam when absent', () => {
      const { nextCalled, response } = runMiddleware('query', { query: {} });
      assert.equal(nextCalled, false);
      assert.equal(response.code, 400);
      assert.equal(response.payload.missingParam, 'projectId');
      assert.match(response.payload.error, /projectId 为必填参数/);
    });

    it("'body' source reads req.body, 'either' prefers body then query", () => {
      const r1 = { body: { projectId: 'from_body' } };
      runMiddleware('body', r1);
      assert.equal(r1.projectId, 'from_body');

      const r2 = { body: {}, query: { projectId: 'from_query' } };
      runMiddleware('either', r2);
      assert.equal(r2.projectId, 'from_query');
    });
  });

  describe('seed field is not persisted', () => {
    it('should not write seed/__isNew into project.json', async () => {
      const proj = await storage.getProject(testProjectId);
      assert.equal(proj.seed, undefined, 'seed is a create-time directive only');
      assert.equal(proj.__isNew, undefined);
    });
  });
});
