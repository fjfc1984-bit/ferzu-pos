// =============================================================================
// FERZU POS — Configuración de Planes (Backend)
//
// REGLA: Este archivo es la fuente de verdad para el backend.
// Debe mantenerse en sincronía con src/lib/plansConfig.js (frontend).
// NO exponer al frontend — solo para uso interno del backend y webhooks.
// =============================================================================

export const PLAN_MODULES = {
  free: {
    enabled_modules: ['pos'],
    max_products:    50,
    max_users:       1,
    max_branches:    1,
  },
  pos_basic: {
    enabled_modules: ['pos', 'inventory', 'customers', 'dashboard'],
    max_products:    500,
    max_users:       3,
    max_branches:    1,
  },
  barbershop: {
    enabled_modules: ['pos', 'barbershop', 'customers', 'dashboard', 'inventory', 'dian'],
    max_products:    200,
    max_users:       5,
    max_branches:    1,
  },
  restaurant: {
    enabled_modules: ['pos', 'kitchen', 'customers', 'dashboard', 'inventory', 'dian'],
    max_products:    300,
    max_users:       8,
    max_branches:    1,
  },
  workshop: {
    enabled_modules: ['pos', 'workshop', 'inventory', 'customers', 'dashboard', 'dian'],
    max_products:    500,
    max_users:       5,
    max_branches:    1,
  },
  minimarket: {
    enabled_modules: ['pos', 'minimarket', 'inventory', 'customers', 'dashboard', 'dian'],
    max_products:    2000,
    max_users:       4,
    max_branches:    1,
  },
  pro: {
    enabled_modules: [
      'pos', 'barbershop', 'kitchen', 'workshop', 'minimarket',
      'inventory', 'customers', 'dashboard', 'dian', 'ai', 'reports',
    ],
    max_products:    10_000,
    max_users:       20,
    max_branches:    3,
  },
  enterprise: {
    enabled_modules: [
      'pos', 'barbershop', 'kitchen', 'workshop', 'minimarket',
      'inventory', 'customers', 'dashboard', 'dian', 'ai', 'reports',
      'api_access', 'white_label', 'multi_branch',
    ],
    max_products:    null,  // Ilimitado
    max_users:       null,
    max_branches:    null,
  },
};

/**
 * Obtiene la configuración de módulos para un plan.
 * Retorna el plan 'free' como fallback seguro si el planId no existe.
 */
export function getPlanConfig(planId) {
  return PLAN_MODULES[planId] ?? PLAN_MODULES['free'];
}
