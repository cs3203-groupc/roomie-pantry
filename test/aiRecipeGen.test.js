const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { AIRecipeGen, aiRecipeGen, ValueError } = require('../src/aiRecipeGen');
const { app } = require('../src/app');
const { PantryStore } = require('../src/store');

test('AIRecipeGen: query input validation', () => {
  const gen = new AIRecipeGen();

  // Non-string arguments must throw TypeError with exact message
  assert.throws(
    () => gen.query(123),
    { name: 'TypeError', message: 'Prompt must be a string' }
  );
  assert.throws(
    () => gen.query(null),
    { name: 'TypeError', message: 'Prompt must be a string' }
  );
  assert.throws(
    () => gen.query(undefined),
    { name: 'TypeError', message: 'Prompt must be a string' }
  );
  assert.throws(
    () => gen.query(true),
    { name: 'TypeError', message: 'Prompt must be a string' }
  );
  assert.throws(
    () => gen.query(['What can I make?']),
    { name: 'TypeError', message: 'Prompt must be a string' }
  );
  assert.throws(
    () => gen.query({ prompt: 'test' }),
    { name: 'TypeError', message: 'Prompt must be a string' }
  );

  // Empty string or whitespace-only must throw ValueError with exact message
  assert.throws(
    () => gen.query(''),
    { name: 'ValueError', message: 'Prompt cannot be empty or whitespace only' }
  );
  assert.throws(
    () => gen.query('   '),
    { name: 'ValueError', message: 'Prompt cannot be empty or whitespace only' }
  );
  assert.throws(
    () => gen.query('\t\r\n '),
    { name: 'ValueError', message: 'Prompt cannot be empty or whitespace only' }
  );
});

test('AIRecipeGen: query processes natural language prompt', async () => {
  const gen = new AIRecipeGen();

  // Synchronous call
  const syncResult = gen.query('What can I make with eggs and spinach?');
  assert.equal(syncResult, 'AI Response to: What can I make with eggs and spinach?');

  // Asynchronous call (await)
  const asyncResult = await gen.query('Quick breakfast idea');
  assert.equal(asyncResult, 'AI Response to: Quick breakfast idea');

  // querySync method
  const explicitSync = gen.querySync('Dinner suggestion');
  assert.equal(explicitSync, 'AI Response to: Dinner suggestion');

  // queryAsync method
  const explicitAsync = await gen.queryAsync('Late night snack');
  assert.equal(explicitAsync, 'AI Response to: Late night snack');
});

test('AIRecipeGen: generate input validation', () => {
  const gen = new AIRecipeGen();

  // Non-list arguments must throw TypeError with exact message
  assert.throws(
    () => gen.generate('eggs'),
    { name: 'TypeError', message: 'Items must be provided as a list' }
  );
  assert.throws(
    () => gen.generate(123),
    { name: 'TypeError', message: 'Items must be provided as a list' }
  );
  assert.throws(
    () => gen.generate(null),
    { name: 'TypeError', message: 'Items must be provided as a list' }
  );
  assert.throws(
    () => gen.generate(undefined),
    { name: 'TypeError', message: 'Items must be provided as a list' }
  );
  assert.throws(
    () => gen.generate({ item1: 'eggs', item2: 'cheese' }),
    { name: 'TypeError', message: 'Items must be provided as a list' }
  );

  // Empty list must throw ValueError with exact message
  assert.throws(
    () => gen.generate([]),
    { name: 'ValueError', message: 'Pantry is empty; at least one ingredient required' }
  );
});

test('AIRecipeGen: generate strictly using pantry items', async () => {
  const gen = new AIRecipeGen();
  const items = ['pasta', 'tomatoes', 'garlic', 'olive oil'];

  // Synchronous generation
  const syncRecipe = gen.generate(items);
  assert.equal(syncRecipe.title, 'Quick Pantry Meal');
  assert.deepEqual(syncRecipe.ingredients, items);

  // Immutability: input array must not be mutated
  assert.equal(syncRecipe.ingredients !== items, true);

  // Asynchronous generation (await)
  const asyncRecipe = await gen.generate(['eggs', 'cheese']);
  assert.equal(asyncRecipe.title, 'Quick Pantry Meal');
  assert.deepEqual(asyncRecipe.ingredients, ['eggs', 'cheese']);

  // generateSync method
  const explicitSync = gen.generateSync(['bread', 'butter']);
  assert.equal(explicitSync.title, 'Quick Pantry Meal');
  assert.deepEqual(explicitSync.ingredients, ['bread', 'butter']);

  // generateAsync method
  const explicitAsync = await gen.generateAsync(['beans', 'rice']);
  assert.equal(explicitAsync.title, 'Quick Pantry Meal');
  assert.deepEqual(explicitAsync.ingredients, ['beans', 'rice']);
});

