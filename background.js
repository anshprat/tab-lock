// Tab Lock background service worker.
//
// Responsibilities:
//  - Track which sites the user has locked and the password hash.
//  - Intercept navigations/tab switches into locked sites and redirect to lock.html.
//  - Track which sites are currently "unlocked" for this browser session, and
//    for how long, in chrome.storage.session (survives service worker restarts,
//    cleared when the browser closes).
//  - Verify passwords and manage the locked-site list on behalf of the
//    options/popup pages via chrome.runtime messages.

const LOCK_PAGE_PATH = 'lock.html';
const LOCK_URL = chrome.runtime.getURL(LOCK_PAGE_PATH);
const PBKDF2_ITERATIONS = 150000;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30000;
const DEFAULT_SETTINGS = {
  // 0 = relock the instant the tab loses focus/is switched away from.
  // N > 0 = stay unlocked for N minutes regardless of tab switches.
  // -1 = stay unlocked until the browser restarts.
  unlockDurationMinutes: 0,
  lockOnStartup: true,
};

// ---------- storage.local (persistent config) ----------

async function getLocal() {
  const { lockedSites = [], passwordHash = null, settings = {} } = await chrome.storage.local.get([
    'lockedSites',
    'passwordHash',
    'settings',
  ]);
  return { lockedSites, passwordHash, settings: { ...DEFAULT_SETTINGS, ...settings } };
}

async function setLocal(partial) {
  await chrome.storage.local.set(partial);
}

// ---------- crypto ----------

function toBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(base64) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function derivePasswordHash(password, saltBytes, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return toBase64(bits);
}

async function createPasswordRecord(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = PBKDF2_ITERATIONS;
  const hash = await derivePasswordHash(password, salt, iterations);
  return { hash, salt: toBase64(salt), iterations };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyPassword(password, record) {
  if (!record) return false;
  const salt = fromBase64(record.salt);
  const hash = await derivePasswordHash(password, salt, record.iterations);
  return timingSafeEqual(hash, record.hash);
}

// ---------- site matching ----------

function extractHostname(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname;
  } catch {
    return null;
  }
}

function hostnameMatchesPattern(hostname, pattern) {
  const p = pattern.trim().toLowerCase().replace(/^\*\./, '');
  return hostname === p || hostname.endsWith('.' + p);
}

function findMatchingSite(hostname, lockedSites) {
  if (!hostname) return null;
  return lockedSites.find((site) => hostnameMatchesPattern(hostname, site.pattern)) || null;
}

// ---------- storage.session (ephemeral unlock/redirect state) ----------

async function isSiteUnlocked(siteId) {
  const { unlockedSites = {} } = await chrome.storage.session.get('unlockedSites');
  const entry = unlockedSites[siteId];
  if (!entry) return false;
  if (entry.expiresAt === null) return true;
  if (entry.expiresAt > Date.now()) return true;
  await clearUnlock(siteId);
  return false;
}

async function setUnlocked(siteId, expiresAt) {
  const { unlockedSites = {} } = await chrome.storage.session.get('unlockedSites');
  unlockedSites[siteId] = { expiresAt };
  await chrome.storage.session.set({ unlockedSites });
}

async function clearUnlock(siteId) {
  const { unlockedSites = {} } = await chrome.storage.session.get('unlockedSites');
  delete unlockedSites[siteId];
  await chrome.storage.session.set({ unlockedSites });
  await chrome.alarms.clear(`relock:${siteId}`);
}

async function unlockSite(siteId, unlockDurationMinutes) {
  await chrome.alarms.clear(`relock:${siteId}`);
  if (unlockDurationMinutes > 0) {
    const expiresAt = Date.now() + unlockDurationMinutes * 60000;
    await setUnlocked(siteId, expiresAt);
    await chrome.alarms.create(`relock:${siteId}`, { when: expiresAt });
  } else {
    // 0 ("ask every time") relies on the blur handler below to relock;
    // -1 ("until browser restart") relies on session storage being wiped on restart.
    await setUnlocked(siteId, null);
  }
}

async function getPendingReturn(tabId) {
  const { pendingReturn = {} } = await chrome.storage.session.get('pendingReturn');
  return pendingReturn[tabId] || null;
}

async function setPendingReturn(tabId, data) {
  const { pendingReturn = {} } = await chrome.storage.session.get('pendingReturn');
  pendingReturn[tabId] = data;
  await chrome.storage.session.set({ pendingReturn });
}

