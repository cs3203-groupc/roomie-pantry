/**
 * RoomiePantry Inventory Management Module
 */
import { pantryApi } from './api.js';
import { isIngredientSelected, toggleSelectedIngredient } from './state.js';
import { showToast } from './toast.js';

let cookSingleCallback = null;
let pantryUpdatedCallback = null;

export function initPantry({ onCookSingle, onPantryUpdated } = {}) {
  cookSingleCallback = onCookSingle;
  pantryUpdatedCallback = onPantryUpdated;

  // Set default expiry to 5 days ahead
  const expiryInput = document.getElementById('pantryExpiry');
  if (expiryInput && !expiryInput.value) {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 5);
    expiryInput.value = defaultDate.toISOString().split('T')[0];
  }

  const form = document.getElementById('addPantryForm');
  if (form) {
    form.addEventListener('submit', handleAddPantryItem);
  }
}

export async function fetchPantry() {
  const list = document.getElementById('pantryList');
  const countBadge = document.getElementById('pantryCount');

  try {
    const data = await pantryApi.getItems();
    const items = data.items || [];

    if (countBadge) {
      countBadge.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
    }

    if (!list) return;
    list.innerHTML = '';

    if (items.length === 0) {
      list.innerHTML = '<li class="empty-state">Pantry is empty. Add items above!</li>';
      return;
    }

    items.forEach(item => {
      const isChecked = isIngredientSelected(item.name);
      const li = document.createElement('li');
      li.className = 'item-card';

      const left = document.createElement('div');
      left.className = 'item-card-left';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'ingredient-cb';
      cb.value = item.name;
      cb.checked = isChecked;
      cb.addEventListener('change', (e) => {
        toggleSelectedIngredient(item.name, e.target.checked);
      });

      const info = document.createElement('div');
      info.className = 'item-info';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'item-name';
      nameSpan.textContent = `${item.name} (x${item.quantity})`;

      const metaSpan = document.createElement('span');
      metaSpan.className = 'item-meta';
      const ownership = item.isShared ? 'Shared' : `Private (${item.owner || 'Personal'})`;
      metaSpan.textContent = `${ownership} • Expires ${item.expiresOn}`;

      info.appendChild(nameSpan);
      info.appendChild(metaSpan);
      left.appendChild(cb);
      left.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'item-card-actions';

      const cookBtn = document.createElement('button');
      cookBtn.type = 'button';
      cookBtn.className = 'btn btn-accent btn-sm btn-icon';
      cookBtn.textContent = '🍳 Cook';
      cookBtn.title = 'Generate recipe for this item';
      cookBtn.addEventListener('click', () => {
        if (typeof cookSingleCallback === 'function') {
          cookSingleCallback(item.name);
        }
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-secondary btn-sm btn-icon';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.title = 'Remove item';
      deleteBtn.addEventListener('click', () => {
        handleDeletePantryItem(item.id, item.name);
      });

      actions.appendChild(cookBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(left);
      li.appendChild(actions);
      list.appendChild(li);
    });
  } catch (err) {
    console.error('Error fetching pantry:', err);
    if (list) {
      list.innerHTML = '<li class="empty-state text-danger">Failed to load pantry items.</li>';
    }
  }
}

async function handleAddPantryItem(e) {
  e.preventDefault();

  const nameInput = document.getElementById('pantryName');
  const qtyInput = document.getElementById('pantryQty');
  const expiryInput = document.getElementById('pantryExpiry');
  const ownerInput = document.getElementById('pantryOwner');
  const isSharedInput = document.getElementById('pantryIsShared');

  const name = nameInput ? nameInput.value.trim() : '';
  const quantity = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;
  const expiresOn = expiryInput ? expiryInput.value : '';
  const owner = ownerInput && ownerInput.value.trim() ? ownerInput.value.trim() : null;
  const isShared = isSharedInput ? isSharedInput.checked : true;

  if (!name || !expiresOn) {
    showToast('Item name and expiration date are required', 'warning');
    return;
  }

  try {
    await pantryApi.addItem({ name, quantity, expiresOn, owner, isShared });
    if (nameInput) nameInput.value = '';
    showToast(`Added ${name} to pantry`, 'success');

    await fetchPantry();
    if (typeof pantryUpdatedCallback === 'function') {
      pantryUpdatedCallback();
    }
  } catch (err) {
    const msg = err.data && err.data.error ? err.data.error : err.message;
    showToast(`Failed to add pantry item: ${msg}`, 'error');
  }
}

async function handleDeletePantryItem(id, itemName) {
  try {
    await pantryApi.deleteItem(id);
    showToast(`Removed ${itemName || 'item'} from pantry`, 'info');
    await fetchPantry();
    if (typeof pantryUpdatedCallback === 'function') {
      pantryUpdatedCallback();
    }
  } catch (err) {
    const msg = err.data && err.data.error ? err.data.error : err.message;
    showToast(`Failed to delete item: ${msg}`, 'error');
  }
}
