@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"

if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock"  del /f /q ".git\HEAD.lock"

git add -A

git commit -m "feat: niche isolation por sucursal — cada negocio con sus propios productos

DB (Supabase ya ejecutado):
- branches.niche TEXT DEFAULT general (barbershop|restaurant|workshop|minimarket|general)
- categories.niche TEXT[] DEFAULT {general} con GIN index
- Backfill automatico desde organizations.business_type

Backend:
- products.routes.js: GET /products acepta ?niche= y filtra por categorias del niche activo
- products.routes.js: nuevo CRUD GET|POST|PUT|DELETE /products/categories con soporte niche
- Categorias general se incluyen siempre (compartidas entre nichos)

Frontend:
- POSContext: estado branchNiche + accion SET_BRANCH_NICHE + resolucion al init()
- useBranchNiche.js: hook nuevo con branchNiche, nicheLabel, isNiche(), nicheParam
- POSPage: ProductGrid usa branchNiche para filtrar categorias y productos automaticamente
- BranchesPage.jsx: UI completa de gestion de sucursales con selector de niche
- App.jsx: ruta /sucursales agregada
- ModuleGuard.jsx: link Sucursales en sidebar para admin/owner

Plan Pro: hasta 3 sucursales, cada una con niche independiente
Plan Enterprise: sucursales ilimitadas"

git push origin main

echo.
echo === Resultado ===
git log --oneline -3
echo.
pause
