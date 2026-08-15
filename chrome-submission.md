# Chrome Web Store Submission Guide

Answers for the Privacy practices tab when publishing.

## Single Purpose Description

> Let the user password-protect specific websites so they are blocked behind a lock screen whenever loaded or switched to, until the correct password is entered.

## Permission Justifications

### storage

> Required to store the user's locked-site list, password hash, and preferences locally, and to track which sites are currently unlocked for the session.

### tabs

> Required to read the URL of the active/navigating tab to determine whether it matches a user-configured locked site, and to redirect that tab to or from the extension's own lock screen page.

### webNavigation

> Required to intercept navigation to a locked site before the destination page renders, so the lock screen is shown first instead of the real page content.

### alarms

> Required to automatically re-lock a site once a user-configured timed unlock period has elapsed.

### nativeMessaging

> Used only when the user opts in by installing the extension's optional local Touch ID helper (a native messaging host the user installs themselves via a script in the repo). Lets the extension ask that local helper whether the device owner can be verified biometrically, receiving only a success/failure result — the helper never receives the user's password or locked-site list.

### Host Permission: `<all_urls>`

> The user can choose to lock any website, so the extension needs to be able to check the hostname of any tab against the user's locked-site list. It does not read, modify, or transmit page content — only the tab's URL is inspected.

### Remote Code

> This extension does not use any remote code. All JavaScript is bundled locally in the extension package. No scripts are fetched from external servers, no dynamic code execution is used, and no code is injected from remote sources.

## Data Usage Certification

This extension:
- Does NOT collect, transmit, or sell user data
- Does NOT use analytics, telemetry, or tracking
- Does NOT communicate with any external server or third-party service
- Stores all data (locked-site list, password hash, settings) locally on the user's device only
- All code executes locally within the browser

The extension complies with the Chrome Web Store Developer Program Policies regarding data handling and user privacy.
