const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { run, get, all, initDb } = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please try again later.' },
});

const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function toApiUser(user) {
  return { id: user.id, email: user.email, createdAt: user.created_at };
}

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

async function logActivity(householdId, userId, action, details = null) {
  await run(
    'INSERT INTO activity_events (household_id, user_id, action, details) VALUES (?, ?, ?, ?)',
    [householdId, userId, action, details]
  );
}

async function ensureMembership(userId, householdId) {
  const membership = await get(
    'SELECT user_id FROM memberships WHERE user_id = ? AND household_id = ?',
    [userId, householdId]
  );
  return Boolean(membership);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return sendError(res, 401, 'Missing auth token.');

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return sendError(res, 401, 'Invalid auth token.');
  }
}

function computeExpiryStatus(expiryDate) {
  if (!expiryDate) return { status: 'none', daysUntilExpiry: null };
  const today = new Date();
  const expiry = new Date(expiryDate);

  if (Number.isNaN(expiry.valueOf())) {
    return { status: 'invalid', daysUntilExpiry: null };
  }

  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  const days = Math.round((expiry - today) / (1000 * 60 * 60 * 24));
  if (days < 0) return { status: 'expired', daysUntilExpiry: days };
  if (days <= 3) return { status: 'expiring', daysUntilExpiry: days };
  return { status: 'fresh', daysUntilExpiry: days };
}

app.post('/api/auth/register', authRateLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || typeof email !== 'string') return sendError(res, 400, 'Valid email is required.');
  if (!password || password.length < 8) return sendError(res, 400, 'Password must be at least 8 characters.');

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [
      email.trim().toLowerCase(),
      passwordHash,
    ]);

    const user = await get('SELECT id, email, created_at FROM users WHERE id = ?', [result.id]);
    return res.status(201).json({ token: createToken(user), user: toApiUser(user) });
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) {
      return sendError(res, 409, 'Email already exists.');
    }
    return sendError(res, 500, 'Failed to register user.');
  }
});

app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return sendError(res, 400, 'Email and password are required.');

  const user = await get('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  if (!user) return sendError(res, 401, 'Invalid credentials.');

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) return sendError(res, 401, 'Invalid credentials.');

  return res.json({ token: createToken(user), user: toApiUser(user) });
});

app.use('/api', apiRateLimiter);

app.get('/api/me', authMiddleware, async (req, res) => {
  const user = await get('SELECT id, email, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) return sendError(res, 404, 'User not found.');

  const households = await all(
    `SELECT h.id, h.name, h.invite_code, h.created_at
     FROM households h
     JOIN memberships m ON m.household_id = h.id
     WHERE m.user_id = ?
     ORDER BY h.created_at DESC`,
    [req.user.id]
  );

  return res.json({ user: toApiUser(user), households });
});

app.post('/api/households', authMiddleware, async (req, res) => {
  const { name } = req.body || {};
  if (!name || typeof name !== 'string') return sendError(res, 400, 'Household name is required.');

  let inviteCode;
  let household;

  for (let i = 0; i < 5; i += 1) {
    try {
      inviteCode = generateInviteCode();
      const result = await run(
        'INSERT INTO households (name, invite_code, created_by) VALUES (?, ?, ?)',
        [name.trim(), inviteCode, req.user.id]
      );
      await run('INSERT INTO memberships (user_id, household_id) VALUES (?, ?)', [req.user.id, result.id]);
      household = await get('SELECT id, name, invite_code, created_at FROM households WHERE id = ?', [result.id]);
      break;
    } catch (error) {
      if (!String(error.message).includes('UNIQUE constraint failed: households.invite_code')) {
        return sendError(res, 500, 'Failed to create household.');
      }
    }
  }

  if (!household) return sendError(res, 500, 'Failed to create household invite code.');

  await logActivity(household.id, req.user.id, 'HOUSEHOLD_CREATED', `${req.user.email} created household`);
  return res.status(201).json(household);
});

app.post('/api/households/join', authMiddleware, async (req, res) => {
  const { inviteCode } = req.body || {};
  if (!inviteCode || typeof inviteCode !== 'string') return sendError(res, 400, 'Invite code is required.');

  const household = await get('SELECT id, name, invite_code, created_at FROM households WHERE invite_code = ?', [
    inviteCode.trim().toUpperCase(),
  ]);

  if (!household) return sendError(res, 404, 'Household not found for invite code.');

  try {
    await run('INSERT INTO memberships (user_id, household_id) VALUES (?, ?)', [req.user.id, household.id]);
    await logActivity(household.id, req.user.id, 'HOUSEHOLD_JOINED', `${req.user.email} joined via invite code`);
    return res.status(201).json(household);
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) {
      return sendError(res, 409, 'You already joined this household.');
    }
    return sendError(res, 500, 'Failed to join household.');
  }
});

