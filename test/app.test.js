const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app } = require('../src/app');

test('supports shared and private pantry tracking', async () => {
  await request(app)
    .post('/pantry/items')
    .send({ name: 'Milk', owner: 'alex', isShared: false, expiresOn: '2099-10-10' })
    .expect(201);

  await request(app)
    .post('/pantry/items')
    .send({ name: 'Rice', isShared: true, expiresOn: '2099-11-10' })
    .expect(201);

  const res = await request(app).get('/pantry/items').expect(200);
  assert.equal(res.body.items.length >= 2, true);
  assert.equal(res.body.items.some((item) => item.name === 'Milk' && item.owner === 'alex' && item.isShared === false), true);
  assert.equal(res.body.items.some((item) => item.name === 'Rice' && item.isShared === true), true);
});

test('exposes color-coded expiration alerts with push notifications', async () => {
  await request(app)
    .post('/pantry/items')
    .send({ name: 'Spinach', isShared: true, expiresOn: '2000-01-01' })
    .expect(201);

  const res = await request(app).get('/pantry/alerts').expect(200);
  assert.ok(res.body.summary.red >= 1);
  assert.equal(Array.isArray(res.body.pushNotifications), true);
  assert.equal(res.body.pushNotifications.some((notification) => notification.itemId), true);
});

test('recommends cook-now meals prioritizing expiring ingredients', async () => {
  await request(app)
    .post('/pantry/items')
    .send({ name: 'Eggs', isShared: true, expiresOn: '2026-10-08' })
    .expect(201);

  const res = await request(app).get('/cook-now').expect(200);
  assert.equal(Array.isArray(res.body.recommendations), true);
  assert.equal(res.body.recommendations.length > 0, true);

  const recipe = res.body.recommendations[0];
  assert.equal(recipe.servings, 1);
  assert.equal(recipe.cleanupLevel, 'minimal');
});

test('supports live grocery sync through shared list and snapshot endpoint', async () => {
  const add = await request(app)
    .post('/grocery/items')
    .send({ name: 'Bread', requestedBy: 'jamie' })
    .expect(201);

  await request(app)
    .patch(`/grocery/items/${add.body.id}`)
    .send({ checked: true })
    .expect(200);

  const grocery = await request(app).get('/grocery/items').expect(200);
  assert.equal(grocery.body.items.some((item) => item.name === 'Bread' && item.checked === true), true);

  const sync = await request(app).get('/sync').expect(200);
  assert.ok(sync.body.version >= 1);
  assert.equal(Array.isArray(sync.body.groceryList), true);
  assert.equal(Array.isArray(sync.body.notifications), true);
});
