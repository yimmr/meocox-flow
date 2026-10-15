import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Sanity Check', () => {
  it('should run node built-in test runner successfully', () => {
    assert.equal(1 + 1, 2);
  });
});
