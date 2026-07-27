@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

echo === Agregando archivos de tests y CI... ===
git add package.json
git add vite.config.js
git add src/__tests__/setup.js
git add src/__tests__/boldCheckout.test.js
git add src/__tests__/ErrorBoundary.test.jsx
git add backend/package.json
git add backend/server.js
git add backend/tests/hmac.test.js
git add backend/tests/plans.test.js
git add .github/workflows/ci.yml

git commit -m "feat(ci): tests Vitest + node:test + GitHub Actions CI

Frontend (Vitest + Testing Library + jsdom):
  - boldCheckout.test.js: 5 tests de parseBoldRedirectResult()
  - ErrorBoundary.test.jsx: 4 tests de captura de errores y fallback UI

Backend (node:test nativo, sin dependencias externas):
  - hmac.test.js: 6 tests de verificacion HMAC-SHA256 para webhook Bold
  - plans.test.js: 7 tests de integridad de precios (Regla de Oro #1)

server.js: guard isMain para que app.listen() no corra durante tests

GitHub Actions CI:
  - .github/workflows/ci.yml
  - test-frontend + test-backend en paralelo
  - Bloquea merge si algun test falla"

echo.
echo === Subiendo a GitHub... ===
git push origin main
echo.
echo === LISTO! ===
echo.
echo GitHub Actions comenzara los tests automaticamente en:
echo   https://github.com/fjfc1984/ferzu-pos/actions
echo.
pause
