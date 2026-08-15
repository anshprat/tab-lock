# Tab Lock

Chrome extension that locks chosen websites behind a password — whether you're
loading the site fresh in a tab, or switching to a tab that's already open.

## Features

- Password-protect any site by domain (`example.com` locks all subdomains too; `mail.example.com` locks just that one)
- Blocks the page before it renders when a locked site loads in a tab
- Re-locks the instant you switch away from a locked tab, so switching back always asks again (configurable)
- Optional grace period (5 min / 15 min / 1 hour / until browser restart) instead of relocking on every switch
- Everything re-locks on browser restart by default
- Password is never stored in plaintext — only a salted PBKDF2 hash lives in `chrome.storage.local`
- Basic brute-force throttling on the lock screen (backs off after repeated wrong guesses)
- Optional Touch ID unlock on macOS, via a small local native helper (see below)

## Installation (Development)

1. Clone this repository
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select this extension's directory

## Usage

1. Click the Tab Lock icon and choose **Lock this site** (or add a domain from the extension's **Options** page)
2. The first time, you'll be asked to set a password
3. Whenever you load or switch to a locked site, you'll be asked for the password before the page is shown
4. Configure how long an unlock should last from the Options page — the default asks again the instant you switch away

## Touch ID unlock (macOS only)

Chrome extensions can't call macOS's biometric APIs directly, so this ships a
tiny native helper (`native-host/tab-lock-touchid.swift`) that the extension
talks to over Chrome's [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
API. The helper only asks macOS "is this the device owner, verified via Touch
ID?" and reports back success/failure — it never sees your password or
locked-site list.

To set it up:

1. Load the extension unpacked (see Installation above) and open `chrome://extensions`
2. Copy Tab Lock's extension ID (stays fixed as long as it's loaded from this same folder)
3. Run:
   ```bash
   cd native-host
   ./install.sh <extension-id>
   ```
4. Reload the extension. The lock screen will now show an "Unlock with Touch ID" option whenever the helper reports Touch ID is available.

Requires [Swift](https://www.swift.org/) (ships with Xcode Command Line Tools: `xcode-select --install`). A successful Touch ID unlock is treated exactly like a correct password — the same "stay unlocked" setting applies afterward.

## How locking works

- **Fresh loads:** caught via `webNavigation.onBeforeNavigate` and redirected to the lock screen before the real page loads.
- **Switching tabs:** caught via `tabs.onActivated` / `windows.onFocusChanged`. In the default "ask every time" mode, a locked tab is swapped to the lock screen the instant it loses focus — so there's nothing to see when you switch back to it.

## Limitations

This is a browser-level deterrent, not a security boundary. Anyone with access to your Chrome profile can disable or remove the extension from `chrome://extensions`, or open DevTools. It's meant to stop casual snooping (someone picking up your laptop while you're away), not a technically motivated attacker with full access to your machine.

There's no password recovery — if you forget it, remove the extension's stored data via `chrome://extensions` → Tab Lock → *Clear data* (or remove and reinstall the extension) and set a new one.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Store the locked-site list, password hash, and settings locally |
| `tabs` | Read tab URLs to detect locked sites, and redirect tabs to/from the lock screen |
| `webNavigation` | Catch navigations to a locked site before the page renders |
| `alarms` | Schedule automatic relocking when a timed unlock period expires |
| `nativeMessaging` | Talk to the optional local Touch ID helper (see above) — unused unless you install it |
| `<all_urls>` (host permission) | Needed to check the hostname of any tab against your locked-site list — the extension doesn't know in advance which sites you'll choose to lock |

## Privacy

This extension does not collect, store, or transmit any data outside your browser. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for details.

## Packaging

```bash
chmod +x package.sh
./package.sh
```

This creates a zip file ready for Chrome Web Store upload.
