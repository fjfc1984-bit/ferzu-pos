@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
if exist ".git\index.lock" del /f ".git\index.lock"
if exist ".git\HEAD.lock"  del /f ".git\HEAD.lock"
git add -A
git commit -m "chore: limpieza logs recuperacion git + ajustes post-deploy"
git push origin main
git log --oneline -3
pause
