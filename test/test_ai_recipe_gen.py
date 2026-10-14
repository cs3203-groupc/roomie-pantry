import unittest
import sys
import os

# Add src to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from ai_recipe_gen import AIRecipeGen


class TestAIRecipeGen(unittest.TestCase):
    def setUp(self):
        self.ai = AIRecipeGen()

    def test_query_valid(self):
        prompt = "What can I cook with eggs?"
        result = self.ai.query(prompt)
        self.assertEqual(result, f"AI Response to: {prompt}")

    def test_query_invalid_type(self):
        for invalid in [123, None, ["hello"], {"p": "test"}, True]:
            with self.subTest(invalid=invalid):
                with self.assertRaises(TypeError) as ctx:
                    self.ai.query(invalid)
                self.assertEqual(str(ctx.exception), "Prompt must be a string")

    def test_query_empty_or_whitespace(self):
        for invalid in ["", "   ", "\n\t  ", "\r\n "]:
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError) as ctx:
                    self.ai.query(invalid)
                self.assertEqual(str(ctx.exception), "Prompt cannot be empty or whitespace only")

    def test_generate_valid(self):
        items = ["eggs", "cheese", "bread"]
        result = self.ai.generate(items)
        self.assertIsInstance(result, dict)
        self.assertEqual(result.get("title"), "Quick Pantry Meal")
        self.assertEqual(result.get("ingredients"), items)

        # Immutability check: modifying input list should not affect returned result
        items.append("sugar")
        self.assertNotIn("sugar", result.get("ingredients"))

    def test_generate_invalid_type(self):
        for invalid in ["eggs", 123, None, ("eggs", "cheese"), {"eggs": 1}]:
            with self.subTest(invalid=invalid):
                with self.assertRaises(TypeError) as ctx:
                    self.ai.generate(invalid)
                self.assertEqual(str(ctx.exception), "Items must be provided as a list")

    def test_generate_empty_list(self):
        with self.assertRaises(ValueError) as ctx:
            self.ai.generate([])
        self.assertEqual(str(ctx.exception), "Pantry is empty; at least one ingredient required")

    def test_with_custom_client(self):
        class MockClient:
            def query(self, prompt):
                return f"Mocked Gemini: {prompt}"

            def generate(self, items):
                return {"title": "Mocked Shakshuka", "ingredients": items}

        ai = AIRecipeGen(api_key="mock", client=MockClient())
        self.assertEqual(ai.query("Hello"), "Mocked Gemini: Hello")
        res = ai.generate(["eggs", "tomato"])
        self.assertEqual(res["title"], "Mocked Shakshuka")
        self.assertEqual(res["ingredients"], ["eggs", "tomato"])

    def test_graceful_fallback_when_client_throws(self):
        class FailingClient:
            def query(self, prompt):
                raise RuntimeError("Service unavailable")

            def generate(self, items):
                raise RuntimeError("Service unavailable")

        ai = AIRecipeGen(api_key="mock", client=FailingClient())
        self.assertEqual(ai.query("Test"), "AI Response to: Test")
        res = ai.generate(["spinach", "mushrooms"])
        self.assertEqual(res["title"], "Quick Pantry Meal")
        self.assertEqual(res["ingredients"], ["spinach", "mushrooms"])

    def test_extract_json_markdown_with_commentary(self):
        text = 'Here is your recipe:\n```json\n{\n  "title": "Avocado Toast",\n  "ingredients": ["bread", "avocado"]\n}\n```\nEnjoy! {healthy}'
        parsed = self.ai._extract_json(text)
        self.assertIsInstance(parsed, dict)
        self.assertEqual(parsed.get("title"), "Avocado Toast")
        self.assertEqual(parsed.get("ingredients"), ["bread", "avocado"])


if __name__ == "__main__":
    unittest.main()
