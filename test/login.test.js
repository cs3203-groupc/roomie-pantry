const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { app } = require('../src/app');
const { loginUser } = require('../src/auth');

test('valid username and password', () => {
  assert.equal(loginUser('student1', 'password123'), true);
});

test('invalid password', () => {
  assert.equal(loginUser('student1', 'wrongpass'), false);
});

test('invalid username', () => {
  assert.equal(loginUser('unknown', 'password123'), false);
});

test('empty username', () => {
  assert.equal(loginUser('', 'password123'), false);
});

test('empty password', () => {
  assert.equal(loginUser('student1', ''), false);
});

test('non-string credentials', () => {
  assert.equal(loginUser(123, 'password123'), false);
  assert.equal(loginUser('student1', null), false);
  assert.equal(loginUser(undefined, undefined), false);
});

test('does not authenticate built-in Object properties', () => {
  assert.equal(loginUser('toString', 'function'), false);
  assert.equal(loginUser('__proto__', 'object'), false);
});

test('POST /login succeeds with valid credentials', async () => {
  const res = await request(app)
    .post('/login')
    .send({ username: 'student1', password: 'password123' })
    .expect(200);

  assert.equal(res.body.message, 'Login successful');
  assert.equal(res.body.user.username, 'student1');
});

test('POST /login rejects missing username or password with 400', async () => {
  const res1 = await request(app)
    .post('/login')
    .send({ username: 'student1' })
    .expect(400);
  assert.equal(res1.body.error, 'username and password are required');

  const res2 = await request(app)
    .post('/login')
    .send({ password: 'password123' })
    .expect(400);
  assert.equal(res2.body.error, 'username and password are required');
});

test('POST /login rejects invalid credentials with 401', async () => {
  const res1 = await request(app)
    .post('/login')
    .send({ username: 'student1', password: 'wrongpassword' })
    .expect(401);
  assert.equal(res1.body.error, 'Invalid username or password');

  const res2 = await request(app)
    .post('/login')
    .send({ username: 'unknownuser', password: 'password123' })
    .expect(401);
  assert.equal(res2.body.error, 'Invalid username or password');
});
