const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');

const { app } = require('../src/app');

test('GUI: Root endpoint GET / serves clean modular HTML', async () => {
  const res = await request(app)
    .get('/')
    .expect('Content-Type', /html/)
    .expect(200);

  // Mandatory string assertions
  assert.equal(res.text.includes('RoomiePantry'), true, 'Must include RoomiePantry');
  assert.equal(res.text.includes('AIRecipeGen'), true, 'Must include AIRecipeGen');

  // Verify header typo fix
  assert.equal(res.text.includes('<h1>RoomiePantry</h1>'), true, 'Header typo fixed to RoomiePantry without question mark');
  assert.equal(res.text.includes('RoomiePantry?'), false, 'Should not contain RoomiePantry? with question mark');

  // Verify GUI login components
  assert.equal(res.text.includes('id="userAccountSection"'), true, 'Must include user account section');
  assert.equal(res.text.includes('id="btnOpenLoginModal"'), true, 'Must include login open button');
  assert.equal(res.text.includes('id="loginModal"'), true, 'Must include login dialog modal');
  assert.equal(res.text.includes('id="loginUsername"'), true, 'Must include login username field');
  assert.equal(res.text.includes('id="loginPassword"'), true, 'Must include login password field');

  // Verify GUI allergy settings components
  assert.equal(res.text.includes('id="allergyCard"'), true, 'Must include allergy card');
  assert.equal(res.text.includes('id="allergyChipsList"'), true, 'Must include allergy chips list');
  assert.equal(res.text.includes('id="allergyCountBadge"'), true, 'Must include allergy count badge');
  assert.equal(res.text.includes('id="recipeAllergyShield"'), true, 'Must include allergy shield status');

  // Verify ES module script tag and stylesheet links
  assert.equal(res.text.includes('<script type="module" src="js/app.js"></script>'), true, 'Must link to ES module app.js');
  assert.equal(res.text.includes('css/main.css'), true, 'Must link to main.css');
  assert.equal(res.text.includes('css/layout.css'), true, 'Must link to layout.css');
  assert.equal(res.text.includes('css/components.css'), true, 'Must link to components.css');
  assert.equal(res.text.includes('css/auth.css'), true, 'Must link to auth.css');
  assert.equal(res.text.includes('css/allergy.css'), true, 'Must link to allergy.css');
  assert.equal(res.text.includes('css/recipe.css'), true, 'Must link to recipe.css');
});

test('GUI: public/index.html file constraints (< 250 lines, no inline <style>, no inline styles)', () => {
  const htmlPath = path.join(__dirname, '../public/index.html');
  const content = fs.readFileSync(htmlPath, 'utf8');
  const lines = content.split('\n');

  assert.ok(lines.length < 250, `index.html must be < 250 lines (actual: ${lines.length})`);
  assert.equal(/<style\b[^>]*>/i.test(content), false, 'Must not have inline <style> tags');
  assert.equal(/\bstyle\s*=\s*"/i.test(content), false, 'Must not have inline style="..." attributes');
});

test('GUI: Express serves all 6 modular CSS files', async () => {
  const cssFiles = [
    'main.css',
    'layout.css',
    'components.css',
    'auth.css',
    'allergy.css',
    'recipe.css'
  ];

  for (const file of cssFiles) {
    const res = await request(app)
      .get(`/css/${file}`)
      .expect('Content-Type', /css/)
      .expect(200);

    assert.ok(res.text.length > 50, `CSS file ${file} should have content`);
  }
});

test('GUI: Express serves all 10 native ES JS modules', async () => {
  const jsFiles = [
    'api.js',
    'state.js',
    'toast.js',
    'auth.js',
    'allergy.js',
    'pantry.js',
    'alerts.js',
    'grocery.js',
    'recipe.js',
    'app.js'
  ];

  for (const file of jsFiles) {
    const res = await request(app)
      .get(`/js/${file}`)
      .expect('Content-Type', /javascript/)
      .expect(200);

    assert.ok(res.text.length > 50, `JS file ${file} should have content`);
  }
});

test('GUI: Authentication endpoint integration (/login)', async () => {
  // Successful login
  const resSuccess = await request(app)
    .post('/login')
    .send({ username: 'student1', password: 'password123' })
    .expect(200);

  assert.equal(resSuccess.body.message, 'Login successful');
  assert.equal(resSuccess.body.user.username, 'student1');

  // Invalid credentials
  const resBadAuth = await request(app)
    .post('/login')
    .send({ username: 'student1', password: 'incorrect' })
    .expect(401);

  assert.equal(resBadAuth.body.error, 'Invalid username or password');

  // Missing fields
  const resMissing = await request(app)
    .post('/login')
    .send({ username: 'student1' })
    .expect(400);

  assert.equal(resMissing.body.error, 'username and password are required');
});

test('GUI: Dietary allergy endpoints integration (/user/allergies)', async () => {
  const testUser = 'gui_allergy_test_user';

  // Initially empty
  const initialRes = await request(app)
    .get(`/user/allergies?username=${testUser}`)
    .expect(200);

  assert.equal(initialRes.body.username, testUser);
  assert.deepEqual(initialRes.body.allergies, []);

  // Add allergy
  const addRes = await request(app)
    .post('/user/allergies')
    .send({ username: testUser, allergy: 'Peanuts' })
    .expect(201);

  assert.equal(addRes.body.success, true);
  assert.equal(addRes.body.allergy, 'peanuts');

  // Verify added
  const verifyRes = await request(app)
    .get(`/user/allergies?username=${testUser}`)
    .expect(200);

  assert.ok(verifyRes.body.allergies.includes('peanuts'));

  // Delete allergy
  const delRes = await request(app)
    .delete(`/user/allergies/peanuts?username=${testUser}`)
    .expect(200);

  assert.equal(delRes.body.success, true);

  // Verify deleted
  const verifyAfterDel = await request(app)
    .get(`/user/allergies?username=${testUser}`)
    .expect(200);

  assert.equal(verifyAfterDel.body.allergies.includes('peanuts'), false);
});

test('GUI: AI Recipe Generation incorporates allergy exclusions', async () => {
  const res = await request(app)
    .post('/ai/recipe')
    .send({
      items: ['cheese', 'bread', 'butter'],
      allergies: ['dairy']
    })
    .expect(200);

  assert.ok(res.body.title, 'Should have a title');
  assert.ok(Array.isArray(res.body.ingredients), 'Should have ingredients array');
  assert.ok(Array.isArray(res.body.instructions), 'Should have instructions array');

  // None of the returned ingredients should be dairy
  const ingredientsStr = res.body.ingredients.join(' ').toLowerCase();
  assert.equal(ingredientsStr.includes('cheese'), false, 'Recipe must not contain cheese');
  assert.equal(ingredientsStr.includes('butter'), false, 'Recipe must not contain butter');
});
