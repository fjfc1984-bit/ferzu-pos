# =============================================================================
# FERZU POS — Setup Git Flow (ejecutar UNA SOLA VEZ)
# Abre PowerShell en C:\Users\fjfc1\Downloads\ferzu-pos y ejecuta:
#   powershell -ExecutionPolicy Bypass -File setup-git-flow.ps1
# =============================================================================

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\fjfc1\Downloads\ferzu-pos"

Write-Host "`n[1/5] Limpiando index.lock si existe..." -ForegroundColor Cyan
if (Test-Path ".git\index.lock") {
    Remove-Item ".git\index.lock" -Force
    Write-Host "  index.lock eliminado." -ForegroundColor Yellow
} else {
    Write-Host "  OK (no hay lock)." -ForegroundColor Green
}

Write-Host "`n[2/5] Asegurando que estamos en main..." -ForegroundColor Cyan
git checkout main
git pull origin main

Write-Host "`n[3/5] Creando rama staging..." -ForegroundColor Cyan
$stagingExists = git branch --list "staging"
if ($stagingExists) {
    Write-Host "  La rama staging ya existe localmente." -ForegroundColor Yellow
    git checkout staging
} else {
    git checkout -b staging
}
git push origin staging
Write-Host "  staging creada y publicada en origin." -ForegroundColor Green

Write-Host "`n[4/5] Creando feature branch del refactor..." -ForegroundColor Cyan
git checkout -b "refactor/split-auth-screens"

Write-Host "`n[5/5] Commiteando refactor completo..." -ForegroundColor Cyan
git add -A
git status

$commitMsg = "refactor: split AuthScreens.jsx monolith into 8 isolated components

- Extract PINLockScreen into src/pages/auth/PINLockScreen.jsx
- Extract AuthContext/AuthProvider/useAuth into src/context/AuthContext.jsx
- Extract LoginPage into src/pages/auth/LoginPage.jsx
- Extract BranchSelector (+ RLS double-fallback fix) into src/pages/auth/BranchSelector.jsx
- Extract OnboardingWizard into src/pages/auth/OnboardingWizard.jsx
- Extract RegisterPage into src/pages/auth/RegisterPage.jsx
- Extract ForgotPasswordPage into src/pages/auth/ForgotPasswordPage.jsx
- Extract ResetPasswordPage into src/pages/auth/ResetPasswordPage.jsx
- Add src/pages/auth/index.js barrel file
- Convert AuthScreens.jsx to tombstone (re-exports for backward compat)
- Update App.jsx imports to point to individual component files
- Add SETUP_GIT_FLOW.md with Feature Branch -> PR -> Main workflow docs
- Update .gitignore to exclude push_*.bat/ps1 emergency scripts"

git commit -m $commitMsg
git push origin "refactor/split-auth-screens"

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "LISTO. Pasos manuales que quedan:" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "1. Abre GitHub -> ferzu-pos -> Pull Requests -> New Pull Request"
Write-Host "   base: staging  <-  compare: refactor/split-auth-screens"
Write-Host "   Titulo: 'refactor: split AuthScreens monolith + RLS BranchSelector fix'"
Write-Host ""
Write-Host "2. Revisa el diff, verifica que Vercel genera preview OK."
Write-Host ""
Write-Host "3. Settings -> Branches -> Add rule -> main:"
Write-Host "   [x] Require a pull request before merging"
Write-Host "   [x] Do not allow bypassing the above settings"
Write-Host ""
Write-Host "4. Cuando staging este estable -> PR staging -> main = deploy prod."
Write-Host ""