app.get('/api/households/:householdId/pantry', authMiddleware, async (req, res) => {
  const householdId = Number(req.params.householdId);
  if (!Number.isInteger(householdId)) return sendError(res, 400, 'Invalid household ID.');
  if (!(await ensureMembership(req.user.id, householdId))) return sendError(res, 403, 'Not a household member.');

  const items = await all(
    `SELECT id, name, quantity, unit, category, expiry_date, owner_user_id, created_at, updated_at
     FROM pantry_items
     WHERE household_id = ?
     ORDER BY expiry_date IS NULL, expiry_date ASC, created_at DESC`,
    [householdId]
  );

  return res.json(
    items.map((item) => ({
      ...item,
      expiry: computeExpiryStatus(item.expiry_date),
    }))
  );
});

app.post('/api/households/:householdId/pantry', authMiddleware, async (req, res) => {
  const householdId = Number(req.params.householdId);
  const { name, quantity = 1, unit = 'pcs', category = 'General', expiryDate = null } = req.body || {};

  if (!Number.isInteger(householdId)) return sendError(res, 400, 'Invalid household ID.');
  if (!(await ensureMembership(req.user.id, householdId))) return sendError(res, 403, 'Not a household member.');
  if (!name || typeof name !== 'string') return sendError(res, 400, 'Item name is required.');
  if (!Number.isFinite(Number(quantity)) || Number(quantity) < 0) return sendError(res, 400, 'Quantity must be >= 0.');

  const result = await run(
    `INSERT INTO pantry_items (household_id, owner_user_id, name, quantity, unit, category, expiry_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [householdId, req.user.id, name.trim(), Number(quantity), String(unit), String(category), expiryDate]
  );

  const item = await get('SELECT * FROM pantry_items WHERE id = ?', [result.id]);
  await logActivity(householdId, req.user.id, 'PANTRY_ITEM_CREATED', item.name);
  return res.status(201).json({ ...item, expiry: computeExpiryStatus(item.expiry_date) });
});

app.put('/api/households/:householdId/pantry/:itemId', authMiddleware, async (req, res) => {
  const householdId = Number(req.params.householdId);
  const itemId = Number(req.params.itemId);
  const { name, quantity, unit, category, expiryDate } = req.body || {};

  if (!Number.isInteger(householdId) || !Number.isInteger(itemId)) return sendError(res, 400, 'Invalid IDs.');
  if (!(await ensureMembership(req.user.id, householdId))) return sendError(res, 403, 'Not a household member.');

  const existing = await get('SELECT * FROM pantry_items WHERE id = ? AND household_id = ?', [itemId, householdId]);
  if (!existing) return sendError(res, 404, 'Pantry item not found.');

  const updated = {
    name: typeof name === 'string' ? name.trim() : existing.name,
    quantity: Number.isFinite(Number(quantity)) ? Number(quantity) : existing.quantity,
    unit: typeof unit === 'string' ? unit : existing.unit,
    category: typeof category === 'string' ? category : existing.category,
    expiryDate: expiryDate === undefined ? existing.expiry_date : expiryDate,
  };

  if (!updated.name) return sendError(res, 400, 'Item name is required.');
  if (updated.quantity < 0) return sendError(res, 400, 'Quantity must be >= 0.');

  await run(
    `UPDATE pantry_items
     SET name = ?, quantity = ?, unit = ?, category = ?, expiry_date = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND household_id = ?`,
    [updated.name, updated.quantity, updated.unit, updated.category, updated.expiryDate, itemId, householdId]
  );

  const item = await get('SELECT * FROM pantry_items WHERE id = ?', [itemId]);
  await logActivity(householdId, req.user.id, 'PANTRY_ITEM_UPDATED', item.name);
  return res.json({ ...item, expiry: computeExpiryStatus(item.expiry_date) });
});

app.delete('/api/households/:householdId/pantry/:itemId', authMiddleware, async (req, res) => {
  const householdId = Number(req.params.householdId);
  const itemId = Number(req.params.itemId);

  if (!Number.isInteger(householdId) || !Number.isInteger(itemId)) return sendError(res, 400, 'Invalid IDs.');
  if (!(await ensureMembership(req.user.id, householdId))) return sendError(res, 403, 'Not a household member.');

  const item = await get('SELECT id, name FROM pantry_items WHERE id = ? AND household_id = ?', [itemId, householdId]);
  if (!item) return sendError(res, 404, 'Pantry item not found.');

  await run('DELETE FROM pantry_items WHERE id = ? AND household_id = ?', [itemId, householdId]);
  await logActivity(householdId, req.user.id, 'PANTRY_ITEM_DELETED', item.name);
  return res.status(204).send();
});

app.get('/api/households/:householdId/shopping-list', authMiddleware, async (req, res) => {
  const householdId = Number(req.params.householdId);
  if (!Number.isInteger(householdId)) return sendError(res, 400, 'Invalid household ID.');
  if (!(await ensureMembership(req.user.id, householdId))) return sendError(res, 403, 'Not a household member.');

  const items = await all(
    `SELECT id, name, quantity, checked, created_at, updated_at
     FROM shopping_list_items
     WHERE household_id = ?
     ORDER BY checked ASC, created_at DESC`,
    [householdId]
  );

  return res.json(items.map((item) => ({ ...item, checked: Boolean(item.checked) })));
});

app.post('/api/households/:householdId/shopping-list', authMiddleware, async (req, res) => {
  const householdId = Number(req.params.householdId);
  const { name, quantity = 1 } = req.body || {};

  if (!Number.isInteger(householdId)) return sendError(res, 400, 'Invalid household ID.');
  if (!(await ensureMembership(req.user.id, householdId))) return sendError(res, 403, 'Not a household member.');
  if (!name || typeof name !== 'string') return sendError(res, 400, 'Item name is required.');
  if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) return sendError(res, 400, 'Quantity must be > 0.');

  const result = await run(
    'INSERT INTO shopping_list_items (household_id, created_by, name, quantity) VALUES (?, ?, ?, ?)',
    [householdId, req.user.id, name.trim(), Number(quantity)]
  );

  const item = await get('SELECT * FROM shopping_list_items WHERE id = ?', [result.id]);
  await logActivity(householdId, req.user.id, 'SHOPPING_ITEM_CREATED', item.name);
  return res.status(201).json({ ...item, checked: Boolean(item.checked) });
});

app.patch('/api/households/:householdId/shopping-list/:itemId', authMiddleware, async (req, res) => {
  const householdId = Number(req.params.householdId);
  const itemId = Number(req.params.itemId);
  const { checked } = req.body || {};

  if (!Number.isInteger(householdId) || !Number.isInteger(itemId)) return sendError(res, 400, 'Invalid IDs.');
  if (!(await ensureMembership(req.user.id, householdId))) return sendError(res, 403, 'Not a household member.');
  if (typeof checked !== 'boolean') return sendError(res, 400, 'Checked must be a boolean.');

  const changes = await run(
    `UPDATE shopping_list_items
     SET checked = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND household_id = ?`,
    [checked ? 1 : 0, itemId, householdId]
  );

  if (!changes.changes) return sendError(res, 404, 'Shopping item not found.');

  const item = await get('SELECT * FROM shopping_list_items WHERE id = ?', [itemId]);
  await logActivity(householdId, req.user.id, 'SHOPPING_ITEM_UPDATED', item.name);
  return res.json({ ...item, checked: Boolean(item.checked) });
});

app.delete('/api/households/:householdId/shopping-list/:itemId', authMiddleware, async (req, res) => {
  const householdId = Number(req.params.householdId);
  const itemId = Number(req.params.itemId);

  if (!Number.isInteger(householdId) || !Number.isInteger(itemId)) return sendError(res, 400, 'Invalid IDs.');
  if (!(await ensureMembership(req.user.id, householdId))) return sendError(res, 403, 'Not a household member.');

  const item = await get('SELECT name FROM shopping_list_items WHERE id = ? AND household_id = ?', [itemId, householdId]);
  if (!item) return sendError(res, 404, 'Shopping item not found.');

  await run('DELETE FROM shopping_list_items WHERE id = ? AND household_id = ?', [itemId, householdId]);
  await logActivity(householdId, req.user.id, 'SHOPPING_ITEM_DELETED', item.name);
  return res.status(204).send();
});

app.get('/api/households/:householdId/activity', authMiddleware, async (req, res) => {
  const householdId = Number(req.params.householdId);
  if (!Number.isInteger(householdId)) return sendError(res, 400, 'Invalid household ID.');
  if (!(await ensureMembership(req.user.id, householdId))) return sendError(res, 403, 'Not a household member.');

  const events = await all(
    `SELECT a.id, a.action, a.details, a.created_at, u.email AS actor_email
     FROM activity_events a
     JOIN users u ON u.id = a.user_id
     WHERE a.household_id = ?
     ORDER BY a.created_at DESC
     LIMIT 50`,
    [householdId]
  );

  return res.json(events);
});

app.get('/health', (_, res) => {
  res.json({ ok: true });
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Roomie Pantry server running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
