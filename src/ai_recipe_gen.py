import json
import os
import re
import urllib.request
import urllib.error

# Lightly load .env file if present
try:
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                trimmed = line.strip()
                if trimmed and not trimmed.startswith("#") and "=" in trimmed:
                    k, v = trimmed.split("=", 1)
                    k, v = k.strip(), v.strip().strip("'\"")
                    if k not in os.environ:
                        os.environ[k] = v
except Exception:
    pass


class AIRecipeGen:
    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gemini-3.8-flash",
        provider: str = "gemini",
        stub: bool | None = None,
        client=None
    ):
        self.provider = provider
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self.model = model
        self.client = client

        if stub is not None:
            self.stub = bool(stub)
        elif client is not None:
            self.stub = False
        elif api_key is not None:
            self.stub = False
        else:
            self.stub = True

    def query(self, prompt: str) -> str:
        """Processes a natural language prompt for the AI."""
        if not isinstance(prompt, str):
            raise TypeError("Prompt must be a string")
        if not prompt.strip():
            raise ValueError("Prompt cannot be empty or whitespace only")

        if self.stub or (not self.api_key and not self.client):
            # Stub response
            return f"AI Response to: {prompt}"

        try:
            if self.client and hasattr(self.client, "query"):
                return self.client.query(prompt)
            return self._call_gemini(prompt)
        except Exception:
            return f"AI Response to: {prompt}"

    def generate(self, items: list[str]) -> dict:
        """Generates a recipe strictly using available pantry items."""
        if not isinstance(items, list):
            raise TypeError("Items must be provided as a list")
        if not items:
            raise ValueError("Pantry is empty; at least one ingredient required")

        if self.stub or (not self.api_key and not self.client):
            # Stub response returning recipe name and ingredients used
            return {
                "title": "Quick Pantry Meal",
                "ingredients": list(items)
            }

        try:
            if self.client and hasattr(self.client, "generate"):
                return self.client.generate(items)

            prompt = (
                f"You are a culinary AI assistant for RoomiePantry. "
                f"Generate a recipe strictly using only the following available pantry items: {', '.join(items)}. "
                f"Return ONLY a JSON object with this exact shape: {{\"title\": \"Recipe Title\", \"ingredients\": [\"item1\", \"item2\"]}}. "
                f"Do not include markdown backticks or commentary."
            )

            raw_text = self._call_gemini(prompt)
            parsed = self._extract_json(raw_text)
            if isinstance(parsed, dict) and "title" in parsed and "ingredients" in parsed:
                return parsed
            return {
                "title": parsed.get("title", "Quick Pantry Meal") if isinstance(parsed, dict) else "Quick Pantry Meal",
                "ingredients": parsed.get("ingredients", list(items)) if isinstance(parsed, dict) and isinstance(parsed.get("ingredients"), list) else list(items)
            }
        except Exception:
            return {
                "title": "Quick Pantry Meal",
                "ingredients": list(items)
            }

    def _call_gemini(self, prompt: str) -> str:
        if not self.api_key:
            return f"AI Response to: {prompt}"

        candidate_models = [self.model, "gemini-3.8-flash", "gemini-flash-latest", "gemma-4-26b-a4b-it", "gemini-3.5-flash"]
        unique_models = []
        for m in candidate_models:
            if m and m not in unique_models:
                unique_models.append(m)

        last_err = None
        for m in unique_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={self.api_key}"
            data = json.dumps({
                "contents": [{"parts": [{"text": prompt}]}]
            }).encode("utf-8")
            req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    body = json.loads(resp.read().decode("utf-8"))
                    text = body.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                    if text:
                        return text
            except Exception as e:
                last_err = e
                continue

        if last_err:
            raise last_err
        return f"AI Response to: {prompt}"

    def _extract_json(self, text: str) -> dict | None:
        if not text or not isinstance(text, str):
            return None

        # 1. Markdown code fences
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
        if match:
            try:
                parsed = json.loads(match.group(1).strip())
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass

        # 2. Direct JSON
        try:
            parsed = json.loads(text.strip())
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

        # 3. Outer braces
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            try:
                parsed = json.loads(text[start:end + 1])
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass

        return None
