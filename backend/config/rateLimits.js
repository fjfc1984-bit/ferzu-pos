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

// IA — 10 req / 1 min (costo por token)
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Límite de consultas de IA alcanzado. Espera un momento.' },
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
