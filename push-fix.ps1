Set-Location "C:\Users\fjfc1\Downloads\ferzu-pos"
git checkout main
git merge fix/client-errors-aug2026 --no-ff -m "fix: errores criticos cliente - customers INSERT RLS"
git push origin main
Write-Host "LISTO - push completado" -ForegroundColor Green
Read-Host "Presiona Enter para cerrar"
