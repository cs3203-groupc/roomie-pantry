const state = {
  token: localStorage.getItem('token'),
  user: null,
  households: [],
  selectedHouseholdId: Number(localStorage.getItem('selectedHouseholdId')) || null,
};

const el = {
  authSection: document.querySelector('#authSection'),
  appSection: document.querySelector('#appSection'),
  authForm: document.querySelector('#authForm'),
  message: document.querySelector('#message'),
  welcomeText: document.querySelector('#welcomeText'),
  householdSelect: document.querySelector('#householdSelect'),
  inviteCodeText: document.querySelector('#inviteCodeText'),
  createHouseholdForm: document.querySelector('#createHouseholdForm'),
  joinHouseholdForm: document.querySelector('#joinHouseholdForm'),
  logoutBtn: document.querySelector('#logoutBtn'),
  pantryForm: document.querySelector('#pantryForm'),
  pantryList: document.querySelector('#pantryList'),
  shoppingForm: document.querySelector('#shoppingForm'),
  shoppingList: document.querySelector('#shoppingList'),
  activityList: document.querySelector('#activityList'),
};

function setMessage(msg, isError = false) {
  el.message.textContent = msg;
  el.message.style.color = isError ? '#af2f24' : '#0a7d63';
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token) headers.Authorization = 'Bearer ' + state.token;

  const response = await fetch(path, { ...options, headers });
  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload;
}

function renderAuthState() {
  if (state.token) {
    el.authSection.classList.add('hidden');
    el.appSection.classList.remove('hidden');
  } else {
    el.authSection.classList.remove('hidden');
    el.appSection.classList.add('hidden');
  }
}

function getSelectedHousehold() {
  return state.households.find((h) => h.id === state.selectedHouseholdId) || null;
}

function renderHouseholds() {
  el.householdSelect.innerHTML = '';
  for (const household of state.households) {
    const option = document.createElement('option');
    option.value = String(household.id);
    option.textContent = household.name;
    el.householdSelect.append(option);
  }

  if (!state.selectedHouseholdId && state.households.length) {
    state.selectedHouseholdId = state.households[0].id;
  }

  const selected = getSelectedHousehold();
  if (selected) {
    el.householdSelect.value = String(selected.id);
    el.inviteCodeText.textContent = `Invite code: ${selected.invite_code}`;
    localStorage.setItem('selectedHouseholdId', String(selected.id));
  } else {
    el.inviteCodeText.textContent = 'Create or join a household to start.';
    localStorage.removeItem('selectedHouseholdId');
  }
}

function badgeForExpiry(expiry) {
  if (!expiry || expiry.status === 'none') return '<span class="badge fresh">No expiry</span>';
  if (expiry.status === 'expired') return '<span class="badge expired">Expired</span>';
  if (expiry.status === 'expiring') return `<span class="badge expiring">${expiry.daysUntilExpiry} day(s) left</span>`;
  return `<span class="badge fresh">${expiry.daysUntilExpiry} day(s) left</span>`;
}

async function loadDashboard() {
  const selected = getSelectedHousehold();
  if (!selected) {
    el.pantryList.innerHTML = '';
    el.shoppingList.innerHTML = '';
    el.activityList.innerHTML = '';
    return;
  }

  const [pantry, shopping, activity] = await Promise.all([
    api(`/api/households/${selected.id}/pantry`),
    api(`/api/households/${selected.id}/shopping-list`),
    api(`/api/households/${selected.id}/activity`),
  ]);

  el.pantryList.innerHTML = pantry
    .map(
      (item) => `
        <li>
          <span><strong>${item.name}</strong> (${item.quantity} ${item.unit}) · ${item.category} ${badgeForExpiry(item.expiry)}</span>
          <button data-remove-pantry="${item.id}" class="secondary">Delete</button>
        </li>`
    )
    .join('');

  el.shoppingList.innerHTML = shopping
    .map(
      (item) => `
      <li>
        <label>
          <input type="checkbox" data-toggle-shopping="${item.id}" ${item.checked ? 'checked' : ''} />
          ${item.name} (${item.quantity})
        </label>
        <button data-remove-shopping="${item.id}" class="secondary">Delete</button>
      </li>`
    )
    .join('');

  el.activityList.innerHTML = activity
    .map((event) => `<li><span>${event.action} · ${event.actor_email}</span><small>${event.created_at}</small></li>`)
    .join('');
}

async function loadSession() {
  if (!state.token) {
    renderAuthState();
    return;
  }

  try {
    const session = await api('/api/me');
    state.user = session.user;
    state.households = session.households;
    el.welcomeText.textContent = `Welcome, ${state.user.email}`;
    renderAuthState();
    renderHouseholds();
    await loadDashboard();
  } catch (error) {
    state.token = null;
    localStorage.removeItem('token');
    setMessage(error.message, true);
    renderAuthState();
  }
}

