// =============================================================================
// FERZU POS — MÓDULO DE INVENTARIO Y PRODUCTOS
// Archivo: src/pages/InventoryPage.jsx
// CRUD completo de productos, entradas, ajustes, proveedores
// =============================================================================
// SECCIONES:
//   1. InventoryPage.jsx      — Layout principal con tabs
//   2. ProductList.jsx        — CRUD de productos con variantes
//   3. ProductForm.jsx        — Formulario de nuevo/editar producto
//   4. StockMovements.jsx     — Historial de movimientos de inventario
//   5. StockAdjustment.jsx    — Modal de ajuste / entrada de inventario
//   6. SupplierList.jsx       — Gestión de proveedores
//   7. ImportProducts.jsx     — Importación masiva desde CSV
// =============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  Package, Plus, Search, Filter, ChevronDown, Edit2, Trash2,
  AlertTriangle, CheckCircle2, Upload, Download, Truck,
  ArrowUpCircle, ArrowDownCircle, BarChart3, RefreshCw,
  Tag, DollarSign, Hash, Image as ImageIcon, X, Save,
  Loader2, ChevronRight, ToggleLeft, ToggleRight, QrCode,
  SlidersHorizontal, Layers, Sparkles
} from 'lucide-react';
import { supabase }      from '../lib/supabase.js';
import { useAuth }       from '../context/AuthContext.jsx';
import { formatCOP }     from '../lib/math.js';
import toast             from 'react-hot-toast';
import VATClassifier, { RATE_LABELS } from '../components/dian/VATClassifier.jsx';
import InventoryInsights from '../components/inventory/InventoryInsights.jsx';
import BatchVATClassifier from '../components/dian/BatchVATClassifier.jsx';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

// =============================================================================
// SECCIÓN 1: InventoryPage — Layout con tabs
// =============================================================================

