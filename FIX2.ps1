$ferzu = "C:\Users\fjfc1\Downloads\ferzu-pos"

# 1. Matar todos los procesos node (libera locks de archivos)
Write-Host "Matando procesos node..." -ForegroundColor Yellow
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 2. Borrar vite, rollup y @vitejs con rd (mas agresivo que Remove-Item)
Write-Host "Borrando paquetes corruptos..." -ForegroundColor Yellow
$pkgs = @("vite","rollup","@vitejs","@rollup")
foreach ($pkg in $pkgs) {
    $p = Join-Path $ferzu "node_modules\$pkg"
    if (Test-Path $p) {
        cmd /c "rd /s /q `"$p`"" 2>$null
        Write-Host "  Borrado: $pkg" -ForegroundColor Green
    }
}

# 3. Reinstalar solo esos paquetes
Write-Host "Reinstalando vite + rollup..." -ForegroundColor Yellow
Set-Location $ferzu
& npm install --save-dev vite @vitejs/plugin-react rollup

# 4. Iniciar frontend en nueva ventana CMD visible
Write-Host "Iniciando frontend..." -ForegroundColor Cyan
$cmd = "cd /d `"$ferzu`" && npm run dev"
Start-Process "cmd.exe" -ArgumentList "/c", "start `"FERZU Frontend`" cmd.exe /k `"$cmd`"" -WindowStyle Normal

Start-Sleep -Seconds 6
Start-Process "http://localhost:5173"

Write-Host "OK - http://localhost:5173" -ForegroundColor Green
