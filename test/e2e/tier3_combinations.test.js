'use strict';

process.env.NODE_ENV = 'test';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app, getOffsetDateString, resetStore } = require('./helpers');

describe('Tier 3: Pairwise Combinations (10 Cross-Feature Interaction Tests)', () => {
  beforeEach(() => {
    resetStore();
  });

  test('T3.1: Login + Private Pantry Add + Delete', async () => {
    // 1. Authenticate user
    const loginRes = await request(app)
      .post('/login')
      .send({ username: 'student1', password: 'password123' })
      .expect(200);

    const username = loginRes.body.user.username;

    // 2. Add private pantry item belonging to authenticated user
    const addRes = await request(app)
      .post('/pantry/items')
      .send({
        name: 'Private Protein Powder',
        owner: username,
        isShared: false,
        expiresOn: getOffsetDateString(90)
      })
      .expect(201);

    assert.equal(addRes.body.owner, 'student1');
    assert.equal(addRes.body.isShared, false);

    // 3. Verify item in pantry listing
    const listRes = await request(app).get('/pantry/items').expect(200);
    const item = listRes.body.items.find((i) => i.id === addRes.body.id);
    assert.ok(item);
    assert.equal(item.owner, 'student1');

    // 4. Delete item and confirm removal
    await request(app).delete(`/pantry/items/${item.id}`).expect(200);
    const afterDel = await request(app).get('/pantry/items').expect(200);
    assert.equal(afterDel.body.items.some((i) => i.id === item.id), false);
  });

  test('T3.2: Allergy Configuration + AI Custom Recipe Generation', async () => {
    // 1. Configure user allergy
    await request(app)
      .post('/user/allergies')
      .send({ username: 'student1', allergy: 'dairy' });

    // 2. Request custom AI recipe with ingredients including an allergen
    const recipeRes = await request(app)
      .post('/ai/recipe')
      .send({
        items: ['cow milk', 'baby spinach', 'olive oil'],
        allergies: ['dairy'],
        username: 'student1'
      })
      .expect(200);

    assert.ok(recipeRes.body.title);
    assert.ok(Array.isArray(recipeRes.body.ingredients));
    const ingredientsLower = recipeRes.body.ingredients.map((i) => i.toLowerCase());
    assert.equal(ingredientsLower.some((i) => i.includes('milk')), false);
  });

  test('T3.3: Allergy Configuration + Pantry Auto-Gen Recipe', async () => {
    // 1. Configure user allergy
    await request(app)
      .post('/user/allergies')
      .send({ username: 'student1', allergy: 'dairy' });

    // 2. Stock pantry with ingredients including dairy
    await request(app)
      .post('/pantry/items')
      .send({ name: 'Whole Milk', expiresOn: getOffsetDateString(5) });
    await request(app)
      .post('/pantry/items')
      .send({ name: 'Sourdough Bread', expiresOn: getOffsetDateString(7) });

    // 3. Auto-generate pantry recipe specifying user
    const autoGenRes = await request(app)
      .get('/pantry/ai-recipe?username=student1')
      .expect(200);

    assert.ok(autoGenRes.body.title);
    const ingredientsLower = autoGenRes.body.ingredients.map((i) => i.toLowerCase());
    assert.equal(ingredientsLower.some((i) => i.includes('milk')), false);
  });

  test('T3.4: Grocery List Checkoff + Pantry Restock', async () => {
    // 1. Add item to shared grocery list
    const groceryItem = (
      await request(app)
        .post('/grocery/items')
        .send({ name: 'Fuji Apples', requestedBy: 'student1', quantity: 4 })
        .expect(201)
    ).body;

    assert.equal(groceryItem.checked, false);

    // 2. Mark item as purchased
    const updatedGrocery = (
      await request(app)
        .patch(`/grocery/items/${groceryItem.id}`)
        .send({ checked: true })
        .expect(200)
    ).body;

    assert.equal(updatedGrocery.checked, true);

    // 3. Restock pantry with purchased item
    const pantryItem = (
      await request(app)
        .post('/pantry/items')
        .send({
          name: groceryItem.name,
          quantity: groceryItem.quantity,
          isShared: true,
          expiresOn: getOffsetDateString(14)
        })
        .expect(201)
    ).body;

    assert.equal(pantryItem.name, 'Fuji Apples');
    assert.equal(pantryItem.quantity, 4);

    // 4. Verify system sync snapshot reflects both grocery list item and pantry item
    const syncRes = await request(app).get('/sync').expect(200);
    assert.ok(syncRes.body.groceryList.some((g) => g.id === groceryItem.id && g.checked === true));
    assert.ok(syncRes.body.pantry.some((p) => p.id === pantryItem.id));
  });

  test('T3.5: Pantry Expiration Alerts + Cook-Now Prioritization', async () => {
    // 1. Add 3 items with staggered expiry dates: 1 day (red), 4 days (yellow), 10 days (green)
    await request(app)
      .post('/pantry/items')
      .send({ name: 'Fresh Berries', expiresOn: getOffsetDateString(1) });
    await request(app)
      .post('/pantry/items')
      .send({ name: 'Cheddar Cheese', expiresOn: getOffsetDateString(4) });
    await request(app)
      .post('/pantry/items')
      .send({ name: 'Dry Brown Rice', expiresOn: getOffsetDateString(10) });

    // 2. Verify alert distribution
    const alertsRes = await request(app).get('/pantry/alerts').expect(200);
    assert.equal(alertsRes.body.summary.red, 1);
    assert.equal(alertsRes.body.summary.yellow, 1);
    assert.equal(alertsRes.body.summary.green, 1);

    // 3. Verify Cook-Now engine prioritizes most urgent item
    const cookNowRes = await request(app).get('/cook-now').expect(200);
    assert.ok(cookNowRes.body.recommendations.length >= 1);
    assert.equal(cookNowRes.body.recommendations[0].itemName, 'Fresh Berries');
  });

  test('T3.6: Multiple Users Concurrent Allergies Isolation', async () => {
    // User A sets 'peanuts'
    await request(app)
      .post('/user/allergies')
      .send({ username: 'student1', allergy: 'peanuts' });

    // User B sets 'shellfish'
    await request(app)
      .post('/user/allergies')
      .send({ username: 'student2', allergy: 'shellfish' });

    // Verify User A profile
    const userARes = await request(app)
      .get('/user/allergies?username=student1')
      .expect(200);
    assert.ok(userARes.body.allergies.includes('peanuts'));
    assert.equal(userARes.body.allergies.includes('shellfish'), false);

    // Verify User B profile
    const userBRes = await request(app)
      .get('/user/allergies?username=student2')
      .expect(200);
    assert.ok(userBRes.body.allergies.includes('shellfish'));
    assert.equal(userBRes.body.allergies.includes('peanuts'), false);
  });

  test('T3.7: Shared vs Private Item Inventory Filter & Metadata', async () => {
    // Add shared staple
    const sharedRes = await request(app)
      .post('/pantry/items')
      .send({ name: 'Communal Olive Oil', isShared: true, expiresOn: getOffsetDateString(60) })
      .expect(201);

    // Add private item
    const privateRes = await request(app)
      .post('/pantry/items')
      .send({ name: 'Private Gourmet Chocolate', owner: 'student1', isShared: false, expiresOn: getOffsetDateString(45) })
      .expect(201);

    const list = (await request(app).get('/pantry/items').expect(200)).body.items;
    const sharedItem = list.find((i) => i.id === sharedRes.body.id);
    const privateItem = list.find((i) => i.id === privateRes.body.id);

    assert.equal(sharedItem.isShared, true);
    assert.equal(privateItem.isShared, false);
    assert.equal(privateItem.owner, 'student1');
  });

  test('T3.8: Grocery List Multi-Item Sync Increments', async () => {
    const v0 = (await request(app).get('/sync').expect(200)).body.version;

    // Add 2 grocery items
    const g1 = (await request(app).post('/grocery/items').send({ name: 'Oatmeal' }).expect(201)).body;
    const g2 = (await request(app).post('/grocery/items').send({ name: 'Bananas' }).expect(201)).body;

    // Check one off
    await request(app).patch(`/grocery/items/${g1.id}`).send({ checked: true }).expect(200);

    const vFinal = (await request(app).get('/sync').expect(200)).body.version;
    assert.equal(vFinal, v0 + 3); // 2 adds + 1 update
  });

  test('T3.9: Login + Expiration Alerts Push Notification Flow', async () => {
    await request(app)
      .post('/login')
      .send({ username: 'student1', password: 'password123' })
      .expect(200);

    const item = (
      await request(app)
        .post('/pantry/items')
        .send({ name: 'Critical Cream', expiresOn: getOffsetDateString(0) })
        .expect(201)
    ).body;

    const alertsRes = await request(app).get('/pantry/alerts').expect(200);
    assert.ok(alertsRes.body.pushNotifications.length >= 1);
    const notif = alertsRes.body.pushNotifications.find((n) => n.itemId === item.id);
    assert.ok(notif);
    assert.match(notif.message, /Critical Cream/i);
  });

  test('T3.10: Pantry Delete Cascades to Cook-Now Recommendations', async () => {
    // Add two items near expiry
    const urgent1 = (await request(app).post('/pantry/items').send({ name: 'Fresh Salmon', expiresOn: getOffsetDateString(1) })).body;
    const urgent2 = (await request(app).post('/pantry/items').send({ name: 'Fresh Spinach', expiresOn: getOffsetDateString(2) })).body;

    const initialRecs = (await request(app).get('/cook-now').expect(200)).body.recommendations;
    assert.equal(initialRecs[0].itemName, 'Fresh Salmon');

    // Delete urgent1
    await request(app).delete(`/pantry/items/${urgent1.id}`).expect(200);

    const updatedRecs = (await request(app).get('/cook-now').expect(200)).body.recommendations;
    assert.equal(updatedRecs.some((r) => r.itemName === 'Fresh Salmon'), false);
    assert.equal(updatedRecs[0].itemName, 'Fresh Spinach');
  });
});
