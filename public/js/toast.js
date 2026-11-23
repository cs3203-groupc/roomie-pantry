/**
 * RoomiePantry Toast Notification Module
 */

function getToastContainer() {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('role', 'status');
    document.body.appendChild(container);
  }
  return container;
}

const ICONS = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌'
};

/**
 * Display a non-blocking toast notification.
 * @param {string} message - Message to display
 * @param {'info'|'success'|'warning'|'error'} type - Notification style
 * @param {number} durationMs - Display time in milliseconds
 */
export function showToast(message, type = 'info', durationMs = 3500) {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');

  const content = document.createElement('div');
  content.className = 'toast-content';

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = ICONS[type] || ICONS.info;

  const text = document.createElement('span');
  text.textContent = message;

  content.appendChild(icon);
  content.appendChild(text);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.onclick = () => dismissToast(toast);

  toast.appendChild(content);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  const timer = setTimeout(() => {
    dismissToast(toast);
  }, durationMs);

  function dismissToast(element) {
    clearTimeout(timer);
    element.classList.add('toast-hiding');
    element.addEventListener('transitionend', () => {
      element.remove();
    }, { once: true });
    // Fallback removal if transition doesn't fire
    setTimeout(() => {
      if (element.parentElement) element.remove();
    }, 250);
  }

  return toast;
}
