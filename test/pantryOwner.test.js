const { pantryOwnerCheck } = require('../src/pantryOwner'); // adjust path if needed

describe('Pantry Owner Check Unit Tests', () => {
  
  test('valid owner and pantry', () => {
    expect(pantryOwnerCheck("valid_owner_id", "valid_pantry_id")).toBe(true);
  });

  test('incorrect member ID', () => {
    expect(pantryOwnerCheck("valid_member_id", "valid_pantry_id")).toBe(false);
  });

  test('boundary cases', () => {
    expect(pantryOwnerCheck(" valid_owner_id ", "valid_pantry_id")).toBe(false);
    expect(pantryOwnerCheck("a", "valid_pantry_id")).toBe(false);
  });

  test('edge cases', () => {
    expect(pantryOwnerCheck("deleted_user_id", "valid_pantry_id")).toBe(false);
    expect(pantryOwnerCheck("valid_owner_id", "orphaned_pantry_id")).toBe(false);
    expect(pantryOwnerCheck("user!@#$%", "valid_pantry_id")).toBe(false);
  });

});
