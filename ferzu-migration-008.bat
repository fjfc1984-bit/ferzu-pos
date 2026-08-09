@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
git add database/migrations/008_subscriptions_and_alerts.sql
git commit -m "db: Migration 008 — subscriptions columns + organizations defaults + alerts resolved_at"
git push origin main
echo.
echo Listo! Ahora ejecuta la migracion en Supabase:
echo.
echo  1. Ve a https://supabase.com/dashboard
echo  2. Abre tu proyecto FERZU POS
echo  3. SQL Editor (icono de base de datos)
echo  4. Nuevo Query
echo  5. Copia y pega el contenido de:
echo     database\migrations\008_subscriptions_and_alerts.sql
echo  6. Clic en "Run"
echo.
pause
