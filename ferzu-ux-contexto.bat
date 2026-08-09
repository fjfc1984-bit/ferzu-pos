@echo off
title FERZU POS — UX: NicheContextBar global en AppShell
color 0A
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul
git add -A
git commit -m "ux: NicheContextBar global en AppShell — contexto visible en todos los modulos"
git push origin main
if %ERRORLEVEL% EQU 0 (
    echo.
    echo  OK! Vercel redesplegando en ~1 min
    echo.
    echo  CAMBIOS:
    echo  - NicheContextBar ahora es route-aware (detecta moduleLabel por pathname)
    echo  - Integrado en AppShell: aparece en Dashboard, Inventario, Clientes,
    echo    Barberia, Taller, Analitica, Retencion, Reportes, Alertas, etc.
    echo  - Removido de BarbershopPage y WorkshopPage (evita duplicado)
    echo  - Si no hay sucursal activa: no se muestra (return null)
) else (
    echo  ERROR al hacer push
)
pause
