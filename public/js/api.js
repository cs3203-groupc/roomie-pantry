/**
 * RoomiePantry Centralized API Client
 */

async function request(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  let data;
  try {
    data = await response.json();
  } catch (_e) {
    data = { error: 'Invalid response from server' };
  }

  if (!response.ok) {
    const error = new Error(data.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const authApi = {
  login(username, password) {
    return request('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }
};

export const pantryApi = {
  getItems() {
    return request('/pantry/items');
  },
  addItem(item) {
    return request('/pantry/items', {
      method: 'POST',
      body: JSON.stringify(item)
    });
  },
  deleteItem(id) {
    return request(`/pantry/items/${id}`, {
      method: 'DELETE'
    });
  },
  getAlerts() {
    return request('/pantry/alerts');
  },
  getCookNow() {
    return request('/cook-now');
  }
};

export const groceryApi = {
  getItems() {
    return request('/grocery/items');
  },
  addItem(item) {
    return request('/grocery/items', {
      method: 'POST',
      body: JSON.stringify(item)
    });
  },
  toggleChecked(id, checked) {
    return request(`/grocery/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ checked })
    });
  }
};

export const allergyApi = {
  getAllergies(username) {
    const query = username ? `?username=${encodeURIComponent(username)}` : '';
    return request(`/user/allergies${query}`);
  },
  addAllergy(username, allergy) {
    return request('/user/allergies', {
      method: 'POST',
      body: JSON.stringify({ username, allergy })
    });
  },
  deleteAllergy(username, allergy) {
    const query = username ? `?username=${encodeURIComponent(username)}` : '';
    return request(`/user/allergies/${encodeURIComponent(allergy)}${query}`, {
      method: 'DELETE'
    });
  }
};

export const recipeApi = {
  generateCustom({ items, allergies, username }) {
    const body = { items };
    if (allergies && allergies.length > 0) body.allergies = allergies;
    if (username) body.username = username;
    return request('/ai/recipe', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  generateFromPantry(username) {
    const query = username ? `?username=${encodeURIComponent(username)}` : '';
    return request(`/pantry/ai-recipe${query}`);
  },
  queryChef(prompt) {
    return request('/ai/query', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });
  }
};

export const systemApi = {
  getStorageInfo() {
    return request('/system/storage');
  }
};
