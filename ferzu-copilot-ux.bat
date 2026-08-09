@echo off
title FERZU - Co-Piloto UX/UI v2
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock  del /f .git\HEAD.lock

git add src/components/CopilotChat/CopilotChat.jsx

git commit -m "feat: Co-Piloto UX/UI v2 — confirmacion inline, tablas, action cards

CopilotChat.jsx:
  - Botones Confirmar/Cancelar inline cuando el Co-Piloto pide confirmacion
    (detecta patrones: '¿Confirmas la anulacion?', '¿Confirmas esta orden?')
  - Action cards verdes para operaciones exitosas (void, purchase_order)
  - Renderizado de tablas Markdown (pipe tables) como HTML con zebra striping
  - Lista numerada (1. 2. 3.) renderizada correctamente
  - Status 'Procesando...' en el header mientras la IA trabaja
  - Chips de sugerencias: agrega 'Anula la ultima venta' y 'Genera una orden'
  - Historial extendido a 8 mensajes (antes 6) para mejor contexto
  - Timeout extendido a 90s para operaciones complejas con tools"

git push origin main
echo ERRORLEVEL: %ERRORLEVEL%
if %ERRORLEVEL% EQU 0 (
  echo OK - Vercel desplegara en ~1 min
  echo.
  echo Cambios visibles:
  echo   - Cuando Co-Piloto pide confirmacion: aparecen botones verde/gris
  echo   - Al ejecutar una operacion: card verde con resultado
  echo   - Tablas del Co-Piloto: HTML real, no texto con pipes
  echo   - Header muestra "Procesando..." mientras trabaja
) else (
  echo ERROR - revisar arriba
)
cmd /k
