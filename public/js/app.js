/**
 * RoomiePantry Application Bootstrap
 */
import { systemApi } from './api.js';
import { getCurrentUser } from './state.js';
import { initAuth } from './auth.js';
import { initAllergy, syncAllergiesFromBackend } from './allergy.js';
import { initPantry, fetchPantry } from './pantry.js';
import { initAlerts, fetchAlerts, fetchCookNow } from './alerts.js';
import { initGrocery, fetchGrocery } from './grocery.js';
import { initRecipe, cookSingleItem, cookSelectedItems } from './recipe.js';

export async function fetchStorageInfo() {
  try {
    const data = await systemApi.getStorageInfo();
    const badge = document.getElementById('storageBadge');
    if (!badge) return;

    if (data.type === 'firebase') {
      badge.textContent = '🔥 Firebase Firestore';
      badge.parentElement.className = 'status-badge status-badge-firebase';
    } else if (data.type === 'sqlite') {
      badge.textContent = '💾 SQLite Persistent';
      badge.parentElement.className = 'status-badge status-badge-sqlite';
    } else {
      badge.textContent = '⚡ Memory';
      badge.parentElement.className = 'status-badge';
    }
  } catch (_e) {
    // Non-critical status indicator
  }
}

export async function refreshAll() {
  const syncStatus = document.getElementById('syncStatus');
  if (syncStatus) syncStatus.textContent = 'Syncing...';

  try {
    await Promise.allSettled([
      fetchPantry(),
      fetchAlerts(),
      fetchCookNow(),
      fetchGrocery(),
      fetchStorageInfo()
    ]);

    const user = getCurrentUser();
    if (user && user.username) {
      await syncAllergiesFromBackend(user.username);
    }

    if (syncStatus) syncStatus.textContent = 'Server Live';
  } catch (err) {
    console.error('Error during refreshAll:', err);
    if (syncStatus) syncStatus.textContent = 'Sync Error';
  }
}

export function initApp() {
  // Initialize Auth
  initAuth({
    onLoginSuccess: (user) => {
      syncAllergiesFromBackend(user.username);
      refreshAll();
    },
    onLogout: () => {
      refreshAll();
    }
  });

  // Initialize Allergy Settings
  initAllergy();

  // Initialize Pantry
  initPantry({
    onCookSingle: (name) => cookSingleItem(name),
    onPantryUpdated: () => {
      fetchAlerts();
      fetchCookNow();
    }
  });

  // Initialize Alerts & Cook-Now
  initAlerts({
    onCookSingle: (name) => cookSingleItem(name),
    onCookSelected: () => cookSelectedItems()
  });

  // Initialize Grocery
  initGrocery();

  // Initialize Recipe
  initRecipe();

  // Wire Refresh button
  const btnRefresh = document.getElementById('btnRefresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => refreshAll());
  }

  // Initial load
  refreshAll();
}

// Global hook for debugging and backwards compatibility
window.RoomiePantry = {
  refreshAll,
  cookSingleItem,
  cookSelectedItems
};
window.refreshAll = refreshAll;

// Auto-bootstrap on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
