#!/usr/bin/env bash
# Rebuilds the static export and force-pushes ./out/ to the gh-pages branch.
set -euo pipefail
cd "$(dirname "$0")"

npm run build
touch out/.nojekyll

TMP=$(mktemp -d)
cp -r out/. "$TMP/"
cd "$TMP"
git init -b gh-pages -q
git add -A
git -c user.name="awaissattar763-ctrl" \
    -c user.email="awaissattar763-ctrl@users.noreply.github.com" \
    commit -qm "Deploy SwiftPOS demo $(date -u +%Y-%m-%d)"
git remote add origin https://github.com/awaissattar763-ctrl/swiftpos.git
git push -f origin gh-pages -q
cd /
rm -rf "$TMP"
echo "Deployed to https://awaissattar763-ctrl.github.io/swiftpos/"
