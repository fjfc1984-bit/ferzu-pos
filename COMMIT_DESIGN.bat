@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
echo === Limpiando locks === > commit_log.txt
del /f /q ".git\index.lock" 2>>commit_log.txt
del /f /q ".git\HEAD.lock" 2>>commit_log.txt
del /f /q ".git\refs\heads\main.lock" 2>>commit_log.txt
echo === Add y commit === >> commit_log.txt
git add src/pages/auth/AuthScreens.jsx src/App.jsx src/lib/plansConfig.js src/components/ModuleGuard.jsx >> commit_log.txt 2>&1
git commit -m "fix: 6 bugs criticos auth — PIN API URL, PINLockScreen doble, forgot-password, branches vacias, seguridad pin_hash, RLS onboarding + PricingPage redesign + DIAN all plans" >> commit_log.txt 2>&1
echo === Stash otros cambios === >> commit_log.txt
git stash >> commit_log.txt 2>&1
echo === Pull === >> commit_log.txt
git pull origin main >> commit_log.txt 2>&1
echo === Pop stash === >> commit_log.txt
git stash pop >> commit_log.txt 2>&1
echo === Push === >> commit_log.txt
git push origin main >> commit_log.txt 2>&1
echo === FIN === >> commit_log.txt
type commit_log.txt
pause
