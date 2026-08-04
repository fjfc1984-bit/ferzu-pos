// =============================================================================
// FERZU POS — Tables Routes  (/api/tables)
// Gestión de mesas para el módulo restaurante.
// Solo admin/owner pueden crear, editar o eliminar mesas.
// Cualquier usuario autenticado con acceso a la sucursal puede listar.
// =============================================================================
import express  from 'express';
import { body, query } from 'express-validator';
import { supabaseAdmin }                      from '../config/supabase.js';
import logger                                  from '../config/logger.js';
import { requireAuth, requireRole, assertBranchOwnership } from '../middleware/auth.js';
import { validate }                            from '../middleware/validate.js';

const router = express.Router();
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tables?branch_id=
// Lista todas las mesas activas de una sucursal
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', [
  query('branch_id').isUUID(),
  validate,
], async (req, res) => {
  try {
    const { branch_id } = req.query;
    await assertBranchOwnership(branch_id, req.organizationId);

    const { data, error } = await supabaseAdmin
      .from('tables')
      .select('id, name, capacity, area, status, position_x, position_y, is_active')
      .eq('branch_id', branch_id)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error('GET /tables', { err });
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tables — Crear mesa
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', [
  requireRole('admin', 'owner'),
  body('branch_id').isUUID(),
  body('name').isString().trim().isLength({ min: 1, max: 50 }),
  body('capacity').optional().isInt({ min: 1, max: 50 }),
  body('area').optional().isString().trim().isLength({ max: 50 }),
  body('position_x').optional().isInt({ min: 0 }),
  body('position_y').optional().isInt({ min: 0 }),
  validate,
], async (req, res) => {
  try {
    const { branch_id, name, capacity = 4, area = 'Salón', position_x = 0, position_y = 0 } = req.body;
    await assertBranchOwnership(branch_id, req.organizationId);

    const { data, error } = await supabaseAdmin
      .from('tables')
      .insert({
        branch_id,
        name:       name.trim(),
        capacity,
        area:       area?.trim() || 'Salón',
        position_x,
        position_y,
        status:     'available',
        is_active:  true,
      })
      .select()
      .single();

    if (error) throw error;
    logger.info('Table created', { id: data.id, name: data.name, branch_id });
    res.status(201).json(data);
  } catch (err) {
    logger.error('POST /tables', { err });
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una mesa con ese nombre en esta sucursal' });
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/tables/:id — Actualizar mesa (nombre, capacidad, área, posición, estado)
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id', [
  requireRole('admin', 'owner'),
  body('name').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('capacity').optional().isInt({ min: 1, max: 50 }),
  body('area').optional().isString().trim().isLength({ max: 50 }),
  body('status').optional().isIn(['available', 'occupied', 'reserved', 'cleaning']),
  body('position_x').optional().isInt({ min: 0 }),
  body('position_y').optional().isInt({ min: 0 }),
  validate,
], async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que la mesa pertenece a la organización
    const { data: existing, error: findErr } = await supabaseAdmin
      .from('tables')
      .select('id, branch_id')
      .eq('id', id)
      .single();
    if (findErr || !existing) return res.status(404).json({ error: 'Mesa no encontrada' });
    await assertBranchOwnership(existing.branch_id, req.organizationId);

    // Solo actualizar los campos enviados
    const allowed = ['name', 'capacity', 'area', 'status', 'position_x', 'position_y'];
    const updates = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        updates[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : req.body[field];
      }
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('tables')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error('PATCH /tables/:id', { err });
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/tables/:id — Soft delete (is_active = false)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', [
  requireRole('admin', 'owner'),
], async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing } = await supabaseAdmin
      .from('tables')
      .select('id, branch_id, name')
      .eq('id', id)
      .single();
    if (!existing) return res.status(404).json({ error: 'Mesa no encontrada' });
    await assertBranchOwnership(existing.branch_id, req.organizationId);

    const { error } = await supabaseAdmin
      .from('tables')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    logger.info('Table deleted', { id, name: existing.name });
    res.json({ success: true });
  } catch (err) {
    logger.error('DELETE /tables/:id', { err });
    res.status(500).json({ error: err.message });
  }
});

export default router;
