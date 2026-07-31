// =============================================================================
// FERZU POS — Middleware de validación (express-validator)
// =============================================================================
import { validationResult } from 'express-validator';

/**
 * validate
 * Procesa los errores acumulados por los validators de express-validator.
 * Siempre se usa como último elemento del array de validators en cada ruta.
 *
 * Ejemplo:
 *   router.post('/', [ body('name').notEmpty(), validate ], handler)
 */
export function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}
