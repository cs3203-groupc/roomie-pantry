const path = require('path');
const express = require('express');
const { PantryStore } = require('./store');
const { loginUser, createSession, getSession } = require('./auth');
const { pantryOwnerCheck } = require('./pantryOwner');
const { AIRecipeGen, aiRecipeGen } = require('./aiRecipeGen');
const AllergyHelper = require('../allergy_helper');

const app = express();
const store = new PantryStore();

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, '../public')));

function resolveRequester(req) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const session = getSession(token);
      if (session) {
        return { username: session.username, authenticated: true, invalidToken: false };
      }
      return { username: null, authenticated: false, invalidToken: true };
    }
    return { username: null, authenticated: false, invalidToken: true };
  }

  if (req.headers['x-user']) {
    return { username: String(req.headers['x-user']), authenticated: true, invalidToken: false };
  }
  if (req.headers['x-authenticated-user']) {
    return { username: String(req.headers['x-authenticated-user']), authenticated: true, invalidToken: false };
  }

  return { username: null, authenticated: false, invalidToken: false };
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const isValid = loginUser(username, password);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = createSession(username);

  return res.status(200).json({
    message: 'Login successful',
    token,
    user: {
      username
    }
  });
});

app.get('/user/allergies', (req, res) => {
  if (Array.isArray(req.query.username)) {
    return res.status(400).json({ error: 'Validation Error: Duplicate or array query parameter for username is not allowed' });
  }
  const requester = resolveRequester(req);
  if (requester.invalidToken) {
    return res.status(401).json({ error: 'Unauthorized: Invalid authentication session' });
  }
  if (req.headers['x-enforce-auth'] === 'true' && !requester.username) {
    return res.status(401).json({ error: 'Unauthorized: Valid authentication session required' });
  }

  const username = req.query.username || requester.username || 'student1';
  if (requester.username && req.query.username && requester.username !== req.query.username) {
    return res.status(403).json({ error: 'Forbidden: You are not authorized to access this user allergy profile' });
  }

  const allergies = store.getUserAllergies(username);
  return res.json({ username, allergies });
});

app.post('/user/allergies', (req, res) => {
  const requester = resolveRequester(req);
  if (requester.invalidToken || (req.headers['x-enforce-auth'] === 'true' && !requester.username)) {
    return res.status(401).json({ error: 'Unauthorized: Valid authentication session required' });
  }

  const { username, allergy } = req.body || {};
  if (!username || typeof username !== 'string' || !username.trim()) {
    return res.status(400).json({ error: 'Valid username required' });
  }
  if (Array.isArray(allergy) || typeof allergy !== 'string' || allergy.trim().length < 2) {
    return res.status(400).json({ error: 'Valid allergy string (min 2 characters) required' });
  }
  if (allergy.trim().length > 50) {
    return res.status(400).json({ error: 'Validation Error: allergy string must not exceed 50 characters' });
  }
  if (!AllergyHelper.ALLERGY_REGEX.test(allergy.trim())) {
    return res.status(400).json({ error: 'Invalid allergy item' });
  }

  if (requester.username && requester.username !== username.trim()) {
    return res.status(403).json({ error: 'Forbidden: You are not authorized to modify this user allergy profile' });
  }

  const added = store.addUserAllergy(username.trim(), allergy.trim());
  if (!added) {
    return res.status(400).json({ error: 'Invalid allergy item' });
  }
  return res.status(201).json({
    success: true,
    username: username.trim(),
    allergy: allergy.trim().toLowerCase()
  });
});

app.delete('/user/allergies/:allergy', (req, res) => {
  const requester = resolveRequester(req);
  if (requester.invalidToken || (req.headers['x-enforce-auth'] === 'true' && !requester.username)) {
    return res.status(401).json({ error: 'Unauthorized: Valid authentication session required' });
  }

  const username = req.query.username || req.body?.username || requester.username || 'student1';
  if (requester.username && username && requester.username !== username) {
    return res.status(403).json({ error: 'Forbidden: You are not authorized to modify this user allergy profile' });
  }

  const allergy = req.params.allergy;
  if (!allergy || typeof allergy !== 'string' || !allergy.trim()) {
    return res.status(400).json({ error: 'Valid allergy param required' });
  }
  store.removeUserAllergy(username, allergy.trim());
  return res.json({
    success: true,
    username,
    allergy: allergy.trim().toLowerCase()
  });
});

