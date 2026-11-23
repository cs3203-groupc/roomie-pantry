const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');

const { app, store } = require('../src/app');
const { PantryStore } = require('../src/store');
const { SqliteStorage } = require('../src/db');
const AllergyHelper = require('../allergy_helper');
const { AIRecipeGen, aiRecipeGen } = require('../src/aiRecipeGen');

const TEST_ALLERGY_DB_PATH = path.resolve(__dirname, '../data/test_allergy_integration.sqlite');

function cleanupTestDb() {
  if (fs.existsSync(TEST_ALLERGY_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_ALLERGY_DB_PATH);
    } catch (_e) {}
  }
}

// ---------------------------------------------------------------------------
// 1. AllergyHelper Unit Tests
// ---------------------------------------------------------------------------
test('AllergyHelper: full lifecycle (add, has, remove, getAll, clear)', () => {
  const helper = new AllergyHelper();
  assert.equal(helper.getAll().length, 0);

  // Add items with casing and trimming
  assert.equal(helper.add('  Peanuts  '), true);
  assert.equal(helper.add('Dairy'), true);
  assert.equal(helper.has('peanuts'), true);
  assert.equal(helper.has('Peanuts'), true);
  assert.equal(helper.has('dairy'), true);
  assert.equal(helper.has('shellfish'), false);

  const all = helper.getAll();
  assert.equal(all.includes('peanuts'), true);
  assert.equal(all.includes('dairy'), true);

  // Remove item
  assert.equal(helper.remove('Peanuts'), true);
  assert.equal(helper.has('peanuts'), false);
  assert.equal(helper.remove('nonexistent'), false);

  // Clear helper
  helper.clear();
  assert.equal(helper.getAll().length, 0);
  assert.equal(helper.has('dairy'), false);
});

// ---------------------------------------------------------------------------
// 2. User Allergy REST API Endpoints (CRUD)
// ---------------------------------------------------------------------------
test('REST API: GET /user/allergies returns empty list for new user', async () => {
  const res = await request(app)
    .get('/user/allergies?username=user_fresh_1')
    .expect(200);

  assert.equal(res.body.username, 'user_fresh_1');
  assert.deepEqual(res.body.allergies, []);
});

test('REST API: POST /user/allergies adds allergy with normalization', async () => {
  const res1 = await request(app)
    .post('/user/allergies')
    .send({ username: 'user_crud_1', allergy: 'Peanuts' })
    .expect(201);

  assert.equal(res1.body.success, true);
  assert.equal(res1.body.username, 'user_crud_1');
  assert.equal(res1.body.allergy, 'peanuts');

  const res2 = await request(app)
    .post('/user/allergies')
    .send({ username: 'user_crud_1', allergy: '  Dairy  ' })
    .expect(201);

  assert.equal(res2.body.allergy, 'dairy');

  // Verify both allergies present
  const getRes = await request(app)
    .get('/user/allergies?username=user_crud_1')
    .expect(200);

  assert.equal(getRes.body.allergies.includes('peanuts'), true);
  assert.equal(getRes.body.allergies.includes('dairy'), true);
});

test('REST API: DELETE /user/allergies/:allergy removes specified allergy', async () => {
  await request(app)
    .post('/user/allergies')
    .send({ username: 'user_del_1', allergy: 'Shellfish' })
    .expect(201);

  const delRes = await request(app)
    .delete('/user/allergies/shellfish?username=user_del_1')
    .expect(200);

  assert.equal(delRes.body.success, true);
  assert.equal(delRes.body.allergy, 'shellfish');

  const getRes = await request(app)
    .get('/user/allergies?username=user_del_1')
    .expect(200);

  assert.equal(getRes.body.allergies.includes('shellfish'), false);
});

test('REST API: User allergy isolation across distinct users', async () => {
  await request(app)
    .post('/user/allergies')
    .send({ username: 'alice_isolated', allergy: 'peanuts' })
    .expect(201);

  await request(app)
    .post('/user/allergies')
    .send({ username: 'bob_isolated', allergy: 'gluten' })
    .expect(201);

  const aliceAllergies = await request(app)
    .get('/user/allergies?username=alice_isolated')
    .expect(200);

  const bobAllergies = await request(app)
    .get('/user/allergies?username=bob_isolated')
    .expect(200);

  assert.equal(aliceAllergies.body.allergies.includes('peanuts'), true);
  assert.equal(aliceAllergies.body.allergies.includes('gluten'), false);

  assert.equal(bobAllergies.body.allergies.includes('gluten'), true);
  assert.equal(bobAllergies.body.allergies.includes('peanuts'), false);
});

