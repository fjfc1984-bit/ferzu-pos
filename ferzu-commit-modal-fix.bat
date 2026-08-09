@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
git add src/pages/POSPage.jsx
git commit -m "fix: modal overflow + redirect guard cuando branchId es null"
git push origin main
echo.
echo ✅ Push completado. Vercel desplegara en ~1 min.
pause
