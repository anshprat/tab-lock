const form = document.getElementById('unlock-form');
const input = document.getElementById('password');
const error = document.getElementById('error');
const siteLabel = document.getElementById('site-label');
const touchIdDivider = document.getElementById('touchid-divider');
const touchIdBtn = document.getElementById('touchid-btn');

init();

async function init() {
  const [ctx, touchId] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'getLockContext' }),
    chrome.runtime.sendMessage({ type: 'checkTouchId' }),
  ]);
  siteLabel.textContent = (ctx && ctx.hostname) || 'this site';
  if (touchId && touchId.available) {
    touchIdDivider.hidden = false;
    touchIdBtn.hidden = false;
  }
  input.focus();
}

touchIdBtn.addEventListener('click', async () => {
  error.textContent = '';
  touchIdBtn.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'attemptTouchIdUnlock' });
    if (res && res.success) return;
    error.textContent = (res && res.error) || 'Touch ID failed.';
  } finally {
    touchIdBtn.disabled = false;
  }
});

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