app.post('/pantry/items', (req, res) => {
  const requester = resolveRequester(req);
  if (requester.invalidToken || (req.headers['x-enforce-auth'] === 'true' && !requester.username)) {
    return res.status(401).json({ error: 'Unauthorized: Valid authentication session required' });
  }

  const { name, owner, quantity, expiresOn, isShared } = req.body || {};

  // Validate name
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name and expiresOn are required' });
  }

  // Validate expiresOn
  if (!expiresOn || typeof expiresOn !== 'string') {
    return res.status(400).json({ error: 'name and expiresOn are required' });
  }

  const ISO_DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!ISO_DATE_REGEX.test(expiresOn)) {
    return res.status(400).json({ error: 'Validation Error: expiresOn must be a valid ISO date in YYYY-MM-DD format' });
  }

  const parts = expiresOn.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (d.getUTCFullYear() !== parts[0] || d.getUTCMonth() !== parts[1] - 1 || d.getUTCDate() !== parts[2]) {
    return res.status(400).json({ error: 'Validation Error: expiresOn represents an invalid calendar date' });
  }

  // Validate quantity if provided
  if (quantity !== undefined && quantity !== null) {
    if (typeof quantity === 'object') {
      return res.status(400).json({ error: 'Validation Error: quantity cannot be an object or array' });
    }
    const num = Number(quantity);
    if (Number.isNaN(num) || num < 0 || num > 1000000) {
      return res.status(400).json({ error: 'Validation Error: quantity must be a non-negative number within valid bounds' });
    }
  }

  const finalOwner = owner || requester.username || null;
  const created = store.addPantryItem({ name, owner: finalOwner, quantity, expiresOn, isShared });
  return res.status(201).json(created);
});

app.get('/pantry/items', (_req, res) => {
  res.json({ items: store.listPantryItems() });
});

app.delete('/pantry/items/:id', (req, res) => {
  const requester = resolveRequester(req);
  if (requester.invalidToken || (req.headers['x-enforce-auth'] === 'true' && !requester.username)) {
    return res.status(401).json({ error: 'Unauthorized: Valid authentication session required' });
  }

  const id = Number(req.params.id);
  if (Number.isNaN(id) || !Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'valid id required' });
  }

  const targetItem = store.items.find((item) => item.id === id);
  if (!targetItem) {
    return res.status(404).json({ error: 'pantry item not found' });
  }

  // Check authorization via pantryOwnerCheck
  const effectiveRequester = requester.username || req.query.username || null;
  if (effectiveRequester && !targetItem.isShared) {
    if (!pantryOwnerCheck(effectiveRequester, id, store)) {
      return res.status(403).json({
        error: 'Forbidden: You are not authorized to modify or delete this private pantry item'
      });
    }
  }

  const deleted = store.deletePantryItem(id);
  if (!deleted) {
    return res.status(404).json({ error: 'pantry item not found' });
  }

  return res.json({ success: true, id });
});

app.get('/system/storage', (_req, res) => {
  res.json({
    type: store.storage ? store.storage.type : 'memory',
    isPersistent: Boolean(store.storage)
  });
});

app.get('/pantry/alerts', (_req, res) => {
  res.json(store.getExpirationAlerts());
});

app.get('/cook-now', (_req, res) => {
  res.json(store.getCookNowRecommendations());
});

app.post('/grocery/items', (req, res) => {
  const requester = resolveRequester(req);
  if (requester.invalidToken || (req.headers['x-enforce-auth'] === 'true' && !requester.username)) {
    return res.status(401).json({ error: 'Unauthorized: Valid authentication session required' });
  }

  const { name, requestedBy, quantity } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  if (quantity !== undefined && quantity !== null) {
    if (typeof quantity === 'object') {
      return res.status(400).json({ error: 'Validation Error: quantity cannot be an object or array' });
    }
  }

  const finalRequestedBy = requestedBy || requester.username || null;
  const created = store.addGroceryItem({ name, requestedBy: finalRequestedBy, quantity });
  return res.status(201).json(created);
});

