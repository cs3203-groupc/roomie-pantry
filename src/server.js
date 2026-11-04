const path = require('path');
const { app, store } = require('./app');

// Initialize persistent storage (SQLite or Firebase)
if (!store.storage) {
  const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../data/pantry.sqlite');
  store.initPersistence({
    dbPath,
    storageType: process.env.DATABASE_TYPE
  });
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  const storageInfo = store.storage ? store.storage.type : 'memory';
  // eslint-disable-next-line no-console
  console.log(`RoomiePantry listening on port ${PORT} [Storage: ${storageInfo}]`);
});

