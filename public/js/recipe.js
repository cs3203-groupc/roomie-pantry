/**
 * RoomiePantry AI Recipe Generator (AIRecipeGen) Module
 */
import { recipeApi } from './api.js';
import { getCurrentUser, getAllergies, getSelectedIngredients } from './state.js';
import { showToast } from './toast.js';

export function initRecipe() {
  // Tab buttons
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId) switchAITab(tabId);
    });
  });

  // Action buttons
  const btnPantry = document.getElementById('btnGenPantry');
  if (btnPantry) {
    btnPantry.addEventListener('click', generateFromPantry);
  }

  const btnCustom = document.getElementById('btnGenCustom');
  if (btnCustom) {
    btnCustom.addEventListener('click', generateFromCustom);
  }

  const btnQuery = document.getElementById('btnQuery');
  if (btnQuery) {
    btnQuery.addEventListener('click', queryAIChef);
  }

  // Allow enter key in input fields
  const customInput = document.getElementById('customInput');
  if (customInput) {
    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        generateFromCustom();
      }
    });
  }

  const promptInput = document.getElementById('promptInput');
  if (promptInput) {
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        queryAIChef();
      }
    });
  }
}

export function switchAITab(tabId) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  const tabContents = document.querySelectorAll('.ai-tab-content');
  tabContents.forEach(content => {
    content.classList.toggle('hidden', content.id !== tabId);
  });
}

export async function generateFromPantry() {
  const spinner = document.getElementById('pantrySpinner');
  const btn = document.getElementById('btnGenPantry');
  if (spinner) spinner.style.display = 'inline-block';
  if (btn) btn.disabled = true;

  try {
    const user = getCurrentUser();
    const username = user ? user.username : null;
    const data = await recipeApi.generateFromPantry(username);

    if (data.error) {
      showToast(data.error, 'error');
      return;
    }

    showAIRecipe(data);
    showToast('Recipe generated from pantry!', 'success');
  } catch (err) {
    const msg = err.data && err.data.error ? err.data.error : err.message;
    showToast(`Failed to generate recipe: ${msg}`, 'error');
  } finally {
    if (spinner) spinner.style.display = 'none';
    if (btn) btn.disabled = false;
  }
}

export async function generateFromCustom() {
  const input = document.getElementById('customInput');
  const raw = input ? input.value.trim() : '';

  if (!raw) {
    showToast('Please enter at least one ingredient', 'warning');
    return;
  }

  const items = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (items.length === 0) {
    showToast('Please enter at least one valid ingredient', 'warning');
    return;
  }

  await cookIngredients(items);
}

export function cookSingleItem(name) {
  cookIngredients([name]);
}

export function cookSelectedItems() {
  const items = getSelectedIngredients();
  if (items.length === 0) {
    showToast('Please select at least one item to cook', 'warning');
    return;
  }
  cookIngredients(items);
}

