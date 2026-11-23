/**
 * RoomiePantry Authentication Module
 */
import { authApi } from './api.js';
import { getCurrentUser, setCurrentUser, subscribeUser } from './state.js';
import { showToast } from './toast.js';

export function initAuth({ onLoginSuccess, onLogout } = {}) {
  const modal = document.getElementById('loginModal');
  const btnOpen = document.getElementById('btnOpenLoginModal');
  const btnClose = document.getElementById('btnCloseLoginModal');
  const form = document.getElementById('loginForm');
  const btnLogout = document.getElementById('btnLogout');

  if (btnOpen && modal) {
    btnOpen.addEventListener('click', () => {
      openLoginModal();
    });
  }

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => {
      closeLoginModal();
    });
  }

  // Click outside dialog to close
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeLoginModal();
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleLoginSubmit(onLoginSuccess);
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      handleLogout(onLogout);
    });
  }

  // Subscribe state changes to update header and auto-fill form owners
  subscribeUser((user) => {
    renderAuthState(user);
    syncFormOwners(user);
  });

  // Initial render
  const initialUser = getCurrentUser();
  renderAuthState(initialUser);
  syncFormOwners(initialUser);
}

export function openLoginModal() {
  const modal = document.getElementById('loginModal');
  const feedback = document.getElementById('loginFeedback');
  if (feedback) {
    feedback.className = 'auth-alert hidden';
    feedback.textContent = '';
  }
  if (modal) {
    if (typeof modal.showModal === 'function') {
      modal.showModal();
    } else {
      modal.classList.remove('hidden');
    }
    const usernameInput = document.getElementById('loginUsername');
    if (usernameInput) usernameInput.focus();
  }
}

export function closeLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) {
    if (typeof modal.close === 'function') {
      modal.close();
    } else {
      modal.classList.add('hidden');
    }
  }
}

async function handleLoginSubmit(onLoginSuccess) {
  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  const feedback = document.getElementById('loginFeedback');
  const spinner = document.getElementById('loginSpinner');
  const submitBtn = document.getElementById('btnSubmitLogin');

  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!username || !password) {
    showLoginError('Username and password are required');
    return;
  }

  if (spinner) spinner.style.display = 'inline-block';
  if (submitBtn) submitBtn.disabled = true;
  if (feedback) feedback.className = 'auth-alert hidden';

  try {
    const data = await authApi.login(username, password);
    const user = data.user || { username };
    setCurrentUser(user);

    if (passwordInput) passwordInput.value = '';
    closeLoginModal();
    showToast(`Welcome back, ${user.username}!`, 'success');

    if (typeof onLoginSuccess === 'function') {
      onLoginSuccess(user);
    }
  } catch (err) {
    const msg = err.data && err.data.error ? err.data.error : err.message || 'Login failed';
    showLoginError(msg);
  } finally {
    if (spinner) spinner.style.display = 'none';
    if (submitBtn) submitBtn.disabled = false;
  }
}

function showLoginError(message) {
  const feedback = document.getElementById('loginFeedback');
  if (feedback) {
    feedback.textContent = message;
    feedback.className = 'auth-alert auth-alert-error';
  } else {
    showToast(message, 'error');
  }
}

function handleLogout(onLogout) {
  const user = getCurrentUser();
  setCurrentUser(null);
  showToast('Signed out successfully', 'info');

  if (typeof onLogout === 'function') {
    onLogout(user);
  }
}

export function renderAuthState(user) {
  const loggedOutBar = document.getElementById('authLoggedOut');
  const loggedInBar = document.getElementById('authLoggedIn');
  const userBadge = document.getElementById('userBadge');

  if (user && user.username) {
    if (loggedOutBar) loggedOutBar.classList.add('hidden');
    if (loggedInBar) loggedInBar.classList.remove('hidden');
    if (userBadge) userBadge.textContent = `👤 ${user.username}`;
  } else {
    if (loggedOutBar) loggedOutBar.classList.remove('hidden');
    if (loggedInBar) loggedInBar.classList.add('hidden');
    if (userBadge) userBadge.textContent = '';
  }
}

export function syncFormOwners(user) {
  const pantryOwner = document.getElementById('pantryOwner');
  const groceryOwner = document.getElementById('groceryOwner');

  if (user && user.username) {
    if (pantryOwner && (!pantryOwner.value || pantryOwner.dataset.autoFilled === 'true')) {
      pantryOwner.value = user.username;
      pantryOwner.dataset.autoFilled = 'true';
    }
    if (groceryOwner && (!groceryOwner.value || groceryOwner.dataset.autoFilled === 'true')) {
      groceryOwner.value = user.username;
      groceryOwner.dataset.autoFilled = 'true';
    }
  } else {
    if (pantryOwner && pantryOwner.dataset.autoFilled === 'true') {
      pantryOwner.value = '';
      pantryOwner.dataset.autoFilled = 'false';
    }
    if (groceryOwner && groceryOwner.dataset.autoFilled === 'true') {
      groceryOwner.value = '';
      groceryOwner.dataset.autoFilled = 'false';
    }
  }
}
