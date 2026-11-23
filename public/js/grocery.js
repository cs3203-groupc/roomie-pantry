/**
 * RoomiePantry Shared Grocery List Module
 */
import { groceryApi } from './api.js';
import { showToast } from './toast.js';

export function initGrocery() {
  const form = document.getElementById('addGroceryForm');
  if (form) {
    form.addEventListener('submit', handleAddGroceryItem);
  }
}

export async function fetchGrocery() {
  const list = document.getElementById('groceryList');
  const countSpan = document.getElementById('groceryCount');

  try {
    const data = await groceryApi.getItems();
    const items = data.items || [];

    if (countSpan) {
      countSpan.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
    }

    if (!list) return;
    list.innerHTML = '';

    if (items.length === 0) {
      list.innerHTML = '<div class="empty-state">Grocery list is clear.</div>';
      return;
    }

    items.forEach(item => {
      const div = document.createElement('div');
      div.className = `grocery-item-row ${item.checked ? 'checked' : ''}`;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!item.checked;
      cb.setAttribute('aria-label', `Mark ${item.name} as purchased`);
      cb.addEventListener('change', () => {
        handleToggleGrocery(item.id, cb.checked);
      });

      const content = document.createElement('div');
      content.className = 'grocery-item-content';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = `${item.name} (x${item.quantity || 1})`;

      const sub = document.createElement('div');
      sub.className = 'subtitle';
      sub.textContent = `Requested by ${item.requestedBy || 'Roommate'}`;

      content.appendChild(nameSpan);
      content.appendChild(sub);

      div.appendChild(cb);
      div.appendChild(content);
      list.appendChild(div);
    });
  } catch (err) {
    console.error('Error fetching grocery list:', err);
    if (list) {
      list.innerHTML = '<div class="empty-state text-danger">Failed to load grocery items.</div>';
    }
  }
}

async function handleAddGroceryItem(e) {
  e.preventDefault();

  const nameInput = document.getElementById('groceryName');
  const ownerInput = document.getElementById('groceryOwner');

  const name = nameInput ? nameInput.value.trim() : '';
  const requestedBy = ownerInput && ownerInput.value.trim() ? ownerInput.value.trim() : null;

  if (!name) {
    showToast('Grocery item name is required', 'warning');
    return;
  }

  try {
    await groceryApi.addItem({ name, requestedBy });
    if (nameInput) nameInput.value = '';
    showToast(`Added ${name} to grocery list`, 'success');
    await fetchGrocery();
  } catch (err) {
    const msg = err.data && err.data.error ? err.data.error : err.message;
    showToast(`Failed to add grocery item: ${msg}`, 'error');
  }
}

async function handleToggleGrocery(id, checked) {
  try {
    await groceryApi.toggleChecked(id, checked);
    await fetchGrocery();
  } catch (err) {
    const msg = err.data && err.data.error ? err.data.error : err.message;
    showToast(`Failed to update grocery item: ${msg}`, 'error');
  }
}
