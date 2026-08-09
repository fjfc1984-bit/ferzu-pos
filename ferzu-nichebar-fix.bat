@echo off
title FERZU POS — Fix NicheContextBar Visual
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
git push origin main
if %ERRORLEVEL% EQU 0 (
    echo.
    echo  OK! NicheContextBar con inline styles — Vercel en ~1 min
) else (
    echo  ERROR
)
pause