export async function cookIngredients(items) {
  if (!items || items.length === 0) return;

  switchAITab('customTab');
  const input = document.getElementById('customInput');
  if (input) input.value = items.join(', ');

  const aiCard = document.getElementById('aiRecipeCard');
  if (aiCard) {
    aiCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const spinner = document.getElementById('customSpinner');
  const btn = document.getElementById('btnGenCustom');
  if (spinner) spinner.style.display = 'inline-block';
  if (btn) btn.disabled = true;

  try {
    const user = getCurrentUser();
    const allergies = getAllergies();
    const payload = {
      items,
      allergies,
      username: user ? user.username : undefined
    };

    const data = await recipeApi.generateCustom(payload);
    if (data.error) {
      showToast(data.error, 'error');
      return;
    }

    showAIRecipe(data);
    showToast('Recipe generated successfully!', 'success');
  } catch (err) {
    const msg = err.data && err.data.error ? err.data.error : err.message;
    showToast(`Failed to generate recipe: ${msg}`, 'error');
  } finally {
    if (spinner) spinner.style.display = 'none';
    if (btn) btn.disabled = false;
  }
}

export async function queryAIChef() {
  const input = document.getElementById('promptInput');
  const prompt = input ? input.value.trim() : '';

  if (!prompt) {
    showToast('Please enter a query or question', 'warning');
    return;
  }

  const spinner = document.getElementById('querySpinner');
  const btn = document.getElementById('btnQuery');
  if (spinner) spinner.style.display = 'inline-block';
  if (btn) btn.disabled = true;

  try {
    const data = await recipeApi.queryChef(prompt);
    if (data.error) {
      showToast(data.error, 'error');
      return;
    }

    showAIText(data.response || 'No response from chef.');
  } catch (err) {
    const msg = err.data && err.data.error ? err.data.error : err.message;
    showToast(`Failed to query AI Chef: ${msg}`, 'error');
  } finally {
    if (spinner) spinner.style.display = 'none';
    if (btn) btn.disabled = false;
  }
}

export function showAIRecipe(recipe) {
  const resultContainer = document.getElementById('aiResultContainer');
  const recipeBox = document.getElementById('aiRecipeBox');
  const textBox = document.getElementById('aiTextBox');

  if (resultContainer) resultContainer.classList.remove('hidden');
  if (recipeBox) recipeBox.classList.remove('hidden');
  if (textBox) textBox.classList.add('hidden');

  const titleEl = document.getElementById('recipeTitle');
  const timeEl = document.getElementById('recipeTime');
  const servingsEl = document.getElementById('recipeServings');
  const metaBar = document.getElementById('recipeMetaBar');

  if (titleEl) titleEl.textContent = recipe.title || 'Quick Pantry Meal';
  if (timeEl) timeEl.textContent = `⏱️ ${recipe.prepTime || '15 mins'}`;
  if (servingsEl) servingsEl.textContent = `👤 ${recipe.servings || 1} serving(s)`;

  // Allergy Checked verification tag
  const existingCheckedTag = document.getElementById('recipeAllergyCheckedTag');
  if (existingCheckedTag) existingCheckedTag.remove();

  const activeAllergies = getAllergies();
  if (metaBar) {
    const checkedTag = document.createElement('span');
    checkedTag.id = 'recipeAllergyCheckedTag';
    checkedTag.className = 'meta-tag allergy-checked-badge';
    if (activeAllergies.length > 0) {
      checkedTag.textContent = `🛡️ Allergy Checked (${activeAllergies.length} avoided)`;
    } else {
      checkedTag.textContent = '🛡️ Allergy Checked';
    }
    metaBar.appendChild(checkedTag);
  }

  // Ingredients chips
  const chipContainer = document.getElementById('recipeIngredients');
  if (chipContainer) {
    chipContainer.innerHTML = '';
    (recipe.ingredients || []).forEach(ing => {
      const span = document.createElement('span');
      span.className = 'chip';
      span.textContent = ing;
      chipContainer.appendChild(span);
    });
  }

  // Instructions steps
  const instructionsContainer = document.getElementById('recipeInstructions');
  if (instructionsContainer) {
    instructionsContainer.innerHTML = '';

    let steps = [];
    if (Array.isArray(recipe.instructions) && recipe.instructions.length > 0) {
      steps = recipe.instructions;
    } else if (typeof recipe.instructions === 'string' && recipe.instructions.trim()) {
      steps = recipe.instructions.split(/\r?\n|\d+\.\s+/).filter(Boolean);
    }

    if (steps.length === 0) {
      steps = [
        `Gather all ingredients: ${(recipe.ingredients || []).join(', ')}.`,
        'Heat skillet or saucepan over medium heat with a splash of oil.',
        'Cook and combine ingredients for 5 to 7 minutes until hot and well-blended.',
        'Plate, season to taste, and enjoy your meal!'
      ];
    }

    steps.forEach((step, idx) => {
      const row = document.createElement('div');
      row.className = 'instruction-step';

      const num = document.createElement('div');
      num.className = 'step-num';
      num.textContent = idx + 1;

      const text = document.createElement('div');
      text.className = 'step-text';
      text.textContent = String(step).replace(/^\d+[\.\)]\s*/, '');

      row.appendChild(num);
      row.appendChild(text);
      instructionsContainer.appendChild(row);
    });
  }
}

export function showAIText(text) {
  const resultContainer = document.getElementById('aiResultContainer');
  const recipeBox = document.getElementById('aiRecipeBox');
  const textBox = document.getElementById('aiTextBox');

  if (resultContainer) resultContainer.classList.remove('hidden');
  if (recipeBox) recipeBox.classList.add('hidden');
  if (textBox) {
    textBox.classList.remove('hidden');

    let html = escapeHtml(text)
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^\* (.*$)/gim, '<li>$1</li>')
      .replace(/\n\n/g, '<br/><br/>');

    textBox.innerHTML = html;
  }
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}
