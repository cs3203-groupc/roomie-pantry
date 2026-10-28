const test = require('node:test');
const assert = require('node:assert/strict');

const { PantryStore } = require('../src/store');

test('item with 0 quantity is out of stock', () => {
  const store = new PantryStore();
  store.addPantryItem({ name: 'Milk', quantity: 0 });

  const result = store.getPantryStock();

  assert.equal(result[0].status, 'out of stock');
});

test('item with 1 quantity is low stock', () => {
  const store = new PantryStore();
  store.addPantryItem({ name: 'Eggs', quantity: 1 });

  const result = store.getPantryStock();

  assert.equal(result[0].status, 'low stock');
});

test('item with 2 quantity is low stock', () => {
  const store = new PantryStore();
  store.addPantryItem({ name: 'Bread', quantity: 2 });

  const result = store.getPantryStock();

  assert.equal(result[0].status, 'low stock');
});

test('item with 5 quantity is in stock', () => {
  const store = new PantryStore();
  store.addPantryItem({ name: 'Rice', quantity: 5 });

  const result = store.getPantryStock();

  assert.equal(result[0].status, 'in stock');
});

test('empty pantry returns empty list', () => {
  const store = new PantryStore();

  const result = store.getPantryStock();

  assert.deepEqual(result, []);
});
