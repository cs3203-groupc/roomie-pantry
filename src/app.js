const path = require('path');
const express = require('express');
const { PantryStore } = require('./store');
const { AIRecipeGen, aiRecipeGen } = require('./aiRecipeGen');

const app = express();
const store = new PantryStore();

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/pantry/items', (req, res) => {
  const { name, owner, quantity, expiresOn, isShared } = req.body;
  if (!name || !expiresOn) {
    return res.status(400).json({ error: 'name and expiresOn are required' });
  }

  const created = store.addPantryItem({ name, owner, quantity, expiresOn, isShared });
  return res.status(201).json(created);
});

app.get('/pantry/items', (_req, res) => {
  res.json({ items: store.listPantryItems() });
});

app.get('/pantry/alerts', (_req, res) => {
  res.json(store.getExpirationAlerts());
});

app.get('/cook-now', (_req, res) => {
  res.json(store.getCookNowRecommendations());
});

app.post('/grocery/items', (req, res) => {
  const { name, requestedBy, quantity } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const created = store.addGroceryItem({ name, requestedBy, quantity });
  return res.status(201).json(created);
});

app.patch('/grocery/items/:id', (req, res) => {
  const id = Number(req.params.id);
  const { checked } = req.body;

  if (Number.isNaN(id) || typeof checked !== 'boolean') {
    return res.status(400).json({ error: 'valid id and checked are required' });
  }

  const updated = store.markGroceryItem(id, checked);
  if (!updated) {
    return res.status(404).json({ error: 'grocery item not found' });
  }

  return res.json(updated);
});

app.get('/grocery/items', (_req, res) => {
  res.json({ items: store.listGroceryItems() });
});

app.get('/sync', (_req, res) => {
  res.json(store.getSyncSnapshot());
});

app.get('/pantry/ai-recipe', async (_req, res) => {
  try {
    const recipe = await store.generateAIRecipeAsync();
    return res.json(recipe);
  } catch (err) {
    if (err.name === 'TypeError' || err.name === 'ValueError') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});

app.post('/ai/recipe', async (req, res) => {
  const { items } = req.body || {};
  try {
    const recipe = await aiRecipeGen.generate(items);
    return res.json(recipe);
  } catch (err) {
    if (err.name === 'TypeError' || err.name === 'ValueError') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});

app.post('/ai/query', async (req, res) => {
  const { prompt } = req.body || {};
  try {
    const response = await aiRecipeGen.query(prompt);
    return res.json({ response });
  } catch (err) {
    if (err.name === 'TypeError' || err.name === 'ValueError') {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});

module.exports = {
  app,
  store,
  aiRecipeGen,
  AIRecipeGen
};
