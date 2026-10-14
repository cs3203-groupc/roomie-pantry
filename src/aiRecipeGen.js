const fs = require('fs');
const path = require('path');

// Lightly load .env file if present
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...vals] = trimmed.split('=');
        const k = key.trim();
        const v = vals.join('=').trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    }
  }
} catch (_e) {}

class ValueError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValueError';
  }
}

let GoogleGenAIClass = null;
try {
  const genai = require('@google/genai');
  GoogleGenAIClass = genai.GoogleGenAI;
} catch (_err) {
  // @google/genai optional or not yet installed
}

class AIRecipeGen {
  /**
   * @param {Object} [options]
   * @param {string} [options.apiKey] - Gemini or OpenAI API Key
   * @param {string} [options.model] - Model name (defaults to 'gemini-3.8-flash')
   * @param {string} [options.provider] - 'gemini' (default) or 'openai'
   * @param {boolean} [options.stub] - Force stub response if true
   * @param {Object} [options.client] - Injected client for testing / custom AI handling
   */
  constructor({ apiKey, model, provider = 'gemini', stub, client } = {}) {
    this.provider = provider;
    this.apiKey = apiKey || (provider === 'gemini' ? (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) : process.env.OPENAI_API_KEY) || null;
    this.model = model || (provider === 'gemini' ? 'gemini-3.8-flash' : 'gpt-4o-mini');
    this.client = client;

    if (stub !== undefined) {
      this.stub = Boolean(stub);
    } else if (client) {
      this.stub = false;
    } else if (apiKey) {
      this.stub = false;
    } else {
      this.stub = true;
    }
  }

  /**
   * Processes a natural language prompt for the AI.
   * @param {string} prompt
   * @param {Object} [options]
   * @returns {string|Promise<string>}
   */
  query(prompt, options = {}) {
    if (typeof prompt !== 'string') {
      throw new TypeError('Prompt must be a string');
    }
    if (!prompt.trim()) {
      throw new ValueError('Prompt cannot be empty or whitespace only');
    }

    const isStub = options.stub !== undefined ? Boolean(options.stub) : this.stub;
    if (isStub || options.sync) {
      return `AI Response to: ${prompt}`;
    }

    return this.queryAsync(prompt, options);
  }

  /**
   * Generates a recipe strictly using available pantry items.
   * @param {string[]} items
   * @param {Object} [options]
   * @returns {Object|Promise<Object>}
   */
  generate(items, options = {}) {
    if (!Array.isArray(items)) {
      throw new TypeError('Items must be provided as a list');
    }
    if (items.length === 0) {
      throw new ValueError('Pantry is empty; at least one ingredient required');
    }

    const isStub = options.stub !== undefined ? Boolean(options.stub) : this.stub;
    if (isStub || options.sync) {
      return {
        title: 'Quick Pantry Meal',
        ingredients: Array.from(items)
      };
    }

    return this.generateAsync(items, options);
  }

  /**
   * Asynchronously processes a natural language prompt using Gemini Studio or injected client.
   * @param {string} prompt
   * @param {Object} [options]
   * @returns {Promise<string>}
   */
  async queryAsync(prompt, options = {}) {
    if (typeof prompt !== 'string') {
      throw new TypeError('Prompt must be a string');
    }
    if (!prompt.trim()) {
      throw new ValueError('Prompt cannot be empty or whitespace only');
    }

    const isStub = options.stub !== undefined ? Boolean(options.stub) : this.stub;
    if (isStub) {
      return `AI Response to: ${prompt}`;
    }

    try {
      if (this.client && typeof this.client.query === 'function') {
        return await this.client.query(prompt, options);
      }

      if (this.client && this.client.models && typeof this.client.models.generateContent === 'function') {
        const resp = await this.client.models.generateContent({
          model: this.model,
          contents: prompt
        });
        return resp.text || (resp.candidates?.[0]?.content?.parts?.[0]?.text ?? `AI Response to: ${prompt}`);
      }

      if (this.provider === 'gemini') {
        return await this._callGemini(prompt);
      } else if (this.provider === 'openai') {
        return await this._callOpenAI([{ role: 'user', content: prompt }]);
      }

      return `AI Response to: ${prompt}`;
    } catch (err) {
      if (options.strict) {
        throw err;
      }
      return `AI Response to: ${prompt}`;
    }
  }