test('AIRecipeGen: Gemini Studio / AI model integration with custom client', async () => {
  // Test with injected Gemini Studio client
  const mockGeminiClient = {
    models: {
      async generateContent({ contents }) {
        if (contents.includes('strictly using only the following')) {
          return {
            text: JSON.stringify({
              title: 'Savory Spinach Frittata',
              ingredients: ['spinach', 'eggs', 'cheese']
            })
          };
        }
        return {
          text: `Gemini Studio response for: ${contents}`
        };
      }
    }
  };

  const genWithGemini = new AIRecipeGen({
    apiKey: 'mock-gemini-key',
    provider: 'gemini',
    client: mockGeminiClient
  });

  const queryResp = await genWithGemini.query('How do I reheat rice?');
  assert.equal(queryResp, 'Gemini Studio response for: How do I reheat rice?');

  const recipe = await genWithGemini.generate(['spinach', 'eggs', 'cheese']);
  assert.equal(recipe.title, 'Savory Spinach Frittata');
  assert.deepEqual(recipe.ingredients, ['spinach', 'eggs', 'cheese']);
});

test('AIRecipeGen: extracts JSON from markdown-wrapped AI responses and text with commentary', async () => {
  const mockMarkdownClient = {
    models: {
      async generateContent() {
        return {
          text: 'Here is what you can make:\n```json\n{\n  "title": "One-Pot Pasta",\n  "ingredients": ["pasta", "sauce"]\n}\n```\nEnjoy {bon appetit}!'
        };
      }
    }
  };

  const gen = new AIRecipeGen({
    apiKey: 'mock-key',
    client: mockMarkdownClient
  });

  const recipe = await gen.generate(['pasta', 'sauce']);
  assert.equal(recipe.title, 'One-Pot Pasta');
  assert.deepEqual(recipe.ingredients, ['pasta', 'sauce']);
});

test('AIRecipeGen: graceful fallback when AI client throws error', async () => {
  const failingClient = {
    models: {
      async generateContent() {
        throw new Error('API Rate Limit Exceeded');
      }
    }
  };

  const gen = new AIRecipeGen({
    apiKey: 'mock-key',
    client: failingClient
  });

  // Query fallback
  const queryFallback = await gen.queryAsync('What can I cook?');
  assert.equal(queryFallback, 'AI Response to: What can I cook?');

  // Default behavior: falls back to safe stub recipe
  const recipe = await gen.generate(['beans', 'rice']);
  assert.equal(recipe.title, 'Quick Pantry Meal');
  assert.deepEqual(recipe.ingredients, ['beans', 'rice']);

  // Strict mode: rethrows error if requested
  await assert.rejects(
    async () => gen.generateAsync(['beans', 'rice'], { strict: true }),
    /API Rate Limit Exceeded/
  );
  await assert.rejects(
    async () => gen.queryAsync('What can I cook?', { strict: true }),
    /API Rate Limit Exceeded/
  );
});

test('PantryStore: integration with AIRecipeGen', async () => {
  const store = new PantryStore();
  store.addPantryItem({ name: 'Oats', expiresOn: '2026-11-01' });
  store.addPantryItem({ name: 'Honey', expiresOn: '2026-12-01' });

  // Synchronous generate
  const recipeFromStore = store.generateAIRecipe();
  assert.equal(recipeFromStore.title, 'Quick Pantry Meal');
  assert.deepEqual(recipeFromStore.ingredients, ['Oats', 'Honey']);

  const customRecipe = store.generateAIRecipe(['Apple', 'Cinnamon']);
  assert.deepEqual(customRecipe.ingredients, ['Apple', 'Cinnamon']);

  // Asynchronous generate
  const asyncRecipe = await store.generateAIRecipeAsync();
  assert.equal(typeof asyncRecipe.title, 'string');
  assert.deepEqual(asyncRecipe.ingredients, ['Oats', 'Honey']);
});

test('API endpoints: /ai/recipe and /ai/query', async () => {
  // Query endpoint - success
  const queryRes = await request(app)
    .post('/ai/query')
    .send({ prompt: 'How do I cook ramen?' })
    .expect(200);
  assert.equal(typeof queryRes.body.response, 'string');
  assert.equal(queryRes.body.response.includes('ramen'), true);

  // Query endpoint - validation errors
  await request(app)
    .post('/ai/query')
    .send({ prompt: '' })
    .expect(400);

  await request(app)
    .post('/ai/query')
    .send({ prompt: 12345 })
    .expect(400);

  // Recipe endpoint - success
  const recipeRes = await request(app)
    .post('/ai/recipe')
    .send({ items: ['tofu', 'soy sauce', 'garlic'] })
    .expect(200);
  assert.equal(typeof recipeRes.body.title, 'string');
  assert.equal(Array.isArray(recipeRes.body.ingredients), true);

  // Recipe endpoint - validation errors
  await request(app)
    .post('/ai/recipe')
    .send({ items: [] })
    .expect(400);

  await request(app)
    .post('/ai/recipe')
    .send({ items: 'not an array' })
    .expect(400);

  // Pantry AI Recipe endpoint - uses store items
  await request(app)
    .post('/pantry/items')
    .send({ name: 'Chickpeas', expiresOn: '2026-11-20', isShared: true });

  const pantryRecipeRes = await request(app)
    .get('/pantry/ai-recipe')
    .expect(200);
  assert.equal(typeof pantryRecipeRes.body.title, 'string');
  assert.equal(Array.isArray(pantryRecipeRes.body.ingredients), true);
  assert.equal(pantryRecipeRes.body.ingredients.includes('Chickpeas'), true);
});

