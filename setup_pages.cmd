@echo off
setlocal ENABLEDELAYEDEXPANSION

echo === Bingo Extractor - GitHub Pages bootstrap ===

REM 0) sanity: need node, npm, git
where node >NUL 2>&1 || (echo [ERROR] Node.js not found. Install Node 18+ and re-run. & exit /b 1)
where npm  >NUL 2>&1 || (echo [ERROR] npm not found. Install Node 18+ and re-run. & exit /b 1)
where git  >NUL 2>&1 || (echo [ERROR] git not found. Install Git and re-run. & exit /b 1)

REM 1) scaffold vite app if package.json is missing
if not exist package.json (
  echo [STEP] Scaffolding Vite + React in current folder...
  echo y | npx create-vite@latest . -- --template react || (echo [ERROR] create-vite failed & exit /b 1)
  echo [STEP] Installing dependencies...
  npm install || (echo [ERROR] npm install failed & exit /b 1)
) else (
  echo [SKIP] Found package.json — skipping scaffold.
)

REM 2) write vite.config.js with GH Pages base
echo [STEP] Writing vite.config.js...
node -e "require('fs').writeFileSync('vite.config.js', `
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Nebula-Bingo-Tracker/',
})
`)" || (echo [ERROR] could not write vite.config.js & exit /b 1)

REM 3) inject Tailwind CDN into index.html (idempotent)
if not exist index.html (echo [ERROR] index.html not found; did Vite scaffold succeed? & exit /b 1)
echo [STEP] Ensuring Tailwind CDN is in index.html...
node -e "const fs=require('fs');const f='index.html';let s=fs.readFileSync(f,'utf8');if(!/tailwindcss\\.com/.test(s)){s=s.replace('</head>','  <script src=\"https://cdn.tailwindcss.com\"></script>\n</head>');fs.writeFileSync(f,s);} else {console.log('Already present.')}"

REM 4) create GitHub Actions workflow
echo [STEP] Creating .github/workflows/pages.yml...
node -e "const fs=require('fs');fs.mkdirSync('.github/workflows',{recursive:true});fs.writeFileSync('.github/workflows/pages.yml', `
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: \"pages\"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: \"npm\"
      - run: npm ci || npm install
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`)" || (echo [ERROR] could not write workflow & exit /b 1)

REM 5) optional: build locally to sanity check
echo [STEP] Running local build...
npm run build || (echo [WARN] local build failed; continuing, Actions will show errors)

REM 6) commit + push
echo [STEP] Committing and pushing to main...
git add . || (echo [ERROR] git add failed & exit /b 1)
git commit -m "Bootstrap: Vite scaffold, Tailwind CDN, Vite base, GitHub Pages workflow" || echo [INFO] Nothing to commit.
git branch --show-current | findstr /I "main" >NUL || (echo [WARN] You are not on 'main'. Pushing to current branch.)
for /f "delims=" %%b in ('git branch --show-current') do set CURR=%%b
git push -u origin %CURR% || (echo [ERROR] git push failed & exit /b 1)

echo [DONE] Pushed to GitHub. GitHub Actions will build and deploy to Pages.
echo Open Pages settings to confirm Source=GitHub Actions (one-time).
start "" "https://github.com/IlyeanaPlus/Nebula-Bingo-Tracker/settings/pages"

echo When the workflow finishes, your site should be at:
echo   https://ilyeanaplus.github.io/Nebula-Bingo-Tracker/
start "" "https://github.com/IlyeanaPlus/Nebula-Bingo-Tracker/actions"

echo.
echo NOTE: This script does NOT overwrite src\App.jsx.
echo - If you haven't pasted the Bingo Extractor code yet, run:
echo     notepad src\App.jsx
echo   then paste the canvas code and save, and run:
echo     npm run build
echo     git add . && git commit -m "Add Bingo Extractor app" && git push
echo.
pause
