@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
git add backend/lib/claudeTools.js backend/routes/ai.routes.js backend/routes/reports.routes.js src/components/CopilotChat/CopilotChat.jsx
git commit -m "feat: Co-Piloto Tool 14 create_product con protocolo dry_run + fix modal overflow + redirect guard branchId + fix Resend lazy init"
git push origin main
echo.
echo ✅ Push completado. Railway y Vercel desplegaran en ~2 min.
pause
