const setPasswordFormWrap = document.getElementById('set-password-form-wrap');
const changePasswordFormWrap = document.getElementById('change-password-form-wrap');
const setPasswordForm = document.getElementById('set-password-form');
const changePasswordForm = document.getElementById('change-password-form');
const passwordStatus = document.getElementById('password-status');

const addSiteForm = document.getElementById('add-site-form');
const sitePatternInput = document.getElementById('site-pattern');
const siteList = document.getElementById('site-list');
const sitesStatus = document.getElementById('sites-status');

const unlockDurationSelect = document.getElementById('unlock-duration');
const lockOnStartupCheckbox = document.getElementById('lock-on-startup');
const settingsStatus = document.getElementById('settings-status');

init();

async function init() {
  await refreshPasswordSection();
  await refreshSiteList();
  await refreshSettings();
}

async function refreshPasswordSection() {
  const { hasPassword } = await chrome.runtime.sendMessage({ type: 'hasPassword' });
  setPasswordFormWrap.hidden = hasPassword;
  changePasswordFormWrap.hidden = !hasPassword;
}

async function refreshSiteList() {
  const { sites } = await chrome.runtime.sendMessage({ type: 'getSites' });
  siteList.innerHTML = '';
  if (!sites || sites.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No sites locked yet.';
    siteList.appendChild(li);
    return;
  }
  for (const site of sites) {
    const li = document.createElement('li');

    const label = document.createElement('span');
    label.textContent = site.pattern;

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.className = 'remove';
    removeBtn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'removeSite', id: site.id });
      await refreshSiteList();
    });

    li.appendChild(label);
    li.appendChild(removeBtn);
    siteList.appendChild(li);
  }
}

async function refreshSettings() {
  const { settings } = await chrome.runtime.sendMessage({ type: 'getSettings' });
  unlockDurationSelect.value = String(settings.unlockDurationMinutes);
  lockOnStartupCheckbox.checked = !!settings.lockOnStartup;
}

setPasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  passwordStatus.textContent = '';
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  if (newPassword !== confirmPassword) {
    passwordStatus.textContent = 'Passwords do not match.';
    return;
  }
  const res = await chrome.runtime.sendMessage({ type: 'setPassword', password: newPassword });
  if (res.success) {
    setPasswordForm.reset();
    passwordStatus.textContent = 'Password set.';
    await refreshPasswordSection();
  } else {
    passwordStatus.textContent = res.error || 'Could not set password.';
  }
});

changePasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  passwordStatus.textContent = '';
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('change-new-password').value;
  const res = await chrome.runtime.sendMessage({ type: 'changePassword', currentPassword, newPassword });
  if (res.success) {
    changePasswordForm.reset();
    passwordStatus.textContent = 'Password changed.';
  } else {
    passwordStatus.textContent = res.error || 'Could not change password.';
  }
});

addSiteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  sitesStatus.textContent = '';
  const pattern = sitePatternInput.value;
  const res = await chrome.runtime.sendMessage({ type: 'addSite', pattern });
  if (res.success) {
    sitePatternInput.value = '';
    await refreshSiteList();
  } else {
    sitesStatus.textContent = res.error || 'Could not add site.';
  }
});

unlockDurationSelect.addEventListener('change', async () => {
  await chrome.runtime.sendMessage({
    type: 'updateSettings',
    settings: { unlockDurationMinutes: Number(unlockDurationSelect.value) },
  });
  flashSettingsStatus();
});

lockOnStartupCheckbox.addEventListener('change', async () => {
  await chrome.runtime.sendMessage({
    type: 'updateSettings',
    settings: { lockOnStartup: lockOnStartupCheckbox.checked },
  });
  flashSettingsStatus();
});

function flashSettingsStatus() {
  settingsStatus.textContent = 'Saved.';
  setTimeout(() => {
    settingsStatus.textContent = '';
  }, 1500);
}
