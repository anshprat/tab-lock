const content = document.getElementById('content');
const openOptions = document.getElementById('open-options');

openOptions.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

init();

async function init() {
  const status = await chrome.runtime.sendMessage({ type: 'getCurrentTabStatus' });

  if (!status || !status.hostname) {
    content.innerHTML = '<p class="hint">Open a website to manage its lock.</p>';
    return;
  }

  if (!status.hasPassword) {
    content.innerHTML = '<p class="hint">Set a password first to start locking sites.</p>';
    return;
  }

  if (status.isLocked) {
    content.innerHTML = `
      <p class="row"><span class="dot locked"></span> <strong>${escapeHtml(status.hostname)}</strong> is locked</p>
      <button id="lock-now">Lock now</button>
    `;
    document.getElementById('lock-now').addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'lockNow' });
      window.close();
    });
  } else {
    content.innerHTML = `
      <p class="row"><span class="dot unlocked"></span> <strong>${escapeHtml(status.hostname)}</strong> is not locked</p>
      <button id="lock-site">Lock this site</button>
    `;
    document.getElementById('lock-site').addEventListener('click', async () => {
      const res = await chrome.runtime.sendMessage({ type: 'addSite', pattern: status.hostname });
      if (res && res.success) window.close();
    });
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
