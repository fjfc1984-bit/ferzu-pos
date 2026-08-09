@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
git add src/pages/SettingsPage.jsx
git commit -m "feat: UI Settings -> Alertas Level 2 — toggle, email/whatsapp, cooldown, subscripciones por tipo"
git push origin main
echo.
echo ✅ Push completado. Vercel desplegara en ~1 min.
pause
