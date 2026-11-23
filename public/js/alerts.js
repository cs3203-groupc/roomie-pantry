/**
 * RoomiePantry Expiration Alerts & Cook-Now Engine Module
 */
import { pantryApi } from './api.js';
import {
  getSelectedIngredients,
  toggleSelectedIngredient,
  setSelectedIngredients,
  isIngredientSelected,
  subscribeSelection
} from './state.js';

let cookSingleCallback = null;
let cookSelectedCallback = null;

export function initAlerts({ onCookSingle, onCookSelected } = {}) {
  cookSingleCallback = onCookSingle;
  cookSelectedCallback = onCookSelected;

  const btnSelectAll = document.getElementById('btnSelectAll');
  if (btnSelectAll) {
    btnSelectAll.addEventListener('click', toggleSelectAllExpiring);
  }

  const btnCookSelected = document.getElementById('btnCookSelected');
  if (btnCookSelected) {
    btnCookSelected.addEventListener('click', () => {
      if (typeof cookSelectedCallback === 'function') {
        cookSelectedCallback();
      }
    });
  }

  const btnPantryCookSelected = document.getElementById('btnPantryCookSelected');
  if (btnPantryCookSelected) {
    btnPantryCookSelected.addEventListener('click', () => {
      if (typeof cookSelectedCallback === 'function') {
        cookSelectedCallback();
      }
    });
  }

  subscribeSelection((selected) => {
    updateSelectionUI(selected);
  });

  updateSelectionUI(getSelectedIngredients());
}

export async function fetchAlerts() {
  const redSpan = document.getElementById('countRed');
  const yellowSpan = document.getElementById('countYellow');
  const greenSpan = document.getElementById('countGreen');

  try {
    const data = await pantryApi.getAlerts();
    const summary = data.summary || {};

    if (redSpan) redSpan.textContent = summary.red || 0;
    if (yellowSpan) yellowSpan.textContent = summary.yellow || 0;
    if (greenSpan) greenSpan.textContent = summary.green || 0;
  } catch (err) {
    console.error('Error fetching alerts:', err);
  }
}

export async function fetchCookNow() {
  const list = document.getElementById('cookNowList');

  try {
    const data = await pantryApi.getCookNow();
    const recommendations = data.recommendations || [];

    if (!list) return;
    list.innerHTML = '';

    if (recommendations.length === 0) {
      list.innerHTML = '<div class="empty-state">No urgent recommendations right now.</div>';
      return;
    }

    recommendations.forEach(rec => {
      const ingredientName = rec.itemName || (rec.ingredientsUsed && rec.ingredientsUsed[0]) || rec.recipeName.replace(/^Quick\s+|\s+Bowl$/g, '');
      const isChecked = isIngredientSelected(ingredientName);

      const div = document.createElement('div');
      div.className = 'item-card';

      const left = document.createElement('div');
      left.className = 'item-card-left';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'cook-now-cb';
      cb.value = ingredientName;
      cb.checked = isChecked;
      cb.addEventListener('change', (e) => {
        toggleSelectedIngredient(ingredientName, e.target.checked);
      });

      const info = document.createElement('div');
      info.className = 'item-info';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'item-name';
      nameSpan.textContent = rec.recipeName;

      const metaSpan = document.createElement('span');
      metaSpan.className = 'item-meta';
      metaSpan.textContent = rec.reason;

      info.appendChild(nameSpan);
      info.appendChild(metaSpan);
      left.appendChild(cb);
      left.appendChild(info);

      const cookBtn = document.createElement('button');
      cookBtn.type = 'button';
      cookBtn.className = 'btn btn-accent btn-sm';
      cookBtn.textContent = '🔥 Cook Now';
      cookBtn.addEventListener('click', () => {
        if (typeof cookSingleCallback === 'function') {
          cookSingleCallback(ingredientName);
        }
      });

      div.appendChild(left);
      div.appendChild(cookBtn);
      list.appendChild(div);
    });
  } catch (err) {
    console.error('Error fetching cook now:', err);
    if (list) {
      list.innerHTML = '<div class="empty-state text-danger">Failed to load cook-now items.</div>';
    }
  }
}

export function toggleSelectAllExpiring() {
  const cbs = document.querySelectorAll('.cook-now-cb');
  const allChecked = cbs.length > 0 && Array.from(cbs).every(cb => cb.checked);

  const newSelection = new Set(getSelectedIngredients());

  cbs.forEach(cb => {
    cb.checked = !allChecked;
    if (!allChecked) {
      newSelection.add(cb.value);
    } else {
      newSelection.delete(cb.value);
    }
  });

  setSelectedIngredients(Array.from(newSelection));

  const btn = document.getElementById('btnSelectAll');
  if (btn) btn.textContent = allChecked ? 'Select All' : 'Deselect All';
}

export function updateSelectionUI(selected) {
  const count = selected.length;
  const cookBtn = document.getElementById('btnCookSelected');
  const pantryCookBtn = document.getElementById('btnPantryCookSelected');
  const countSpan = document.getElementById('selectedCount');
  const badges = document.querySelectorAll('.selected-count-badge');

  if (countSpan) countSpan.textContent = count;
  badges.forEach(b => {
    b.textContent = count;
  });

  if (count > 0) {
    if (cookBtn) cookBtn.classList.remove('hidden');
    if (pantryCookBtn) pantryCookBtn.classList.remove('hidden');
  } else {
    if (cookBtn) cookBtn.classList.add('hidden');
    if (pantryCookBtn) pantryCookBtn.classList.add('hidden');
    const selectAllBtn = document.getElementById('btnSelectAll');
    if (selectAllBtn) selectAllBtn.textContent = 'Select All';
  }

  // Sync checkboxes in DOM
  document.querySelectorAll('input.ingredient-cb, input.cook-now-cb').forEach(cb => {
    cb.checked = selected.includes(cb.value);
  });
}
