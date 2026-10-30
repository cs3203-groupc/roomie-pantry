const test = require('node:test');
const assert = require('node:assert/strict');

const { pantryOwnerCheck } = require('../src/pantryOwner');

test('PantryOwnerCheck: valid owner and pantry', () => {
  assert.equal(pantryOwnerCheck('valid_owner_id', 'valid_pantry_id'), true);
});

test('PantryOwnerCheck: incorrect member ID', () => {
  assert.equal(pantryOwnerCheck('valid_member_id', 'valid_pantry_id'), false);
});

test('PantryOwnerCheck: boundary cases', () => {
  assert.equal(pantryOwnerCheck(' valid_owner_id ', 'valid_pantry_id'), false);
  assert.equal(pantryOwnerCheck('a', 'valid_pantry_id'), false);
});

test('PantryOwnerCheck: edge cases', () => {
  assert.equal(pantryOwnerCheck('deleted_user_id', 'valid_pantry_id'), false);
  assert.equal(pantryOwnerCheck('valid_owner_id', 'orphaned_pantry_id'), false);
  assert.equal(pantryOwnerCheck('user!@#$%', 'valid_pantry_id'), false);
});
