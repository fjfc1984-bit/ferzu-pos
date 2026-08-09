@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"  del /f /q ".git\HEAD.lock"

git add src/pages/TablesPage.jsx src/pages/ShiftsPage.jsx

git commit -m "fix: correct default imports of api in TablesPage and ShiftsPage

api.js only has named exports (export const api = ...).
TablesPage.jsx and ShiftsPage.jsx were using default import syntax.
Fixed both to use named import: import { api } from '../lib/api'"

git push origin main

echo.
echo === Ultimos commits ===
git log --oneline -5
echo.
pause
