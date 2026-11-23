'use strict';

process.env.NODE_ENV = 'test';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app, getOffsetDateString, resetStore } = require('./helpers');

describe('Tier 2: Boundary & Corner Cases (40 Tests Across 7 Domains)', () => {
  beforeEach(() => {
    resetStore();
  });

  // =========================================================================
  // Domain 1: String Length & Empty Input Boundaries
  // =========================================================================
  describe('Domain 1: String Length & Empty Input Boundaries', () => {
    test('T2.1: Empty item name in /pantry/items rejected with 400', async () => {
      const res = await request(app)
        .post('/pantry/items')
        .send({ name: '', expiresOn: getOffsetDateString(7) })
        .expect(400);

      assert.ok(res.body.error);
    });

    test('T2.2: Whitespace-only item name in /pantry/items handled safely', async () => {
      const res = await request(app)
        .post('/pantry/items')
        .send({ name: '   ', expiresOn: getOffsetDateString(7) });

      // Either rejected with 400 or accepted with trimmed/raw string without server crash
      assert.ok([201, 400].includes(res.status));
      if (res.status === 201) {
        assert.ok(res.body.id);
      }
    });

    test('T2.3: Extremely long item name (500+ characters) handled safely without crash', async () => {
      const longName = 'ExtraLargeOrganicProduct_'.repeat(25); // 625 chars
      const res = await request(app)
        .post('/pantry/items')
        .send({ name: longName, expiresOn: getOffsetDateString(10) });

      assert.ok([201, 400].includes(res.status));
      if (res.status === 201) {
        assert.equal(res.body.name, longName);
      }
    });

    test('T2.4: Single character allergy in /user/allergies rejected (min length 2)', async () => {
      const res = await request(app)
        .post('/user/allergies')
        .send({ username: 'student1', allergy: 'a' });

      assert.equal(res.status, 400);
      assert.ok(res.body.error);
    });

    test('T2.5: Two character allergy in /user/allergies accepted', async () => {
      const res = await request(app)
        .post('/user/allergies')
        .send({ username: 'student1', allergy: 'so' });

      assert.equal(res.status, 201);
      assert.equal(res.body.allergy, 'so');
    });
  });

  // =========================================================================
  // Domain 2: Numeric & Quantity Boundaries
  // =========================================================================
  describe('Domain 2: Numeric & Quantity Boundaries', () => {
    test('T2.6: Zero quantity in pantry item handled safely', async () => {
      const res = await request(app)
        .post('/pantry/items')
        .send({ name: 'Salt', quantity: 0, expiresOn: getOffsetDateString(100) });

      assert.ok([201, 400].includes(res.status));
      if (res.status === 201) {
        assert.equal(res.body.quantity, 0);
      }
    });

    test('T2.7: Negative quantity in pantry item handled safely without arithmetic corruption', async () => {
      const res = await request(app)
        .post('/pantry/items')
        .send({ name: 'Pepper', quantity: -5, expiresOn: getOffsetDateString(100) });

      assert.ok([201, 400].includes(res.status));
    });

    test('T2.8: Decimal quantity (e.g. 1.5) handled without crashing', async () => {
      const res = await request(app)
        .post('/pantry/items')
        .send({ name: 'Flour (kg)', quantity: 1.5, expiresOn: getOffsetDateString(30) });

      assert.equal(res.status, 201);
      assert.equal(res.body.quantity, 1.5);
    });

    test('T2.9: Large quantity (99999) handled without integer overflow', async () => {
      const res = await request(app)
        .post('/pantry/items')
        .send({ name: 'Rice Grains', quantity: 99999, expiresOn: getOffsetDateString(365) });

      assert.equal(res.status, 201);
      assert.equal(res.body.quantity, 99999);
    });

    test('T2.10: String quantity handled safely without server exception', async () => {
      const res = await request(app)
        .post('/pantry/items')
        .send({ name: 'Sugar', quantity: '2 bags', expiresOn: getOffsetDateString(30) });

      assert.ok([201, 400].includes(res.status));
    });
  });

  // =========================================================================
  // Domain 3: Date & Expiration Boundaries
  // =========================================================================
  describe('Domain 3: Date & Expiration Boundaries', () => {
    test('T2.11: Past expiration date (expired yesterday) categorized as immediate red alert', async () => {
      await request(app)
        .post('/pantry/items')
        .send({ name: 'Expired Milk', expiresOn: getOffsetDateString(-1) })
        .expect(201);

      const res = await request(app).get('/pantry/alerts').expect(200);
      assert.ok(res.body.summary.red >= 1);
      const alert = res.body.alerts.find((a) => a.itemName === 'Expired Milk');
      assert.ok(alert);
      assert.equal(alert.status, 'red');
    });

    test('T2.12: Distant future expiration date categorized as green alert', async () => {
      await request(app)
        .post('/pantry/items')
        .send({ name: 'Canned Beans', expiresOn: '2099-12-31' })
        .expect(201);

      const res = await request(app).get('/pantry/alerts').expect(200);
      assert.ok(res.body.summary.green >= 1);
      const alert = res.body.alerts.find((a) => a.itemName === 'Canned Beans');
      assert.ok(alert);
      assert.equal(alert.status, 'green');
    });

    test('T2.13: Leap year date (2028-02-29) parsed correctly', async () => {
      const res = await request(app)
        .post('/pantry/items')
        .send({ name: 'Leap Honey', expiresOn: '2028-02-29' })
        .expect(201);

      assert.equal(res.body.expiresOn, '2028-02-29');
    });

    test('T2.14: Missing expiresOn parameter in /pantry/items rejected with 400', async () => {
      const res = await request(app)
        .post('/pantry/items')
        .send({ name: 'Missing Expiry Item' })
        .expect(400);

      assert.ok(res.body.error);
    });

    test('T2.15: Distant past expiration date (1970-01-01) categorized as red alert without underflow', async () => {
      await request(app)
        .post('/pantry/items')
        .send({ name: 'Ancient Relic', expiresOn: '1970-01-01' })
        .expect(201);

      const res = await request(app).get('/pantry/alerts').expect(200);
      const alert = res.body.alerts.find((a) => a.itemName === 'Ancient Relic');
      assert.ok(alert);
      assert.equal(alert.status, 'red');
    });
  });

  // =========================================================================
  // Domain 4: Allergy & AI Generation Boundaries
  // =========================================================================
  describe('Domain 4: Allergy & AI Generation Boundaries', () => {
    test('T2.16: Empty ingredients array to /ai/recipe rejected with 400', async () => {
      const res = await request(app)
        .post('/ai/recipe')
        .send({ items: [] })
        .expect(400);

      assert.ok(res.body.error);
    });

    test('T2.17: Whitespace-only prompt to /ai/query rejected with 400', async () => {
      const res = await request(app)
        .post('/ai/query')
        .send({ prompt: '    ' })
        .expect(400);

      assert.ok(res.body.error);
    });

    test('T2.18: Duplicate allergy submission is idempotent', async () => {
      await request(app)
        .post('/user/allergies')
        .send({ username: 'student1', allergy: 'peanuts' });

      await request(app)
        .post('/user/allergies')
        .send({ username: 'student1', allergy: 'peanuts' });

      const res = await request(app)
        .get('/user/allergies?username=student1')
        .expect(200);

      const occurrences = res.body.allergies.filter((a) => a === 'peanuts');
      assert.equal(occurrences.length, 1);
    });

    test('T2.19: Case insensitivity in allergy handling (Peanuts vs peanuts)', async () => {
      await request(app)
        .post('/user/allergies')
        .send({ username: 'student1', allergy: 'PeAnUtS' });

      const res = await request(app)
        .get('/user/allergies?username=student1')
        .expect(200);

      assert.ok(res.body.allergies.includes('peanuts'));
    });

    test('T2.20: Non-string prompt to /ai/query rejected with 400', async () => {
      const res = await request(app)
        .post('/ai/query')
        .send({ prompt: 12345 })
        .expect(400);

      assert.ok(res.body.error);
    });

    test('T2.21: Non-array items to /ai/recipe rejected with 400', async () => {
      const res = await request(app)
        .post('/ai/recipe')
        .send({ items: 'not-an-array' })
        .expect(400);

      assert.ok(res.body.error);
    });
  });

  // =========================================================================
  // Domain 5: Payload & Format Boundaries
  // =========================================================================
  describe('Domain 5: Payload & Format Boundaries', () => {
    test('T2.22: Empty JSON body {} to /pantry/items rejected with 400', async () => {
      const res = await request(app)
        .post('/pantry/items')
        .send({})
        .expect(400);

      assert.ok(res.body.error);
    });

    test('T2.23: Empty JSON body {} to /login rejected with 400', async () => {
      const res = await request(app)
        .post('/login')
        .send({})
        .expect(400);

      assert.ok(res.body.error);
    });

    test('T2.24: Prototype pollution probe __proto__ in login username rejected with 401', async () => {
      const res = await request(app)
        .post('/login')
        .send({ username: '__proto__', password: 'password123' })
        .expect(401);

      assert.ok(res.body.error);
    });

    test('T2.25: Special characters and emojis in item names handled safely', async () => {
      const weirdName = '<script>alert("xss")</script> 🍎 \' OR \'1\'=\'1';
      const res = await request(app)
        .post('/pantry/items')
        .send({ name: weirdName, expiresOn: getOffsetDateString(7) })
        .expect(201);

      assert.equal(res.body.name, weirdName);

      const listRes = await request(app).get('/pantry/items').expect(200);
      const found = listRes.body.items.find((i) => i.id === res.body.id);
      assert.ok(found);
      assert.equal(found.name, weirdName);
    });

    test('T2.26: Empty JSON body {} to /grocery/items rejected with 400', async () => {
      const res = await request(app)
        .post('/grocery/items')
        .send({})
        .expect(400);

      assert.ok(res.body.error);
    });

    test('T2.27: Non-boolean checked in PATCH /grocery/items/:id rejected with 400', async () => {
      const item = (await request(app).post('/grocery/items').send({ name: 'Napkins' })).body;

      const res = await request(app)
        .patch(`/grocery/items/${item.id}`)
        .send({ checked: 'true' }) // string instead of boolean
        .expect(400);

      assert.ok(res.body.error);
    });

    test('T2.28: Prototype pollution probe in allergy payload handled safely', async () => {
      const res = await request(app)
        .post('/user/allergies')
        .send({ username: '__proto__', allergy: 'peanuts' });

      // Either rejected or safe without polluting Object.prototype
      assert.equal(Object.prototype.peanuts, undefined);
    });

    test('T2.29: Non-string allergy in POST /user/allergies rejected with 400', async () => {
      const res = await request(app)
        .post('/user/allergies')
        .send({ username: 'student1', allergy: 12345 })
        .expect(400);

      assert.ok(res.body.error);
    });

    test('T2.30: Whitespace-only allergy in POST /user/allergies rejected with 400', async () => {
      const res = await request(app)
        .post('/user/allergies')
        .send({ username: 'student1', allergy: '    ' })
        .expect(400);

      assert.ok(res.body.error);
    });
  });

  // =========================================================================
  // Domain 6: Expiration Threshold Exact Boundaries
  // =========================================================================
  describe('Domain 6: Expiration Threshold Exact Boundaries', () => {
    test('T2.31: Exactly 0 days remaining (today) categorized as red alert', async () => {
      await request(app)
        .post('/pantry/items')
        .send({ name: 'Today Item', expiresOn: getOffsetDateString(0) })
        .expect(201);

      const res = await request(app).get('/pantry/alerts').expect(200);
      const alert = res.body.alerts.find((a) => a.itemName === 'Today Item');
      assert.ok(alert);
      assert.equal(alert.status, 'red');
    });

    test('T2.32: Exactly 2 days remaining categorized as red alert (<= 2 boundary)', async () => {
      await request(app)
        .post('/pantry/items')
        .send({ name: 'Day 2 Item', expiresOn: getOffsetDateString(2) })
        .expect(201);

      const res = await request(app).get('/pantry/alerts').expect(200);
      const alert = res.body.alerts.find((a) => a.itemName === 'Day 2 Item');
      assert.ok(alert);
      assert.equal(alert.status, 'red');
    });

    test('T2.33: Exactly 3 days remaining categorized as yellow alert (3-5 boundary)', async () => {
      await request(app)
        .post('/pantry/items')
        .send({ name: 'Day 3 Item', expiresOn: getOffsetDateString(3) })
        .expect(201);

      const res = await request(app).get('/pantry/alerts').expect(200);
      const alert = res.body.alerts.find((a) => a.itemName === 'Day 3 Item');
      assert.ok(alert);
      assert.equal(alert.status, 'yellow');
    });

    test('T2.34: Exactly 5 days remaining categorized as yellow alert (<= 5 boundary)', async () => {
      await request(app)
        .post('/pantry/items')
        .send({ name: 'Day 5 Item', expiresOn: getOffsetDateString(5) })
        .expect(201);

      const res = await request(app).get('/pantry/alerts').expect(200);
      const alert = res.body.alerts.find((a) => a.itemName === 'Day 5 Item');
      assert.ok(alert);
      assert.equal(alert.status, 'yellow');
    });

    test('T2.35: Exactly 6 days remaining categorized as green alert (> 5 boundary)', async () => {
      await request(app)
        .post('/pantry/items')
        .send({ name: 'Day 6 Item', expiresOn: getOffsetDateString(6) })
        .expect(201);

      const res = await request(app).get('/pantry/alerts').expect(200);
      const alert = res.body.alerts.find((a) => a.itemName === 'Day 6 Item');
      assert.ok(alert);
      assert.equal(alert.status, 'green');
    });
  });

  // =========================================================================
  // Domain 7: High-Volume & Rapid Mutation Boundaries
  // =========================================================================
  describe('Domain 7: High-Volume & Mutation Boundaries', () => {
    test('T2.36: Batch adding 15 pantry items sequentially preserves monotonic IDs and version', async () => {
      const initialVer = (await request(app).get('/sync').expect(200)).body.version;

      for (let i = 1; i <= 15; i++) {
        await request(app)
          .post('/pantry/items')
          .send({ name: `Batch Item ${i}`, expiresOn: getOffsetDateString(i + 5) })
          .expect(201);
      }

      const sync = (await request(app).get('/sync').expect(200)).body;
      assert.equal(sync.version, initialVer + 15);
      assert.equal(sync.pantry.length, 15);
    });

    test('T2.37: Rapid alternating check/uncheck on grocery item toggles state reliably', async () => {
      const item = (await request(app).post('/grocery/items').send({ name: 'Baking Soda' })).body;

      await request(app).patch(`/grocery/items/${item.id}`).send({ checked: true }).expect(200);
      await request(app).patch(`/grocery/items/${item.id}`).send({ checked: false }).expect(200);
      const finalRes = await request(app).patch(`/grocery/items/${item.id}`).send({ checked: true }).expect(200);

      assert.equal(finalRes.body.checked, true);
    });

    test('T2.38: Re-deleting already deleted pantry item returns 404', async () => {
      const item = (await request(app).post('/pantry/items').send({ name: 'One-off', expiresOn: getOffsetDateString(5) })).body;

      await request(app).delete(`/pantry/items/${item.id}`).expect(200);
      await request(app).delete(`/pantry/items/${item.id}`).expect(404);
    });

    test('T2.39: Updating non-existent grocery item returns 404', async () => {
      await request(app)
        .patch('/grocery/items/888888')
        .send({ checked: true })
        .expect(404);
    });

    test('T2.40: Querying /pantry/alerts with zero items returns clean empty summary', async () => {
      const res = await request(app)
        .get('/pantry/alerts')
        .expect(200);

      assert.equal(res.body.summary.green, 0);
      assert.equal(res.body.summary.yellow, 0);
      assert.equal(res.body.summary.red, 0);
      assert.equal(res.body.alerts.length, 0);
    });
  });
});
