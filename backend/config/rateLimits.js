// =============================================================================
// FERZU POS — Rate Limiters
// =============================================================================
import rateLimit from 'express-rate-limit';

// General — 300 req / 15 min por IP
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: 'Demasiadas solicitudes. Intenta en 15 minutos.' },
});

// IA por IP — 10 req / 1 min (costo por token)
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Límite de consultas de IA alcanzado. Espera un momento.' },
});

// IA por usuario autenticado — 20 req / 1 min
// Complementa aiRateLimit: evita que un usuario evada el límite rotando IPs
// (proxy, VPN). Se usa DESPUÉS de requireAuth para tener req.user.id disponible.
export const aiUserRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.id || req.ip,  // cae en IP si no hay user (no debería)
  message: { error: 'Límite de consultas de IA por usuario alcanzado. Espera un momento.' },
});

// PIN — 10 intentos / 15 min por IP (anti brute-force)
// Con 10.000 combinaciones de 4 dígitos y 10 intentos/15min
// se necesitarían 250 horas desde una sola IP para brute-forcear.
export const pinRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de PIN. Espera 15 minutos.', valid: false },
  standardHeaders: true,
  legacyHeaders: false,
});