// ---------------------------------------------------------------------------
// 3. User Allergy Validation (Bad Requests)
// ---------------------------------------------------------------------------
test('REST API: POST /user/allergies rejects invalid inputs with 400', async () => {
  // Missing username
  await request(app)
    .post('/user/allergies')
    .send({ allergy: 'peanuts' })
    .expect(400);

  // Empty username
  await request(app)
    .post('/user/allergies')
    .send({ username: '', allergy: 'peanuts' })
    .expect(400);

  // Missing allergy
  await request(app)
    .post('/user/allergies')
    .send({ username: 'val_user' })
    .expect(400);

  // Empty allergy
  await request(app)
    .post('/user/allergies')
    .send({ username: 'val_user', allergy: '' })
    .expect(400);

  // Whitespace-only allergy
  await request(app)
    .post('/user/allergies')
    .send({ username: 'val_user', allergy: '   ' })
    .expect(400);

  // Single-character allergy (length < 2)
  await request(app)
    .post('/user/allergies')
    .send({ username: 'val_user', allergy: 'x' })
    .expect(400);

  // Non-string allergy
  await request(app)
    .post('/user/allergies')
    .send({ username: 'val_user', allergy: 12345 })
    .expect(400);

  // Object allergy
  await request(app)
    .post('/user/allergies')
    .send({ username: 'val_user', allergy: { bad: 'type' } })
    .expect(400);
});

test('REST API: DELETE /user/allergies/:allergy rejects whitespace or empty param with 400', async () => {
  await request(app)
    .delete('/user/allergies/%20%20%20?username=val_user')
    .expect(400);
});

// ---------------------------------------------------------------------------
// 4. Allergy-Aware Recipe Generation
// ---------------------------------------------------------------------------
test('AI Recipe: POST /ai/recipe excludes user allergies and tags title', async () => {
  const res = await request(app)
    .post('/ai/recipe')
    .send({
      items: ['Spinach', 'Cheddar Cheese', 'Eggs'],
      allergies: ['dairy']
    })
    .expect(200);

  assert.equal(res.body.title.includes('Allergy-Safe'), true);
  assert.equal(Array.isArray(res.body.ingredients), true);

  // Cheese is dairy: must be excluded
  const hasDairy = res.body.ingredients.some((i) =>
    i.toLowerCase().includes('cheese') || i.toLowerCase().includes('dairy')
  );
  assert.equal(hasDairy, false);
  assert.equal(res.body.ingredients.includes('Spinach'), true);
  assert.equal(res.body.ingredients.includes('Eggs'), true);
});

test('AI Recipe: POST /ai/recipe resolves allergies by username', async () => {
  // Configure user allergy
  await request(app)
    .post('/user/allergies')
    .send({ username: 'peanut_allergy_user', allergy: 'peanuts' })
    .expect(201);

  const res = await request(app)
    .post('/ai/recipe')
    .send({
      items: ['Peanut Butter', 'Jelly', 'Whole Wheat Bread'],
      username: 'peanut_allergy_user'
    })
    .expect(200);

  // Peanut Butter must be excluded
  const hasPeanut = res.body.ingredients.some((i) =>
    i.toLowerCase().includes('peanut')
  );
  assert.equal(hasPeanut, false);
  assert.equal(res.body.ingredients.includes('Jelly'), true);
});

test('AI Recipe: 100% allergen pantry gracefully substitutes safe ingredients', async () => {
  const res = await request(app)
    .post('/ai/recipe')
    .send({
      items: ['Peanuts', 'Peanut Butter'],
      allergies: ['peanuts']
    })
    .expect(200);

  // Must not contain any peanuts
  const hasPeanuts = res.body.ingredients.some((i) =>
    i.toLowerCase().includes('peanut')
  );
  assert.equal(hasPeanuts, false);
  assert.equal(res.body.ingredients.length > 0, true);
  assert.equal(res.body.title.includes('Allergy-Safe'), true);
});

