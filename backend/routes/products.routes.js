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

// GET /products?branch_id=&category_id=&search=&page=&limit=&niche=
// niche: filtra productos cuya categoría pertenece al nicho de la branch activa.
// Si niche='general' o no se envía → retorna todos (comportamiento anterior).
router.get('/', async (req, res) => {
  try {
    const { branch_id, category_id, search, page = 1, limit = 50, niche } = req.query;
    await assertBranchOwnership(branch_id, req.organizationId, { optional: true });
    const offset = (page - 1) * limit;

    // Si se pasa branch_id sin niche explícito, resolver el niche desde la DB.
    let resolvedNiche = niche || null;
    if (branch_id && !resolvedNiche) {
      const { data: br } = await supabaseAdmin
        .from('branches')
        .select('niche')
        .eq('id', branch_id)
        .eq('organization_id', req.organizationId)
        .single();
      resolvedNiche = br?.niche || null;
    }

    // Construir la lista de category_ids permitidos por niche (si aplica).
    // niche='general' o null → sin filtro de niche (retorna todo, backward compatible).
    let nicheCategories = null;
    if (resolvedNiche && resolvedNiche !== 'general') {
      const { data: cats } = await supabaseAdmin
        .from('categories')
        .select('id')
        .eq('organization_id', req.organizationId)
        .contains('niche', [resolvedNiche]);
      // También incluir categorías 'general' (compartidas entre nichos)
      const { data: generalCats } = await supabaseAdmin
        .from('categories')
        .select('id')
        .eq('organization_id', req.organizationId)
        .contains('niche', ['general']);
      nicheCategories = [
        ...(cats || []).map(c => c.id),
        ...(generalCats || []).map(c => c.id),
      ];
    }

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
        categories(id, name, color, niche),
        inventory(branch_id, quantity, average_cost),
        product_variants(id)
      `, { count: 'exact' })
      .eq('organization_id', req.organizationId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .range(offset, offset + limit - 1);

    if (category_id)     query = query.eq('category_id', category_id);
    if (nicheCategories) query = query.in('category_id', nicheCategories.length ? nicheCategories : ['__none__']);
    // SECURITY: sanear `,` `(` `)` — delimitadores de la gramática .or() de PostgREST
    if (search)          query = query.or(`name.ilike.%${search.replace(/[,()]/g, '')}%,sku.ilike.%${search.replace(/[,()]/g, '')}%,barcode.eq.${search.replace(/[,()]/g, '')}`);
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

// =============================================================================
// CATEGORIES — CRUD con soporte de niche
// IMPORTANTE: estas rutas deben ir ANTES de /:id para que Express no
// interprete "categories" como un parámetro de ID.
// =============================================================================

// GET /products/categories?niche=barbershop
// niche='general' o sin niche → retorna todas las categorías de la org (backward compatible)
router.get('/categories', async (req, res) => {
  try {
    const { niche } = req.query;
    let query = supabaseAdmin
      .from('categories')
      .select('id, name, color, niche, sort_order')
      .eq('organization_id', req.organizationId)
      .order('sort_order', { ascending: true });

    // Filtrar por niche: retorna categorías del niche solicitado + las 'general' (compartidas)
    if (niche && niche !== 'general') {
      query = query.or(`niche.cs.{"${niche}"},niche.cs.{"general"}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error('GET /products/categories', { err });
    res.status(500).json({ error: err.message });
  }
});

