const test = require('node:test');
const assert = require('node:assert/strict');

const { PantryStore } = require('../src/store');

// 1. PASS CASE (Happy path / normal expected behavior)
test('Pass case: item with sufficient quantity is in stock', () => {
  const store = new PantryStore();
  store.addPantryItem({ name: 'Rice', quantity: 5 });

  const result = store.getPantryStock();

  assert.equal(result[0].status, 'in stock');
});

// 2. FAIL CASE (Negative test / item fails to have stock)
test('Fail case: item with 0 quantity is out of stock and not in stock', () => {
  const store = new PantryStore();
  store.addPantryItem({ name: 'Milk', quantity: 0 });

  const result = store.getPantryStock();

  assert.equal(result[0].status, 'out of stock');
  assert.notEqual(result[0].status, 'in stock');
});

// 3. BOUNDARY CASE (Threshold value right at the low-stock limit)
test('Boundary case: quantity of 2 is the upper boundary for low stock', () => {
  const store = new PantryStore();
  store.addPantryItem({ name: 'Bread', quantity: 2 });

  const result = store.getPantryStock();

  assert.equal(result[0].status, 'low stock');
});

// 4. EDGE CASE (Extreme/empty collection corner case)
test('Edge case: empty pantry returns empty list', () => {
  const store = new PantryStore();

  const result = store.getPantryStock();

  assert.deepEqual(result, []);
});
