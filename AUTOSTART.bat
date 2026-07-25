@echo off
title FERZU POS — Configurar Inicio Automatico
color 0A
cls

echo.
echo  ==========================================
echo   FERZU POS — Inicio Automatico con Windows
echo  ==========================================
echo.

:: Ruta de la carpeta Inicio de Windows
set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SCRIPT=%~dp0INICIAR.bat
set SHORTCUT=%STARTUP%\FERZU POS.lnk

:: Crear acceso directo usando PowerShell
echo Registrando FERZU POS en el inicio de Windows...
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $s = $ws.CreateShortcut('%SHORTCUT%'); ^
   $s.TargetPath = '%SCRIPT%'; ^
   $s.WorkingDirectory = '%~dp0'; ^
   $s.WindowStyle = 1; ^
   $s.Description = 'FERZU POS - Arranque automatico'; ^
   $s.Save()"

if exist "%SHORTCUT%" (
    echo.
    echo  [OK] FERZU POS se iniciara automaticamente al encender Windows.
    echo.
    echo  Acceso directo creado en:
    echo  %SHORTCUT%
    echo.
    echo  Para desactivar el inicio automatico, borra ese archivo.
) else (
    echo.
    echo  [ERROR] No se pudo crear el acceso directo.
    echo  Crea manualmente un acceso directo a INICIAR.bat
    echo  en la carpeta: %STARTUP%
)

echo.
pause
