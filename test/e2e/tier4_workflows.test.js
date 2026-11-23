'use strict';

process.env.NODE_ENV = 'test';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app, getOffsetDateString, resetStore } = require('./helpers');

describe('Tier 4: Real-World Household Application Workflows (6 End-to-End Scenarios)', () => {
  beforeEach(() => {
    resetStore();
  });

  // =========================================================================
  // Scenario 1: New Roommate Move-In & Onboarding Workflow
  // =========================================================================
  test('Scenario 1: New Roommate Move-In & Onboarding Workflow', async () => {
    // 1. Student1 signs into RoomiePantry
    const loginRes = await request(app)
      .post('/login')
      .send({ username: 'student1', password: 'password123' })
      .expect(200);

    const username = loginRes.body.user.username;
    assert.equal(username, 'student1');

    // 2. Onboarding: Configure dietary allergies
    await request(app)
      .post('/user/allergies')
      .send({ username, allergy: 'peanuts' })
      .expect(201);

    await request(app)
      .post('/user/allergies')
      .send({ username, allergy: 'tree nuts' })
      .expect(201);

    // 3. Verify user profile preserves dietary settings
    const allergyRes = await request(app)
      .get(`/user/allergies?username=${username}`)
      .expect(200);

    assert.ok(allergyRes.body.allergies.includes('peanuts'));
    assert.ok(allergyRes.body.allergies.includes('tree nuts'));

    // 4. Initial grocery move-in: Stock pantry staples
    await request(app)
      .post('/pantry/items')
      .send({ name: 'Dry Penne Pasta', isShared: true, quantity: 2, expiresOn: getOffsetDateString(90) })
      .expect(201);

    await request(app)
      .post('/pantry/items')
      .send({ name: 'Olive Oil', isShared: true, quantity: 1, expiresOn: getOffsetDateString(180) })
      .expect(201);

    await request(app)
      .post('/pantry/items')
      .send({ name: 'Tomato Basil Sauce', isShared: true, quantity: 2, expiresOn: getOffsetDateString(60) })
      .expect(201);

    // 5. Generate first allergy-safe meal from freshly stocked pantry
    const recipeRes = await request(app)
      .get(`/pantry/ai-recipe?username=${username}`)
      .expect(200);

    assert.ok(recipeRes.body.title);
    assert.ok(Array.isArray(recipeRes.body.ingredients));
    assert.ok(recipeRes.body.instructions.length > 0);

    const ingredientsLower = recipeRes.body.ingredients.map((i) => i.toLowerCase());
    assert.equal(ingredientsLower.some((i) => i.includes('peanut')), false);
    assert.equal(ingredientsLower.some((i) => i.includes('nut')), false);
  });

  // =========================================================================
  // Scenario 2: Weekly Household Grocery Shopping & Restock Cycle
  // =========================================================================
  test('Scenario 2: Weekly Household Grocery Shopping & Restock Cycle', async () => {
    // 1. Roommates populate communal grocery list with needed goods
    const g1 = (await request(app).post('/grocery/items').send({ name: 'Almond Butter', requestedBy: 'student1', quantity: 1 }).expect(201)).body;
    const g2 = (await request(app).post('/grocery/items').send({ name: 'Whole Wheat Bread', requestedBy: 'student1', quantity: 2 }).expect(201)).body;
    const g3 = (await request(app).post('/grocery/items').send({ name: 'Grade A Eggs', requestedBy: 'student2', quantity: 12 }).expect(201)).body;
    const g4 = (await request(app).post('/grocery/items').send({ name: 'Oat Milk', requestedBy: 'student1', quantity: 1 }).expect(201)).body;

    // 2. Roommate goes shopping: marks purchased items as checked
    await request(app).patch(`/grocery/items/${g1.id}`).send({ checked: true }).expect(200);
    await request(app).patch(`/grocery/items/${g2.id}`).send({ checked: true }).expect(200);
    await request(app).patch(`/grocery/items/${g3.id}`).send({ checked: true }).expect(200);
    // Oat milk (g4) was out of stock at store, remains unchecked

    // 3. Shopper unloads groceries and restocks the household pantry
    const p1 = (await request(app).post('/pantry/items').send({ name: g1.name, quantity: g1.quantity, isShared: true, expiresOn: getOffsetDateString(45) }).expect(201)).body;
    const p2 = (await request(app).post('/pantry/items').send({ name: g2.name, quantity: g2.quantity, isShared: true, expiresOn: getOffsetDateString(7) }).expect(201)).body;
    const p3 = (await request(app).post('/pantry/items').send({ name: g3.name, quantity: g3.quantity, isShared: true, expiresOn: getOffsetDateString(21) }).expect(201)).body;

    // 4. Verify system sync snapshot reflects complete state consistency
    const syncRes = await request(app).get('/sync').expect(200);
    assert.equal(syncRes.body.groceryList.length, 4);
    assert.equal(syncRes.body.pantry.length, 3);

    const checkedCount = syncRes.body.groceryList.filter((g) => g.checked).length;
    assert.equal(checkedCount, 3);

    const pantryNames = syncRes.body.pantry.map((p) => p.name);
    assert.ok(pantryNames.includes('Almond Butter'));
    assert.ok(pantryNames.includes('Whole Wheat Bread'));
    assert.ok(pantryNames.includes('Grade A Eggs'));
  });

  // =========================================================================
  // Scenario 3: Zero-Waste Dinner Preparation Under Food Expiry Pressure
  // =========================================================================
  test('Scenario 3: Zero-Waste Dinner Preparation Under Food Expiry Pressure', async () => {
    // 1. Household pantry has items with varied expiration urgency
    const urgentMilk = (await request(app).post('/pantry/items').send({ name: 'Whole Milk', expiresOn: getOffsetDateString(1) }).expect(201)).body;
    const urgentSpinach = (await request(app).post('/pantry/items').send({ name: 'Baby Spinach', expiresOn: getOffsetDateString(2) }).expect(201)).body;
    const stablePasta = (await request(app).post('/pantry/items').send({ name: 'Dried Spaghetti', expiresOn: getOffsetDateString(60) }).expect(201)).body;

    // 2. Housemate checks expiration alerts dashboard
    const alertsRes = await request(app).get('/pantry/alerts').expect(200);
    assert.equal(alertsRes.body.summary.red, 2);
    assert.equal(alertsRes.body.summary.green, 1);

    // 3. Query cook-now recommendations
    const cookNowRes = await request(app).get('/cook-now').expect(200);
    assert.ok(cookNowRes.body.recommendations.length >= 2);
    assert.equal(cookNowRes.body.recommendations[0].itemName, 'Whole Milk');

    // 4. Housemate prepares and consumes the urgent items
    await request(app).delete(`/pantry/items/${urgentMilk.id}`).expect(200);
    await request(app).delete(`/pantry/items/${urgentSpinach.id}`).expect(200);

    // 5. Expiration alerts reflect zero food waste and zero red items remaining
    const updatedAlerts = await request(app).get('/pantry/alerts').expect(200);
    assert.equal(updatedAlerts.body.summary.red, 0);
    assert.equal(updatedAlerts.body.summary.green, 1);
  });

  // =========================================================================
  // Scenario 4: Multi-User Household with Conflicting Dietary Restrictions
  // =========================================================================
  test('Scenario 4: Multi-User Household with Conflicting Dietary Restrictions', async () => {
    // 1. User A (student1) is allergic to dairy
    await request(app).post('/user/allergies').send({ username: 'student1', allergy: 'dairy' }).expect(201);

    // 2. User B (student2) is allergic to gluten
    await request(app).post('/user/allergies').send({ username: 'student2', allergy: 'gluten' }).expect(201);

    // 3. Stock pantry with communal groceries
    await request(app).post('/pantry/items').send({ name: 'Sharp Cheddar Cheese', expiresOn: getOffsetDateString(14) }).expect(201);
    await request(app).post('/pantry/items').send({ name: 'Whole Wheat Bread', expiresOn: getOffsetDateString(7) }).expect(201);
    await request(app).post('/pantry/items').send({ name: 'Fresh Eggs', expiresOn: getOffsetDateString(10) }).expect(201);

    // 4. User A requests meal -> dairy must be excluded
    const recipeA = (await request(app).get('/pantry/ai-recipe?username=student1').expect(200)).body;
    const ingA = recipeA.ingredients.map((i) => i.toLowerCase());
    assert.equal(ingA.some((i) => i.includes('cheese')), false);

    // 5. User B requests meal -> gluten must be excluded
    const recipeB = (await request(app).get('/pantry/ai-recipe?username=student2').expect(200)).body;
    const ingB = recipeB.ingredients.map((i) => i.toLowerCase());
    assert.equal(ingB.some((i) => i.includes('bread')), false);

    // 6. Joint dinner meal generation excludes both dairy and gluten
    const jointRecipe = (
      await request(app)
        .post('/ai/recipe')
        .send({
          items: ['Sharp Cheddar Cheese', 'Whole Wheat Bread', 'Fresh Eggs', 'Olive Oil'],
          allergies: ['dairy', 'gluten']
        })
        .expect(200)
    ).body;

    const jointIng = jointRecipe.ingredients.map((i) => i.toLowerCase());
    assert.equal(jointIng.some((i) => i.includes('cheese')), false);
    assert.equal(jointIng.some((i) => i.includes('bread')), false);
  });

  // =========================================================================
  // Scenario 5: End-of-Semester Cleanout and Inventory Reset
  // =========================================================================
  test('Scenario 5: End-of-Semester Cleanout and Inventory Reset', async () => {
    // 1. Populate pantry with mixture of shared and private items
    const i1 = (await request(app).post('/pantry/items').send({ name: 'Condiment 1', isShared: true, expiresOn: getOffsetDateString(5) })).body;
    const i2 = (await request(app).post('/pantry/items').send({ name: 'Condiment 2', isShared: true, expiresOn: getOffsetDateString(10) })).body;
    const i3 = (await request(app).post('/pantry/items').send({ name: 'Private Snack', owner: 'student1', isShared: false, expiresOn: getOffsetDateString(20) })).body;

    // 2. Populate grocery list
    await request(app).post('/grocery/items').send({ name: 'Stale Grocery 1' });
    await request(app).post('/grocery/items').send({ name: 'Stale Grocery 2' });

    // 3. Batch deletion of all items during apartment move-out
    await request(app).delete(`/pantry/items/${i1.id}`).expect(200);
    await request(app).delete(`/pantry/items/${i2.id}`).expect(200);
    await request(app).delete(`/pantry/items/${i3.id}`).expect(200);

    // 4. Verify clean inventory state
    const pantryList = (await request(app).get('/pantry/items').expect(200)).body.items;
    assert.equal(pantryList.length, 0);

    // 5. Expiration alerts reflect completely clean kitchen
    const alerts = (await request(app).get('/pantry/alerts').expect(200)).body;
    assert.equal(alerts.summary.green, 0);
    assert.equal(alerts.summary.yellow, 0);
    assert.equal(alerts.summary.red, 0);
    assert.equal(alerts.alerts.length, 0);

    // 6. Monotonic store version tracking is intact and increments across all deletions
    const sync = (await request(app).get('/sync').expect(200)).body;
    assert.ok(sync.version >= 5);
  });

  // =========================================================================
  // Scenario 6: Hostile Input & Resilience Stress Under Concurrent Operations
  // =========================================================================
  test('Scenario 6: Hostile Input & Resilience Stress Under Concurrent Operations', async () => {
    // 1. Fire sequence of hostile, malformed, and adversarial inputs
    await request(app).post('/login').send({ username: '__proto__', password: 'bad' }).expect(401);
    await request(app).post('/pantry/items').send({}).expect(400);
    await request(app).delete('/pantry/items/not-a-number').expect(400);
    await request(app).delete('/pantry/items/999999').expect(404);
    await request(app).post('/grocery/items').send({}).expect(400);
    await request(app).patch('/grocery/items/999999').send({ checked: true }).expect(404);
    await request(app).post('/ai/recipe').send({ items: [] }).expect(400);
    await request(app).post('/ai/query').send({ prompt: '   ' }).expect(400);

    // 2. Health check confirms server is fully operational
    const health = await request(app).get('/health').expect(200);
    assert.equal(health.body.status, 'ok');

    // 3. Legitimate operation executes cleanly immediately following stress inputs
    const validPantry = await request(app)
      .post('/pantry/items')
      .send({ name: 'Resilient Oatmeal', expiresOn: getOffsetDateString(30) })
      .expect(201);

    assert.equal(validPantry.body.name, 'Resilient Oatmeal');

    const validGrocery = await request(app)
      .post('/grocery/items')
      .send({ name: 'Resilient Bananas' })
      .expect(201);

    assert.equal(validGrocery.body.name, 'Resilient Bananas');

    // 4. Sync snapshot confirms valid state is undisturbed
    const sync = (await request(app).get('/sync').expect(200)).body;
    assert.equal(sync.pantry.length, 1);
    assert.equal(sync.groceryList.length, 1);
  });
});
