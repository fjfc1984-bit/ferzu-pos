@echo off
title FERZU POS — Fix Build Error
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
git add src/pages/AlertsPage.jsx src/pages/RetentionPage.jsx
git commit -m "fix(build): import api como named export en AlertsPage y RetentionPage"
git push origin main
if %ERRORLEVEL% EQU 0 (
    echo.
    echo  OK! Fix subido — Vercel reintentara el build en ~1 min
) else (
    echo  ERROR — revisa arriba
)
pause
