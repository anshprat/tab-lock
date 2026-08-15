# Privacy Policy for Tab Lock

**Last Updated:** 2026-08-15

## Overview

Tab Lock is a Chrome extension that lets you password-protect specific websites so they're blocked behind a lock screen when loaded or switched to. This privacy policy explains our data practices and commitment to user privacy.

## Data Collection and Usage

**We do not collect, store, or transmit any user data to any server.**

This extension:
- Does NOT collect any personal information
- Does NOT track user behavior or browsing history
- Does NOT use analytics or telemetry services
- Does NOT communicate with any external server

All data the extension creates — your list of locked domains, your password (as a salted PBKDF2 hash, never in plaintext), and your settings — is stored locally in Chrome's `chrome.storage.local` and `chrome.storage.session`, on your device only, and is never transmitted anywhere.

## Permissions

### storage

> Used to store your locked-site list, password hash, and preferences locally in the browser. Also used for session-only state (which sites are currently unlocked) that clears when the browser closes.

### tabs

> Used to read the URL of the active or navigating tab so the extension can tell whether it matches a site you've chosen to lock, and to redirect that tab to or from the lock screen.

### webNavigation

> Used to detect a navigation to a locked site before the page finishes loading, so the lock screen can be shown instead of letting the page render first.

### alarms

> Used to automatically re-lock a site once a timed unlock period (e.g. "stay unlocked for 15 minutes") that you configured has expired.

### Host Permissions: `<all_urls>`

> Required to check the hostname of any tab against your locked-site list. Because you can choose to lock any website, the extension needs the ability to inspect the URL of any tab — it does not fetch, read, or transmit the content of any page.

## What the Extension Does

The extension performs only the following operations, entirely on your device:
1. Watches for tab navigations and tab/window focus changes
2. Compares the hostname of the tab against the list of domains you've chosen to lock
3. If it matches and isn't currently unlocked, redirects that tab to a local lock screen bundled with the extension
4. Verifies the password you type against a locally stored salted PBKDF2 hash
5. On success, redirects the tab back to the original page

## Third-Party Services

None. This extension does not communicate with any third-party service, API, or server.

## Data Security

Your password is never stored in plaintext. Only a PBKDF2 hash (150,000 iterations, SHA-256, random 16-byte salt) is kept in local browser storage. There is no password recovery mechanism and no way to extract the original password from the stored hash.

## Children's Privacy

This extension does not knowingly collect information from children under 13 years of age (it does not collect information from anyone).

## Changes to This Privacy Policy

We may update this privacy policy from time to time. Any changes will be reflected in the "Last Updated" date at the top of this document.

## Contact Information

If you have any questions about this privacy policy, please open an issue on the GitHub repository:
https://github.com/anshprat/tab-lock

## Compliance

This extension complies with:
- Chrome Web Store Developer Program Policies
- General Data Protection Regulation (GDPR)
- California Consumer Privacy Act (CCPA)

## Summary

In simple terms: this extension locks sites you choose behind a password you set. Everything — the site list, the password hash, and your settings — stays on your own device. Nothing is ever sent anywhere.
