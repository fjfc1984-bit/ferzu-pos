// =============================================================================
// FERZU POS — PANTALLA DE COBRO COMPLETA
// Archivo: src/pages/POSPage.jsx (y subcomponentes)
// Stack: React 18 + Tailwind CSS + Lucide Icons
// =============================================================================
// CONTENIDO:
//   Sección 1: POSPage.jsx          — Página principal del POS
//   Sección 2: ProductGrid.jsx      — Grilla de productos con búsqueda/barcode
//   Sección 3: OrderPanel.jsx       — Panel derecho de la orden activa
//   Sección 4: PaymentModal.jsx     — Modal de cobro multi-método
//   Sección 5: CustomerSearch.jsx   — Búsqueda y asignación de cliente
//   Sección 6: DiscountModal.jsx    — Modal de descuento con aprobación
//   Sección 7: CashSessionModal.jsx — Modal de apertura/cierre de caja
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 1: POSPage.jsx
// src/pages/POSPage.jsx
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, Search, Zap, User, ChevronDown,
  Package, BarChart3, LogOut, Wifi, WifiOff,
  Clock, AlertCircle, CheckCircle2, X, Plus, Minus,
  Percent, DollarSign, CreditCard, Smartphone, Split,
  Printer, RefreshCw, Settings, ChevronRight
} from 'lucide-react';
import { usePOS }                  from '../context/POSContext.jsx';
import { useAuth }                 from '../context/AuthContext.jsx';
import { useSyncContext }          from '../context/SyncContext.jsx';
import { useAIProposals }          from '../hooks/useAIProposals.js';
import { useKeyboardShortcuts }    from '../hooks/useKeyboardShortcuts.js';
import { formatCOP }               from '../lib/math.js';
import { cashAPI, api }            from '../lib/api.js';
import toast                       from 'react-hot-toast';

// Sub-componentes (definidos en secciones siguientes)
// import ProductGrid        from '../components/pos/ProductGrid.jsx';
// import OrderPanel         from '../components/pos/OrderPanel.jsx';
// import PaymentModal       from '../components/pos/PaymentModal.jsx';
// import CustomerSearch     from '../components/pos/CustomerSearch.jsx';
// import CashSessionModal   from '../components/pos/CashSessionModal.jsx';

