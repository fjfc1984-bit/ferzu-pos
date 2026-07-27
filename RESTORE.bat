@echo off
:: =============================================================================
:: FERZU POS — RESTAURAR DESDE BACKUP
:: Muestra los backups disponibles y restaura el seleccionado.
:: =============================================================================
echo.
echo ===================================================
echo   FERZU POS — RESTAURAR BACKUP
echo ===================================================
echo.

:: Mostrar historial
if exist "C:\Backups\ferzu-pos\HISTORIAL.txt" (
  echo Backups disponibles:
  echo.
  type "C:\Backups\ferzu-pos\HISTORIAL.txt"
  echo.
) else (
  echo No hay backups registrados. Ejecuta BACKUP.bat primero.
  pause
  exit /b
)

:: Mostrar carpetas de backup
echo Carpetas de backup en C:\Backups\ferzu-pos\:
dir /B /AD "C:\Backups\ferzu-pos\" 2>nul
echo.

set /p BACKUP_NAME="Escribe el nombre del backup (ej: backup_2024-01-15_10-30): "

if not exist "C:\Backups\ferzu-pos\%BACKUP_NAME%\code" (
  echo ERROR: No se encontro el backup "%BACKUP_NAME%"
  pause
  exit /b
)

echo.
echo ADVERTENCIA: Esto sobreescribira los archivos actuales del proyecto.
echo El backup se restaurara desde: C:\Backups\ferzu-pos\%BACKUP_NAME%\code
echo.
set /p CONFIRM="Confirmas? (escribe SI para continuar): "

if /i not "%CONFIRM%"=="SI" (
  echo Cancelado.
  pause
  exit /b
)

echo.
echo [1/3] Creando backup de seguridad del estado actual...
call BACKUP.bat >nul 2>&1
echo      OK

echo [2/3] Restaurando archivos...
xcopy /E /I /Y /Q "C:\Backups\ferzu-pos\%BACKUP_NAME%\code" "C:\Users\fjfc1\Downloads\ferzu-pos" >nul 2>&1
echo      OK

echo [3/3] Reinstalando dependencias...
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
call npm ci --silent 2>nul || npm install --silent 2>nul
cd backend
call npm ci --silent 2>nul || npm install --silent 2>nul
cd ..
echo      OK

echo.
echo ===================================================
echo   RESTAURACION COMPLETA
echo   El proyecto esta listo. Ejecuta INICIAR.bat
echo ===================================================
echo.
pause
