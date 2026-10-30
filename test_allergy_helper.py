import unittest
from allergy_helper import AllergyHelper

class TestAllergyHelperAdd(unittest.TestCase):

    def setUp(self):
        self.helper = AllergyHelper()

    def test_valid_allergy_string(self):
        self.assertTrue(self.helper.add("Peanuts"))

    def test_invalid_data_types(self):
        self.assertFalse(self.helper.add(True))
        self.assertFalse(self.helper.add(None))
        self.assertFalse(self.helper.add(123))

    def test_boundary_min_characters(self):
        self.assertFalse(self.helper.add("A"))
        self.assertTrue(self.helper.add("Pe"))

    def test_edge_empty_and_whitespace(self):
        self.assertFalse(self.helper.add(""))
        self.assertFalse(self.helper.add("   "))

if __name__ == '__main__':
    unittest.main()