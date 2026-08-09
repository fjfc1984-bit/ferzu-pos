@echo off
echo ========================================
echo  FERZU POS - Fix: /categories route order
echo ========================================
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git push origin main

IF %ERRORLEVEL% NEQ 0 (
    echo ERROR: Revisa el error arriba.
    pause
    exit /b 1
)

echo.
echo OK - Railway desplegara en ~2 min.
echo Despues, /api/products/categories devolvera categorias correctamente.
pause
