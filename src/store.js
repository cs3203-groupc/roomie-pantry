const DAY_MS = 24 * 60 * 60 * 1000;

class PantryStore {
  constructor() {
    this.nextItemId = 1;
    this.nextGroceryId = 1;
    this.version = 0;

    this.items = [];
    this.groceryList = [];
    this.notifications = [];
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
    this.bumpVersion();
    this.notifications.push({
      id: `pantry-${item.id}-${Date.now()}`,
      type: 'pantry.item.created',
      message: `${item.name} was added to ${item.isShared ? 'the shared' : `${item.owner}'s private`} pantry.`,
      createdAt: new Date().toISOString()
    });

    return item;
  }

  listPantryItems() {
    return this.items;
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
    this.bumpVersion();

    this.notifications.push({
      id: `grocery-${item.id}-${Date.now()}`,
      type: 'grocery.item.created',
      message: `${item.name} was added to the shared grocery list.`,
      createdAt: new Date().toISOString()
    });

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
    this.bumpVersion();

    return item;
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
}

module.exports = {
  PantryStore
};
