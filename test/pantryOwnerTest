import unittest
from pantryOwner import pantryOwnerCheck

class TestPantryOwnerCheck(unittest.TestCase):
    def test_pantry_owner_check_valid(self):
        self.assertTrue(pantryOwnerCheck("valid_owner_id", "valid_pantry_id"))
        
    def test_pantry_owner_check_incorrect(self):
        self.assertFalse(pantryOwnerCheck("valid_member_id", "valid_pantry_id"))
        
    def test_pantry_owner_check_boundary(self):
        self.assertFalse(pantryOwnerCheck(" valid_owner_id ", "valid_pantry_id"))
        self.assertFalse(pantryOwnerCheck("a", "valid_pantry_id"))
        
    def test_pantry_owner_check_edge_case(self):
        self.assertFalse(pantryOwnerCheck("deleted_user_id", "valid_pantry_id"))
        self.assertFalse(pantryOwnerCheck("valid_owner_id", "orphaned_pantry_id"))
        self.assertFalse(pantryOwnerCheck("user!@#$%", "valid_pantry_id"))

if __name__ == '__main__':
    unittest.main()
