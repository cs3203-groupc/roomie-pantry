const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { PantryStore } = require('../src/store');
const { SqliteStorage, FirebaseStorage, createStorage } = require('../src/db');

const TEST_DB_PATH = path.resolve(__dirname, '../data/test_persistence.sqlite');

function cleanupTestDb() {
  if (fs.existsSync(TEST_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch (_e) {}
  }
}

test('SqliteStorage: initializes schema and performs CRUD operations', () => {
  cleanupTestDb();
  const storage = new SqliteStorage(TEST_DB_PATH);

  // Initial state should be empty
  const state0 = storage.loadState();
  assert.equal(state0.items.length, 0);
  assert.equal(state0.groceryList.length, 0);
  assert.equal(state0.version, 0);

  // Save pantry item
  const item1 = {
    id: 1,
    name: 'Sourdough Bread',
    owner: 'Alex',
    quantity: 2,
    expiresOn: '2026-11-01',
    isShared: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  storage.savePantryItem(item1);

  // Save grocery item
  const grocery1 = {
    id: 1,
    name: 'Oat Milk',
    requestedBy: 'Jamie',
    quantity: 1,
    checked: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  storage.saveGroceryItem(grocery1);

  // Save version
  storage.saveVersion(42);

  // Verify loaded state
  const state1 = storage.loadState();
  assert.equal(state1.items.length, 1);
  assert.equal(state1.items[0].name, 'Sourdough Bread');
  assert.equal(state1.items[0].quantity, 2);
  assert.equal(state1.groceryList.length, 1);
  assert.equal(state1.groceryList[0].name, 'Oat Milk');
  assert.equal(state1.version, 42);

  // Update grocery item
  storage.updateGroceryItem(1, true, new Date().toISOString());
  const state2 = storage.loadState();
  assert.equal(state2.groceryList[0].checked, true);

  // Delete pantry item
  storage.deletePantryItem(1);
  const state3 = storage.loadState();
  assert.equal(state3.items.length, 0);

  storage.close();
  cleanupTestDb();
});

test('PantryStore persistence: survives simulated server shutdown and restart', () => {
  cleanupTestDb();

  // --- Phase 1: Server running, housemates add items ---
  const serverInstance1Store = new PantryStore({ dbPath: TEST_DB_PATH });

  serverInstance1Store.addPantryItem({
    name: 'Cheddar Cheese',
    owner: 'Taylor',
    quantity: 1,
    expiresOn: '2026-10-30',
    isShared: false
  });
  serverInstance1Store.addPantryItem({
    name: 'Brown Rice',
    isShared: true,
    expiresOn: '2027-01-01'
  });

  serverInstance1Store.addGroceryItem({
    name: 'Avocados',
    requestedBy: 'Taylor',
    quantity: 3
  });

  assert.equal(serverInstance1Store.listPantryItems().length, 2);
  assert.equal(serverInstance1Store.listGroceryItems().length, 1);
  assert.ok(serverInstance1Store.version >= 3);

  // Simulate server shutdown: close connections and drop instance
  if (serverInstance1Store.storage) {
    serverInstance1Store.storage.close();
  }

  // --- Phase 2: Server reboot / restart ---
  const serverInstance2Store = new PantryStore({ dbPath: TEST_DB_PATH });

  // Verify all state was restored from persistent storage
  const restoredItems = serverInstance2Store.listPantryItems();
  assert.equal(restoredItems.length, 2);
  assert.equal(restoredItems[0].name, 'Cheddar Cheese');
  assert.equal(restoredItems[0].owner, 'Taylor');
  assert.equal(restoredItems[0].isShared, false);
  assert.equal(restoredItems[1].name, 'Brown Rice');
  assert.equal(restoredItems[1].isShared, true);

  const restoredGroceries = serverInstance2Store.listGroceryItems();
  assert.equal(restoredGroceries.length, 1);
  assert.equal(restoredGroceries[0].name, 'Avocados');
  assert.equal(restoredGroceries[0].quantity, 3);
  assert.equal(restoredGroceries[0].checked, false);

  // Verify ID sequence continuity after reboot
  const newItem = serverInstance2Store.addPantryItem({
    name: 'Apples',
    expiresOn: '2026-10-25'
  });
  assert.equal(newItem.id, 3); // nextId resumed properly

  if (serverInstance2Store.storage) {
    serverInstance2Store.storage.close();
  }
  cleanupTestDb();
});

test('FirebaseStorage: gracefully falls back to SQLite when credentials are not configured', () => {
  cleanupTestDb();
  // No Firebase credentials in environment -> should fall back safely to local sqlite
  const fbStorage = new FirebaseStorage({ dbPath: TEST_DB_PATH });
  assert.equal(fbStorage.isAvailable(), false);

  const store = new PantryStore({ storage: fbStorage });
  store.addPantryItem({ name: 'Tomatoes', expiresOn: '2026-10-28' });
  assert.equal(store.listPantryItems().length, 1);
  assert.equal(store.listPantryItems()[0].name, 'Tomatoes');

  fbStorage.close();
  cleanupTestDb();
});

test('createStorage factory helper selects correct backend', () => {
  cleanupTestDb();
  const sqlite = createStorage({ dbPath: TEST_DB_PATH });
  assert.equal(sqlite.type, 'sqlite');
  sqlite.close();
  cleanupTestDb();
});
