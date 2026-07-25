# FERZU POS - Setup limpio
# Ejecutar con: powershell -ExecutionPolicy Bypass -File SETUP.ps1

$ErrorActionPreference = "Continue"
$ferzu = "C:\Users\fjfc1\Downloads\ferzu-pos"

Write-Host ""
Write-Host "FERZU POS - Instalacion limpia" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Pausar OneDrive temporalmente
Write-Host "[0] Pausando OneDrive..." -ForegroundColor Yellow
Stop-Process -Name "OneDrive" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Borrar frontend node_modules
Write-Host "[1/4] Borrando node_modules del frontend..." -ForegroundColor Yellow
$nm = Join-Path $ferzu "node_modules"
if (Test-Path $nm) {
    Remove-Item -Path $nm -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "     OK" -ForegroundColor Green
}
$pl = Join-Path $ferzu "package-lock.json"
if (Test-Path $pl) { Remove-Item $pl -Force }

# Borrar backend node_modules
Write-Host "[2/4] Borrando node_modules del backend..." -ForegroundColor Yellow
$bnm = Join-Path $ferzu "backend\node_modules"
if (Test-Path $bnm) {
    Remove-Item -Path $bnm -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "     OK" -ForegroundColor Green
}
$bpl = Join-Path $ferzu "backend\package-lock.json"
if (Test-Path $bpl) { Remove-Item $bpl -Force }

# npm install frontend
Write-Host "[3/4] npm install frontend..." -ForegroundColor Yellow
Set-Location $ferzu
& npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install fallo en frontend" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}

# npm install backend
Write-Host "[4/4] npm install backend..." -ForegroundColor Yellow
Set-Location (Join-Path $ferzu "backend")
& npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: npm install fallo en backend" -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}

Write-Host ""
Write-Host "INSTALACION COMPLETA!" -ForegroundColor Green
Write-Host ""
Write-Host "Iniciando FERZU POS..." -ForegroundColor Cyan

# Iniciar backend
Start-Process cmd -ArgumentList '/k', "cd /d `"$ferzu\backend`" && node server.js" -WindowStyle Normal

# Esperar 2 segundos y iniciar frontend
Start-Sleep -Seconds 2
Start-Process cmd -ArgumentList '/k', "cd /d `"$ferzu`" && npm run dev" -WindowStyle Normal

# Abrir navegador
Start-Sleep -Seconds 6
Start-Process "http://localhost:5177"

Write-Host "Servidores iniciados!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5177" -ForegroundColor White
Write-Host "Backend:  http://localhost:3001" -ForegroundColor White
Read-Host "Presiona Enter para cerrar esta ventana"