el.authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(el.authForm);
  const action = event.submitter?.value || 'login';
  const payload = {
    email: String(formData.get('email') || '').trim(),
    password: String(formData.get('password') || ''),
  };

  try {
    const result = await api(`/api/auth/${action}`, { method: 'POST', body: JSON.stringify(payload) });
    state.token = result.token;
    localStorage.setItem('token', state.token);
    setMessage(`${action === 'register' ? 'Registered' : 'Logged in'} successfully.`);
    await loadSession();
  } catch (error) {
    setMessage(error.message, true);
  }
});

el.createHouseholdForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(el.createHouseholdForm);
  try {
    await api('/api/households', {
      method: 'POST',
      body: JSON.stringify({ name: String(formData.get('name') || '').trim() }),
    });
    el.createHouseholdForm.reset();
    await loadSession();
    setMessage('Household created.');
  } catch (error) {
    setMessage(error.message, true);
  }
});

el.joinHouseholdForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(el.joinHouseholdForm);
  try {
    await api('/api/households/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode: String(formData.get('inviteCode') || '').trim() }),
    });
    el.joinHouseholdForm.reset();
    await loadSession();
    setMessage('Joined household.');
  } catch (error) {
    setMessage(error.message, true);
  }
});

el.householdSelect.addEventListener('change', async (event) => {
  state.selectedHouseholdId = Number(event.target.value);
  renderHouseholds();
  await loadDashboard();
});

el.pantryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const selected = getSelectedHousehold();
  if (!selected) return setMessage('Select a household first.', true);

  const formData = new FormData(el.pantryForm);
  try {
    await api(`/api/households/${selected.id}/pantry`, {
      method: 'POST',
      body: JSON.stringify({
        name: String(formData.get('name') || '').trim(),
        quantity: Number(formData.get('quantity')),
        unit: String(formData.get('unit') || 'pcs').trim(),
        category: String(formData.get('category') || 'General').trim(),
        expiryDate: String(formData.get('expiryDate') || '') || null,
      }),
    });

    el.pantryForm.reset();
    await loadDashboard();
    setMessage('Pantry item added.');
  } catch (error) {
    setMessage(error.message, true);
  }
});

el.shoppingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const selected = getSelectedHousehold();
  if (!selected) return setMessage('Select a household first.', true);

  const formData = new FormData(el.shoppingForm);
  try {
    await api(`/api/households/${selected.id}/shopping-list`, {
      method: 'POST',
      body: JSON.stringify({
        name: String(formData.get('name') || '').trim(),
        quantity: Number(formData.get('quantity')),
      }),
    });
    el.shoppingForm.reset();
    await loadDashboard();
    setMessage('Shopping list item added.');
  } catch (error) {
    setMessage(error.message, true);
  }
});

el.pantryList.addEventListener('click', async (event) => {
  const id = Number(event.target.getAttribute('data-remove-pantry'));
  if (!id) return;
  const selected = getSelectedHousehold();
  if (!selected) return;

  try {
    await api(`/api/households/${selected.id}/pantry/${id}`, { method: 'DELETE' });
    await loadDashboard();
    setMessage('Pantry item deleted.');
  } catch (error) {
    setMessage(error.message, true);
  }
});

el.shoppingList.addEventListener('click', async (event) => {
  const removeId = Number(event.target.getAttribute('data-remove-shopping'));
  if (!removeId) return;
  const selected = getSelectedHousehold();
  if (!selected) return;

  try {
    await api(`/api/households/${selected.id}/shopping-list/${removeId}`, { method: 'DELETE' });
    await loadDashboard();
    setMessage('Shopping item deleted.');
  } catch (error) {
    setMessage(error.message, true);
  }
});

el.shoppingList.addEventListener('change', async (event) => {
  const id = Number(event.target.getAttribute('data-toggle-shopping'));
  if (!id) return;
  const selected = getSelectedHousehold();
  if (!selected) return;

  try {
    await api(`/api/households/${selected.id}/shopping-list/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ checked: event.target.checked }),
    });
    await loadDashboard();
  } catch (error) {
    setMessage(error.message, true);
  }
});

el.logoutBtn.addEventListener('click', () => {
  state.token = null;
  state.user = null;
  state.households = [];
  localStorage.removeItem('token');
  localStorage.removeItem('selectedHouseholdId');
  renderAuthState();
  setMessage('Logged out.');
});

loadSession();
