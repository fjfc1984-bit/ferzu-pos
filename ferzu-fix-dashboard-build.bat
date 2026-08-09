@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"  del /f /q ".git\HEAD.lock"

git add src/pages/DashboardPage.jsx

git commit -m "fix: remove duplicate cachedAt declaration in DashboardPage

DashboardPage declared cachedAt both as useState (line 133) and
as a destructured value from useDashboard hook (line 162).
This caused a build error: 'The symbol cachedAt has already been declared'.
Fixed by removing the redundant useState declaration — the hook
already provides cachedAt via its return value."

git push origin main

echo.
echo === Ultimos commits ===
git log --oneline -3
echo.
pause