async function clearPendingReturn(tabId) {
  const { pendingReturn = {} } = await chrome.storage.session.get('pendingReturn');
  delete pendingReturn[tabId];
  await chrome.storage.session.set({ pendingReturn });
}

async function getActiveTabMap() {
  const { activeTabByWindow = {} } = await chrome.storage.session.get('activeTabByWindow');
  return activeTabByWindow;
}

async function setActiveTabMap(map) {
  await chrome.storage.session.set({ activeTabByWindow: map });
}

// ---------- core guard ----------

async function sendTabToLock(tabId, url, site, hostname) {
  await setPendingReturn(tabId, { url, siteId: site.id, hostname });
  try {
    await chrome.tabs.update(tabId, { url: LOCK_URL });
  } catch {
    // Tab may have been closed already.
  }
}

async function guardTab(tabId, url) {
  if (!url || url.startsWith(LOCK_URL)) return;
  const hostname = extractHostname(url);
  if (!hostname) return;

  const { lockedSites, passwordHash } = await getLocal();
  if (!passwordHash) return; // Not configured yet — nothing to lock.

  const site = findMatchingSite(hostname, lockedSites);
  if (!site) return;

  if (await isSiteUnlocked(site.id)) return;

  const pending = await getPendingReturn(tabId);
  if (pending && pending.siteId === site.id && pending.url === url) return; // Already headed to the lock screen for this.

  await sendTabToLock(tabId, url, site, hostname);
}

async function handleTabBecameInactive(tabId) {
  const { lockedSites, settings } = await getLocal();
  if (settings.unlockDurationMinutes !== 0) return; // Only "ask every time" mode relocks on blur.

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }
  const hostname = extractHostname(tab.url);
  const site = findMatchingSite(hostname, lockedSites);
  if (!site) return;
  if (!(await isSiteUnlocked(site.id))) return;

  await clearUnlock(site.id);
  await sendTabToLock(tabId, tab.url, site, hostname);
}

async function guardAllOpenTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id !== undefined && tab.url) {
      await guardTab(tab.id, tab.url);
    }
  }
}

// ---------- event wiring ----------

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  guardTab(details.tabId, details.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const map = await getActiveTabMap();
  const prevTabId = map[windowId];
  map[windowId] = tabId;
  await setActiveTabMap(map);

  if (prevTabId && prevTabId !== tabId) {
    await handleTabBecameInactive(prevTabId);
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    await guardTab(tabId, tab.url);
  } catch {
    // Tab may already be gone.
  }
});

let lastFocusedWindowId = chrome.windows.WINDOW_ID_NONE;

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Chrome itself lost OS focus (e.g. user switched to another app) — relock
    // whatever tab was active in the window we last had focus in.
    if (lastFocusedWindowId !== chrome.windows.WINDOW_ID_NONE) {
      const map = await getActiveTabMap();
      const tabId = map[lastFocusedWindowId];
      if (tabId) await handleTabBecameInactive(tabId);
    }
    return;
  }

  lastFocusedWindowId = windowId;
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab) await guardTab(tab.id, tab.url);
  } catch {
    // Ignore — window may be closing.
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith('relock:')) return;
  const siteId = alarm.name.slice('relock:'.length);
  await clearUnlock(siteId);

  const { lockedSites } = await getLocal();
  const site = lockedSites.find((s) => s.id === siteId);
  if (!site) return;

  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const hostname = extractHostname(tab.url);
    if (hostname && hostnameMatchesPattern(hostname, site.pattern)) {
      await sendTabToLock(tab.id, tab.url, site, hostname);
    }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const { settings } = await getLocal();
  if (settings.lockOnStartup) {
    await chrome.storage.session.set({ unlockedSites: {}, pendingReturn: {}, activeTabByWindow: {} });
  }
  await guardAllOpenTabs();
});

chrome.runtime.onInstalled.addListener(async () => {
  await guardAllOpenTabs();
});

// ---------- messages from lock.html / options.html / popup.html ----------

