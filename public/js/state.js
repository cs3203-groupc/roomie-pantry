/**
 * RoomiePantry Client State Store
 */

// User state
let currentUser = null;
try {
  const savedUser = localStorage.getItem('rp_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
  }
} catch (e) {
  console.warn('Failed to parse saved user from localStorage:', e);
}

// Allergies state
let allergies = new Set();
function loadStoredAllergies(username) {
  const key = username ? `rp_allergies_${username}` : 'rp_allergies_guest';
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr);
      }
    }
  } catch (e) {
    console.warn('Failed to load allergies from localStorage:', e);
  }
  return new Set();
}

allergies = loadStoredAllergies(currentUser ? currentUser.username : null);

// Selected ingredients for recipe generation
const selectedIngredients = new Set();

// Subscribers
const userListeners = [];
const allergyListeners = [];
const selectionListeners = [];

export function subscribeUser(fn) {
  userListeners.push(fn);
  return () => {
    const idx = userListeners.indexOf(fn);
    if (idx !== -1) userListeners.splice(idx, 1);
  };
}

export function subscribeAllergies(fn) {
  allergyListeners.push(fn);
  return () => {
    const idx = allergyListeners.indexOf(fn);
    if (idx !== -1) allergyListeners.splice(idx, 1);
  };
}

export function subscribeSelection(fn) {
  selectionListeners.push(fn);
  return () => {
    const idx = selectionListeners.indexOf(fn);
    if (idx !== -1) selectionListeners.splice(idx, 1);
  };
}

// User Actions
export function getCurrentUser() {
  return currentUser;
}

export function setCurrentUser(user) {
  currentUser = user;
  if (user) {
    localStorage.setItem('rp_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('rp_user');
  }
  // Reload stored allergies for new user (or guest)
  allergies = loadStoredAllergies(user ? user.username : null);
  userListeners.forEach(fn => fn(currentUser));
  allergyListeners.forEach(fn => fn(getAllergies()));
}

// Allergy Actions
export function getAllergies() {
  return Array.from(allergies);
}

export function setAllergies(list) {
  allergies = new Set(list.map(s => String(s).trim()).filter(Boolean));
  persistAllergies();
  allergyListeners.forEach(fn => fn(getAllergies()));
}

export function addAllergyToState(item) {
  const trimmed = String(item).trim();
  if (trimmed.length < 2) return false;
  allergies.add(trimmed);
  persistAllergies();
  allergyListeners.forEach(fn => fn(getAllergies()));
  return true;
}

export function removeAllergyFromState(item) {
  const trimmed = String(item).trim();
  const deleted = allergies.delete(trimmed);
  if (deleted) {
    persistAllergies();
    allergyListeners.forEach(fn => fn(getAllergies()));
  }
  return deleted;
}

function persistAllergies() {
  const key = currentUser ? `rp_allergies_${currentUser.username}` : 'rp_allergies_guest';
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(allergies)));
  } catch (e) {
    console.warn('Failed to save allergies to localStorage:', e);
  }
}

// Selection Actions
export function getSelectedIngredients() {
  return Array.from(selectedIngredients);
}

export function isIngredientSelected(name) {
  return selectedIngredients.has(name);
}

export function toggleSelectedIngredient(name, checked) {
  if (checked) {
    selectedIngredients.add(name);
  } else {
    selectedIngredients.delete(name);
  }
  selectionListeners.forEach(fn => fn(getSelectedIngredients()));
}

export function setSelectedIngredients(items) {
  selectedIngredients.clear();
  items.forEach(item => selectedIngredients.add(item));
  selectionListeners.forEach(fn => fn(getSelectedIngredients()));
}

export function clearSelectedIngredients() {
  selectedIngredients.clear();
  selectionListeners.forEach(fn => fn(getSelectedIngredients()));
}