test('AI Recipe: GET /pantry/ai-recipe respects user allergy preferences', async () => {
  // Add pantry items
  await request(app)
    .post('/pantry/items')
    .send({ name: 'Whole Milk', expiresOn: '2099-01-01', isShared: true })
    .expect(201);

  await request(app)
    .post('/pantry/items')
    .send({ name: 'Rolled Oats', expiresOn: '2099-01-01', isShared: true })
    .expect(201);

  // Set user allergy for dairy
  await request(app)
    .post('/user/allergies')
    .send({ username: 'dairy_free_chef', allergy: 'dairy' })
    .expect(201);

  const res = await request(app)
    .get('/pantry/ai-recipe?username=dairy_free_chef')
    .expect(200);

  assert.equal(res.body.title.includes('Allergy-Safe'), true);
  const hasMilk = res.body.ingredients.some((i) =>
    i.toLowerCase().includes('milk') || i.toLowerCase().includes('dairy')
  );
  assert.equal(hasMilk, false);
  assert.equal(res.body.ingredients.includes('Rolled Oats'), true);
});

// ---------------------------------------------------------------------------
// 5. Storage Persistence Across Restarts
// ---------------------------------------------------------------------------
test('SqliteStorage & PantryStore: allergies persist across storage restart', () => {
  cleanupTestDb();

  // Phase 1: Initialize first storage instance and write allergies
  const storage1 = new SqliteStorage(TEST_ALLERGY_DB_PATH);
  storage1.saveUserAllergy('student_persist', 'gluten');
  storage1.saveUserAllergy('student_persist', 'peanuts');

  const loadedState1 = storage1.loadState();
  assert.deepEqual(loadedState1.userAllergies.student_persist, ['gluten', 'peanuts']);
  storage1.close();

  // Phase 2: Open second storage instance (simulating restart)
  const storage2 = new SqliteStorage(TEST_ALLERGY_DB_PATH);
  const retrievedAllergies = storage2.getUserAllergies('student_persist');
  assert.deepEqual(retrievedAllergies, ['gluten', 'peanuts']);

  // Delete an allergy and confirm update persists
  storage2.deleteUserAllergy('student_persist', 'gluten');
  assert.deepEqual(storage2.getUserAllergies('student_persist'), ['peanuts']);
  storage2.close();

  // Phase 3: Open with PantryStore and confirm persistence
  const storeInstance = new PantryStore({ dbPath: TEST_ALLERGY_DB_PATH });
  assert.deepEqual(storeInstance.getUserAllergies('student_persist'), ['peanuts']);

  storeInstance.addUserAllergy('student_persist', 'tree nuts');
  assert.equal(storeInstance.getUserAllergies('student_persist').includes('tree nuts'), true);

  if (storeInstance.storage) {
    storeInstance.storage.close();
  }
  cleanupTestDb();
});

// ---------------------------------------------------------------------------
// 6. Regression Tests: Specific Food Varieties & Instruction Sanitization
// ---------------------------------------------------------------------------
test('Regression: Specific cheese names (Cheddar, Mozzarella, Parmesan) excluded by dairy and cheese allergies', async () => {
  // Test POST /ai/recipe with dairy allergy and specific cheeses
  const resDairy = await request(app)
    .post('/ai/recipe')
    .send({
      items: ['Cheddar', 'Mozzarella', 'Rice'],
      allergies: ['dairy']
    })
    .expect(200);

  assert.equal(resDairy.body.title.includes('Allergy-Safe'), true);
  assert.equal(resDairy.body.ingredients.includes('Rice'), true);
  assert.equal(resDairy.body.ingredients.includes('Cheddar'), false);
  assert.equal(resDairy.body.ingredients.includes('Mozzarella'), false);

  // Test with cheese allergy
  const resCheese = await request(app)
    .post('/ai/recipe')
    .send({
      items: ['Parmesan', 'Swiss', 'Provolone', 'Oats'],
      allergies: ['cheese']
    })
    .expect(200);

  assert.equal(resCheese.body.title.includes('Allergy-Safe'), true);
  assert.equal(resCheese.body.ingredients.includes('Oats'), true);
  assert.equal(resCheese.body.ingredients.some((i) => ['parmesan', 'swiss', 'provolone'].includes(i.toLowerCase())), false);

  // Synchronous unit call via aiRecipeGen
  const syncRes = aiRecipeGen.generate(['Cheddar', 'Rice'], { allergies: ['dairy'] });
  assert.deepEqual(syncRes.ingredients, ['Rice']);
  assert.equal(syncRes.title.includes('Allergy-Safe'), true);
});