async function attemptUnlock(tabId, password) {
  const pending = await getPendingReturn(tabId);
  if (!pending) return { success: false, error: 'Nothing to unlock.' };

  const { failedAttempts = {} } = await chrome.storage.session.get('failedAttempts');
  const record = failedAttempts[pending.siteId];
  if (record && record.count >= MAX_ATTEMPTS && Date.now() - record.lastAttempt < LOCKOUT_MS) {
    const waitSec = Math.ceil((LOCKOUT_MS - (Date.now() - record.lastAttempt)) / 1000);
    return { success: false, error: `Too many attempts. Try again in ${waitSec}s.` };
  }

  const { passwordHash, settings } = await getLocal();
  const ok = await verifyPassword(password, passwordHash);

  if (!ok) {
    const stillWithinWindow = record && Date.now() - record.lastAttempt < LOCKOUT_MS;
    failedAttempts[pending.siteId] = {
      count: stillWithinWindow ? record.count + 1 : 1,
      lastAttempt: Date.now(),
    };
    await chrome.storage.session.set({ failedAttempts });
    return { success: false, error: 'Incorrect password.' };
  }

  delete failedAttempts[pending.siteId];
  await chrome.storage.session.set({ failedAttempts });

  await unlockSite(pending.siteId, settings.unlockDurationMinutes);
  await clearPendingReturn(tabId);
  try {
    await chrome.tabs.update(tabId, { url: pending.url });
  } catch {
    // Tab may have been closed while typing the password.
  }
  return { success: true };
}

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'getLockContext': {
      const tabId = sender.tab && sender.tab.id;
      const pending = tabId !== undefined ? await getPendingReturn(tabId) : null;
      return { hostname: pending ? pending.hostname : null };
    }
    case 'attemptUnlock': {
      const tabId = sender.tab && sender.tab.id;
      if (tabId === undefined) return { success: false, error: 'No tab context.' };
      return attemptUnlock(tabId, message.password);
    }
    case 'hasPassword': {
      const { passwordHash } = await getLocal();
      return { hasPassword: !!passwordHash };
    }
    case 'setPassword': {
      const { passwordHash } = await getLocal();
      if (passwordHash) return { success: false, error: 'A password is already set.' };
      if (!message.password || message.password.length < 4) {
        return { success: false, error: 'Password must be at least 4 characters.' };
      }
      const record = await createPasswordRecord(message.password);
      await setLocal({ passwordHash: record });
      return { success: true };
    }
    case 'changePassword': {
      const { passwordHash } = await getLocal();
      if (!passwordHash) return { success: false, error: 'No password set yet.' };
      const ok = await verifyPassword(message.currentPassword, passwordHash);
      if (!ok) return { success: false, error: 'Current password is incorrect.' };
      if (!message.newPassword || message.newPassword.length < 4) {
        return { success: false, error: 'New password must be at least 4 characters.' };
      }
      const record = await createPasswordRecord(message.newPassword);
      await setLocal({ passwordHash: record });
      return { success: true };
    }
    case 'getSites': {
      const { lockedSites } = await getLocal();
      return { sites: lockedSites };
    }
    case 'addSite': {
      const pattern = (message.pattern || '').trim().toLowerCase();
      if (!pattern) return { success: false, error: 'Enter a domain.' };
      const { lockedSites } = await getLocal();
      if (lockedSites.some((s) => s.pattern === pattern)) {
        return { success: false, error: 'That site is already locked.' };
      }
      const site = { id: crypto.randomUUID(), pattern, addedAt: Date.now() };
      await setLocal({ lockedSites: [...lockedSites, site] });
      await guardAllOpenTabs();
      return { success: true, site };
    }
    case 'removeSite': {
      const { lockedSites } = await getLocal();
      await setLocal({ lockedSites: lockedSites.filter((s) => s.id !== message.id) });
      await clearUnlock(message.id);
      return { success: true };
    }
    case 'getSettings': {
      const { settings } = await getLocal();
      return { settings };
    }
    case 'updateSettings': {
      const { settings } = await getLocal();
      const updated = { ...settings, ...message.settings };
      await setLocal({ settings: updated });
      return { success: true, settings: updated };
    }
    case 'getCurrentTabStatus': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) return { hostname: null };
      const hostname = extractHostname(tab.url);
      const { lockedSites, passwordHash } = await getLocal();
      const site = findMatchingSite(hostname, lockedSites);
      return {
        hostname,
        hasPassword: !!passwordHash,
        isLocked: !!site,
      };
    }
    case 'lockNow': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) return { success: false, error: 'No active tab.' };
      const hostname = extractHostname(tab.url);
      const { lockedSites } = await getLocal();
      const site = findMatchingSite(hostname, lockedSites);
      if (!site) return { success: false, error: 'This site is not locked.' };
      await clearUnlock(site.id);
      await sendTabToLock(tab.id, tab.url, site, hostname);
      return { success: true };
    }
    default:
      return { success: false, error: 'Unknown message type.' };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ success: false, error: err.message }));
  return true; // Keep the message channel open for the async response.
});
