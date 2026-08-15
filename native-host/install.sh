#!/bin/bash

# Installs the Tab Lock Touch ID native messaging host.
#
# Chrome extensions can't call macOS's LocalAuthentication (Touch ID) API
# directly — this registers a small local helper (tab-lock-touchid.swift)
# that Chrome is allowed to launch via Native Messaging, scoped to this one
# extension via its ID.
#
# Usage: ./install.sh <chrome-extension-id>
# Find the extension ID at chrome://extensions after loading Tab Lock unpacked
# (Developer mode > Load unpacked). It stays fixed as long as the extension
# is loaded from this same directory.

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <chrome-extension-id>"
  echo "Find the extension ID at chrome://extensions after loading Tab Lock unpacked."
  exit 1
fi

if ! command -v swift >/dev/null 2>&1; then
  echo "Swift is required (install Xcode Command Line Tools: xcode-select --install)."
  exit 1
fi

EXTENSION_ID="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_PATH="$SCRIPT_DIR/tab-lock-touchid.swift"
HOST_NAME="com.anshprat.tablock.touchid"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_PATH="$MANIFEST_DIR/$HOST_NAME.json"

chmod +x "$HELPER_PATH"
mkdir -p "$MANIFEST_DIR"

cat > "$MANIFEST_PATH" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Tab Lock Touch ID helper",
  "path": "$HELPER_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
EOF

echo "Installed native messaging host manifest at:"
echo "  $MANIFEST_PATH"
echo "Helper script:"
echo "  $HELPER_PATH"
echo
echo "Reload the Tab Lock extension, then look for 'Unlock with Touch ID' on the lock screen."
