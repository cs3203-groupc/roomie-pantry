const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

class SqliteStorage {
  constructor(dbPath) {
    this.type = 'sqlite';
    this.dbPath = dbPath || path.resolve(__dirname, '../data/pantry.sqlite');

    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pantry_items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        owner TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        expiresOn TEXT NOT NULL,
        isShared INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS grocery_items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        requestedBy TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        checked INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS store_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  loadState() {
    const pantryRows = this.db.prepare('SELECT * FROM pantry_items ORDER BY id ASC').all();
    const items = pantryRows.map((row) => ({
      id: row.id,
      name: row.name,
      owner: row.owner || null,
      quantity: Number(row.quantity),
      expiresOn: row.expiresOn,
      isShared: Boolean(row.isShared),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));

    const groceryRows = this.db.prepare('SELECT * FROM grocery_items ORDER BY id ASC').all();
    const groceryList = groceryRows.map((row) => ({
      id: row.id,
      name: row.name,
      requestedBy: row.requestedBy || null,
      quantity: Number(row.quantity),
      checked: Boolean(row.checked),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }));

    const notifRows = this.db.prepare('SELECT * FROM notifications ORDER BY createdAt ASC').all();
    const notifications = notifRows.map((row) => ({
      id: row.id,
      type: row.type,
      message: row.message,
      createdAt: row.createdAt
    }));

    const versionRow = this.db.prepare("SELECT value FROM store_metadata WHERE key = 'version'").get();
    const version = versionRow ? Number(versionRow.value) || 0 : 0;

    const maxPantryId = items.reduce((max, i) => Math.max(max, i.id), 0);
    const maxGroceryId = groceryList.reduce((max, g) => Math.max(max, g.id), 0);

    return {
      items,
      groceryList,
      notifications,
      version,
      nextItemId: maxPantryId + 1,
      nextGroceryId: maxGroceryId + 1
    };
  }

  savePantryItem(item) {
    const stmt = this.db.prepare(`
      INSERT INTO pantry_items (id, name, owner, quantity, expiresOn, isShared, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        owner = excluded.owner,
        quantity = excluded.quantity,
        expiresOn = excluded.expiresOn,
        isShared = excluded.isShared,
        updatedAt = excluded.updatedAt
    `);
    stmt.run(
      item.id,
      item.name,
      item.owner,
      item.quantity,
      item.expiresOn,
      item.isShared ? 1 : 0,
      item.createdAt,
      item.updatedAt
    );
  }

  deletePantryItem(id) {
    this.db.prepare('DELETE FROM pantry_items WHERE id = ?').run(id);
  }

  saveGroceryItem(item) {
    const stmt = this.db.prepare(`
      INSERT INTO grocery_items (id, name, requestedBy, quantity, checked, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        requestedBy = excluded.requestedBy,
        quantity = excluded.quantity,
        checked = excluded.checked,
        updatedAt = excluded.updatedAt
    `);
    stmt.run(
      item.id,
      item.name,
      item.requestedBy,
      item.quantity,
      item.checked ? 1 : 0,
      item.createdAt,
      item.updatedAt
    );
  }

  updateGroceryItem(id, checked, updatedAt) {
    const stmt = this.db.prepare(`
      UPDATE grocery_items
      SET checked = ?, updatedAt = ?
      WHERE id = ?
    `);
    stmt.run(checked ? 1 : 0, updatedAt, id);
  }

  deleteGroceryItem(id) {
    this.db.prepare('DELETE FROM grocery_items WHERE id = ?').run(id);
  }

  saveNotification(notif) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO notifications (id, type, message, createdAt)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(notif.id, notif.type, notif.message, notif.createdAt);
  }

  saveVersion(version) {
    const stmt = this.db.prepare(`
      INSERT INTO store_metadata (key, value)
      VALUES ('version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(String(version));
  }

  close() {
    try {
      this.db.close();
    } catch (_e) {}
  }
}

class FirebaseStorage {
  constructor(options = {}) {
    this.type = 'firebase';
    this.firestore = null;
    this.fallbackStorage = new SqliteStorage(options.dbPath || path.resolve(__dirname, '../data/pantry.sqlite'));
    this.initFirebase(options);
  }

  initFirebase(options = {}) {
    try {
      const admin = require('firebase-admin');
      if (admin.apps && admin.apps.length > 0) {
        this.firestore = admin.firestore();
        return;
      }

      const serviceAccountPath = options.serviceAccountPath || process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const serviceAccountJson = options.serviceAccountJson || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      const projectId = options.projectId || process.env.FIREBASE_PROJECT_ID;

      let credential = null;
      if (serviceAccountJson) {
        const parsed = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
        credential = admin.credential.cert(parsed);
      } else if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
        credential = admin.credential.cert(require(path.resolve(serviceAccountPath)));
      } else if (projectId) {
        credential = admin.credential.applicationDefault();
      }

      if (credential || projectId) {
        const app = admin.initializeApp({
          credential: credential || undefined,
          projectId: projectId || undefined
        });
        this.firestore = app.firestore();
      }
    } catch (err) {
      // Firebase not configured or credentials invalid; fall back to local sqlite
      this.firestore = null;
    }
  }

  isAvailable() {
    return Boolean(this.firestore);
  }

  async loadState() {
    if (!this.isAvailable()) {
      return this.fallbackStorage.loadState();
    }

    try {
      const [pantrySnap, grocerySnap, notifSnap, metaSnap] = await Promise.all([
        this.firestore.collection('pantry_items').orderBy('id', 'asc').get(),
        this.firestore.collection('grocery_items').orderBy('id', 'asc').get(),
        this.firestore.collection('notifications').orderBy('createdAt', 'asc').get(),
        this.firestore.collection('store_metadata').doc('version').get()
      ]);

      const items = pantrySnap.docs.map((doc) => doc.data());
      const groceryList = grocerySnap.docs.map((doc) => doc.data());
      const notifications = notifSnap.docs.map((doc) => doc.data());
      const version = metaSnap.exists ? Number(metaSnap.data()?.value || 0) : 0;

      const maxPantryId = items.reduce((max, i) => Math.max(max, i.id), 0);
      const maxGroceryId = groceryList.reduce((max, g) => Math.max(max, g.id), 0);

      return {
        items,
        groceryList,
        notifications,
        version,
        nextItemId: maxPantryId + 1,
        nextGroceryId: maxGroceryId + 1
      };
    } catch (_e) {
      return this.fallbackStorage.loadState();
    }
  }

  savePantryItem(item) {
    this.fallbackStorage.savePantryItem(item);
    if (this.isAvailable()) {
      this.firestore.collection('pantry_items').doc(String(item.id)).set(item).catch(() => {});
    }
  }

  deletePantryItem(id) {
    this.fallbackStorage.deletePantryItem(id);
    if (this.isAvailable()) {
      this.firestore.collection('pantry_items').doc(String(id)).delete().catch(() => {});
    }
  }

  saveGroceryItem(item) {
    this.fallbackStorage.saveGroceryItem(item);
    if (this.isAvailable()) {
      this.firestore.collection('grocery_items').doc(String(item.id)).set(item).catch(() => {});
    }
  }

  updateGroceryItem(id, checked, updatedAt) {
    this.fallbackStorage.updateGroceryItem(id, checked, updatedAt);
    if (this.isAvailable()) {
      this.firestore.collection('grocery_items').doc(String(id)).set({ checked, updatedAt }, { merge: true }).catch(() => {});
    }
  }

  deleteGroceryItem(id) {
    this.fallbackStorage.deleteGroceryItem(id);
    if (this.isAvailable()) {
      this.firestore.collection('grocery_items').doc(String(id)).delete().catch(() => {});
    }
  }

  saveNotification(notif) {
    this.fallbackStorage.saveNotification(notif);
    if (this.isAvailable()) {
      this.firestore.collection('notifications').doc(String(notif.id)).set(notif).catch(() => {});
    }
  }

  saveVersion(version) {
    this.fallbackStorage.saveVersion(version);
    if (this.isAvailable()) {
      this.firestore.collection('store_metadata').doc('version').set({ value: version }).catch(() => {});
    }
  }

  close() {
    this.fallbackStorage.close();
  }
}

function createStorage(options = {}) {
  const preferFirebase = options.storageType === 'firebase' ||
    process.env.DATABASE_TYPE === 'firebase' ||
    Boolean(process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

  if (preferFirebase) {
    const fb = new FirebaseStorage(options);
    if (fb.isAvailable()) {
      return fb;
    }
  }

  return new SqliteStorage(options.dbPath);
}

module.exports = {
  SqliteStorage,
  FirebaseStorage,
  createStorage
};
