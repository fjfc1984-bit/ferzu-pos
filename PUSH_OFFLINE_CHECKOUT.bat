@echo off
cd /d "C:\Users\fjfc1\Downloads\ferzu-pos"
del /f /q ".git\index.lock" 2>nul
del /f /q ".git\HEAD.lock" 2>nul

echo === Subiendo fix offline checkout... ===
git add src/App.jsx
git add src/context/POSContext.jsx
git add src/pages/POSPage.jsx

git commit -m "fix: checkout offline-first en POSContext (Regla de Oro #3)

Problema: processPayment fallaba silenciosamente sin red — sin fallback offline.

Cambios:
  App.jsx: SyncProvider ahora envuelve POSProvider (antes era al reves)
           => permite que POSContext use useSync()

  POSContext.jsx:
    - Importa useSync() para acceder a isOnline + saveOrderOffline
    - processPayment tiene dos rutas:
        Ruta 1 (online):  POST /orders al backend. Error de negocio (4xx/5xx)
                          muestra toast y lanza. Error de red activa Ruta 2.
        Ruta 2 (offline): saveOrderOffline() -> Dexie + cola de sync.
                          Se sincroniza automaticamente al reconectar.

  POSPage.jsx / PaymentModal:
    - handleConfirm lee order.offline del resultado de processPayment
    - step 'done-offline': pantalla ambar con mensaje explicativo y vuelto"

echo.
echo === Subiendo a GitHub... ===
git push origin main
echo.
echo === LISTO! Vercel redespliega en ~1 min ===
echo.
pause
