import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransition, assertTransition, canApprove } from '../src/utils/workflow.js';

test('allows expected forward and recovery transitions', () => {
  assert.equal(canTransition('OPEN','IN_PROGRESS'), true);
  assert.equal(canTransition('BLOCKED','RESOLVED'), true);
  assert.equal(canTransition('RESOLVED','OPEN'), true);
  assert.equal(canTransition('IN_PROGRESS','AWAITING_APPROVAL'), true);
});

test('rejects reopening a closed item and invalid status names', () => {
  assert.equal(canTransition('CLOSED','OPEN'), false);
  assert.equal(canTransition('OPEN','BANANA'), false);
  assert.throws(() => assertTransition('CLOSED','OPEN'), { status: 422 });
});

test('only Lead or Admin can pass the approval step', () => {
  assert.equal(canApprove({ role: 'LEAD' }), true);
  assert.equal(canApprove({ role: 'ADMIN' }), true);
  assert.equal(canApprove({ role: 'MANAGER' }), false);
  assert.equal(canApprove({ role: 'MEMBER' }), false);
});

test('same status is a no-op transition', () => {
  assert.equal(canTransition('IN_PROGRESS','IN_PROGRESS'), true);
});
