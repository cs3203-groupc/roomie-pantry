'use strict';

process.env.NODE_ENV = 'test';

const { app, store } = require('../../src/app');

/**
 * Generates an ISO date string (YYYY-MM-DD) offset by a given number of days from today.
 * @param {number} daysOffset - Days to add (positive) or subtract (negative).
 * @returns {string} - YYYY-MM-DD
 */
function getOffsetDateString(daysOffset) {
  const target = new Date();
  target.setUTCDate(target.getUTCDate() + daysOffset);
  const year = target.getUTCFullYear();
  const month = String(target.getUTCMonth() + 1).padStart(2, '0');
  const day = String(target.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Resets the in-memory PantryStore and any underlying SQLite test database tables.
 */
function resetStore() {
  if (typeof store.clear === 'function') {
    store.clear();
  }

  // Clear allergies if tracked on store instance
  if (store.userAllergies) {
    if (typeof store.userAllergies.clear === 'function') {
      store.userAllergies.clear();
    } else if (typeof store.userAllergies === 'object') {
      for (const key of Object.keys(store.userAllergies)) {
        delete store.userAllergies[key];
      }
    }
  }

  // Clear sqlite user_allergies table if storage is attached
  if (store.storage && store.storage.db && typeof store.storage.db.exec === 'function') {
    try {
      store.storage.db.exec('DELETE FROM user_allergies;');
    } catch (_err) {
      // Table may not exist in early milestone phases
    }
  }

  // Reset next ID counters
  store.nextItemId = 1;
  store.nextGroceryId = 1;
  store.version = 0;
  store.items = [];
  store.groceryList = [];
  store.notifications = [];

  return store;
}

module.exports = {
  app,
  store,
  getOffsetDateString,
  resetStore
};