// POST /products/categories
router.post('/categories', requireRole('owner', 'admin'), [
  body('name').notEmpty().trim(),
  validate,
], async (req, res) => {
  try {
    const { name, color, sort_order, niche } = req.body;
    const { data, error } = await supabaseAdmin
      .from('categories')
      .insert({
        organization_id: req.organizationId,
        name: name.trim(),
        color: color || '#6b7280',
        sort_order: sort_order ?? 0,
        niche: Array.isArray(niche) ? niche : (niche ? [niche] : ['general']),
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /products/categories/:id
router.put('/categories/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { name, color, sort_order, niche } = req.body;
    const update = {};
    if (name       != null) update.name       = name.trim();
    if (color      != null) update.color      = color;
    if (sort_order != null) update.sort_order = sort_order;
    if (niche      != null) update.niche      = Array.isArray(niche) ? niche : [niche];

    const { data, error } = await supabaseAdmin
      .from('categories')
      .update(update)
      .eq('id', req.params.id)
      .eq('organization_id', req.organizationId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /products/categories/:id
router.delete('/categories/:id', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('categories')
      .delete()
      .eq('id', req.params.id)
      .eq('organization_id', req.organizationId);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
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

// ── Variantes ─────────────────────────────────────────────────────────────────

// GET /products/:id/variants?branch_id=
router.get('/:id/variants', async (req, res) => {
  try {
    const { branch_id } = req.query;
    const { data: product, error: pErr } = await supabaseAdmin
      .from('products')
      .select('id, organization_id')
      .eq('id', req.params.id)
      .single();
    if (pErr || product.organization_id !== req.organizationId) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    const { data, error } = await supabaseAdmin
      .from('product_variants')
      .select('*, variant_inventory(branch_id, quantity)')
      .eq('product_id', req.params.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    // Si hay branch_id, aplanar el stock de esa sucursal
    const enriched = (data || []).map(v => ({
      ...v,
      current_stock: branch_id
        ? (v.variant_inventory?.find(i => i.branch_id === branch_id)?.quantity ?? null)
        : null,
    }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /products/:id/variants
router.post('/:id/variants', requireRole('owner', 'admin'), [
  body('name').notEmpty().trim(),
  validate,
], async (req, res) => {
  try {
    const { data: product, error: pErr } = await supabaseAdmin
      .from('products').select('id, organization_id').eq('id', req.params.id).single();
    if (pErr || product.organization_id !== req.organizationId) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    const { name, sku, barcode, price, cost, attributes, sort_order } = req.body;
    const { data, error } = await supabaseAdmin
      .from('product_variants')
      .insert({
        product_id:      req.params.id,
        organization_id: req.organizationId,
        name: name.trim(),
        sku:        sku        || null,
        barcode:    barcode    || null,
        price:      price      != null ? Math.round(Number(price)) : null,
        cost:       cost       != null ? Math.round(Number(cost))  : null,
        attributes: attributes || {},
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    await logAudit(req.organizationId, req.user.id, 'create', 'product_variants', data.id, null, data);
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /products/:id/variants/:vid
router.put('/:id/variants/:vid', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { data: existing } = await supabaseAdmin
      .from('product_variants')
      .select('id, organization_id')
      .eq('id', req.params.vid)
      .eq('product_id', req.params.id)
      .single();
    if (!existing || existing.organization_id !== req.organizationId) {
      return res.status(404).json({ error: 'Variante no encontrada' });
    }
    const { name, sku, barcode, price, cost, attributes, sort_order, is_active } = req.body;
    const update = {};
    if (name      != null) update.name       = name.trim();
    if (sku       != null) update.sku        = sku || null;
    if (barcode   != null) update.barcode    = barcode || null;
    if (price     != null) update.price      = Math.round(Number(price));
    if (cost      != null) update.cost       = Math.round(Number(cost));
    if (attributes!= null) update.attributes = attributes;
    if (sort_order!= null) update.sort_order = sort_order;
    if (is_active != null) update.is_active  = is_active;
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('product_variants').update(update).eq('id', req.params.vid).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /products/:id/variants/:vid  (soft delete)
router.delete('/:id/variants/:vid', requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { data: existing } = await supabaseAdmin
      .from('product_variants').select('id, organization_id')
      .eq('id', req.params.vid).eq('product_id', req.params.id).single();
    if (!existing || existing.organization_id !== req.organizationId) {
      return res.status(404).json({ error: 'Variante no encontrada' });
    }
    const { error } = await supabaseAdmin
      .from('product_variants')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.vid);
    if (error) throw error;
    await logAudit(req.organizationId, req.user.id, 'delete', 'product_variants', req.params.vid, null, null);
    res.status(204).end();
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
