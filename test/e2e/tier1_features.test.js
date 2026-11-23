'use strict';

process.env.NODE_ENV = 'test';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app, getOffsetDateString, resetStore } = require('./helpers');

describe('Tier 1: Feature Coverage (40+ Tests Across 8 Core Features)', () => {
  beforeEach(() => {
    resetStore();
  });

  // =========================================================================
  // Feature 1: User Authentication (/login)
  // =========================================================================
  describe('Feature 1: User Authentication (/login)', () => {
    test('T1.1: Valid login with student1:password123 returns 200 and user object', async () => {
      const res = await request(app)
        .post('/login')
        .send({ username: 'student1', password: 'password123' })
        .expect(200);

      assert.equal(res.body.message, 'Login successful');
      assert.ok(res.body.user);
      assert.equal(res.body.user.username, 'student1');
    });

    test('T1.2: Missing password returns 400 with descriptive error', async () => {
      const res = await request(app)
        .post('/login')
        .send({ username: 'student1' })
        .expect(400);

      assert.ok(res.body.error);
      assert.match(res.body.error, /password/i);
    });

    test('T1.3: Missing username returns 400 with descriptive error', async () => {
      const res = await request(app)
        .post('/login')
        .send({ password: 'password123' })
        .expect(400);

      assert.ok(res.body.error);
      assert.match(res.body.error, /username/i);
    });

    test('T1.4: Invalid password returns 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/login')
        .send({ username: 'student1', password: 'wrongpassword' })
        .expect(401);

      assert.ok(res.body.error);
      assert.match(res.body.error, /invalid/i);
    });

    test('T1.5: Unregistered username returns 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/login')
        .send({ username: 'ghost_user', password: 'password123' })
        .expect(401);

      assert.ok(res.body.error);
      assert.match(res.body.error, /invalid/i);
    });
  });

  // =========================================================================
  // Feature 2: Pantry Inventory CRUD (/pantry/items)
  // =========================================================================
  describe('Feature 2: Pantry Inventory CRUD (/pantry/items)', () => {
    test('T1.6: Add new shared pantry item returns 201 with generated id', async () => {
      const res = await request(app)
        .post('/pantry/items')
        .send({
          name: 'Organic Rolled Oats',
          quantity: 2,
          expiresOn: getOffsetDateString(14),
          isShared: true
        })
        .expect(201);

      assert.ok(res.body.id);
      assert.equal(typeof res.body.id, 'number');
      assert.equal(res.body.name, 'Organic Rolled Oats');
      assert.equal(res.body.isShared, true);
    });

    test('T1.7: Add private pantry item with explicit owner returns 201', async () => {
      const res = await request(app)
        .post('/pantry/items')
        .send({
          name: 'Greek Yogurt',
          owner: 'student1',
          quantity: 1,
          expiresOn: getOffsetDateString(7),
          isShared: false
        })
        .expect(201);

      assert.equal(res.body.name, 'Greek Yogurt');
      assert.equal(res.body.owner, 'student1');
      assert.equal(res.body.isShared, false);
    });

    test('T1.8: Get pantry items returns array containing added item', async () => {
      const createRes = await request(app)
        .post('/pantry/items')
        .send({
          name: 'Almond Milk',
          quantity: 1,
          expiresOn: getOffsetDateString(10),
          isShared: true
        })
        .expect(201);

      const res = await request(app)
        .get('/pantry/items')
        .expect(200);

      assert.ok(Array.isArray(res.body.items));
      const found = res.body.items.find((i) => i.id === createRes.body.id);
      assert.ok(found);
      assert.equal(found.name, 'Almond Milk');
    });

    test('T1.9: Delete existing pantry item by ID returns 200 success', async () => {
      const createRes = await request(app)
        .post('/pantry/items')
        .send({
          name: 'Crackers',
          quantity: 1,
          expiresOn: getOffsetDateString(30),
          isShared: true
        })
        .expect(201);

      const delRes = await request(app)
        .delete(`/pantry/items/${createRes.body.id}`)
        .expect(200);

      assert.equal(delRes.body.success, true);
      assert.equal(delRes.body.id, createRes.body.id);
    });

    test('T1.10: Re-querying pantry items after delete confirms item is removed', async () => {
      const createRes = await request(app)
        .post('/pantry/items')
        .send({
          name: 'Temporary Spinach',
          quantity: 1,
          expiresOn: getOffsetDateString(3),
          isShared: true
        })
        .expect(201);

      await request(app)
        .delete(`/pantry/items/${createRes.body.id}`)
        .expect(200);

      const listRes = await request(app)
        .get('/pantry/items')
        .expect(200);

      const found = listRes.body.items.find((i) => i.id === createRes.body.id);
      assert.equal(found, undefined);
    });
  });

  // =========================================================================
  // Feature 3: Expiration Alerts & Cook-Now (/pantry/alerts, /cook-now)
  // =========================================================================
  describe('Feature 3: Expiration Alerts & Cook-Now Engine', () => {
    test('T1.11: Expiration alerts endpoint returns green/yellow/red summary structure', async () => {
      const res = await request(app)
        .get('/pantry/alerts')
        .expect(200);

      assert.ok(res.body.summary);
      assert.equal(typeof res.body.summary.green, 'number');
      assert.equal(typeof res.body.summary.yellow, 'number');
      assert.equal(typeof res.body.summary.red, 'number');
      assert.ok(Array.isArray(res.body.alerts));
      assert.ok(Array.isArray(res.body.pushNotifications));
    });

    test('T1.12: Item expiring today triggers red alert status', async () => {
      await request(app)
        .post('/pantry/items')
        .send({
          name: 'Fresh Fish',
          quantity: 1,
          expiresOn: getOffsetDateString(0),
          isShared: true
        })
        .expect(201);

      const res = await request(app)
        .get('/pantry/alerts')
        .expect(200);

      assert.ok(res.body.summary.red >= 1);
      const alertItem = res.body.alerts.find((a) => a.itemName === 'Fresh Fish');
      assert.ok(alertItem);
      assert.equal(alertItem.status, 'red');
    });

    test('T1.13: Item expiring in 4 days triggers yellow alert status', async () => {
      await request(app)
        .post('/pantry/items')
        .send({
          name: 'Cheddar Block',
          quantity: 1,
          expiresOn: getOffsetDateString(4),
          isShared: true
        })
        .expect(201);

      const res = await request(app)
        .get('/pantry/alerts')
        .expect(200);

      assert.ok(res.body.summary.yellow >= 1);
      const alertItem = res.body.alerts.find((a) => a.itemName === 'Cheddar Block');
      assert.ok(alertItem);
      assert.equal(alertItem.status, 'yellow');
    });

    test('T1.14: Item expiring in 10 days triggers green alert status', async () => {
      await request(app)
        .post('/pantry/items')
        .send({
          name: 'Dried Lentils',
          quantity: 1,
          expiresOn: getOffsetDateString(10),
          isShared: true
        })
        .expect(201);

      const res = await request(app)
        .get('/pantry/alerts')
        .expect(200);

      assert.ok(res.body.summary.green >= 1);
      const alertItem = res.body.alerts.find((a) => a.itemName === 'Dried Lentils');
      assert.ok(alertItem);
      assert.equal(alertItem.status, 'green');
    });

    test('T1.15: Cook-now endpoint returns meal recommendations prioritized by expiration', async () => {
      // Add items with staggered expiration
      await request(app)
        .post('/pantry/items')
        .send({ name: 'Long Life Rice', expiresOn: getOffsetDateString(30) });

      await request(app)
        .post('/pantry/items')
        .send({ name: 'Urgent Avocado', expiresOn: getOffsetDateString(1) });

      const res = await request(app)
        .get('/cook-now')
        .expect(200);

      assert.ok(Array.isArray(res.body.recommendations));
      assert.ok(res.body.recommendations.length >= 1);
      const firstRec = res.body.recommendations[0];
      assert.equal(firstRec.itemName, 'Urgent Avocado');
    });
  });

  // =========================================================================
  // Feature 4: Shared Grocery List CRUD (/grocery/items)
  // =========================================================================
  describe('Feature 4: Shared Grocery List CRUD (/grocery/items)', () => {
    test('T1.16: Add item to grocery list returns 201 with checked=false', async () => {
      const res = await request(app)
        .post('/grocery/items')
        .send({
          name: 'Olive Oil',
          requestedBy: 'student1',
          quantity: 1
        })
        .expect(201);

      assert.ok(res.body.id);
      assert.equal(res.body.name, 'Olive Oil');
      assert.equal(res.body.requestedBy, 'student1');
      assert.equal(res.body.checked, false);
    });

    test('T1.17: Get grocery items returns array containing added item', async () => {
      const createRes = await request(app)
        .post('/grocery/items')
        .send({ name: 'Ground Coffee', requestedBy: 'student1', quantity: 2 })
        .expect(201);

      const res = await request(app)
        .get('/grocery/items')
        .expect(200);

      assert.ok(Array.isArray(res.body.items));
      const found = res.body.items.find((g) => g.id === createRes.body.id);
      assert.ok(found);
      assert.equal(found.name, 'Ground Coffee');
    });

    test('T1.18: Toggle grocery item checked=true returns 200 with updated item', async () => {
      const createRes = await request(app)
        .post('/grocery/items')
        .send({ name: 'Paper Towels', requestedBy: 'student1' })
        .expect(201);

      const patchRes = await request(app)
        .patch(`/grocery/items/${createRes.body.id}`)
        .send({ checked: true })
        .expect(200);

      assert.equal(patchRes.body.id, createRes.body.id);
      assert.equal(patchRes.body.checked, true);
    });

    test('T1.19: Toggle grocery item checked=false resets status', async () => {
      const createRes = await request(app)
        .post('/grocery/items')
        .send({ name: 'Dish Soap' })
        .expect(201);

      await request(app)
        .patch(`/grocery/items/${createRes.body.id}`)
        .send({ checked: true })
        .expect(200);

      const resetRes = await request(app)
        .patch(`/grocery/items/${createRes.body.id}`)
        .send({ checked: false })
        .expect(200);

      assert.equal(resetRes.body.checked, false);
    });

    test('T1.20: Adding multiple grocery items preserves order and distinct IDs', async () => {
      const res1 = await request(app).post('/grocery/items').send({ name: 'Item 1' }).expect(201);
      const res2 = await request(app).post('/grocery/items').send({ name: 'Item 2' }).expect(201);
      const res3 = await request(app).post('/grocery/items').send({ name: 'Item 3' }).expect(201);

      assert.notEqual(res1.body.id, res2.body.id);
      assert.notEqual(res2.body.id, res3.body.id);

      const listRes = await request(app).get('/grocery/items').expect(200);
      assert.equal(listRes.body.items.length, 3);
      assert.equal(listRes.body.items[0].name, 'Item 1');
      assert.equal(listRes.body.items[1].name, 'Item 2');
      assert.equal(listRes.body.items[2].name, 'Item 3');
    });
  });

  // =========================================================================
  // Feature 5: State Synchronization (/sync)
  // =========================================================================
  describe('Feature 5: State Synchronization (/sync)', () => {
    test('T1.21: Sync endpoint returns valid snapshot schema', async () => {
      const res = await request(app)
        .get('/sync')
        .expect(200);

      assert.equal(typeof res.body.version, 'number');
      assert.ok(Array.isArray(res.body.pantry));
      assert.ok(Array.isArray(res.body.groceryList));
      assert.ok(Array.isArray(res.body.notifications));
    });

    test('T1.22: Adding a pantry item increments the store version', async () => {
      const initial = (await request(app).get('/sync').expect(200)).body.version;

      await request(app)
        .post('/pantry/items')
        .send({ name: 'Honey', expiresOn: getOffsetDateString(60) })
        .expect(201);

      const updated = (await request(app).get('/sync').expect(200)).body.version;
      assert.equal(updated, initial + 1);
    });

    test('T1.23: Adding a grocery item increments the store version', async () => {
      const initial = (await request(app).get('/sync').expect(200)).body.version;

      await request(app)
        .post('/grocery/items')
        .send({ name: 'Garlic' })
        .expect(201);

      const updated = (await request(app).get('/sync').expect(200)).body.version;
      assert.equal(updated, initial + 1);
    });

    test('T1.24: Toggling a grocery item increments the store version', async () => {
      const item = (await request(app).post('/grocery/items').send({ name: 'Ginger' })).body;
      const initial = (await request(app).get('/sync').expect(200)).body.version;

      await request(app)
        .patch(`/grocery/items/${item.id}`)
        .send({ checked: true })
        .expect(200);

      const updated = (await request(app).get('/sync').expect(200)).body.version;
      assert.equal(updated, initial + 1);
    });

    test('T1.25: Deleting a pantry item increments the store version', async () => {
      const item = (await request(app).post('/pantry/items').send({ name: 'Thyme', expiresOn: getOffsetDateString(30) })).body;
      const initial = (await request(app).get('/sync').expect(200)).body.version;

      await request(app)
        .delete(`/pantry/items/${item.id}`)
        .expect(200);

      const updated = (await request(app).get('/sync').expect(200)).body.version;
      assert.equal(updated, initial + 1);
    });
  });

  // =========================================================================
  // Feature 6: User Dietary Allergy Settings (/user/allergies)
  // =========================================================================
  describe('Feature 6: User Dietary Allergy Settings (/user/allergies)', () => {
    test('T1.26: Get allergies for new user returns empty array', async () => {
      const res = await request(app)
        .get('/user/allergies?username=fresh_roommate')
        .expect(200);

      assert.equal(res.body.username, 'fresh_roommate');
      assert.ok(Array.isArray(res.body.allergies));
      assert.equal(res.body.allergies.length, 0);
    });

    test('T1.27: Add allergy returns 201 and stores normalized allergy', async () => {
      const res = await request(app)
        .post('/user/allergies')
        .send({ username: 'student1', allergy: 'peanuts' })
        .expect(201);

      assert.equal(res.body.success, true);
      assert.equal(res.body.username, 'student1');
      assert.equal(res.body.allergy, 'peanuts');
    });

    test('T1.28: Get allergies returns saved allergy list', async () => {
      await request(app)
        .post('/user/allergies')
        .send({ username: 'student1', allergy: 'peanuts' })
        .expect(201);

      const res = await request(app)
        .get('/user/allergies?username=student1')
        .expect(200);

      assert.equal(res.body.username, 'student1');
      assert.ok(res.body.allergies.includes('peanuts'));
    });

    test('T1.29: Delete allergy removes specified allergy from user profile', async () => {
      await request(app)
        .post('/user/allergies')
        .send({ username: 'student1', allergy: 'shellfish' })
        .expect(201);

      const delRes = await request(app)
        .delete('/user/allergies/shellfish?username=student1')
        .expect(200);

      assert.equal(delRes.body.success, true);

      const listRes = await request(app)
        .get('/user/allergies?username=student1')
        .expect(200);

      assert.equal(listRes.body.allergies.includes('shellfish'), false);
    });

    test('T1.30: Add multiple allergies stores distinct set', async () => {
      await request(app)
        .post('/user/allergies')
        .send({ username: 'student1', allergy: 'dairy' })
        .expect(201);

      await request(app)
        .post('/user/allergies')
        .send({ username: 'student1', allergy: 'gluten' })
        .expect(201);

      const res = await request(app)
        .get('/user/allergies?username=student1')
        .expect(200);

      assert.ok(res.body.allergies.includes('dairy'));
      assert.ok(res.body.allergies.includes('gluten'));
      assert.ok(res.body.allergies.length >= 2);
    });
  });

  // =========================================================================
  // Feature 7: Allergy-Aware AI Recipe Generation (/ai/recipe, /pantry/ai-recipe)
  // =========================================================================
  describe('Feature 7: Allergy-Aware AI Recipe Generation', () => {
    test('T1.31: Custom recipe generation returns valid recipe JSON', async () => {
      const res = await request(app)
        .post('/ai/recipe')
        .send({ items: ['eggs', 'toast', 'butter'] })
        .expect(200);

      assert.ok(res.body.title);
      assert.ok(Array.isArray(res.body.ingredients));
      assert.ok(Array.isArray(res.body.instructions));
      assert.ok(res.body.prepTime);
      assert.ok(res.body.servings);
    });

    test('T1.32: Recipe generation with allergies excludes specified allergens from ingredients', async () => {
      const res = await request(app)
        .post('/ai/recipe')
        .send({
          items: ['whole milk', 'cereal', 'bananas'],
          allergies: ['dairy']
        })
        .expect(200);

      assert.ok(res.body.title);
      assert.ok(Array.isArray(res.body.ingredients));
      const ingredientsLower = res.body.ingredients.map((i) => i.toLowerCase());
      assert.equal(ingredientsLower.some((i) => i.includes('milk')), false);
    });

    test('T1.33: Pantry auto-gen recipe returns recipe based on available inventory', async () => {
      await request(app)
        .post('/pantry/items')
        .send({ name: 'Pasta', expiresOn: getOffsetDateString(60) });
      await request(app)
        .post('/pantry/items')
        .send({ name: 'Tomato Sauce', expiresOn: getOffsetDateString(40) });

      const res = await request(app)
        .get('/pantry/ai-recipe')
        .expect(200);

      assert.ok(res.body.title);
      assert.ok(Array.isArray(res.body.ingredients));
      assert.ok(res.body.instructions.length > 0);
    });

    test('T1.34: Pantry auto-gen with user query param applies user saved allergy constraints', async () => {
      await request(app)
        .post('/user/allergies')
        .send({ username: 'student1', allergy: 'peanuts' });

      await request(app)
        .post('/pantry/items')
        .send({ name: 'Peanut Butter', expiresOn: getOffsetDateString(30) });
      await request(app)
        .post('/pantry/items')
        .send({ name: 'Whole Wheat Bread', expiresOn: getOffsetDateString(7) });

      const res = await request(app)
        .get('/pantry/ai-recipe?username=student1')
        .expect(200);

      assert.ok(res.body.title);
      const ingredientsLower = res.body.ingredients.map((i) => i.toLowerCase());
      assert.equal(ingredientsLower.some((i) => i.includes('peanut')), false);
    });

    test('T1.35: AI query assistant returns culinary response', async () => {
      const res = await request(app)
        .post('/ai/query')
        .send({ prompt: 'How do I substitute butter in baking?' })
        .expect(200);

      assert.ok(res.body.response);
      assert.equal(typeof res.body.response, 'string');
      assert.ok(res.body.response.length > 0);
    });
  });

  // =========================================================================
  // Feature 8: Authorization & Security Basics
  // =========================================================================
  describe('Feature 8: Authorization & Security Basics', () => {
    test('T1.36: Non-numeric pantry item ID returns 400', async () => {
      const res = await request(app)
        .delete('/pantry/items/not-a-number')
        .expect(400);

      assert.ok(res.body.error);
    });

    test('T1.37: Non-existent pantry item ID returns 404 on delete', async () => {
      const res = await request(app)
        .delete('/pantry/items/999999')
        .expect(404);

      assert.ok(res.body.error);
    });

    test('T1.38: Non-numeric grocery item ID returns 400 on patch', async () => {
      const res = await request(app)
        .patch('/grocery/items/invalid-id')
        .send({ checked: true })
        .expect(400);

      assert.ok(res.body.error);
    });

    test('T1.39: Non-existent grocery item ID returns 404 on patch', async () => {
      const res = await request(app)
        .patch('/grocery/items/999999')
        .send({ checked: true })
        .expect(404);

      assert.ok(res.body.error);
    });

    test('T1.40: Health check endpoint /health returns 200 { status: ok }', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);

      assert.equal(res.body.status, 'ok');
    });
  });
});
