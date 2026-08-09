@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"  del /f /q ".git\HEAD.lock"

git add backend/routes/loyalty.routes.js

git commit -m "fix: replace verifyToken with requireAuth in loyalty.routes.js

auth.js does not export verifyToken — it exports requireAuth.
loyalty.routes.js was crashing the backend on startup with:
SyntaxError: does not provide an export named 'verifyToken'"

git push origin main

echo.
echo === Ultimos commits ===
git log --oneline -5
echo.
pause
