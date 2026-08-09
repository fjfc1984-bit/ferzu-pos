@echo off
title FERZU - Health Fix
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo.
echo === [0] Limpiando locks ===
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock
echo OK

echo.
echo === [1] Estado actual ===
git status
echo.
echo === [2] Diff del archivo ===
git diff backend/routes/health.routes.js
echo.

echo === [3] git add ===
git add backend/routes/health.routes.js
if %ERRORLEVEL% NEQ 0 (echo ERROR en git add: %ERRORLEVEL%) else (echo OK)

echo.
echo === [4] git commit ===
git commit -m "fix: sync_chain health robusto — schema incompleto no causa critical"
echo ERRORLEVEL del commit: %ERRORLEVEL%

echo.
echo === [5] git push ===
git push origin main
echo ERRORLEVEL del push: %ERRORLEVEL%

echo.
echo === FIN — Lee los mensajes arriba ===
cmd /k
