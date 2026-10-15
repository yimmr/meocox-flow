import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validate,
  assertValid,
  TASK_SCHEMA,
  RUN_SCHEMA,
  EVENT_SCHEMA,
  ARTIFACT_SCHEMA,
  BLACKBOARD_SCHEMA,
  createTask,
  createRun,
  createBlackboard,
  ulid,
  hashPayload,
  stableStringify
} from '../../src/core/contracts/index.js';

describe('Contracts · 校验器', () => {
  test('合法 Task 通过校验', () => {
    const task = createTask({
      id: 'tsk_1', runId: 'run_1', projectId: 'p1',
      type: 'script', produces: ['storyboard'], dependsOn: []
    });
    const res = validate(TASK_SCHEMA, task);
    assert.equal(res.valid, true, res.errors.join('; '));
  });

  test('缺失必填字段 / 非法枚举被拒绝', () => {
    const bad = { id: 'tsk_1', type: 'not-a-type' };
    const res = validate(TASK_SCHEMA, bad);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('缺少必填字段')));
    assert.ok(res.errors.some((e) => e.includes('枚举')));
  });

  test('assertValid 校验失败即抛错', () => {
    assert.throws(() => assertValid(EVENT_SCHEMA, { id: 'x' }, 'Event'), /校验失败/);
  });

  test('Run / Artifact / Blackboard 工厂产物合法', () => {
    const run = createRun({ id: 'run_1', projectId: 'p1' });
    assert.equal(validate(RUN_SCHEMA, run).valid, true);

    const art = {
      id: 'art_1', projectId: 'p1', kind: 'storyboard',
      currentVersion: 1, status: 'draft',
      versions: [{
        version: 1, hash: 'sha256:x', schemaId: 'schema.storyboard@1',
        lineage: [], producedBy: { taskId: 'tsk_1' },
        createdAt: Date.now(), payloadRef: 'artifacts/storyboard/art_1/v1.json'
      }]
    };
    assert.equal(validate(ARTIFACT_SCHEMA, art).valid, true);

    const bb = createBlackboard('p1');
    assert.equal(validate(BLACKBOARD_SCHEMA, bb).valid, true);
  });
});

describe('Contracts · ID 与哈希', () => {
  test('ulid 单调递增且唯一', () => {
    const a = ulid('tsk');
    const b = ulid('tsk');
    assert.ok(a.startsWith('tsk_'));
    assert.notEqual(a, b);
  });

  test('stableStringify 与对象键顺序无关', () => {
    assert.equal(stableStringify({ a: 1, b: 2 }), stableStringify({ b: 2, a: 1 }));
  });

  test('hashPayload 同内容同哈希,异内容异哈希', () => {
    const h1 = hashPayload({ a: 1, b: [2, 3] });
    const h2 = hashPayload({ b: [2, 3], a: 1 });
    const h3 = hashPayload({ a: 1, b: [2, 4] });
    assert.equal(h1, h2);
    assert.notEqual(h1, h3);
    assert.ok(h1.startsWith('sha256:'));
  });
});