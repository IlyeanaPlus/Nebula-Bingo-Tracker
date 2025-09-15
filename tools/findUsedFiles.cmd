@echo off
setlocal
cd /d "%~dp0\.."
node ".\tools\findUsedFiles.mjs"
pause
