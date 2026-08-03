// =============================================================================
// FERZU POS — Products Routes  (/api/products)
// =============================================================================
import express  from 'express';
import { body } from 'express-validator';
import logger   from '../config/logger.js';
import { supabaseAdmin } from '../config/supabase.js';
import { requireAuth, requireRole, assertBranchOwnership } from '../middleware/auth.js';
import { validate }  from '../middleware/validate.js';
import { logAudit }  from '../middleware/audit.js';

const router = express.Router();
router.use(requireAuth);

// GET /products?branch_id=&category_id=&search=&page=&limit=
router.get('/', async (req, res) => {
  try {
    const { branch_id, category_id, search, page = 1, limit = 50 } = req.query;
    await assertBranchOwnership(branch_id, req.organizationId, { optional: true });
    const offset = (page - 1) * limit;

    // FIX: Usar supabaseAdmin con filtro explícito de organization_id.
    // NO usar `.eq('inventory.branch_id', branch_id)` en la cadena de filtros:
    // en PostgREST ese patrón actúa como INNER JOIN y excluye los productos
    // con track_inventory=false (que no tienen filas en inventory).
    // En cambio, traemos inventory sin filtro de branch_id y filtramos client-side.
    let query = supabaseAdmin
      .from('products')
      .select(`
        id, name, sku, barcode, price, cost, vat_rate, vat_included,
        track_inventory, unit_of_measure, min_stock, item_type,
        is_active, is_featured, metadata, image_url,
        categories(id, name, color),
        inventory(branch_id, quantity, average_cost)
      `, { count: 'exact' })
      .eq('organization_id', req.organizationId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .range(offset, offset + limit - 1);

    if (category_id) query = query.eq('category_id', category_id);
    if (search)      query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.eq.${search}`);
    // NOTA: branch_id YA NO se aplica como filtro de join sobre inventory.
    // Se usa client-side al calcular current_stock.

    const { data, count, error } = await query;
    if (error) throw error;

    const enriched = data.map(p => {
      // Para obtener el stock de la sucursal correcta, filtramos client-side.
      const stockRow = branch_id
        ? p.inventory?.find(i => i.branch_id === branch_id)
        : p.inventory?.[0];
      return {
        ...p,
        price_with_vat:    p.vat_included ? p.price : Math.round(p.price * (1 + p.vat_rate / 100)),
        price_without_vat: p.vat_included ? Math.round(p.price / (1 + p.vat_rate / 100)) : p.price,
        current_stock:     stockRow?.quantity ?? null,
      };
    });

    res.json({ data: enriched, count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    logger.error('GET /products', { err });
    res.status(500).json({ error: err.message });
  }
});

// GET /products/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('products')
      .select('*, categories(*), product_variants(*), inventory(*)')
      .eq('id', req.params.id)
      .single();
    if (error) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /products — Solo admin/owner
router.post('/', requireRole('owner', 'admin'), [
  body('name').notEmpty().trim(),
  body('price').isInt({ min: 0 }),
  body('vat_rate').isIn([0, 5, 8, 19]),  // 8 = INC restaurantes (Ley 2010/2019)
  validate,
], async (req, res) => {
  try {
    // FIX: Extraer solo campos permitidos del body. El viejo `...rest` spread
    // permitía al cliente inyectar `organization_id` (y otros) con valor arbitrario.
    const {
      name, price, cost = 0, vat_rate = 0, vat_included = true,
      sku, barcode, category_id, description, image_url,
      track_inventory = false, unit_of_measure, min_stock, item_type,
      is_active = true, is_featured = false, sort_order, metadata,
    } = req.body;

    // FIX: Usar supabaseAdmin con organization_id explícito — nunca req.supabase.
    const { data, error } = await supabaseAdmin
      .from('products')
      .insert({
        organization_id: req.organizationId,   // siempre del JWT, nunca del body
        name, price, cost, vat_rate, vat_included,
        sku: sku || null, barcode: barcode || null,
        category_id: category_id || null,
        description: description || null, image_url: image_url || null,
        track_inventory, unit_of_measure: unit_of_measure || null,
        min_stock: min_stock || null, item_type: item_type || 'product',
        is_active, is_featured,
        sort_order: sort_order ?? null,
        metadata: metadata || null,
      })
      .select()
      .single();

    if (error) throw error;
    await logAudit(req.organizationId, req.user.id, 'create', 'products', data.id, null, data);
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
