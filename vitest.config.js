// Configuración mínima de Vitest (sin plugins de Vite que bloquean en CI/sandbox)
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',       // no jsdom — los tests de lógica no necesitan DOM
    globals: true,
    include: ['src/__tests__/**/*.{test,spec}.{js,jsx}'],
  },
})
