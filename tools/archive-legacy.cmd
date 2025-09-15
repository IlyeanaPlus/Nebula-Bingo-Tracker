@echo off
setlocal
cd /d "%~dp0\.."
node ".\tools\archiveLegacy.mjs" %*
pause
