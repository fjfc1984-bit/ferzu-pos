$ProjectRef = "laimnfckldpiovgbugyr"
$Dir = "C:\Users\fjfc1\Downloads\ferzu-pos"

Write-Host "`n🚀 FERZU POS — Migraciones Supabase`n" -ForegroundColor Cyan

$files = @("migration_variants.sql", "migration_courtesy.sql")
$names = @("F9-C: Variantes", "F10: Cortesias")
$allOk = $true

for ($i = 0; $i -lt $files.Length; $i++) {
    $f = Join-Path $Dir $files[$i]
    Write-Host "Ejecutando $($names[$i])... " -NoNewline
    $out = npx supabase db execute --project-ref $ProjectRef --file $f 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK" -ForegroundColor Green
    } else {
        Write-Host "REQUIERE MANUAL" -ForegroundColor Yellow
        $allOk = $false
    }
}

if (-not $allOk) {
    Write-Host "`nAbre este link y pega cada archivo SQL:`n"
    Write-Host "https://supabase.com/dashboard/project/$ProjectRef/sql/new" -ForegroundColor Cyan
    Write-Host "`nO corre:`n"
    Write-Host "  npx supabase login" -ForegroundColor White
    Write-Host "  npx supabase db execute --project-ref $ProjectRef --file migration_variants.sql" -ForegroundColor White
    Write-Host "  npx supabase db execute --project-ref $ProjectRef --file migration_courtesy.sql" -ForegroundColor White
}
