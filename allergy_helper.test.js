const test = require('node:test');
const assert = require('node:assert/strict');

const AllergyHelper = require('./allergy_helper');

test('AllergyHelper: adds valid allergy strings', () => {
    const helper = new AllergyHelper();
    assert.equal(helper.add('Peanuts'), true);
});

test('AllergyHelper: rejects invalid data types', () => {
    const helper = new AllergyHelper();
    assert.equal(helper.add(true), false);
    assert.equal(helper.add(null), false);
    assert.equal(helper.add(123), false);
});

test('AllergyHelper: enforces minimum length', () => {
    const helper = new AllergyHelper();
    assert.equal(helper.add('A'), false);
    assert.equal(helper.add('Pe'), true);
});

test('AllergyHelper: rejects empty and whitespace-only strings', () => {
    const helper = new AllergyHelper();
    assert.equal(helper.add(''), false);
    assert.equal(helper.add('   '), false);
});