test('Regression: 100% cheddar pantry gracefully substitutes safe ingredients', async () => {
  // REST endpoint check
  const res = await request(app)
    .post('/ai/recipe')
    .send({
      items: ['Cheddar'],
      allergies: ['dairy']
    })
    .expect(200);

  assert.equal(res.body.title.includes('Allergy-Safe'), true);
  assert.equal(res.body.ingredients.includes('Cheddar'), false);
  assert.equal(res.body.ingredients.length > 0, true);
  // Verify instructions do not mention cheddar
  const leakedInInstructions = res.body.instructions.some((step) =>
    step.toLowerCase().includes('cheddar') || step.toLowerCase().includes('dairy')
  );
  assert.equal(leakedInInstructions, false);

  // Direct generator check
  const direct = aiRecipeGen.generate(['cheddar'], { allergies: ['dairy'] });
  assert.equal(direct.ingredients.includes('cheddar'), false);
  assert.deepEqual(direct.ingredients, ['rice', 'vegetables']);
  assert.equal(direct.title.includes('Allergy-Safe'), true);
});

test('Regression: Generated recipe instructions do not leak allergens (step sanitization & safe fallback)', async () => {
  // Scenario A: Partial instruction leakage filtered out
  const clientPartial = {
    generate: async () => ({
      title: 'Garden Rice Bowl',
      ingredients: ['Rice', 'Carrots'],
      instructions: [
        'Rinse rice and carrots thoroughly.',
        'Cook rice in boiling water until tender.',
        'Stir in whole milk and melted cheddar cheese until creamy.',
        'Top with freshly chopped herbs and serve.'
      ]
    })
  };

  const genPartial = new AIRecipeGen({ client: clientPartial, stub: false });
  const resPartial = await genPartial.generateAsync(['Rice', 'Carrots'], { allergies: ['dairy'] });

  assert.equal(resPartial.instructions.length, 3);
  assert.equal(resPartial.instructions.some((s) => s.toLowerCase().includes('milk') || s.toLowerCase().includes('cheddar')), false);
  assert.equal(resPartial.instructions[0], 'Rinse rice and carrots thoroughly.');
  assert.equal(resPartial.instructions[1], 'Cook rice in boiling water until tender.');
  assert.equal(resPartial.instructions[2], 'Top with freshly chopped herbs and serve.');

  // Scenario B: All steps contain allergens -> safe fallback triggered
  const clientAllAllergens = {
    generate: async () => ({
      title: 'Cheese Delight',
      ingredients: ['Rice'],
      instructions: [
        'Melt butter and cheddar in saucepan.',
        'Add heavy cream and parmesan cheese.'
      ]
    })
  };

  const genAllAllergens = new AIRecipeGen({ client: clientAllAllergens, stub: false });
  const resAllAllergens = await genAllAllergens.generateAsync(['Rice'], { allergies: ['dairy'] });

  assert.equal(resAllAllergens.instructions.length > 0, true);
  assert.equal(resAllAllergens.instructions[0].includes('sanitized to avoid cross-contamination'), true);
  assert.equal(resAllAllergens.instructions.some((s) => s.toLowerCase().includes('butter') || s.toLowerCase().includes('cheddar') || s.toLowerCase().includes('cream')), false);
});

test('Regression: Expanded allergen varieties for gluten, shellfish, tree nuts, and fish', async () => {
  // Gluten varieties
  const glutenRes = aiRecipeGen.generate(['Seitan', 'Semolina', 'Couscous', 'Ramen', 'Rice'], { allergies: ['gluten'] });
  assert.deepEqual(glutenRes.ingredients, ['Rice']);

  // Shellfish varieties
  const shellfishRes = aiRecipeGen.generate(['Scallop', 'Squid', 'Calamari', 'Rice'], { allergies: ['shellfish'] });
  assert.deepEqual(shellfishRes.ingredients, ['Rice']);

  // Tree nuts
  const nutRes = aiRecipeGen.generate(['Macadamia', 'Oats'], { allergies: ['tree nuts'] });
  assert.deepEqual(nutRes.ingredients, ['Oats']);

  // Fish varieties
  const fishRes = aiRecipeGen.generate(['Sardine', 'Mackerel', 'Potatoes'], { allergies: ['fish'] });
  assert.deepEqual(fishRes.ingredients, ['Potatoes']);
});