  /**
   * Asynchronously generates a recipe strictly using available pantry items.
   * @param {string[]} items
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async generateAsync(items, options = {}) {
    if (!Array.isArray(items)) {
      throw new TypeError('Items must be provided as a list');
    }
    if (items.length === 0) {
      throw new ValueError('Pantry is empty; at least one ingredient required');
    }

    const isStub = options.stub !== undefined ? Boolean(options.stub) : this.stub;
    if (isStub) {
      return {
        title: 'Quick Pantry Meal',
        ingredients: Array.from(items)
      };
    }

    if (this.client && typeof this.client.generate === 'function') {
      return await this.client.generate(items, options);
    }

    const systemPrompt = `You are a culinary AI assistant for RoomiePantry. Generate a recipe strictly using only the following available pantry items: ${items.join(', ')}. Return ONLY a JSON object with this exact shape: {"title": "Recipe Title", "ingredients": ["item1", "item2"]}. Do not include markdown backticks or commentary.`;

    try {
      let rawText = '';
      if (this.client && this.client.models && typeof this.client.models.generateContent === 'function') {
        const resp = await this.client.models.generateContent({
          model: this.model,
          contents: systemPrompt
        });
        rawText = resp.text || (resp.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
      } else if (this.provider === 'gemini') {
        rawText = await this._callGemini(systemPrompt);
      } else if (this.provider === 'openai') {
        rawText = await this._callOpenAI([
          { role: 'system', content: 'You are a helpful kitchen assistant that responds only in JSON.' },
          { role: 'user', content: systemPrompt }
        ]);
      }

      const parsed = this._extractJson(rawText);
      if (parsed && typeof parsed.title === 'string' && Array.isArray(parsed.ingredients)) {
        return parsed;
      }
      return {
        title: (parsed && typeof parsed.title === 'string') ? parsed.title : 'Quick Pantry Meal',
        ingredients: (parsed && Array.isArray(parsed.ingredients)) ? parsed.ingredients : Array.from(items)
      };
    } catch (_err) {
      if (options.strict) {
        throw _err;
      }
      return {
        title: 'Quick Pantry Meal',
        ingredients: Array.from(items)
      };
    }
  }

  querySync(prompt) {
    return this.query(prompt, { sync: true });
  }

  generateSync(items) {
    return this.generate(items, { sync: true });
  }

  async _callGemini(promptText) {
    if (this.client && this.client.models && typeof this.client.models.generateContent === 'function') {
      const resp = await this.client.models.generateContent({
        model: this.model,
        contents: promptText
      });
      return resp.text || (resp.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
    }

    if (!this.apiKey) {
      return `AI Response to: ${promptText}`;
    }

    const candidateModels = [this.model, 'gemini-3.8-flash', 'gemini-flash-latest', 'gemma-4-26b-a4b-it', 'gemini-3.5-flash'];
    const uniqueModels = [...new Set(candidateModels.filter(Boolean))];

    if (GoogleGenAIClass && this.apiKey) {
      const ai = new GoogleGenAIClass({ apiKey: this.apiKey });
      let lastErr = null;
      for (const m of uniqueModels) {
        try {
          const resp = await ai.models.generateContent({
            model: m,
            contents: promptText
          });
          const text = resp.text || (resp.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
          if (text) return text;
        } catch (err) {
          lastErr = err;
          continue;
        }
      }
      if (lastErr) throw lastErr;
    }

    // Direct HTTP fetch fallback to Google AI Studio API
    let fetchErr = null;
    for (const m of uniqueModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${this.apiKey}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }]
          })
        });

        if (!resp.ok) {
          fetchErr = new Error(`Gemini API error (${resp.status})`);
          continue;
        }

        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      } catch (err) {
        fetchErr = err;
        continue;
      }
    }
    if (fetchErr) throw fetchErr;

    return `AI Response to: ${promptText}`;
  }

  async _callOpenAI(messages) {
    if (!this.apiKey) {
      return '';
    }
    const url = 'https://api.openai.com/v1/chat/completions';
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenAI API error (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  }

  _extractJson(text) {
    if (!text || typeof text !== 'string') return null;

    // 1. Try markdown code fences: ```json { ... } ``` or ``` { ... } ```
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_e) {
        // Fall through to regex extraction
      }
    }

    // 2. Direct JSON parse
    try {
      const parsed = JSON.parse(text.trim());
      if (parsed && typeof parsed === 'object') return parsed;
    } catch (_e) {}

    // 3. Search for outermost JSON object
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    if (startIdx !== -1 && endIdx > startIdx) {
      const candidate = text.substring(startIdx, endIdx + 1);
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (_e) {}
    }

    return null;
  }
}

const defaultApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY;
const aiRecipeGen = new AIRecipeGen({
  apiKey: defaultApiKey,
  stub: !defaultApiKey
});

module.exports = {
  AIRecipeGen,
  aiRecipeGen,
  ValueError
};
