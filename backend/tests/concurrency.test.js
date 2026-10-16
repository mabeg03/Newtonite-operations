import test from 'node:test';
import assert from 'node:assert/strict';

function isCurrentVersion(clientVersion, databaseVersion) {
  return Number(clientVersion) === Number(databaseVersion);
}
function claimCanSucceed({ assigneeId, version, expectedVersion }) {
  return assigneeId == null && Number(version) === Number(expectedVersion);
}

test('accepts update when client has the latest version', () => {
  assert.equal(isCurrentVersion(4,4), true);
});
test('rejects stale update rather than overwriting newer data', () => {
  assert.equal(isCurrentVersion(3,4), false);
});
test('claim precondition allows only unassigned item at current version', () => {
  assert.equal(claimCanSucceed({assigneeId:null,version:2,expectedVersion:2}), true);
  assert.equal(claimCanSucceed({assigneeId:12,version:2,expectedVersion:2}), false);
  assert.equal(claimCanSucceed({assigneeId:null,version:3,expectedVersion:2}), false);
});
