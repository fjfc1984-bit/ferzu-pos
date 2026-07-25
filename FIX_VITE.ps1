# Repara vite reinstalando solo ese paquete
$ferzu = "C:\Users\fjfc1\Downloads\ferzu-pos"
Set-Location $ferzu

Write-Host "Reparando vite..." -ForegroundColor Cyan

# Borrar solo el paquete vite (no todo node_modules)
$viteDir = Join-Path $ferzu "node_modules\vite"
if (Test-Path $viteDir) {
    Write-Host "Borrando node_modules\vite..." -ForegroundColor Yellow
    cmd /c "rd /s /q `"$viteDir`""
}
$viteplugin = Join-Path $ferzu "node_modules\@vitejs"
if (Test-Path $viteplugin) {
    cmd /c "rd /s /q `"$viteplugin`""
}
$rollup = Join-Path $ferzu "node_modules\rollup"
if (Test-Path $rollup) {
    cmd /c "rd /s /q `"$rollup`""
}

Write-Host "Reinstalando vite + rollup..." -ForegroundColor Yellow
& npm install vite @vitejs/plugin-react rollup --save-dev

Write-Host "Listo! Inicia el servidor con: npm run dev" -ForegroundColor Green
Write-Host "URL: http://localhost:5173" -ForegroundColor White
Read-Host "Presiona Enter para iniciar"

# Iniciar frontend
Start-Process cmd -ArgumentList "/k", "cd /d `"$ferzu`" && npm run dev" -WindowStyle Normal
Start-Sleep -Seconds 5
Start-Process "http://localhost:5173"
