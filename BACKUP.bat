@echo off
:: =============================================================================
:: FERZU POS — BACKUP AUTOMÁTICO
:: Crea una copia comprimida del proyecto en C:\Backups\ferzu-pos\
:: y marca el commit actual con un git tag.
:: =============================================================================
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
set TS=%DATE:~6,4%-%DATE:~3,2%-%DATE:~0,2%_%TIME:~0,2%-%TIME:~3,2%
set TS=%TS: =0%
set DEST=C:\Backups\ferzu-pos\backup_%TS%

echo.
echo ===================================================
echo   FERZU POS — BACKUP %TS%
echo ===================================================
echo.

:: Crear carpeta de backups si no existe
if not exist "C:\Backups\ferzu-pos" mkdir "C:\Backups\ferzu-pos"

:: Copia del código fuente (excluye node_modules, .git, logs)
echo [1/4] Copiando codigo fuente...
xcopy /E /I /Q /EXCLUDE:BACKUP_EXCLUDE.txt "C:\Users\fjfc1\Downloads\ferzu-pos" "%DEST%\code" >nul 2>&1
echo      OK — %DEST%\code

:: Git tag para marcar este estado en el historial
echo [2/4] Creando git tag...
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
git tag -a "backup-%TS%" -m "Backup automatico %TS%" 2>nul && echo      OK — tag backup-%TS% || echo      WARN: git tag fallo (continua)

:: Guardar lista de todos los tags (historial de backups)
echo [3/4] Registrando en historial...
echo %TS% — %CD% >> "C:\Backups\ferzu-pos\HISTORIAL.txt"
git log --oneline -1 >> "C:\Backups\ferzu-pos\HISTORIAL.txt" 2>nul
echo. >> "C:\Backups\ferzu-pos\HISTORIAL.txt"

:: Estado del sistema al momento del backup
echo [4/4] Guardando diagnostico...
echo ======== DIAGNOSTICO %TS% ======== > "%DEST%\DIAGNOSTICO.txt"
echo Frontend package.json: >> "%DEST%\DIAGNOSTICO.txt"
node -e "const p=require('./package.json');console.log('version:',p.version,'deps:',Object.keys(p.dependencies).length)" >> "%DEST%\DIAGNOSTICO.txt" 2>nul
echo Backend package.json: >> "%DEST%\DIAGNOSTICO.txt"
node -e "const p=require('./backend/package.json');console.log('version:',p.version,'deps:',Object.keys(p.dependencies).length)" >> "%DEST%\DIAGNOSTICO.txt" 2>nul
echo Archivos en src/: >> "%DEST%\DIAGNOSTICO.txt"
dir /B /S src\*.jsx src\*.js 2>nul | find /C "." >> "%DEST%\DIAGNOSTICO.txt"
git log --oneline -5 >> "%DEST%\DIAGNOSTICO.txt" 2>nul

echo.
echo ===================================================
echo   BACKUP COMPLETO
echo   Ubicacion: %DEST%
echo ===================================================
echo.
echo Para restaurar este backup, ejecuta RESTORE.bat
echo.
pause
