#!/bin/bash
# Persona Draft — repo reorganization script
# Run this ONCE from the root of your cloned repo:
#   bash reorganize.sh

set -e  # stop on any error

echo ">> Creating new folder structure..."
mkdir -p docs
mkdir -p src/js
mkdir -p database
mkdir -p assets

echo ">> Moving frontend files to /src..."
[ -f index.html ] && mv index.html src/
[ -f script.js ]  && mv script.js  src/
[ -f style.css ]  && mv style.css  src/

echo ">> Moving database folder..."
# Already exists — just confirm it's in place
[ -d database ] && echo "   /database already present, skipping."

echo ">> Renaming attached_assets to /assets..."
if [ -d attached_assets ]; then
  cp -r attached_assets/. assets/
  rm -rf attached_assets
  echo "   Done."
else
  echo "   attached_assets not found, skipping."
fi

echo ">> Copying .gitignore into root..."
# Assumes you downloaded .gitignore from Claude into this folder
[ -f .gitignore ] && echo "   .gitignore already present." || echo "   Place the .gitignore file in the root manually."

echo ">> Removing Replit-specific files..."
rm -f .replit replit.nix
rm -rf .config .local .agents .upm

echo ">> Creating placeholder docs..."
if [ ! -f docs/MASTER.md ]; then
cat > docs/MASTER.md << 'EOF'
# Persona Draft — Master Context

Paste your Gemini handoff document here.
This file is injected into Claude Code at the start of every session.
EOF
fi

if [ ! -f docs/CHANGELOG.md ]; then
cat > docs/CHANGELOG.md << 'EOF'
# Changelog

## [Unreleased]
- Repo migrated from Replit to local dev + GitHub
- Switched AI engine from Gemini to Claude API
EOF
fi

if [ ! -f README.md ]; then
cat > README.md << 'EOF'
# Persona Draft — Identity Collapse Engine

A behavioral rehearsal tool for high-stakes social and professional interactions.

## Setup
1. Clone the repo
2. Add a `.env` file with your `CLAUDE_API_KEY`
3. Open `src/index.html` via a local server (VS Code Live Server or `npx serve src`)

## Structure
- `/src` — frontend (HTML, CSS, JS)
- `/database/personas` — paired .md + .json persona files
- `/assets` — images, fonts, sounds
- `/docs` — PRD, MASTER.md context, changelog
EOF
fi

echo ""
echo "=============================="
echo "  Reorganization complete!"
echo "=============================="
echo ""
echo "Next steps:"
echo "  1. Copy .gitignore (downloaded from Claude) into the repo root"
echo "  2. Paste your Gemini handoff doc into docs/MASTER.md"
echo "  3. Update the fetch paths in src/script.js:"
echo "     OLD: /database/personas/"
echo "     NEW: ../database/personas/  (since script.js now lives in /src)"
echo "  4. git add -A && git commit -m 'chore: reorganize repo structure'"
echo "  5. git push"
echo ""
echo "  On your MacBook: git pull — and you're in sync."
