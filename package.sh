#!/bin/bash

# Packaging script for Chrome Web Store upload.
# Creates {extension-name}-v{version}.zip from the extension files, excluding
# dev/meta/store files. Extension name + version are read from manifest.json.

set -e

VERSION=$(grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4)
NAME=$(grep -o '"name": "[^"]*"' manifest.json | cut -d'"' -f4 | tr ' ' '-' | tr '[:upper:]' '[:lower:]')
ZIP_NAME="${NAME}-v${VERSION}.zip"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Packaging ${NAME} v${VERSION}...${NC}"

[ -f "$ZIP_NAME" ] && rm "$ZIP_NAME"

# Zip the whole extension dir, excluding dev/meta/store/doc files.
zip -r "$ZIP_NAME" . \
    -x "*.DS_Store" ".git/*" "_metadata/*" "store/*" \
       "package.sh" "README.md" "SCAFFOLD.md" "PRIVACY_POLICY.md" "chrome-submission.md" \
       ".gitignore" "*.zip" "*.md"

echo -e "${GREEN}Package created: ${ZIP_NAME}${NC}"
echo -e "${BLUE}Upload at: https://chrome.google.com/webstore/devconsole${NC}"
