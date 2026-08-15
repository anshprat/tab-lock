const form = document.getElementById('unlock-form');
const input = document.getElementById('password');
const error = document.getElementById('error');
const siteLabel = document.getElementById('site-label');

init();

async function init() {
  const ctx = await chrome.runtime.sendMessage({ type: 'getLockContext' });
  siteLabel.textContent = (ctx && ctx.hostname) || 'this site';
  input.focus();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.textContent = '';
  const password = input.value;
  if (!password) return;

  const submitBtn = form.querySelector('button');
  submitBtn.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'attemptUnlock', password });
    if (res && res.success) {
      // The background service worker has already navigated this tab back
      // to the original page — nothing left to do here.
      return;
    }
    error.textContent = (res && res.error) || 'Incorrect password.';
    input.value = '';
    input.focus();
  } finally {
    submitBtn.disabled = false;
  }
});