app.patch('/grocery/items/:id', (req, res) => {
  const requester = resolveRequester(req);
  if (requester.invalidToken || (req.headers['x-enforce-auth'] === 'true' && !requester.username)) {
    return res.status(401).json({ error: 'Unauthorized: Valid authentication session required' });
  }

  const id = Number(req.params.id);
  const { checked } = req.body || {};

  if (Number.isNaN(id) || !Number.isInteger(id) || typeof checked !== 'boolean') {
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

app.get('/pantry/ai-recipe', async (req, res) => {
  if (Array.isArray(req.query.username)) {
    return res.status(400).json({ error: 'Validation Error: Duplicate or array query parameter for username is not allowed' });
  }
  const requester = resolveRequester(req);
  if (requester.invalidToken || (req.headers['x-enforce-auth'] === 'true' && !requester.username)) {
    return res.status(401).json({ error: 'Unauthorized: Valid authentication session required' });
  }

  const username = req.query.username || req.query.user || requester.username || null;

  if (requester.username && username && requester.username !== username) {
    return res.status(403).json({ error: 'Forbidden: You are not authorized to generate recipes for this user' });
  }

  const userAllergies = username ? store.getUserAllergies(username) : [];
  try {
    const recipe = await store.generateAIRecipeAsync(null, { allergies: userAllergies, username });
    return res.json(recipe);
  } catch (err) {
    if (err.name === 'TypeError' || err.name === 'ValueError') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[Internal Error in /pantry/ai-recipe]:', err);
    return res.status(500).json({ error: 'An unexpected internal server error occurred' });
  }
});

app.post('/ai/recipe', async (req, res) => {
  const requester = resolveRequester(req);
  if (requester.invalidToken || (req.headers['x-enforce-auth'] === 'true' && !requester.username)) {
    return res.status(401).json({ error: 'Unauthorized: Valid authentication session required' });
  }

  const { items, allergies, username } = req.body || {};

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Items must be provided as a list' });
  }

  for (const item of items) {
    if (typeof item !== 'string' || !item.trim()) {
      return res.status(400).json({ error: 'Each ingredient item must be a non-empty string' });
    }
  }

  if (allergies && !Array.isArray(allergies)) {
    return res.status(400).json({ error: 'Allergies must be provided as a list' });
  }

  if (requester.username && username && requester.username !== username) {
    return res.status(403).json({ error: 'Forbidden: You are not authorized to generate recipes for this user' });
  }

  const userAllergies = Array.isArray(allergies)
    ? allergies
    : (username ? store.getUserAllergies(username) : []);

  try {
    const recipe = await aiRecipeGen.generate(items, { allergies: userAllergies });
    return res.json(recipe);
  } catch (err) {
    if (err.name === 'TypeError' || err.name === 'ValueError') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[Internal Error in /ai/recipe]:', err);
    return res.status(500).json({ error: 'An unexpected internal server error occurred' });
  }
});

app.post('/ai/query', async (req, res) => {
  const requester = resolveRequester(req);
  if (requester.invalidToken || (req.headers['x-enforce-auth'] === 'true' && !requester.username)) {
    return res.status(401).json({ error: 'Unauthorized: Valid authentication session required' });
  }

  const { prompt } = req.body || {};
  if (typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt must be a string' });
  }
  if (!prompt.trim()) {
    return res.status(400).json({ error: 'Prompt cannot be empty or whitespace only' });
  }
  if (prompt.length > 5000) {
    return res.status(400).json({ error: 'Prompt exceeds maximum allowed length of 5000 characters' });
  }

  try {
    const response = await aiRecipeGen.query(prompt);
    return res.json({ response });
  } catch (err) {
    if (err.name === 'TypeError' || err.name === 'ValueError') {
      return res.status(400).json({ error: err.message });
    }
    console.error('[Internal Error in /ai/query]:', err);
    return res.status(500).json({ error: 'An unexpected internal server error occurred' });
  }
});

module.exports = {
  app,
  store,
  aiRecipeGen,
  AIRecipeGen
};
