// =============================================================================
// FERZU POS — Ruta: /api/customers
//
// Gestión de clientes en punto de venta.
// Usa supabaseAdmin para evitar problemas de schema cache del cliente frontend.
// =============================================================================

import express              from 'express'
import { body, query }      from 'express-validator'
import { supabaseAdmin }    from '../config/supabase.js'
import { requireAuth }      from '../middleware/auth.js'
import { validate }         from '../middleware/validate.js'
import logger               from '../config/logger.js'

const router = express.Router()
router.use(requireAuth)

// =============================================================================
// GET /api/customers/search?q=<cédula|NIT|celular>
//
// Busca un cliente por número de documento o celular dentro de la organización.
// Devuelve el primer match (maybeSingle) o null si no existe.
// =============================================================================

router.get('/search', [
  query('q').trim().notEmpty().withMessage('Parámetro q requerido'),
  validate,
], async (req, res) => {
  try {
    const { q }            = req.query
    const organizationId   = req.organizationId

    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('id, full_name, id_type, id_number, email, phone')
      .eq('organization_id', organizationId)
      .or(`id_number.eq.${q},phone.eq.${q}`)
      .maybeSingle()

    if (error) {
      logger.error('[customers/search] Supabase error:', error.message)
      return res.status(500).json({ error: error.message })
    }

    res.json({ customer: data || null })
  } catch (err) {
    logger.error('[customers/search] Error:', err.message)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

// =============================================================================
// POST /api/customers
//
// Crea un cliente nuevo asociado a la organización del usuario autenticado.
// Rechaza duplicados de id_number dentro de la misma org.
// =============================================================================

router.post('/', [
  body('full_name').trim().notEmpty().withMessage('El nombre es obligatorio'),
  body('id_number').optional({ nullable: true }).trim(),
  body('email').optional({ nullable: true }).isEmail().normalizeEmail(),
  body('phone').optional({ nullable: true }).trim(),
  validate,
], async (req, res) => {
  try {
    const { full_name, id_number, email, phone } = req.body
    const organizationId = req.organizationId

    // Evitar duplicado de cédula en la misma org
    if (id_number) {
      const { data: existing } = await supabaseAdmin
        .from('customers')
        .select('id, full_name')
        .eq('organization_id', organizationId)
        .eq('id_number', id_number)
        .maybeSingle()

      if (existing) {
        return res.status(409).json({
          error: `Ya existe un cliente con este documento: ${existing.full_name}`,
          existing,
        })
      }
    }

    const { data, error } = await supabaseAdmin
      .from('customers')
      .insert({
        full_name:       full_name.trim(),
        id_number:       id_number?.trim()  || null,
        email:           email              || null,
        phone:           phone?.trim()      || null,
        organization_id: organizationId,
      })
      .select()
      .single()

    if (error) {
      logger.error('[customers/create] Supabase error:', error.message)
      return res.status(500).json({ error: error.message })
    }

    logger.info(`[customers] Nuevo cliente creado: ${data.id} (${data.full_name})`)
    res.status(201).json({ customer: data })
  } catch (err) {
    logger.error('[customers/create] Error:', err.message)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

export default router
