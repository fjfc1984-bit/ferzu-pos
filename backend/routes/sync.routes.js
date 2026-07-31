// =============================================================================
// FERZU POS — Sync Routes  (/api/sync)
// Recibe operaciones offline del cliente y las procesa con re-validación.
// =============================================================================
import express  from 'express';
import { body } from 'express-validator';
import { requireAuth }            from '../middleware/auth.js';
import { validate }               from '../middleware/validate.js';
import { processSyncOperation }   from '../services/sync.service.js';

const router = express.Router();
router.use(requireAuth);

// POST /sync/push — El cliente envía operaciones pendientes de offline
router.post('/push', [
  body('operations').isArray(),
  validate,
], async (req, res) => {
  try {
    const { operations } = req.body;
    const results = [];

    for (const op of operations) {
      try {
        const result = await processSyncOperation(op, req.organizationId, req.user.id);
        results.push({ local_id: op.local_id, success: true, server_id: result?.id });
      } catch (err) {
        results.push({ local_id: op.local_id, success: false, error: err.message });
      }
    }

    const successful = results.filter(r => r.success).length;
    res.json({
      processed:  operations.length,
      successful,
      failed:     operations.length - successful,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
