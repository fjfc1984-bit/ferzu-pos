@echo off
chcp 65001 >nul
title FERZU POS — Panel de Control
color 0A

:MENU
cls
echo.
echo  ████████╗███████╗██████╗ ███████╗██╗   ██╗    ██████╗  ██████╗ ███████╗
echo  ██╔════╝██╔════╝██╔══██╗╚════██║██║   ██║    ██╔══██╗██╔═══██╗██╔════╝
echo  █████╗  █████╗  ██████╔╝    ██╔╝██║   ██║    ██████╔╝██║   ██║███████╗
echo  ██╔══╝  ██╔══╝  ██╔══██╗   ██╔╝ ██║   ██║    ██╔═══╝ ██║   ██║╚════██║
echo  ██║     ███████╗██║  ██║   ██║  ╚██████╔╝    ██║     ╚██████╔╝███████║
echo  ╚═╝     ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═════╝     ╚═╝      ╚═════╝ ╚══════╝
echo.
echo  ══════════════════════════════════════════════════════════════
echo   Panel de Control — FERZU POS
echo  ══════════════════════════════════════════════════════════════
echo.
echo   [1]  Instalar dependencias (primera vez)
echo   [2]  Iniciar desarrollo local
echo   [3]  Hacer commit y push a GitHub
echo   [4]  Verificar estado de produccion
echo   [5]  Limpiar locks de git (emergencia)
echo   [0]  Salir
echo.
set /p OPCION="  Elige una opcion: "

if "%OPCION%"=="1" goto INSTALAR
if "%OPCION%"=="2" goto INICIAR
if "%OPCION%"=="3" goto COMMIT
if "%OPCION%"=="4" goto STATUS
if "%OPCION%"=="5" goto FIX_GIT
if "%OPCION%"=="0" goto FIN
goto MENU

:: ─────────────────────────────────────────────
:INSTALAR
cls
echo.
echo  [FERZU] Instalando dependencias...
echo.
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
call npm install
cd backend
call npm install
cd ..
echo.
echo  [OK] Instalacion completada.
pause
goto MENU

:: ─────────────────────────────────────────────
:INICIAR
cls
echo.
echo  [FERZU] Iniciando servidores de desarrollo...
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3001
echo.
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
start "FERZU Backend" cmd /k "cd backend && node server.js"
timeout /t 2 >nul
start "FERZU Frontend" cmd /k "npm run dev"
timeout /t 3 >nul
start "" "http://localhost:5173"
echo  [OK] Servidores iniciados. Cerrando este menu...
timeout /t 2 >nul
goto MENU

:: ─────────────────────────────────────────────
:COMMIT
cls
echo.
set /p MENSAJE="  Mensaje del commit (Enter para 'update: cambios varios'): "
if "%MENSAJE%"=="" set MENSAJE=update: cambios varios
echo.
echo  [FERZU] Haciendo commit: %MENSAJE%
echo.
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
git add -A
git commit -m "%MENSAJE%"
git push origin main
echo.
echo  [OK] Push completado. Vercel desplegara en ~1 min, Railway en ~2 min.
pause
goto MENU

:: ─────────────────────────────────────────────
:STATUS
cls
echo.
echo  [FERZU] Verificando estado de produccion...
echo.
echo  Frontend (Vercel):
curl -s -o nul -w "  Status: %%{http_code} — https://ferzu-pos.vercel.app\n" https://ferzu-pos.vercel.app
echo.
echo  Backend (Railway):
curl -s https://ferzu-backend-production.up.railway.app/health
echo.
echo.
pause
goto MENU

:: ─────────────────────────────────────────────
:FIX_GIT
cls
echo.
echo  [FERZU] Eliminando locks de git...
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock (
    del /f .git\index.lock
    echo  [OK] index.lock eliminado.
) else (
    echo  [--] No habia index.lock.
)
if exist .git\HEAD.lock (
    del /f .git\HEAD.lock
    echo  [OK] HEAD.lock eliminado.
) else (
    echo  [--] No habia HEAD.lock.
)
echo.
echo  [OK] Git limpio. Ya puedes hacer commit.
pause
goto MENU

:: ─────────────────────────────────────────────
:FIN
echo.
echo  Hasta luego.
exit /b 0
