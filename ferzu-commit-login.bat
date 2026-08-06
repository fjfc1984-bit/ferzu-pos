@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"  del /f /q ".git\HEAD.lock"

git add -A

git commit -m "feat: registrar last_login_at en cada inicio de sesion real

AuthScreens.jsx: en onAuthStateChange, cuando event === SIGNED_IN
actualiza users.last_login_at con la hora actual via supabase.
Fire-and-forget para no bloquear la UI de login."

git push origin main

echo.
echo === Ultimos commits ===
git log --oneline -3
echo.
pause
