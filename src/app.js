const express = require('express');
const { PantryStore } = require('./store');

const app = express();
const store = new PantryStore();

app.use(express.json());

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

module.exports = {
  app,
  store
};
