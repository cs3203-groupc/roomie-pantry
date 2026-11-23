/**
 * RoomiePantry Dietary & Allergy Settings Module
 */
import { allergyApi } from './api.js';
import {
  getCurrentUser,
  getAllergies,
  setAllergies,
  addAllergyToState,
  removeAllergyFromState,
  subscribeAllergies
} from './state.js';
import { showToast } from './toast.js';

export function initAllergy() {
  const form = document.getElementById('addAllergyForm');
  const input = document.getElementById('allergyInput');

  // Form submit for custom allergy
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = input ? input.value : '';
      await handleAddAllergy(val);
      if (input) input.value = '';
    });
  }

  // Preset buttons
  const presetButtons = document.querySelectorAll('.preset-btn');
  presetButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const preset = btn.getAttribute('data-allergy') || btn.textContent.replace(/^\+\s*/, '').trim();
      await handleAddAllergy(preset);
    });
  });

  // Subscribe to allergy changes to re-render UI
  subscribeAllergies((allergies) => {
    renderAllergies(allergies);
    renderAllergyShield(allergies);
  });

  // Initial render from state
  const current = getAllergies();
  renderAllergies(current);
  renderAllergyShield(current);

  // If user is currently logged in, sync from backend
  const user = getCurrentUser();
  if (user && user.username) {
    syncAllergiesFromBackend(user.username);
  }
}

/**
 * Load allergies from backend for a specific user
 */
export async function syncAllergiesFromBackend(username) {
  if (!username) return;
  try {
    const data = await allergyApi.getAllergies(username);
    if (data && Array.isArray(data.allergies)) {
      setAllergies(data.allergies);
    }
  } catch (err) {
    console.warn('Failed to sync allergies from backend:', err);
  }
}

/**
 * Handle adding an allergy (both client state and backend if logged in)
 */
export async function handleAddAllergy(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    showToast('Please enter an allergy name', 'warning');
    return false;
  }

  const cleaned = rawName.trim();
  if (cleaned.length < 2) {
    showToast('Allergy name must be at least 2 characters', 'warning');
    return false;
  }

  // Check if already present (case-insensitive)
  const current = getAllergies();
  const exists = current.some(a => a.toLowerCase() === cleaned.toLowerCase());
  if (exists) {
    showToast(`"${cleaned}" is already configured`, 'info');
    return false;
  }

  const user = getCurrentUser();
  if (user && user.username) {
    try {
      await allergyApi.addAllergy(user.username, cleaned);
    } catch (err) {
      const msg = err.data && err.data.error ? err.data.error : err.message;
      showToast(`Error saving allergy: ${msg}`, 'error');
      return false;
    }
  }

  addAllergyToState(cleaned);
  showToast(`Added allergy: ${cleaned}`, 'success');
  return true;
}

/**
 * Handle removing an allergy
 */
export async function handleRemoveAllergy(allergyName) {
  const user = getCurrentUser();
  if (user && user.username) {
    try {
      await allergyApi.deleteAllergy(user.username, allergyName);
    } catch (err) {
      const msg = err.data && err.data.error ? err.data.error : err.message;
      showToast(`Error deleting allergy: ${msg}`, 'error');
      return false;
    }
  }

  removeAllergyFromState(allergyName);
  showToast(`Removed allergy: ${allergyName}`, 'info');
  return true;
}

/**
 * Render the active allergy chips
 */
export function renderAllergies(allergiesList) {
  const container = document.getElementById('allergyChipsList');
  const countBadge = document.getElementById('allergyCountBadge');

  if (countBadge) {
    const count = allergiesList.length;
    countBadge.textContent = `${count} configured`;
    countBadge.className = count > 0 ? 'badge badge-yellow' : 'badge badge-green';
  }

  if (!container) return;
  container.innerHTML = '';

  if (!allergiesList || allergiesList.length === 0) {
    container.innerHTML = '<span class="subtitle" style="padding: 0.25rem 0.5rem;">No allergies configured. All ingredients are allowed.</span>';
    return;
  }

  allergiesList.forEach(allergy => {
    const chip = document.createElement('div');
    chip.className = 'allergy-chip';

    const text = document.createElement('span');
    text.textContent = allergy;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'allergy-chip-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.setAttribute('aria-label', `Remove ${allergy}`);
    removeBtn.addEventListener('click', () => {
      handleRemoveAllergy(allergy);
    });

    chip.appendChild(text);
    chip.appendChild(removeBtn);
    container.appendChild(chip);
  });
}

/**
 * Render the Allergy Shield indicator in AIRecipeGen Card
 */
export function renderAllergyShield(allergiesList) {
  const shield = document.getElementById('recipeAllergyShield');
  const namesSpan = document.getElementById('shieldAllergyNames');

  if (!shield) return;

  if (allergiesList && allergiesList.length > 0) {
    shield.className = 'allergy-shield-status allergy-shield-active';
    if (namesSpan) {
      namesSpan.textContent = allergiesList.join(', ');
    }
  } else {
    shield.className = 'allergy-shield-status';
    if (namesSpan) {
      namesSpan.textContent = 'None';
    }
  }
}
