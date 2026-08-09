@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"  del /f /q ".git\HEAD.lock"

git add src/pages/AdminPage.jsx

git commit -m "fix: use named import for api in AdminPage

api.js exports api as a named export, not default.
Changed: import api from '../lib/api.js'
     to: import { api } from '../lib/api.js'"

git push origin main

echo.
echo === Ultimos commits ===
git log --oneline -4
echo.
pause
