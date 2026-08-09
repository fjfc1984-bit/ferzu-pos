@echo off
title FERZU POS — Fix crash realtime + reports routes
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
git add -A
git commit -m "fix: crash realtime channel + reports routes (discount_amount, branch_id, payments)"
git push origin main
if %ERRORLEVEL% EQU 0 (
    echo.
    echo  OK! Vercel + Railway redesplegando en ~2 min
    echo.
    echo  FIXES incluidos:
    echo  [CRASH] useAIProposals: canal realtime con nombre unico por instancia
    echo  [CRASH] ModuleGuard: mismo fix en canal plan:org
    echo  [CRASH] BarbershopPage: mismo fix en canal appointments:branch
    echo  [CRASH] WorkshopPage: mismo fix en canal workshop:branch
    echo  [CRASH] KitchenDisplayPage: mismo fix en canal kitchen:branch
    echo  [BACKEND] reports.routes: discount_amount / branch_id / payments join
) else (
    echo  ERROR al hacer push
)
pause
