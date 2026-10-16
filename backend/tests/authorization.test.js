import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessWorkItem, canManageWorkItem } from '../src/utils/authorization.js';

const item = { id: 7, team_id: 2, created_by: 10 };

test('admin can access items across teams', () => {
  assert.equal(canAccessWorkItem({id:1,role:'ADMIN'}, item, []), true);
});

test('members only access items in their teams', () => {
  assert.equal(canAccessWorkItem({id:10,role:'MEMBER'}, item, [2]), true);
  assert.equal(canAccessWorkItem({id:11,role:'MEMBER'}, item, [3]), false);
});

test('manager can manage items in their team, member can manage own created item only', () => {
  assert.equal(canManageWorkItem({id:20,role:'MANAGER'}, item, [2]), true);
  assert.equal(canManageWorkItem({id:10,role:'MEMBER'}, item, [2]), true);
  assert.equal(canManageWorkItem({id:11,role:'MEMBER'}, item, [2]), false);
});
