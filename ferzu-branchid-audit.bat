@echo off
title FERZU POS — Push branchId audit
color 0A
echo.
echo  ============================================================
echo   FERZU POS — Subiendo cambios branchId audit (5 paginas)
echo  ============================================================
echo.

cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

echo [1/3] Revisando estado del repo...
git status
echo.

echo [2/3] Haciendo commit...
git commit -m "refactor: replace localStorage branchId with usePOS() in 5 pages"
echo.

echo [3/3] Haciendo push a GitHub...
git push origin main
echo.

if %ERRORLEVEL% EQU 0 (
    color 0A
    echo  ============================================================
    echo   OK! Push exitoso.
    echo   Vercel desplegara en ~1 minuto.
    echo   https://ferzu-pos.vercel.app
    echo  ============================================================
) else (
    color 0C
    echo  ============================================================
    echo   ERROR en el push. Revisa el mensaje de arriba.
    echo  ============================================================
)

echo.
pause