export default function InventoryPage() {
  const [tab, setTab] = useState('products'); // 'products' | 'movements' | 'suppliers' | 'insights'
  const [criticalCount, setCriticalCount] = useState(0);
  const { organizationId } = useAuth();
  // branchId vive en POSContext/localStorage — no en AuthContext
  const [branchId, setBranchId] = useState(localStorage.getItem('ferzu_branch_id') || null);

  // FIX: auto-resolver primera sucursal si localStorage está vacío
  useEffect(() => {
    if (branchId || !organizationId) return;
    supabase.from('branches').select('id')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
      .limit(1).maybeSingle()
      .then(({ data }) => {
        if (data?.id) {
          setBranchId(data.id);
          localStorage.setItem('ferzu_branch_id', data.id);
        }
      });
  }, [organizationId]);

  const TABS = [
    { key: 'products',   label: 'Productos',   icon: Package   },
    { key: 'movements',  label: 'Movimientos', icon: BarChart3 },
    { key: 'suppliers',  label: 'Proveedores', icon: Truck     },
    { key: 'insights',   label: 'Alertas IA',  icon: Sparkles, badge: criticalCount },
  ];

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 pt-4 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Package size={20} className="text-brand-600" />
            Inventario
          </h1>
        </div>
        <div className="flex gap-1">
          {TABS.map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-brand-500 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={14} />
              {label}
              {badge > 0 && (
                <span className="ml-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white
                                 text-[10px] font-bold rounded-full flex items-center justify-center">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido del tab activo */}
      <div className="flex-1 overflow-hidden">
        {tab === 'products'  && <ProductList  organizationId={organizationId} branchId={branchId} />}
        {tab === 'movements' && <StockMovements branchId={branchId} />}
        {tab === 'suppliers' && <SupplierList  organizationId={organizationId} />}
        {tab === 'insights'  && (
          <InventoryInsights
            branchId={branchId}
            onInsightCountChange={setCriticalCount}
          />
        )}
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 2: ProductList — Tabla de productos con búsqueda y filtros
// =============================================================================

function ProductList({ organizationId, branchId }) {
  const [products,  setProducts]  = useState([]);
  const [inventory, setInventory] = useState({});  // { product_id: { quantity, min_stock } }
  const [categories, setCategories] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [showForm,  setShowForm]  = useState(false);
  const [editProd,  setEditProd]  = useState(null);
  const [showAdj,   setShowAdj]   = useState(null); // product para ajuste
  const [showBatchVAT, setShowBatchVAT] = useState(false);

  useEffect(() => { if (organizationId) loadAll(); }, [organizationId, branchId]);

  async function loadAll() {
    setLoading(true);
    try {
      await Promise.all([loadProducts(), loadInventory(), loadCategories()]);
    } catch (err) {
      toast.error('Error al cargar inventario');
    } finally {
      setLoading(false);
    }
  }

  async function loadProducts() {
    const { data } = await supabase
      .from('products')
      .select('*, categories(name, color)')
      .eq('organization_id', organizationId)
      .order('name');
    setProducts(data || []);
  }

  async function loadInventory() {
    if (!branchId) return;
    const { data } = await supabase
      .from('inventory')
      .select('product_id, quantity, min_stock')
      .eq('branch_id', branchId);
    const map = {};
    for (const r of data || []) map[r.product_id] = r;
    setInventory(map);
  }

  async function loadCategories() {
    const { data } = await supabase
      .from('categories')
      .select('id, name, color')
      .eq('organization_id', organizationId)
      .order('name');
    setCategories(data || []);
  }

  async function toggleActive(product) {
    await supabase.from('products').update({ is_active: !product.is_active }).eq('id', product.id);
    await loadProducts();
    toast.success(product.is_active ? 'Producto desactivado' : 'Producto activado');
  }

  async function deleteProduct(product) {
    if (!confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return;
    const { error } = await supabase.from('products').delete().eq('id', product.id);
    if (error) { toast.error('No se puede eliminar: tiene movimientos asociados'); return; }
    await loadProducts();
    toast.success('Producto eliminado');
  }

  // Filtrar
  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
      || p.sku?.toLowerCase().includes(search.toLowerCase())
      || p.barcode?.includes(search);
    const matchCat = catFilter === 'all' || p.category_id === catFilter;
    return matchSearch && matchCat;
  });

  // Stock status badge
  function stockBadge(productId) {
    const inv = inventory[productId];
    if (!inv) return null;
    if (inv.quantity === 0)               return { label: 'SIN STOCK', cls: 'bg-red-100 text-red-700' };
    if (inv.quantity <= inv.min_stock)    return { label: 'BAJO',      cls: 'bg-amber-100 text-amber-700' };
    return { label: `${inv.quantity} uds`, cls: 'bg-green-100 text-green-700' };
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-3">
        {/* Búsqueda */}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, SKU o código de barras..."
            className="w-full h-9 pl-9 pr-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>

        {/* Filtro por categoría */}
        <select
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          className="h-9 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400 text-gray-600">
          <option value="all">Todas las categorías</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="ml-auto flex gap-2">
          {/* Botón Clasificar IVA — visible cuando hay productos sin tarifa */}
          {products.filter(p => !p.vat_rate || Number(p.vat_rate) === 0).length > 0 && (
            <button
              onClick={() => setShowBatchVAT(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100
                         text-amber-700 border border-amber-200 text-sm font-medium rounded-xl transition-colors">
              <Sparkles size={14} />
              Clasificar IVA
              <span className="ml-0.5 min-w-[18px] h-[18px] px-1 bg-amber-500 text-white
                               text-[10px] font-bold rounded-full flex items-center justify-center">
                {products.filter(p => !p.vat_rate || Number(p.vat_rate) === 0).length}
              </span>
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors">
            <Plus size={15} />
            Nuevo producto
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={22} className="animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Package size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Sin productos{search ? ` que coincidan con "${search}"` : ''}</p>
            <button onClick={() => setShowForm(true)}
              className="mt-3 text-brand-600 text-sm hover:underline">
              + Agregar primer producto
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {['Producto','SKU','Precio','Costo','Stock','Categoría','Estado','Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filtered.map(p => {
                const badge = stockBadge(p.id);
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                    {/* Producto */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-lg shrink-0 overflow-hidden">
                          {p.image_url
                            ? <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                            : p.emoji || '📦'}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 leading-tight">{p.name}</p>
                          {p.barcode && (
                            <p className="text-[10px] text-gray-400 flex items-center gap-0.5 mt-0.5">
                              <QrCode size={9} />{p.barcode}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* SKU */}
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono">{p.sku || '—'}</td>

                    {/* Precio */}
                    <td className="px-4 py-3 font-semibold text-gray-900">{formatCOP(p.price)}</td>

                    {/* Costo */}
                    <td className="px-4 py-3 text-gray-500">{p.cost ? formatCOP(p.cost) : '—'}</td>

                    {/* Stock */}
                    <td className="px-4 py-3">
                      {badge ? (
                        <button
                          onClick={() => setShowAdj(p)}
                          className={`text-[10px] font-bold px-2 py-1 rounded-full ${badge.cls} hover:opacity-80 transition-opacity`}>
                          {badge.label}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">N/A</span>
                      )}
                    </td>

                    {/* Categoría */}
                    <td className="px-4 py-3">
                      {p.categories ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                          {p.categories.name}
                        </span>
                      ) : '—'}
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActive(p)} className="flex items-center gap-1 text-xs">
                        {p.is_active
                          ? <ToggleRight size={18} className="text-green-500" />
                          : <ToggleLeft  size={18} className="text-gray-400" />}
                        <span className={p.is_active ? 'text-green-600' : 'text-gray-400'}>
                          {p.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </button>
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditProd(p); setShowForm(true); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => setShowAdj(p)}
                          className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600"
                          title="Ajuste de inventario">
                          <SlidersHorizontal size={13} />
                        </button>
                        <button
                          onClick={() => deleteProduct(p)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modales */}
      {showForm && (
        <ProductForm
          product={editProd}
          organizationId={organizationId}
          branchId={branchId}
          categories={categories}
          onClose={() => { setShowForm(false); setEditProd(null); }}
          onSaved={loadAll}
        />
      )}

      {showAdj && (
        <StockAdjustment
          product={showAdj}
          currentStock={inventory[showAdj.id]?.quantity ?? 0}
          branchId={branchId}
          onClose={() => setShowAdj(null)}
          onSaved={loadAll}
        />
      )}

      {showBatchVAT && (
        <BatchVATClassifier
          products={products}
          onClose={() => setShowBatchVAT(false)}
          onSaved={loadAll}
        />
      )}
    </div>
  );
}


// =============================================================================
// SECCIÓN 3: ProductForm — Formulario crear / editar producto
// =============================================================================

function ProductForm({ product, organizationId, branchId, categories, onClose, onSaved }) {
  const isEdit = !!product;
  const [form, setForm] = useState({
    name:         product?.name         || '',
    sku:          product?.sku          || '',
    barcode:      product?.barcode      || '',
    price:        product?.price?.toString()     || '',
    cost:         product?.cost?.toString()      || '',
    category_id:  product?.category_id  || '',
    emoji:        product?.emoji        || '📦',
    item_type:    product?.item_type    || 'product',
    vat_rate:     (product?.vat_rate != null ? String(product.vat_rate) : '0'), // 0|5|8|19
    vat_included: product?.vat_included ?? true,             // precio ya incluye IVA
    min_stock:    product?.min_stock?.toString() || '5',
    initial_stock: '0',
    description:  product?.description  || '',
  });
  const [saving, setSaving] = useState(false);

  function update(field, val) {
    setForm(f => ({ ...f, [field]: val }));
  }

  async function handleSave() {
    if (!form.name || !form.price) { toast.error('Nombre y precio son obligatorios'); return; }
    if (Number(form.price) < 0)         { toast.error('El precio no puede ser negativo'); return; }
    if (form.cost && Number(form.cost) < 0) { toast.error('El costo no puede ser negativo'); return; }
    if (!isEdit && Number(form.initial_stock) < 0) { toast.error('El stock inicial no puede ser negativo'); return; }

    setSaving(true);
    try {
      const payload = {
        organization_id: organizationId,
        name:            form.name.trim(),
        sku:             form.sku.trim() || null,
        barcode:         form.barcode.trim() || null,
        price:           Math.round(Number(form.price)),
        cost:            form.cost ? Math.round(Number(form.cost)) : null,
        category_id:     form.category_id || null,
        emoji:           form.emoji,
        item_type:       form.item_type,
        vat_rate:        parseFloat(form.vat_rate) || 0,    // columna real en DB
        vat_included:    form.vat_included,                  // columna real en DB
        description:     form.description || null,
        is_active:       true,
      };

      let productId = product?.id;

      if (isEdit) {
        const { error } = await supabase.from('products').update(payload).eq('id', productId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('products').insert(payload).select().single();
        if (error) throw error;
        productId = data.id;

        // Crear registro de inventario inicial
        const initialQty = Math.round(Number(form.initial_stock || '0'));
        await supabase.from('inventory').insert({
          product_id: productId,
          branch_id:  branchId,
          quantity:   initialQty,
          min_stock:  Math.round(Number(form.min_stock || '5')),
        });

        // Registrar movimiento inicial si > 0
        if (initialQty > 0) {
          await supabase.from('inventory_movements').insert({
            product_id:     productId,
            branch_id:      branchId,
            movement_type:  'initial',
            quantity_change: initialQty,
            quantity_after:  initialQty,
            notes:           'Stock inicial al crear producto',
          });
        }
      }

      toast.success(isEdit ? 'Producto actualizado' : 'Producto creado');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const EMOJIS = ['📦','🍔','☕','🍕','💈','🔧','💊','👕','📱','🎸','🍺','🌮'];
  const TYPES  = [
    { key: 'product',  label: 'Producto físico' },
    { key: 'service',  label: 'Servicio' },
    { key: 'combo',    label: 'Combo / kit' },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            {isEdit ? <Edit2 size={16} /> : <Plus size={16} />}
            {isEdit ? 'Editar producto' : 'Nuevo producto'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Emoji picker */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Ícono del producto</label>
            <div className="flex gap-2 flex-wrap">
              {EMOJIS.map(e => (
                <button key={e} onClick={() => update('emoji', e)}
                  className={`w-9 h-9 rounded-xl text-xl flex items-center justify-center transition-all ${
                    form.emoji === e ? 'bg-brand-100 ring-2 ring-brand-400 scale-110' : 'bg-gray-100 hover:bg-gray-200'
                  }`}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Tipo */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Tipo</label>
            <div className="flex gap-2">
              {TYPES.map(t => (
                <button key={t.key} onClick={() => update('item_type', t.key)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
                    form.item_type === t.key
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-brand-200'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nombre */}
          <FField label="Nombre *" value={form.name} onChange={v => update('name', v)} placeholder="Ej: Café americano" />

          {/* SKU y barcode */}
          <div className="grid grid-cols-2 gap-3">
            <FField label="SKU / Referencia" value={form.sku} onChange={v => update('sku', v)} placeholder="CAF-001" />
            <FField label="Código de barras" value={form.barcode} onChange={v => update('barcode', v)} placeholder="7501234567890" />
          </div>

          {/* Precio y costo */}
          <div className="grid grid-cols-2 gap-3">
            <FField label="Precio de venta * (COP)" value={form.price} onChange={v => update('price', v)} type="number" placeholder="5000" min="0" />
            <FField label="Costo unitario (COP)" value={form.cost} onChange={v => update('cost', v)} type="number" placeholder="2500" min="0" />
          </div>

          {/* Tarifa de IVA */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              Tarifa IVA (DIAN)
            </label>
            <div className="flex gap-2 flex-wrap mb-2">
              {Object.entries(RATE_LABELS).map(([rate, label]) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => update('vat_rate', rate)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    form.vat_rate === rate
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-brand-200'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            {/* Clasificador IA */}
            <VATClassifier
              productName={form.name}
              productCategory={categories.find(c => c.id === form.category_id)?.name}
              productDescription={form.description}
              currentRate={Number(form.vat_rate)}
              onAccepted={rate => update('vat_rate', String(rate))}
              disabled={saving}
            />
          </div>

          {/* IVA incluido en el precio */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.vat_included}
              onChange={e => update('vat_included', e.target.checked)}
              className="rounded accent-brand-600"
            />
            <span className="text-sm text-gray-600">
              El precio de venta ya incluye el IVA
            </span>
          </label>

          {/* Categoría */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Categoría</label>
            <select value={form.category_id} onChange={e => update('category_id', e.target.value)}
              className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400">
              <option value="">Sin categoría</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Stock inicial (solo al crear) */}
          {!isEdit && form.item_type === 'product' && (
            <div className="grid grid-cols-2 gap-3">
              <FField label="Stock inicial" value={form.initial_stock} onChange={v => update('initial_stock', v)} type="number" placeholder="0" min="0" />
              <FField label="Stock mínimo (alerta)" value={form.min_stock} onChange={v => update('min_stock', v)} type="number" placeholder="5" min="0" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100">
          <button onClick={handleSave} disabled={saving}
            className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Crear producto')}
          </button>
        </div>
      </div>
    </div>
  );
}

function FField({ label, value, onChange, placeholder, type = 'text', min, max }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
      />
    </div>
  );
}


// =============================================================================
// SECCIÓN 4: StockMovements — Historial de movimientos de inventario
// =============================================================================

function StockMovements({ branchId }) {
  const [movements, setMovements] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [page,      setPage]      = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => { load(); }, [branchId, page]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('inventory_movements')
      .select(`
        id, movement_type, quantity_change, quantity_after, notes, created_at,
        products(name, emoji),
        users(full_name)
      `)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    setMovements(data || []);
    setLoading(false);
  }

  const typeConfig = {
    sale:        { label: 'Venta',           color: 'text-red-600',   bg: 'bg-red-50',   icon: ArrowDownCircle },
    purchase:    { label: 'Entrada',         color: 'text-green-600', bg: 'bg-green-50', icon: ArrowUpCircle   },
    adjustment:  { label: 'Ajuste',          color: 'text-blue-600',  bg: 'bg-blue-50',  icon: SlidersHorizontal },
    initial:     { label: 'Stock inicial',   color: 'text-gray-600',  bg: 'bg-gray-50',  icon: Package         },
    refund:      { label: 'Devolución',      color: 'text-amber-600', bg: 'bg-amber-50', icon: ArrowUpCircle   },
    waste:       { label: 'Merma',           color: 'text-red-500',   bg: 'bg-red-50',   icon: Trash2          },
  };

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Historial de movimientos</p>
        <button onClick={load} className="text-gray-400 hover:text-gray-600">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={22} className="animate-spin text-gray-300" />
          </div>
        ) : movements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <BarChart3 size={36} className="mb-3 opacity-30" />
            <p className="text-sm">{page > 0 ? 'No hay más movimientos' : 'Sin movimientos registrados'}</p>
          </div>
        ) : (
          <table className="w-full text-sm bg-white">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['Fecha','Producto','Tipo','Cambio','Stock después','Usuario','Nota'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movements.map(m => {
                const cfg = typeConfig[m.movement_type] || typeConfig.adjustment;
                const Icon = cfg.icon;
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {m.created_at
                        ? format(parseISO(m.created_at), "d MMM, h:mm a", { locale: es })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-gray-800">
                        {m.products?.emoji || '📦'} {m.products?.name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                        <Icon size={10} />{cfg.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-bold text-sm ${m.quantity_change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {m.quantity_change > 0 ? '+' : ''}{m.quantity_change}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{m.quantity_after}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{m.users?.full_name || 'Sistema'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate">{m.notes || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginación */}
      <div className="border-t border-gray-100 bg-white px-6 py-3 flex items-center justify-between shrink-0">
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0 || loading}
          className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40 flex items-center gap-1">
          ← Anterior
        </button>
        <span className="text-xs text-gray-400">
          Página {page + 1} · {movements.length} registros
        </span>
        <button
          onClick={() => setPage(p => p + 1)}
          disabled={movements.length < PAGE_SIZE || loading}
          className="text-xs text-brand-600 hover:text-brand-700 disabled:opacity-40 flex items-center gap-1">
          Siguiente →
        </button>
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 5: StockAdjustment — Modal de ajuste / entrada de inventario
// =============================================================================

function StockAdjustment({ product, currentStock, branchId, onClose, onSaved }) {
  const [type,     setType]     = useState('purchase'); // 'purchase' | 'adjustment' | 'waste'
  const [qty,      setQty]      = useState('');
  const [cost,     setCost]     = useState(product?.cost?.toString() || '');
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);

  const typeOpts = [
    { key: 'purchase',   label: '📦 Entrada de compra',   sign: +1 },
    { key: 'adjustment', label: '🔧 Ajuste / conteo físico', sign: null },
    { key: 'waste',      label: '🗑 Merma / pérdida',      sign: -1 },
  ];

  const selectedType  = typeOpts.find(t => t.key === type);
  const numQty        = Number(qty || '0');
  const newStock      = type === 'adjustment'
    ? numQty
    : currentStock + selectedType.sign * numQty;

  async function handleSave() {
    if (!qty) { toast.error('Ingresa la cantidad'); return; }
    if (Number(qty) < 0) { toast.error('La cantidad no puede ser negativa'); return; }
    setSaving(true);
    try {
      // actualNewStock siempre >= 0; change consistente con lo que realmente cambia
      const actualNewStock = Math.max(0, newStock);
      const change = actualNewStock - currentStock;

      // 1. Actualizar inventario
      const { error: invError } = await supabase
        .from('inventory')
        .update({ quantity: actualNewStock, updated_at: new Date().toISOString() })
        .eq('product_id', product.id)
        .eq('branch_id', branchId);

      if (invError) throw invError;

      // 2. Registrar movimiento
      await supabase.from('inventory_movements').insert({
        product_id:      product.id,
        branch_id:       branchId,
        movement_type:   type,
        quantity_change: change,
        quantity_after:  actualNewStock,
        unit_cost:       cost ? Math.round(Number(cost)) : null,
        notes:           notes || null,
      });

      // 3. Si es compra con costo → actualizar costo promedio ponderado en products
      if (type === 'purchase' && cost) {
        const newCost = Math.round(Number(cost));
        const weightedAvg = currentStock > 0
          ? Math.round((currentStock * (product.cost || 0) + numQty * newCost) / (currentStock + numQty))
          : newCost;
        await supabase.from('products')
          .update({ cost: weightedAvg })
          .eq('id', product.id);
      }

      toast.success('Inventario actualizado');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Error al actualizar inventario');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-brand-600" />
            Ajustar inventario — {product.emoji} {product.name}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Stock actual */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
            <span className="text-xs text-gray-500">Stock actual</span>
            <span className="font-bold text-gray-900">{currentStock} unidades</span>
          </div>

          {/* Tipo de movimiento */}
          <div className="space-y-2">
            {typeOpts.map(t => (
              <label key={t.key} className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                type === t.key ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
              }`}>
                <input type="radio" name="type" value={t.key} checked={type === t.key}
                  onChange={e => setType(e.target.value)} className="accent-brand-600" />
                <span className="text-sm text-gray-700">{t.label}</span>
              </label>
            ))}
          </div>

          {/* Cantidad */}
          <FField
            label={type === 'adjustment' ? 'Nuevo stock total' : 'Cantidad'}
            value={qty}
            onChange={setQty}
            type="number"
            placeholder={type === 'adjustment' ? currentStock.toString() : '10'}
          />

          {/* Costo unitario (solo entradas) */}
          {type === 'purchase' && (
            <FField label="Costo unitario COP (actualiza costo promedio)"
              value={cost} onChange={setCost} type="number" placeholder="2500" />
          )}

          {/* Nota */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Nota (opcional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Motivo del ajuste..."
              className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400" />
          </div>

          {/* Preview del resultado */}
          {qty && (
            <div className={`flex items-center justify-between rounded-xl px-4 py-3 border-2 ${
              newStock < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
            }`}>
              <span className="text-xs text-gray-600">Nuevo stock</span>
              <span className={`font-bold ${newStock < 0 ? 'text-red-600' : 'text-green-700'}`}>
                {Math.max(0, newStock)} unidades
              </span>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100">
          <button onClick={handleSave} disabled={saving || !qty}
            className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            {saving ? 'Guardando...' : 'Confirmar ajuste'}
          </button>
        </div>
      </div>
    </div>
  );
}


// =============================================================================
// SECCIÓN 6: SupplierList — Gestión de proveedores
// =============================================================================

function SupplierList({ organizationId }) {
  const [suppliers, setSuppliers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editSupp,  setEditSupp]  = useState(null);

  useEffect(() => { load(); }, [organizationId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name');
    setSuppliers(data || []);
    setLoading(false);
  }

  async function saveSupplier(form) {
    const payload = { ...form, organization_id: organizationId };
    let error;
    if (editSupp) {
      ({ error } = await supabase.from('suppliers').update(payload).eq('id', editSupp.id));
    } else {
      ({ error } = await supabase.from('suppliers').insert(payload));
    }
    if (error) {
      toast.error(error.message || 'Error al guardar proveedor');
      return;
    }
    toast.success(editSupp ? 'Proveedor actualizado' : 'Proveedor creado');
    setShowForm(false);
    setEditSupp(null);
    await load();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Proveedores</p>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl transition-colors">
          <Plus size={13} /> Nuevo proveedor
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-gray-300" />
          </div>
        ) : suppliers.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Truck size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm mb-3">Sin proveedores registrados</p>
            <button onClick={() => setShowForm(true)} className="text-brand-600 text-sm hover:underline">
              + Agregar primer proveedor
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {suppliers.map(s => (
              <div key={s.id} className="bg-white border border-gray-200 rounded-2xl p-4 hover:border-brand-200 transition-colors group">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center">
                    <Truck size={16} className="text-brand-600" />
                  </div>
                  <button
                    onClick={() => { setEditSupp(s); setShowForm(true); }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-all">
                    <Edit2 size={13} />
                  </button>
                </div>
                <p className="font-semibold text-gray-900 text-sm">{s.name}</p>
                {s.contact_name && <p className="text-xs text-gray-500 mt-0.5">{s.contact_name}</p>}
                {s.phone && (
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    📞 {s.phone}
                  </p>
                )}
                {s.nit && <p className="text-xs text-gray-400">NIT: {s.nit}</p>}
                {s.email && <p className="text-xs text-brand-600 truncate">{s.email}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <SupplierForm
          supplier={editSupp}
          onClose={() => { setShowForm(false); setEditSupp(null); }}
          onSave={saveSupplier}
        />
      )}
    </div>
  );
}

function SupplierForm({ supplier, onClose, onSave }) {
  const [form, setForm] = useState({
    name:         supplier?.name         || '',
    nit:          supplier?.nit          || '',
    contact_name: supplier?.contact_name || '',
    phone:        supplier?.phone        || '',
    email:        supplier?.email        || '',
    address:      supplier?.address      || '',
    notes:        supplier?.notes        || '',
  });
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">
            {supplier ? 'Editar proveedor' : 'Nuevo proveedor'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <FField label="Razón social *" value={form.name} onChange={v => setForm(f => ({...f, name: v}))} placeholder="Distribuidora XYZ" />
          <div className="grid grid-cols-2 gap-3">
            <FField label="NIT" value={form.nit} onChange={v => setForm(f => ({...f, nit: v}))} placeholder="900.123.456-7" />
            <FField label="Teléfono" value={form.phone} onChange={v => setForm(f => ({...f, phone: v}))} placeholder="300 000 0000" />
          </div>
          <FField label="Contacto" value={form.contact_name} onChange={v => setForm(f => ({...f, contact_name: v}))} placeholder="Nombre del vendedor" />
          <FField label="Email" value={form.email} onChange={v => setForm(f => ({...f, email: v}))} type="email" placeholder="ventas@proveedor.com" />
        </div>
        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={async () => { setSaving(true); await onSave(form); setSaving(false); }}
            disabled={!form.name || saving}
            className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-colors">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Guardando...' : 'Guardar proveedor'}
          </button>
        </div>
      </div>
    </div>
  );
}
