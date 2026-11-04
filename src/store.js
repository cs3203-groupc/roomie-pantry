const { aiRecipeGen } = require('./aiRecipeGen');
const { createStorage } = require('./db');

const DAY_MS = 24 * 60 * 60 * 1000;

class PantryStore {
  constructor(options = {}) {
    this.options = options;
    this.storage = null;
    this.nextItemId = 1;
    this.nextGroceryId = 1;
    this.version = 0;

    this.items = [];
    this.groceryList = [];
    this.notifications = [];

    if (options.persist || options.dbPath || options.storageType) {
      this.initPersistence(options);
    }
  }

  initPersistence(options = {}) {
    this.storage = options.storage || createStorage({
      dbPath: options.dbPath || this.options.dbPath,
      storageType: options.storageType || this.options.storageType
    });

    const saved = this.storage.loadState();
    if (saved) {
      this.items = saved.items || [];
      this.groceryList = saved.groceryList || [];
      this.notifications = saved.notifications || [];
      this.version = saved.version || 0;
      this.nextItemId = saved.nextItemId || 1;
      this.nextGroceryId = saved.nextGroceryId || 1;
    }
  }

  addPantryItem({ name, owner = null, quantity = 1, expiresOn, isShared = true }) {
    const item = {
      id: this.nextItemId++,
      name,
      owner,
      quantity,
      expiresOn,
      isShared: Boolean(isShared),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.items.push(item);
    if (this.storage) {
      this.storage.savePantryItem(item);
    }
    this.bumpVersion();

    const notif = {
      id: `pantry-${item.id}-${Date.now()}`,
      type: 'pantry.item.created',
      message: `${item.name} was added to ${item.isShared ? 'the shared' : `${item.owner}'s private`} pantry.`,
      createdAt: new Date().toISOString()
    };
    this.notifications.push(notif);
    if (this.storage) {
      this.storage.saveNotification(notif);
    }

    return item;
  }

  listPantryItems() {
    return this.items;
  }

  getPantryStock() {
    return this.items.map((item) => {
      let status = 'in stock';
      if (item.quantity <= 0) {
        status = 'out of stock';
      } else if (item.quantity <= 2) {
        status = 'low stock';
      }

      return {
        ...item,
        status
      };
    });
  }

  deletePantryItem(itemId) {
    const idx = this.items.findIndex((item) => item.id === itemId);
    if (idx === -1) return false;
    this.items.splice(idx, 1);
    if (this.storage) {
      this.storage.deletePantryItem(itemId);
    }
    this.bumpVersion();
    return true;
  }

  addGroceryItem({ name, requestedBy = null, quantity = 1 }) {
    const item = {
      id: this.nextGroceryId++,
      name,
      requestedBy,
      quantity,
      checked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.groceryList.push(item);
    if (this.storage) {
      this.storage.saveGroceryItem(item);
    }
    this.bumpVersion();

    const notif = {
      id: `grocery-${item.id}-${Date.now()}`,
      type: 'grocery.item.created',
      message: `${item.name} was added to the shared grocery list.`,
      createdAt: new Date().toISOString()
    };
    this.notifications.push(notif);
    if (this.storage) {
      this.storage.saveNotification(notif);
    }

    return item;
  }

  listGroceryItems() {
    return this.groceryList;
  }

  markGroceryItem(itemId, checked) {
    const item = this.groceryList.find((entry) => entry.id === itemId);
    if (!item) {
      return null;
    }

    item.checked = checked;
    item.updatedAt = new Date().toISOString();
    if (this.storage) {
      this.storage.updateGroceryItem(item.id, checked, item.updatedAt);
    }
    this.bumpVersion();

    return item;
  }

  deleteGroceryItem(itemId) {
    const idx = this.groceryList.findIndex((item) => item.id === itemId);
    if (idx === -1) return false;
    this.groceryList.splice(idx, 1);
    if (this.storage) {
      this.storage.deleteGroceryItem(itemId);
    }
    this.bumpVersion();
    return true;
  }

  bumpVersion() {
    this.version += 1;
    if (this.storage) {
      this.storage.saveVersion(this.version);
    }
  }

  clear() {
    this.items = [];
    this.groceryList = [];
    this.notifications = [];
    this.version = 0;
    this.nextItemId = 1;
    this.nextGroceryId = 1;
    if (this.storage && this.storage.type === 'sqlite' && this.storage.db) {
      this.storage.db.exec('DELETE FROM pantry_items; DELETE FROM grocery_items; DELETE FROM notifications; DELETE FROM store_metadata;');
    }
  }

  getExpirationAlerts(now = new Date()) {
    const alerts = this.items.map((item) => {
      const expiresAt = new Date(item.expiresOn);
      const diffDays = Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);

      let status = 'green';
      if (diffDays < 0) {
        status = 'red';
      } else if (diffDays <= 2) {
        status = 'red';
      } else if (diffDays <= 5) {
        status = 'yellow';
      }

      return {
        itemId: item.id,
        itemName: item.name,
        owner: item.owner,
        isShared: item.isShared,
        expiresOn: item.expiresOn,
        status,
        daysUntilExpiry: diffDays
      };
    });

    const summary = alerts.reduce(
      (acc, alert) => {
        acc[alert.status] += 1;
        return acc;
      },
      { green: 0, yellow: 0, red: 0 }
    );

    const pushNotifications = alerts
      .filter((alert) => alert.status !== 'green')
      .map((alert) => ({
        type: 'expiration.warning',
        itemId: alert.itemId,
        message:
          alert.status === 'red'
            ? `${alert.itemName} needs attention now.`
            : `${alert.itemName} is expiring soon.`,
        status: alert.status
      }));

    return { summary, alerts, pushNotifications };
  }

  getCookNowRecommendations(now = new Date()) {
    const byUrgency = this.items
      .map((item) => {
        const expiresAt = new Date(item.expiresOn);
        const diffDays = Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
        return { ...item, urgency: diffDays };
      })
      .sort((a, b) => a.urgency - b.urgency);

    const recommendations = byUrgency.slice(0, 3).map((item) => {
      const title = `Quick ${item.name} Bowl`;
      return {
        itemId: item.id,
        itemName: item.name,
        recipeName: title,
        ingredientsUsed: [item.name],
        servings: 1,
        cleanupLevel: 'minimal',
        reason: `Uses ${item.name}, which expires in ${item.urgency} day(s).`
      };
    });

    return { recommendations };
  }

  getSyncSnapshot() {
    return {
      version: this.version,
      pantry: this.items,
      groceryList: this.groceryList,
      notifications: this.notifications
    };
  }

  bumpVersion() {
    this.version += 1;
  }

  generateAIRecipe(customItems = null) {
    const items = customItems || this.items.map((i) => i.name);
    return aiRecipeGen.generate(items, { sync: true });
  }

  async generateAIRecipeAsync(customItems = null) {
    const items = customItems || this.items.map((i) => i.name);
    return aiRecipeGen.generateAsync(items);
  }
}

module.exports = {
  PantryStore
};