export default function POSPage() {
  const { user, logout, organizationId }  = useAuth();
  const { cashSession, branchId, dispatch, sessionLoading } = usePOS();
  const { isOnline, pendingCount, cacheProducts, getOfflineProducts } = useSyncContext();
  const { proposals }                       = useAIProposals(branchId);

  const [showCustomer,  setShowCustomer]  = useState(false);
  const [showPayment,   setShowPayment]   = useState(false);
  const [showDiscount,  setShowDiscount]  = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showAIPanel,   setShowAIPanel]   = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);

  // ── Atajos de teclado ─────────────────────────────────────────────────────
  useKeyboardShortcuts({
    onNewSale:  () => { dispatch({ type: 'CLEAR_ORDER' }); toast('🛒 Nueva venta (F2)') },
    onCheckout: () => { if (cashSession) setShowPayment(true) },
    onEscape:   () => {
      setShowPayment(false)
      setShowDiscount(false)
      setShowCustomer(false)
      setShowCashModal(false)
      setShowAIPanel(false)
    },
  })

  // Si no hay caja abierta al cargar, mostrar modal de apertura
  // Esperar a que sessionLoading sea false para evitar mostrar el modal
  // durante los ~200ms que tarda cashAPI.current() en responder
  useEffect(() => {
    if (!sessionLoading && !cashSession) setShowCashModal(true);
  }, [sessionLoading, cashSession]);

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">

      {/* ── Sidebar de navegación ── */}
      <nav className="w-14 bg-white border-r border-gray-100 flex flex-col items-center py-3 gap-1.5 shrink-0 shadow-sm z-10">
        <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center mb-2 shadow-md shadow-brand-700/30">
          <span className="text-white text-sm font-bold">F</span>
        </div>

        {[
          { icon: ShoppingCart, label: 'Caja',        active: true,  href: '/pos' },
          { icon: Package,      label: 'Inventario',  active: false, href: '/inventory' },
          { icon: BarChart3,    label: 'Dashboard',   active: false, href: '/dashboard' },
        ].map(({ icon: Icon, label, active, href }) => (
          <Link key={label} to={href}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              active
                ? 'bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-100'
                : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
            }`}
            title={label}>
            <Icon size={19} />
          </Link>
        ))}

        {/* Botón IA con badge */}
        <button
          onClick={() => setShowAIPanel(!showAIPanel)}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 hover:bg-purple-50 hover:text-purple-600 transition-all relative"
          title="Agente IA">
          <Zap size={19} />
          {proposals.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold shadow-sm">
              {proposals.length}
            </span>
          )}
        </button>

        <div className="flex-1" />

        {/* Cerrar caja — visible cuando hay sesión activa */}
        {cashSession && (
          <button
            onClick={() => setShowCashModal(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-amber-500 hover:bg-amber-50 hover:text-amber-600 transition-all"
            title="Cerrar caja">
            <DollarSign size={17} />
          </button>
        )}

        {/* Estado de conexión */}
        <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
          isOnline ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
        }`} title={isOnline ? 'En línea' : 'Sin conexión'}>
          {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
        </div>

        {/* Botón de usuario */}
        <button
          onClick={logout}
          className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
          title={`Salir (${user?.full_name})`}>
          <LogOut size={17} />
        </button>
      </nav>

      {/* ── Área principal ── */}
      <div className="flex flex-1 overflow-hidden">
        <ProductGrid
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          organizationId={organizationId}
          branchId={branchId}
        />

        <OrderPanel
          onPay={()          => setShowPayment(true)}
          onCustomer={()     => setShowCustomer(true)}
          onDiscount={()     => setShowDiscount(true)}
          onOpenCashModal={() => setShowCashModal(true)}
        />
      </div>

      {/* ── Header de caja ── */}
      {cashSession && (
        <div className="absolute top-0 left-14 right-0 h-0">
          {/* Invisible: la info de caja está en OrderPanel */}
        </div>
      )}

      {/* ── Modales ── */}
      {showCashModal && (
        <CashSessionModal
          onClose={() => setShowCashModal(false)}
          branchId={branchId}
        />
      )}

      {showPayment && (
        <PaymentModal onClose={() => setShowPayment(false)} />
      )}

      {showCustomer && (
        <CustomerSearch
          onClose={() => setShowCustomer(false)}
          organizationId={organizationId}
        />
      )}

      {showDiscount && (
        <DiscountModal onClose={() => setShowDiscount(false)} />
      )}

      {/* ── Panel IA lateral ── */}
      {showAIPanel && (
        <AIProposalsPanel
          proposals={proposals}
          onClose={() => setShowAIPanel(false)}
          branchId={branchId}
        />
      )}

      {/* ── Banner offline ── */}
      {!isOnline && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm px-4 py-2 rounded-full flex items-center gap-2 shadow-lg z-50">
          <WifiOff size={14} />
          Sin conexión — ventas guardadas localmente
          {pendingCount > 0 && <span className="bg-white text-red-600 rounded-full px-2 py-0.5 text-xs font-bold">{pendingCount}</span>}
        </div>
      )}
      {/* ── Banner sync pendiente (online pero con ventas offline por subir) ── */}
      {isOnline && pendingCount > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-sm px-4 py-2 rounded-full flex items-center gap-2 shadow-lg z-50">
          <span className="animate-pulse">⟳</span>
          Sincronizando {pendingCount} venta{pendingCount > 1 ? 's' : ''} offline...
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 2: ProductGrid.jsx
// src/components/pos/ProductGrid.jsx
// ─────────────────────────────────────────────────────────────────────────────

// export default function ProductGrid({ activeCategory, onCategoryChange, organizationId, branchId })

function ProductGrid({ activeCategory, onCategoryChange, organizationId, branchId }) {
  const { addItem }                = usePOS();
  const [search, setSearch]        = useState('');
  const [categories, setCategories]= useState([]);
  const [products, setProducts]    = useState([]);
  const [isLoading, setIsLoading]  = useState(false);
  const searchRef                  = useRef(null);
  const barcodeBuffer              = useRef('');
  const barcodeTimer               = useRef(null);
  const lastKeyTime                = useRef(0);
  const isScanning                 = useRef(false);
  const isFirstLoad                = useRef(true);

  // Cargar categorías solo cuando cambia la sucursal
  useEffect(() => {
    loadCategories();
  }, [branchId]);

  // Auto-focus en search
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Escáner de código de barras — detección por velocidad de teclas (< 50ms = escáner USB)
  useEffect(() => {
    const handleKey = (e) => {
      // Ignorar si el foco está en otro input (no el de búsqueda del POS)
      if (e.target.tagName === 'INPUT' && e.target !== searchRef.current) return;
      if (e.target.tagName === 'TEXTAREA') return;

      const now = Date.now();
      const gap = now - lastKeyTime.current;
      lastKeyTime.current = now;

      if (e.key === 'Enter') {
        if (isScanning.current && barcodeBuffer.current.length >= 4) {
          const barcode = barcodeBuffer.current;
          barcodeBuffer.current = '';
          isScanning.current = false;
          e.preventDefault();
          handleBarcodeScanned(barcode);
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        // Interval < 50ms entre teclas consecutivas → es un escáner USB (no humano)
        if (gap < 50) isScanning.current = true;

        if (isScanning.current) {
          // Evitar que los chars del escáner contaminen el campo de búsqueda
          if (e.target === searchRef.current) e.preventDefault();
          barcodeBuffer.current += e.key;
        } else {
          // Tipeo manual del usuario → limpiar buffer de escaneo
          barcodeBuffer.current = '';
        }

        // Timeout de seguridad: si el escáner no envía Enter, resetear estado
        clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => {
          barcodeBuffer.current = '';
          isScanning.current = false;
        }, 150);
      }
    };

    // capture: true → interceptar ANTES de que el char llegue al input
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, []); // Sin deps en products — handleBarcodeScanned hace fallback al backend

  async function loadCategories() {
    try {
      const res = await api.get('/categories');
      const body = res.data;
      setCategories(Array.isArray(body) ? body : (body?.data ?? []));
    } catch {
      setCategories([]);
    }
  }

  async function loadProducts() {
    setIsLoading(true);
    try {
      const res = await api.get('/products', {
        params: {
          branch_id:   branchId || undefined,
          category_id: activeCategory || undefined,
          search:      search || undefined,
          limit:       60,
        },
      });
      const body = res.data;
      const fetched = Array.isArray(body) ? body : (body?.data ?? []);
      setProducts(fetched);
      // Cachear en Dexie solo cuando no hay filtros activos (caché "completa")
      if (!search && !activeCategory && branchId) {
        cacheProducts(fetched, branchId).catch(() => {});
      }
    } catch {
      // Fallback a caché local (Dexie IndexedDB)
      const local = await getOfflineProducts(branchId, search || '');
      setProducts(local);
    } finally {
      setIsLoading(false);
    }
  }

  // Carga de productos: inmediata en mount, debounced al cambiar filtros
  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      loadProducts();
      return;
    }
    const timer = setTimeout(loadProducts, 300);
    return () => clearTimeout(timer);
  }, [search, activeCategory, branchId]);

  async function handleBarcodeScanned(barcode) {
    // 1. Buscar en productos ya cargados en la vista actual (instantáneo)
    const localHit = products.find(p => p.barcode === barcode || p.sku === barcode);
    if (localHit) {
      addItem(localHit);
      toast.success(`${localHit.name} agregado`, { duration: 1500 });
      return;
    }
    // 2. No está en la página actual → buscar directamente en el backend por barcode/sku
    try {
      const res  = await api.get('/products', { params: { search: barcode, limit: 1 } });
      const body = res.data;
      const hit  = Array.isArray(body) ? body[0] : body?.data?.[0];
      if (hit) {
        addItem(hit);
        toast.success(`${hit.name} agregado`, { duration: 1500 });
      } else {
        toast.error(`Código ${barcode} no encontrado`, { duration: 2000 });
      }
    } catch {
      toast.error(`Código ${barcode} no encontrado`, { duration: 2000 });
    }
  }

  const stockStatus = (product) => {
    if (!product.track_inventory) return null;
    const qty = product.current_stock ?? 0;
    if (qty === 0)  return 'out';
    if (qty <= (product.min_stock || 0)) return 'low';
    return 'ok';
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

      {/* ── Barra de búsqueda + categorías ── */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 space-y-3 shadow-sm">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto o escanear código..."
            className="w-full pl-9 pr-4 h-10 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-400 focus:border-brand-400 outline-none transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Tabs de categorías con emoji */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
          <button
            onClick={() => onCategoryChange(null)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
              !activeCategory
                ? 'bg-brand-600 text-white shadow-sm shadow-brand-700/25'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            🏷️ Todos
          </button>
          {categories.map(cat => {
            const EMOJI_MAP = {
              comida:'🍔', bebidas:'🥤', bebida:'🥤', licores:'🍺', snacks:'🍟',
              postres:'🍰', café:'☕', pizza:'🍕', pollo:'🍗', carnes:'🥩',
              ensaladas:'🥗', desayunos:'🥐', almuerzo:'🥘', helados:'🍦',
              servicios:'⚙️', servicio:'⚙️', corte:'✂️', barbería:'💈',
              ropa:'👕', accesorios:'👜', tecnología:'📱', hogar:'🏠',
              'sin categoría':'📦', general:'📦',
            };
            const emoji = EMOJI_MAP[cat.name?.toLowerCase()] || '📦';
            return (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(cat.id)}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                  activeCategory === cat.id
                    ? 'bg-brand-600 text-white shadow-sm shadow-brand-700/25'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {emoji} {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Fila de Favoritos (top productos sin filtrar) ── */}
      {!search && !activeCategory && products.length > 0 && (
        <div className="px-4 pt-3 pb-0">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">
            ⚡ Acceso rápido
          </p>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            {products.slice(0, 8).map(p => (
              <button
                key={`fav-${p.id}`}
                onClick={() => !( (p.track_inventory && (p.current_stock ?? 0) === 0)) && addItem(p)}
                disabled={p.track_inventory && (p.current_stock ?? 0) === 0}
                className="shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl bg-white border border-gray-200 hover:border-brand-400 hover:bg-brand-50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                style={{ minWidth:'72px', maxWidth:'80px' }}>
                <span className="text-xl leading-none">
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} className="w-6 h-6 object-cover rounded" />
                    : (p.item_type === 'service' ? '⚙️' : '📦')}
                </span>
                <span className="text-[10px] font-semibold text-gray-700 text-center leading-tight line-clamp-2">{p.name}</span>
                <span className="text-[10px] font-bold text-brand-700">{formatCOP(p.price_with_vat || p.price)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Grilla de productos ── */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw size={24} className="text-gray-300 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Package size={40} className="mb-3 opacity-40" />
            <p className="text-sm">
              {search ? `Sin resultados para "${search}"` : 'Sin productos disponibles'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {products.map(product => {
              const status = stockStatus(product);
              const isOut  = status === 'out';

              return (
                <button
                  key={product.id}
                  onClick={() => !isOut && addItem(product)}
                  disabled={isOut}
                  className={`
                    relative bg-white rounded-2xl p-3 text-left border transition-all duration-150
                    ${isOut
                      ? 'opacity-40 cursor-not-allowed border-gray-100'
                      : 'border-gray-200 shadow-sm hover:border-brand-300 hover:shadow-lg hover:-translate-y-0.5 active:scale-95 active:shadow-sm cursor-pointer'
                    }
                  `}>

                  {/* Badge de stock */}
                  {status === 'low' && (
                    <div className="absolute top-2 right-2 w-2 h-2 bg-amber-400 rounded-full" title="Stock bajo" />
                  )}
                  {status === 'out' && (
                    <div className="absolute top-2 right-2 bg-red-100 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      AGOTADO
                    </div>
                  )}

                  {/* Imagen o placeholder */}
                  <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-slate-50 to-gray-100 flex items-center justify-center mb-2 overflow-hidden">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">
                        {product.item_type === 'service' ? '⚙️' : '📦'}
                      </span>
                    )}
                  </div>

                  <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2 mb-1.5">
                    {product.name}
                  </p>

                  <p className="text-sm font-bold text-brand-700">
                    {formatCOP(product.price_with_vat || product.price)}
                  </p>

                  {product.track_inventory && product.current_stock !== null && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      Stock: {product.current_stock} {product.unit_of_measure}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 3: OrderPanel.jsx
// src/components/pos/OrderPanel.jsx
// ─────────────────────────────────────────────────────────────────────────────

function OrderPanel({ onPay, onCustomer, onDiscount, onOpenCashModal }) {
  const {
    items, totals, customerId, cashSession,
    updateQty, removeItem, isProcessing
  } = usePOS();
  const { isOnline } = useSyncContext();

  const isEmpty = items.length === 0;

  return (
    <div className="w-[300px] xl:w-[320px] bg-white border-l border-gray-100 flex flex-col shrink-0 shadow-xl shadow-gray-300/20">

      {/* ── Header con info de caja ── */}
      <div className="px-4 py-3 border-b border-gray-100 bg-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cashSession ? 'bg-green-500' : 'bg-amber-400'}`} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-gray-900 truncate">Orden actual</p>
                {!isEmpty && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700">
                    {items.length} ítem{items.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 truncate">
                {cashSession
                  ? `Caja · ${new Date(cashSession.opened_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`
                  : <span className="text-amber-500 font-medium">Sin caja activa</span>
                }
              </p>
            </div>
          </div>

          {/* Botón cliente */}
          <button
            onClick={onCustomer}
            className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              customerId
                ? 'bg-brand-50 text-brand-700 border-brand-200 shadow-sm'
                : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
            }`}>
            <User size={13} />
            {customerId ? 'Cliente ✓' : '+ Cliente'}
          </button>
        </div>
      </div>

      {/* ── Items de la orden ── */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
              <ShoppingCart size={32} className="text-gray-200" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-400">Carrito vacío</p>
              <p className="text-xs text-gray-300 mt-1">Haz clic en un producto o escanea un código</p>
            </div>
            <div className="mt-2 flex flex-col gap-1.5 w-full">
              {[['F2','Nueva venta'],['F4','Cobrar'],['ESC','Cancelar']].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded-lg">
                  <span className="text-[11px] text-gray-400">{label}</span>
                  <kbd className="text-[10px] font-mono font-bold text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {items.map((item, idx) => (
              <div key={`${item.product_id}-${idx}`}
                className="flex items-center gap-2 bg-gray-50 rounded-xl p-2.5 group border border-gray-100/80">

                {/* Nombre */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 truncate">{item.product_name}</p>
                  <p className="text-[11px] text-gray-400">{formatCOP(item.unit_price)} c/u</p>
                </div>

                {/* Controles de cantidad */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateQty(item.product_id, item.quantity - 1)}
                    className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors">
                    <Minus size={10} />
                  </button>
                  <span className="text-xs font-semibold w-5 text-center">{item.quantity}</span>
                  <button
                    onClick={() => updateQty(item.product_id, item.quantity + 1)}
                    className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-green-50 hover:text-green-500 hover:border-green-200 transition-colors">
                    <Plus size={10} />
                  </button>
                </div>

                {/* Total del ítem */}
                <div className="text-right">
                  <p className="text-xs font-semibold text-gray-900">
                    {formatCOP(item.unit_price * item.quantity)}
                  </p>
                  <button
                    onClick={() => removeItem(item.product_id)}
                    className="text-[10px] text-gray-300 hover:text-red-400 transition-colors">
                    quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer con totales y botón de cobro ── */}
      <div className="border-t border-gray-100 p-4 space-y-3">

        {/* Totales */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Subtotal</span>
            <span>{formatCOP(totals.subtotal)}</span>
          </div>
          {totals.tax_total > 0 && (
            <div className="flex justify-between text-xs text-gray-500">
              <span>IVA</span>
              <span>{formatCOP(totals.tax_total)}</span>
            </div>
          )}
          {totals.discount_amount > 0 && (
            <div className="flex justify-between text-xs text-green-600">
              <span>Descuento</span>
              <span>- {formatCOP(totals.discount_amount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-900 text-base pt-2 mt-0.5 border-t border-gray-200">
            <span>Total</span>
            <span className="text-brand-700">{formatCOP(totals.total)}</span>
          </div>
        </div>

        {/* Botón descuento */}
        <button
          onClick={onDiscount}
          disabled={isEmpty}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-gray-300 rounded-xl text-xs text-gray-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50/50 disabled:opacity-40 transition-all">
          <Percent size={12} />
          Aplicar descuento
        </button>

        {/* Botón COBRAR — CTA principal */}
        <button
          onClick={onPay}
          disabled={isEmpty || !cashSession || isProcessing}
          className={`
            w-full h-14 text-white font-black text-lg rounded-2xl flex items-center justify-center gap-2.5
            transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed
            ${!isEmpty && cashSession && !isProcessing
              ? 'bg-brand-600 hover:bg-brand-700 shadow-xl shadow-brand-600/35 hover:shadow-brand-700/40 hover:-translate-y-0.5'
              : 'bg-brand-600 shadow-lg shadow-brand-600/20'}
          `}>
          {isProcessing ? (
            <><RefreshCw size={20} className="animate-spin" /> Procesando…</>
          ) : (
            <>
              <CheckCircle2 size={20} strokeWidth={2.5} />
              <span>
                Cobrar
                {!isEmpty && <span className="ml-1.5 font-extrabold">{formatCOP(totals.total)}</span>}
              </span>
              {!isEmpty && <kbd className="text-[11px] font-mono opacity-60 bg-white/15 px-1.5 py-0.5 rounded ml-auto">F4</kbd>}
            </>
          )}
        </button>

        {/* Guardia: explica por qué el botón Cobrar está deshabilitado */}
        {!cashSession && (
          <button
            onClick={onOpenCashModal}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl py-2 hover:bg-amber-100 transition-colors"
          >
            <AlertCircle size={13} />
            Sin caja activa — toca para abrir caja
          </button>
        )}

        {!isOnline && !isEmpty && (
          <p className="text-[10px] text-amber-600 text-center">
            Sin internet — la venta se guardará localmente
          </p>
        )}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 4: PaymentModal.jsx
// src/components/pos/PaymentModal.jsx
// ─────────────────────────────────────────────────────────────────────────────

function PaymentModal({ onClose }) {
  const { totals, items, customerName, processPayment, processPaymentMixed, isProcessing, clearOrder } = usePOS();
  const [method,       setMethod]       = useState('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [mixCash,      setMixCash]      = useState('');
  const [mixCard,      setMixCard]      = useState('');
  const [step,         setStep]         = useState('select'); // 'select' | 'done' | 'done-offline'
  const [finalChange,  setFinalChange]  = useState(0);       // vuelto fijo para pantalla post-venta
  const cashInputRef = useRef(null);
  const mixCashRef   = useRef(null);

  const total        = totals.total;
  const cashAmt      = Number(cashReceived) || 0;
  const change       = method === 'cash' ? Math.max(0, cashAmt - total) : 0;
  const cashSufficient = method !== 'cash' || (cashAmt >= total && cashAmt >= 0);

  // Mixto: auto-completar card cuando se ingresa cash
  const mixCashAmt = Number(mixCash) || 0;
  const mixCardAmt = Number(mixCard) || 0;
  const mixValid   = method === 'mixed' && mixCashAmt > 0 && mixCardAmt > 0 && (mixCashAmt + mixCardAmt) === total;

  function handleMixCashChange(val) {
    setMixCash(val)
    const remaining = total - (Number(val) || 0)
    setMixCard(remaining > 0 ? String(remaining) : '')
  }

  // Auto-focus en el input según el método
  useEffect(() => {
    if (method === 'cash')  setTimeout(() => cashInputRef.current?.focus(), 100);
    if (method === 'mixed') setTimeout(() => mixCashRef.current?.focus(), 100);
  }, [method]);

  const PAYMENT_METHODS = [
    { id: 'cash',        label: 'Efectivo',      icon: DollarSign,   color: 'green' },
    { id: 'card_debit',  label: 'Tarjeta débito', icon: CreditCard,   color: 'blue' },
    { id: 'card_credit', label: 'Tarjeta crédito',icon: CreditCard,   color: 'purple' },
    { id: 'nequi',       label: 'Nequi',          icon: Smartphone,   color: 'pink' },
    { id: 'daviplata',   label: 'Daviplata',      icon: Smartphone,   color: 'orange' },
    { id: 'transfer',    label: 'Transferencia',  icon: ChevronRight, color: 'gray' },
    { id: 'mixed',       label: 'Mixto',          icon: Split,        color: 'indigo' },
  ];

  const colorMap = {
    green:  'bg-green-50 border-green-200 text-green-700',
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    pink:   'bg-pink-50 border-pink-200 text-pink-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    gray:   'bg-gray-50 border-gray-200 text-gray-700',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  };

  async function handleConfirm() {
    if (method === 'mixed') {
      if (!mixValid) {
        toast.error(`La suma debe ser exactamente ${formatCOP(total)}`);
        return;
      }
      try {
        const order = await processPaymentMixed(mixCashAmt, mixCardAmt);
        setFinalChange(0);
        setStep(order?.offline ? 'done-offline' : 'done');
      } catch {}
      return;
    }
    if (method === 'cash' && cashAmt < 0) {
      toast.error('El monto recibido no puede ser negativo');
      return;
    }
    try {
      const order = await processPayment(method, method === 'cash' ? cashAmt : total);
      // Guardar el vuelto ANTES de que el estado cambie
      setFinalChange(change);
      setStep(order?.offline ? 'done-offline' : 'done');
      // SIN auto-close: el cajero decide cuándo pasar al siguiente cliente
    } catch {}
  }

  function handleNewSale() {
    clearOrder();
    onClose();
  }

  function handlePrint() {
    // Inyectar div de recibo en el DOM para que @media print lo muestre
    const existing = document.getElementById('print-receipt');
    if (existing) existing.remove();

    const lines = [];
    if (customerName) lines.push(`<div class="receipt-row"><span>Cliente</span><span>${customerName}</span></div>`);
    items.forEach(i => {
      lines.push(`<div class="receipt-row"><span>${i.product_name} x${i.quantity}</span><span>$${(i.unit_price * i.quantity).toLocaleString('es-CO')}</span></div>`);
    });

    const div = document.createElement('div');
    div.id = 'print-receipt';
    div.style.display = 'none';
    div.innerHTML = `
      <div class="receipt-logo">FERZU POS</div>
      <div class="receipt-divider"></div>
      ${lines.join('')}
      <div class="receipt-divider"></div>
      <div class="receipt-row receipt-total"><span>TOTAL</span><span>$${totals.total.toLocaleString('es-CO')}</span></div>
      ${finalChange > 0 ? `<div class="receipt-change">Vuelto: $${finalChange.toLocaleString('es-CO')}</div>` : ''}
      <div class="receipt-divider"></div>
      <div class="receipt-footer">¡Gracias por su compra!</div>
    `;
    document.body.appendChild(div);
    window.print();
    setTimeout(() => div.remove(), 2000);
  }

  // Genera texto de recibo para WhatsApp
  function buildWhatsAppReceipt() {
    const lines = ['*Recibo de compra — FERZU POS*', '']
    if (customerName) lines.push(`Cliente: ${customerName}`)
    items.forEach(i => lines.push(`• ${i.product_name} x${i.quantity}  ${formatCOP(i.unit_price * i.quantity)}`))
    lines.push('', `*Total:  ${formatCOP(totals.total)}*`)
    if (finalChange > 0) lines.push(`Vuelto:  ${formatCOP(finalChange)}`)
    lines.push('', `Gracias por su compra 🛍️`)
    return encodeURIComponent(lines.join('\n'))
  }

  // ── PANTALLA POST-VENTA: online ──────────────────────────────────────────────
  // Sin auto-close. El cajero controla cuándo pasar al siguiente cliente.
  if (step === 'done' || step === 'done-offline') {
    const isOffline = step === 'done-offline'
    return (
      <Modal onClose={handleNewSale} size="sm">
        <div className="flex flex-col items-center py-6 gap-5 px-6">

          {/* Ícono y estado */}
          <div className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg ${
            isOffline ? 'bg-amber-100 shadow-amber-200' : 'bg-green-100 shadow-green-200'
          }`}>
            {isOffline
              ? <span className="text-4xl">📦</span>
              : <CheckCircle2 size={40} className="text-green-600" />}
          </div>

          <div className="text-center">
            <p className="text-xl font-bold text-gray-900">
              {isOffline ? 'Venta guardada offline' : '¡Cobro exitoso!'}
            </p>
            {isOffline && (
              <p className="text-xs text-gray-400 mt-1 max-w-[220px]">
                Se sincronizará automáticamente cuando regrese la conexión
              </p>
            )}
          </div>

          {/* VUELTO — grande y visible para mostrarlo al cliente */}
          {method === 'cash' && finalChange > 0 ? (
            <div className={`w-full rounded-2xl px-6 py-5 text-center border-2 ${
              isOffline
                ? 'bg-amber-50 border-amber-200'
                : 'bg-green-50 border-green-300'
            }`}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">
                Vuelto al cliente
              </p>
              <p className={`text-5xl font-black ${isOffline ? 'text-amber-600' : 'text-green-600'}`}>
                {formatCOP(finalChange)}
              </p>
            </div>
          ) : method !== 'cash' ? (
            <div className="w-full bg-blue-50 border-2 border-blue-200 rounded-2xl px-6 py-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">Total cobrado</p>
              <p className="text-4xl font-black text-blue-700">{formatCOP(total)}</p>
            </div>
          ) : null}

          {/* Acciones post-venta */}
          <div className="w-full space-y-2 pt-1">
            {/* Botón principal — próximo cliente */}
            <button
              onClick={handleNewSale}
              className="w-full h-12 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-600/25">
              <ShoppingCart size={18} />
              Nueva venta
            </button>

            {/* WhatsApp — diferenciador colombiano */}
            <a
              href={`https://wa.me/?text=${buildWhatsAppReceipt()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-10 border border-green-400 text-green-700 bg-green-50 hover:bg-green-100 font-semibold rounded-xl flex items-center justify-center gap-2 text-sm transition-all">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.136.558 4.14 1.535 5.877L0 24l6.273-1.509A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.8 9.8 0 01-5.022-1.381l-.36-.214-3.73.897.93-3.63-.234-.373A9.774 9.774 0 012.182 12C2.182 6.562 6.562 2.182 12 2.182S21.818 6.562 21.818 12 17.438 21.818 12 21.818z"/>
              </svg>
              Enviar recibo por WhatsApp
            </a>

            {/* Imprimir — usa window.print() con CSS de recibo */}
            <button
              onClick={handlePrint}
              className="w-full h-10 border border-gray-200 text-gray-500 hover:bg-gray-50 font-medium rounded-xl flex items-center justify-center gap-2 text-sm transition-all">
              <Printer size={15} />
              Imprimir recibo
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title="Cobrar orden">
      <div className="p-5 space-y-5">

        {/* Total a cobrar */}
        <div className="bg-gradient-to-br from-brand-50 to-emerald-50 rounded-2xl p-4 text-center border border-brand-100">
          <p className="text-[11px] font-semibold text-brand-600 mb-1 uppercase tracking-wide">Total a cobrar</p>
          <p className="text-3xl font-bold text-gray-900">{formatCOP(total)}</p>
        </div>

        {/* Métodos de pago */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Método de pago</p>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map(({ id, label, icon: Icon, color }) => (
              <button
                key={id}
                onClick={() => setMethod(id)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                  method === id
                    ? colorMap[color] + ' border-2'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                <Icon size={18} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Input de efectivo */}
        {method === 'cash' && (
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">
              Efectivo recibido
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                ref={cashInputRef}
                type="number"
                min="0"
                value={cashReceived}
                onChange={e => setCashReceived(e.target.value)}
                onFocus={e => e.target.select()}
                placeholder={total.toString()}
                className="w-full pl-7 pr-4 h-12 border-2 border-gray-200 focus:border-brand-400 rounded-xl text-lg font-semibold outline-none text-right"
              />
            </div>

            {/* Botones de denominaciones */}
            <div className="flex gap-2 mt-2">
              {[5000, 10000, 20000, 50000].map(denom => (
                <button
                  key={denom}
                  onClick={() => setCashReceived(String(denom))}
                  className="flex-1 py-1.5 text-[11px] bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 text-gray-600">
                  ${(denom/1000).toFixed(0)}k
                </button>
              ))}
              <button
                onClick={() => setCashReceived(String(Math.ceil(total / 1000) * 1000))}
                className="flex-1 py-1.5 text-[11px] bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100 text-brand-700">
                Exacto
              </button>
            </div>

            {/* Vuelto en tiempo real */}
            {cashAmt > 0 && (
              <div className={`mt-3 rounded-xl p-3 flex justify-between items-center ${
                cashSufficient ? 'bg-green-50' : 'bg-red-50'
              }`}>
                <span className="text-sm text-gray-600">
                  {cashSufficient ? 'Vuelto' : 'Falta'}
                </span>
                <span className={`text-lg font-bold ${cashSufficient ? 'text-green-600' : 'text-red-500'}`}>
                  {cashSufficient ? formatCOP(change) : formatCOP(total - cashAmt)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Inputs de pago mixto */}
        {method === 'mixed' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Efectivo recibido</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  ref={mixCashRef}
                  type="number"
                  min="0"
                  max={total}
                  value={mixCash}
                  onChange={e => handleMixCashChange(e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="0"
                  className="w-full pl-7 pr-4 h-12 border-2 border-gray-200 focus:border-indigo-400 rounded-xl text-lg font-semibold outline-none text-right"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Tarjeta débito</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  max={total}
                  value={mixCard}
                  onChange={e => setMixCard(e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="0"
                  className="w-full pl-7 pr-4 h-12 border-2 border-gray-200 focus:border-indigo-400 rounded-xl text-lg font-semibold outline-none text-right"
                />
              </div>
            </div>
            <div className={`rounded-xl p-3 flex justify-between items-center text-sm ${
              mixValid ? 'bg-indigo-50 text-indigo-700' : 'bg-red-50 text-red-600'
            }`}>
              <span>Suma</span>
              <span className="font-bold">{formatCOP(mixCashAmt + mixCardAmt)} / {formatCOP(total)}</span>
            </div>
          </div>
        )}

        {/* Botón confirmar */}
        <button
          onClick={handleConfirm}
          disabled={isProcessing || (method === 'cash' && !cashSufficient && cashAmt > 0) || (method === 'mixed' && !mixValid)}
          className="w-full h-12 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-600/25">
          {isProcessing ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          {isProcessing ? 'Procesando...' : `Confirmar cobro · ${formatCOP(total)}`}
        </button>
      </div>
    </Modal>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 5: CustomerSearch.jsx
// ─────────────────────────────────────────────────────────────────────────────

function CustomerSearch({ onClose, organizationId }) {
  const { dispatch }         = usePOS();
  const [query, setQuery]    = useState('');
  const [results, setResults]= useState([]);
  const [loading, setLoading]= useState(false);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function search() {
    setLoading(true);
    try {
      const { default: api } = await import('../lib/api.js');
      const { data } = await api.get('/customers', { params: { search: query, limit: 10 } });
      setResults(data || []);
    } finally {
      setLoading(false);
    }
  }

  function selectCustomer(customer) {
    const name = `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim();
    dispatch({ type: 'SET_CUSTOMER', payload: { id: customer.id, name } });
    toast.success(`Cliente: ${name}`);
    onClose();
  }

  return (
    <Modal onClose={onClose} title="Seleccionar cliente">
      <div className="p-4 space-y-4">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Nombre, teléfono o cédula..."
          className="w-full h-10 border border-gray-200 rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-brand-400"
        />

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {loading && <p className="text-sm text-center text-gray-400 py-4">Buscando...</p>}
          {results.map(c => (
            <button
              key={c.id}
              onClick={() => selectCustomer(c)}
              className="w-full text-left flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 border border-gray-100">
              <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold shrink-0">
                {(c.first_name?.[0] || '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {c.first_name} {c.last_name}
                </p>
                <p className="text-xs text-gray-400 truncate">
                  {c.phone || c.email || c.document_number}
                </p>
              </div>
              {c.segment === 'vip' && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">VIP</span>
              )}
              <p className="text-xs text-gray-400 shrink-0">{formatCOP(c.total_spent || 0)}</p>
            </button>
          ))}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400 mb-3">No se encontró el cliente</p>
              <button
                onClick={() => toast('Creación de clientes disponible en módulo Clientes', { icon: '👥' })}
                className="text-sm text-brand-600 hover:underline">
                + Crear nuevo cliente
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 6: DiscountModal.jsx
// ─────────────────────────────────────────────────────────────────────────────

function DiscountModal({ onClose }) {
  const { setDiscount, totals } = usePOS();
  const { isAdmin } = useAuth();
  const [type,       setType]       = useState('percentage');
  const [value,      setValue]      = useState('');
  const [reason,     setReason]     = useState('');
  const [pin,        setPin]        = useState('');
  const [needPin,    setNeedPin]    = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinUser,    setPinUser]    = useState(null); // gerente que autorizó

  const maxDiscount = isAdmin ? 100 : 15; // Cajeros: hasta 15%; admin/gerente: hasta 100%

  async function handleApply() {
    const numVal = Number(value);
    if (!numVal || numVal <= 0) { toast.error('Ingresa un valor de descuento'); return; }
    if (!reason.trim()) { toast.error('Indica el motivo del descuento'); return; }

    // Descuento sobre el límite del cajero → requiere autorización de gerencia con PIN real
    const needsAuth = type === 'percentage' && numVal > maxDiscount && !isAdmin;
    if (needsAuth) {
      if (!needPin) { setNeedPin(true); return; }
      if (!pin || pin.length < 4) {
        toast.error('Ingresa el PIN de gerencia');
        return;
      }
      // Validar PIN contra backend si todavía no está autorizado
      if (!pinUser) {
        setPinLoading(true);
        try {
          const { data } = await api.post('/auth/verify-pin', { pin });
          if (!data.valid) {
            toast.error('PIN incorrecto');
            return;
          }
          if (!['admin', 'owner', 'manager'].includes(data.user?.role)) {
            toast.error('Este PIN no tiene permisos para autorizar descuentos');
            return;
          }
          setPinUser(data.user);
        } catch {
          toast.error('Error al verificar el PIN. Intenta de nuevo.');
          return;
        } finally {
          setPinLoading(false);
        }
      }
    }

    const authorizedBy = pinUser?.full_name ?? null;
    setDiscount({ type: type === 'percentage' ? 'pct' : 'fixed', value: numVal, reason, authorizedBy });
    toast.success(`Descuento de ${type === 'percentage' ? numVal + '%' : formatCOP(numVal)} aplicado`);
    onClose();
  }

  const previewDiscount = type === 'percentage'
    ? Math.round(totals.total * Number(value) / 100)
    : Number(value);

  return (
    <Modal onClose={onClose} title="Aplicar descuento" size="sm">
      <div className="p-5 space-y-4">
        {/* Tipo de descuento */}
        <div className="flex gap-2">
          {[
            { id: 'percentage', label: '% Porcentaje' },
            { id: 'fixed',      label: '$ Valor fijo' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => { setType(t.id); setValue(''); }}
              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                type === t.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-gray-50 text-gray-600 border-gray-200'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Valor */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {type === 'percentage' ? '%' : '$'}
          </span>
          <input
            autoFocus
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
            max={type === 'percentage' ? 100 : totals.total}
            className="w-full pl-8 pr-4 h-11 border-2 border-gray-200 focus:border-brand-400 rounded-xl text-lg font-semibold text-right outline-none"
            placeholder={type === 'percentage' ? '10' : '5000'}
          />
        </div>

        {/* Porcentajes rápidos */}
        {type === 'percentage' && (
          <div className="flex gap-2">
            {[5, 10, 15, 20].map(p => (
              <button
                key={p}
                onClick={() => setValue(String(p))}
                className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                  Number(value) === p ? 'bg-brand-100 border-brand-300 text-brand-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                } ${p > maxDiscount ? 'opacity-50' : ''}`}>
                {p}%
              </button>
            ))}
          </div>
        )}

        {/* Preview del descuento */}
        {value && Number(value) > 0 && (
          <div className="bg-green-50 rounded-xl p-3 flex justify-between">
            <span className="text-sm text-gray-600">Ahorro del cliente</span>
            <span className="text-sm font-bold text-green-600">- {formatCOP(previewDiscount)}</span>
          </div>
        )}

        {/* Motivo */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Motivo (obligatorio)</label>
          <select
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full h-10 border border-gray-200 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-brand-400">
            <option value="">Seleccionar motivo...</option>
            <option>Cliente frecuente</option>
            <option>Producto dañado / cerca de vencimiento</option>
            <option>Promoción del día</option>
            <option>Cortesía gerencia</option>
            <option>Otro</option>
          </select>
        </div>

        {needPin && (
          <div className="rounded-xl p-3 border border-amber-200 bg-amber-50">
            {pinUser ? (
              <p className="text-xs text-green-700 font-semibold">
                ✓ Autorizado por {pinUser.full_name}
              </p>
            ) : (
              <>
                <p className="text-xs text-amber-700 mb-2">
                  Descuento mayor al {maxDiscount}% — requiere PIN de gerencia
                </p>
                <input
                  type="password"
                  maxLength={6}
                  value={pin}
                  onChange={e => { setPin(e.target.value); setPinUser(null); }}
                  placeholder="PIN gerencia"
                  autoFocus
                  className="w-full h-10 border border-amber-300 rounded-lg px-3 text-sm outline-none focus:ring-2 focus:ring-amber-400 text-center tracking-widest"
                />
              </>
            )}
          </div>
        )}

        <button
          onClick={handleApply}
          disabled={!value || !reason || pinLoading}
          className="w-full h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-md shadow-brand-600/20">
          {pinLoading ? 'Verificando PIN…' : 'Aplicar descuento'}
        </button>
      </div>
    </Modal>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 7: CashSessionModal.jsx
// ─────────────────────────────────────────────────────────────────────────────

// Denominaciones colombianas para el conteo físico
const BILL_DENOMS   = [100000, 50000, 20000, 10000, 5000, 2000, 1000];
const COIN_DENOMS   = [500, 200, 100, 50];

function CashSessionModal({ onClose, branchId }) {
  const { cashSession, dispatch } = usePOS();
  const { user }           = useAuth();

  // ── APERTURA ──
  const [openCash, setOpenCash] = useState('');
  // ── CIERRE ──
  const [step,       setStep]      = useState('summary'); // 'summary' | 'counting' | 'report'
  const [summary,    setSummary]   = useState(null);
  const [loadSum,    setLoadSum]   = useState(false);
  const [closingCash,setClosingCash]= useState('');
  const [counts,     setCounts]    = useState({});       // { 100000: 0, 50000: 0, ... }
  const [notes,      setNotes]     = useState('');
  const [closing,    setClosing]   = useState(false);
  const [closedData, setClosedData]= useState(null);     // datos retornados al cerrar
  const [openLoading,setOpenLoading]= useState(false);

  const isOpen = !!cashSession;

  // Calcular total desde conteo de billetes/monedas
  const countedTotal = [...BILL_DENOMS, ...COIN_DENOMS].reduce(
    (sum, d) => sum + (Number(counts[d]) || 0) * d, 0
  );
  // Si hay conteo activo, usa ese total; si no, el campo manual
  const closingAmt = step === 'counting' ? countedTotal : (Number(closingCash) || 0);

  // Cargar resumen al abrir modal de cierre
  useEffect(() => {
    if (!isOpen || !cashSession?.id) return;
    setLoadSum(true);
    api.get(`/cash-sessions/${cashSession.id}/summary`)
      .then(r => setSummary(r.data))
      .catch(() => setSummary(null))
      .finally(() => setLoadSum(false));
  }, [cashSession?.id, isOpen]);

  // ── ABRIR SESIÓN ──────────────────────────────────────────────────────────
  async function openSession() {
    if (!branchId) { toast.error('Selecciona una sucursal primero'); return; }
    setOpenLoading(true);
    try {
      const session = await cashAPI.open({ branch_id: branchId, opening_cash: Number(openCash) || 0 });
      dispatch({ type: 'SET_CASH_SESSION', payload: session });
      toast.success('Caja abierta correctamente');
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al abrir caja');
    } finally { setOpenLoading(false); }
  }

  // ── CERRAR SESIÓN ─────────────────────────────────────────────────────────
  async function closeSession() {
    if (!cashSession?.id) return;
    setClosing(true);
    try {
      const data = await cashAPI.close(cashSession.id, { closing_cash: Math.round(closingAmt), notes });
      dispatch({ type: 'SET_CASH_SESSION', payload: null });
      setClosedData(data);
      setStep('report');
      toast.success('Caja cerrada');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Error al cerrar caja');
    } finally { setClosing(false); }
  }

  const openedAt  = cashSession?.opened_at
    ? new Date(cashSession.opened_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    : '';
  const openingCash = cashSession?.opening_cash ?? 0;
  const expectedCash = openingCash + (summary?.total_cash ?? 0);
  const difference   = closingAmt > 0 ? closingAmt - expectedCash : null;

  // ── MODAL APERTURA ────────────────────────────────────────────────────────
  if (!isOpen) {
    return (
      <Modal title="Abrir caja" hideClose>
        <div className="p-6 space-y-5">
          <div className="text-center">
            <p className="text-sm text-gray-500">Cajero</p>
            <p className="font-semibold text-gray-900">{user?.full_name}</p>
            <p className="text-xs text-gray-400">{new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Efectivo inicial en caja</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input autoFocus type="number" value={openCash} onChange={e => setOpenCash(e.target.value)} placeholder="0"
                className="w-full pl-7 pr-4 h-12 border-2 border-gray-200 focus:border-brand-400 rounded-xl text-xl font-bold text-right outline-none" />
            </div>
            <p className="text-xs text-gray-400 mt-1">Cuenta el efectivo disponible y digita el monto</p>
          </div>
          <button onClick={openSession} disabled={openLoading}
            className="w-full h-12 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-brand-600/25">
            {openLoading ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
            {openLoading ? 'Abriendo...' : 'Abrir caja y empezar'}
          </button>
        </div>
      </Modal>
    );
  }

  // ── INFORME POST-CIERRE ───────────────────────────────────────────────────
  if (step === 'report' && closedData) {
    const diff = closedData.cash_difference ?? 0;
    const dur  = closedData.closed_at && closedData.opened_at
      ? Math.round((new Date(closedData.closed_at) - new Date(closedData.opened_at)) / 60000)
      : null;
    return (
      <Modal title="Informe de turno" onClose={onClose} size="md">
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Encabezado */}
          <div className={`rounded-2xl p-4 text-center ${Math.abs(diff) === 0 ? 'bg-green-50' : Math.abs(diff) > 50000 ? 'bg-red-50' : 'bg-amber-50'}`}>
            <p className="text-2xl font-black">{formatCOP(closedData.total_sales ?? 0)}</p>
            <p className="text-sm text-gray-500 mt-1">Total ventas del turno</p>
            {dur !== null && <p className="text-xs text-gray-400 mt-0.5">Duración: {dur < 60 ? `${dur} min` : `${Math.floor(dur/60)}h ${dur%60}min`}</p>}
          </div>

          {/* Desglose por método de pago */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
            <p className="font-semibold text-gray-700 mb-3">Desglose por método de pago</p>
            {[
              { label: 'Efectivo',       value: closedData.total_cash       ?? 0, icon: '💵' },
              { label: 'Tarjeta',        value: closedData.total_card       ?? 0, icon: '💳' },
              { label: 'Nequi',          value: closedData.total_nequi      ?? 0, icon: '📱' },
              { label: 'Daviplata',      value: closedData.total_daviplata  ?? 0, icon: '📲' },
              { label: 'Transferencia',  value: closedData.total_transfers  ?? 0, icon: '🏦' },
            ].filter(m => m.value > 0).map(m => (
              <div key={m.label} className="flex justify-between items-center">
                <span className="text-gray-500">{m.icon} {m.label}</span>
                <span className="font-semibold">{formatCOP(m.value)}</span>
              </div>
            ))}
            {(closedData.total_discounts ?? 0) > 0 && (
              <div className="flex justify-between items-center text-red-600 border-t border-gray-200 pt-2 mt-1">
                <span>🏷️ Descuentos otorgados</span>
                <span className="font-semibold">-{formatCOP(closedData.total_discounts)}</span>
              </div>
            )}
          </div>

          {/* Cuadre de caja */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
            <p className="font-semibold text-gray-700 mb-3">Cuadre de efectivo</p>
            <div className="flex justify-between"><span className="text-gray-500">Saldo inicial</span><span>{formatCOP(closedData.opening_cash ?? openingCash)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">+ Ventas efectivo</span><span>{formatCOP(closedData.total_cash ?? 0)}</span></div>
            <div className="flex justify-between font-bold border-t border-gray-200 pt-2 mt-1">
              <span>= Esperado en caja</span>
              <span>{formatCOP((closedData.opening_cash ?? openingCash) + (closedData.total_cash ?? 0))}</span>
            </div>
            <div className="flex justify-between"><span className="text-gray-500">Contado físicamente</span><span>{formatCOP(closedData.closing_cash ?? 0)}</span></div>
          </div>

          {/* Diferencia */}
          <div className={`flex justify-between items-center px-4 py-3 rounded-xl font-bold border-2 ${
            diff === 0 ? 'bg-green-50 border-green-200 text-green-700'
            : diff > 0 ? 'bg-blue-50 border-blue-200 text-blue-700'
            : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            <span>{diff === 0 ? '✓ Caja cuadrada' : diff > 0 ? '↑ Sobrante' : '↓ Faltante'}</span>
            <span>{diff === 0 ? 'Sin diferencia' : formatCOP(Math.abs(diff))}</span>
          </div>

          {closedData.notes && (
            <p className="text-xs text-gray-400 italic px-1">Obs: {closedData.notes}</p>
          )}

          <button onClick={onClose} className="w-full h-11 bg-gray-900 text-white font-bold rounded-2xl">
            Cerrar
          </button>
        </div>
      </Modal>
    );
  }

  // ── MODAL CIERRE: PASO 1 — RESUMEN Y MONTO ───────────────────────────────
  if (step === 'summary') {
    return (
      <Modal title="Cerrar caja" onClose={onClose} size="md">
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">

          {/* Info del turno */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Cajero</span><span className="font-semibold">{user?.full_name}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Apertura</span><span className="font-semibold">{openedAt}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Saldo inicial</span><span className="font-semibold">{formatCOP(openingCash)}</span></div>
          </div>

          {/* Desglose ventas (del summary) */}
          {loadSum ? (
            <div className="flex items-center justify-center py-4 text-gray-400 text-sm gap-2">
              <RefreshCw size={14} className="animate-spin" /> Cargando totales...
            </div>
          ) : summary ? (
            <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
              <div className="flex justify-between text-base font-bold pb-2 border-b border-gray-200">
                <span>Total ventas del turno</span>
                <span className="text-brand-700">{formatCOP(summary.total_sales)}</span>
              </div>
              <p className="text-xs text-gray-400">{summary.order_count} orden{summary.order_count !== 1 ? 'es' : ''} pagada{summary.order_count !== 1 ? 's' : ''}</p>
              {[
                { label: '💵 Efectivo',      value: summary.total_cash },
                { label: '💳 Tarjeta',       value: summary.total_card },
                { label: '📱 Nequi',         value: summary.total_nequi },
                { label: '📲 Daviplata',     value: summary.total_daviplata },
                { label: '🏦 Transferencia', value: summary.total_transfers },
              ].filter(m => m.value > 0).map(m => (
                <div key={m.label} className="flex justify-between text-xs">
                  <span className="text-gray-500">{m.label}</span>
                  <span>{formatCOP(m.value)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Efectivo esperado */}
          {summary && (
            <div className="bg-emerald-50 rounded-xl px-4 py-3 flex justify-between items-center text-sm">
              <span className="text-emerald-700 font-medium">Efectivo esperado en caja</span>
              <span className="font-bold text-emerald-800">{formatCOP(expectedCash)}</span>
            </div>
          )}

          {/* Campo conteo */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Efectivo contado</label>
              <button onClick={() => setStep('counting')}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                Contar por billetes →
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
              <input autoFocus type="number" value={closingCash} onChange={e => setClosingCash(e.target.value)} placeholder="0"
                className="w-full pl-7 pr-4 h-12 border-2 border-gray-200 focus:border-brand-400 rounded-xl text-xl font-bold text-right outline-none" />
            </div>
          </div>

          {/* Diferencia en tiempo real */}
          {difference !== null && (
            <div className={`flex justify-between items-center px-4 py-3 rounded-xl text-sm font-bold border-2 ${
              difference === 0 ? 'bg-green-50 border-green-200 text-green-700'
              : difference > 0 ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              <span>{difference === 0 ? '✓ Sin descuadre' : difference > 0 ? '↑ Sobrante' : '↓ Faltante'}</span>
              <span>{difference === 0 ? '' : formatCOP(Math.abs(difference))}</span>
            </div>
          )}

          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones del turno (opcional)"
            rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:border-brand-400" />

          <button onClick={closeSession} disabled={closing || closingAmt === 0}
            className="w-full h-12 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all">
            {closing ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
            {closing ? 'Cerrando...' : 'Cerrar caja y generar informe'}
          </button>
        </div>
      </Modal>
    );
  }

  // ── MODAL CIERRE: PASO 2 — CONTADOR DE BILLETES ──────────────────────────
  return (
    <Modal title="Contar efectivo" onClose={() => setStep('summary')} size="md">
      <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
        <p className="text-sm text-gray-500">Ingresa cuántos billetes/monedas hay en caja:</p>

        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Billetes</p>
          {BILL_DENOMS.map(d => (
            <div key={d} className="flex items-center gap-3 py-1.5">
              <span className="w-24 text-sm font-medium text-gray-700">{formatCOP(d)}</span>
              <input type="number" min="0" value={counts[d] || ''} onChange={e => setCounts(c => ({ ...c, [d]: e.target.value }))}
                placeholder="0"
                className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-center text-sm font-bold outline-none focus:border-brand-400" />
              <span className="text-xs text-gray-400 flex-1 text-right">{(Number(counts[d]) || 0) > 0 ? formatCOP((Number(counts[d])) * d) : ''}</span>
            </div>
          ))}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">Monedas</p>
          {COIN_DENOMS.map(d => (
            <div key={d} className="flex items-center gap-3 py-1.5">
              <span className="w-24 text-sm font-medium text-gray-700">{formatCOP(d)}</span>
              <input type="number" min="0" value={counts[d] || ''} onChange={e => setCounts(c => ({ ...c, [d]: e.target.value }))}
                placeholder="0"
                className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-center text-sm font-bold outline-none focus:border-brand-400" />
              <span className="text-xs text-gray-400 flex-1 text-right">{(Number(counts[d]) || 0) > 0 ? formatCOP((Number(counts[d])) * d) : ''}</span>
            </div>
          ))}
        </div>

        {/* Total contado */}
        <div className="bg-gray-900 text-white rounded-2xl p-4 flex justify-between items-center">
          <span className="font-medium">Total contado</span>
          <span className="text-2xl font-black">{formatCOP(countedTotal)}</span>
        </div>

        <div className="flex gap-3">
          <button onClick={() => setStep('summary')}
            className="flex-1 h-11 border-2 border-gray-200 text-gray-700 font-bold rounded-2xl">
            ← Atrás
          </button>
          <button onClick={() => { setClosingCash(String(countedTotal)); setStep('summary'); }}
            disabled={countedTotal === 0}
            className="flex-1 h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-bold rounded-2xl">
            Usar este total
          </button>
        </div>
      </div>
    </Modal>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 8: Panel de Propuestas IA (sidebar)
// ─────────────────────────────────────────────────────────────────────────────

function AIProposalsPanel({ proposals, onClose, branchId }) {
  const { approve, reject, isApproving } = useAIProposals(branchId);

  const typeLabels = {
    inventory_entry: { label: 'Inventario',  color: 'blue',   emoji: '📦' },
    purchase_order:  { label: 'Pedido',      color: 'amber',  emoji: '🛒' },
    stock_adjustment:{ label: 'Ajuste',      color: 'red',    emoji: '⚠️' },
    marketing_message:{ label: 'Marketing', color: 'green',  emoji: '📱' },
    price_update:    { label: 'Precio',      color: 'purple', emoji: '💰' },
  };

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-2xl border-l border-gray-100 z-40 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 bg-purple-50/30">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-purple-600" />
          <span className="font-semibold text-gray-900">Agente IA</span>
          {proposals.length > 0 && (
            <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-medium">
              {proposals.length}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {proposals.length === 0 ? (
          <div className="text-center py-10 text-gray-300">
            <Zap size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Sin propuestas pendientes</p>
          </div>
        ) : proposals.map(p => {
          const meta = typeLabels[p.proposal_type] || { label: p.proposal_type, emoji: '🤖' };
          return (
            <div key={p.id} className="bg-white rounded-2xl p-3 space-y-2.5 border border-gray-100 shadow-sm">
              <div className="flex items-start gap-2">
                <span className="text-xl shrink-0">{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-900 leading-tight">{p.title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{p.description}</p>
                </div>
              </div>

              {/* Barra de confianza */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${p.confidence_score}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 shrink-0">{p.confidence_score}%</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => approve({ proposalId: p.id })}
                  disabled={isApproving}
                  className="flex-1 h-8 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all shadow-sm shadow-brand-700/20">
                  <CheckCircle2 size={12} />
                  Aprobar
                </button>
                <button
                  onClick={() => reject({ proposalId: p.id, reason: 'Rechazado manualmente' })}
                  className="h-8 px-3 border border-gray-200 text-gray-500 text-xs rounded-xl hover:bg-gray-100 transition-colors">
                  <X size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Modal base reutilizable
// ─────────────────────────────────────────────────────────────────────────────

function Modal({ children, title, onClose, hideClose = false, size = 'md' }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && !hideClose) onClose?.(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [hideClose, onClose]);

  const sizeMap = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget && !hideClose) onClose?.(); }}>
      <div className={`bg-white rounded-3xl shadow-2xl shadow-gray-900/15 w-full ${sizeMap[size]} overflow-hidden ring-1 ring-gray-200/60`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">{title}</h2>
            {!hideClose && (
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100">
                <X size={16} />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
