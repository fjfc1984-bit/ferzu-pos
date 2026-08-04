/**
 * FERZU POS — Exportación de Reportes
 * Excel (.xlsx) con SheetJS + PDF con jsPDF (CDN inline)
 * Usado desde DashboardPage y ReportsPage
 */

// ── Excel con SheetJS (ya como dep del proyecto) ──────────────────────────────
async function loadXLSX() {
  // SheetJS disponible via CDN o como dep
  if (window.XLSX) return window.XLSX
  const { default: XLSX } = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs')
  return XLSX
}

// ── jsPDF para PDF ─────────────────────────────────────────────────────────
async function loadJsPDF() {
  if (window.jsPDF) return window.jsPDF
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    script.onload = () => resolve(window.jspdf.jsPDF)
    document.head.appendChild(script)
  })
}

const COP = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0)

// ── 1. Exportar ventas a Excel ────────────────────────────────────────────────
export async function exportSalesToExcel({ orders, dateRange, businessName }) {
  const XLSX = await loadXLSX()

  const rows = orders.map(o => ({
    'Orden #':          o.order_number || o.id?.slice(0, 8),
    'Fecha':            new Date(o.created_at).toLocaleString('es-CO'),
    'Cajero':           o.staff_name || '—',
    'Método de pago':   o.payment_method,
    'Productos':        (o.order_items || []).map(i => `${i.product_name} x${i.quantity}`).join(', '),
    'Subtotal':         Number(o.subtotal || 0),
    'Descuento':        Number(o.discount_amount || 0),
    'IVA':              Number(o.tax_amount || 0),
    'Total (COP)':      Number(o.total || 0),
    'Estado':           o.status || 'completed',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)

  // Anchos de columna
  ws['!cols'] = [
    { wch: 12 }, { wch: 20 }, { wch: 18 }, { wch: 16 },
    { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 12 },
  ]

  // Hoja resumen
  const totalVentas   = orders.reduce((s, o) => s + Number(o.total || 0), 0)
  const totalDesc     = orders.reduce((s, o) => s + Number(o.discount_amount || 0), 0)
  const promedioVenta = orders.length ? totalVentas / orders.length : 0

  const summary = [
    ['FERZU POS — Reporte de Ventas', ''],
    ['Negocio:', businessName || '—'],
    ['Período:', dateRange || 'Todos'],
    ['Generado:', new Date().toLocaleString('es-CO')],
    ['', ''],
    ['Total de ventas', orders.length],
    ['Ingresos totales', totalVentas],
    ['Descuentos otorgados', totalDesc],
    ['Ticket promedio', promedioVenta],
  ]
  const wsSummary = XLSX.utils.aoa_to_sheet(summary)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen')
  XLSX.utils.book_append_sheet(wb, ws, 'Ventas')

  const fileName = `FERZU_Ventas_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, fileName)
  return fileName
}

// ── 1b. Exportar reporte semanal WoW a Excel ─────────────────────────────────
export async function exportWeeklyToExcel({ weeklyData, businessName }) {
  const XLSX = await loadXLSX();

  const DAY_LABELS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];

  // Hoja comparativa
  const compareRows = weeklyData.current.map((day, i) => ({
    'Día':              DAY_LABELS[i],
    'Fecha':            weeklyData.current_dates[i],
    'Ventas semana':    day.total_revenue,
    'Órdenes semana':   day.total_orders,
    'Ticket prom.':     day.avg_ticket,
    'Ventas sem. ant.': weeklyData.prev[i]?.total_revenue || 0,
    'Órdenes sem. ant.':weeklyData.prev[i]?.total_orders  || 0,
    'Delta %':          weeklyData.prev[i]?.total_revenue > 0
      ? `${Math.round(((day.total_revenue - weeklyData.prev[i].total_revenue) / weeklyData.prev[i].total_revenue) * 100)}%`
      : '—',
  }));

  const ws = XLSX.utils.json_to_sheet(compareRows);
  ws['!cols'] = [
    {wch:10},{wch:12},{wch:16},{wch:14},{wch:14},{wch:16},{wch:16},{wch:10}
  ];

  // Hoja resumen
  const { comparison } = weeklyData;
  const summary = [
    ['FERZU POS — Reporte Semanal', ''],
    ['Negocio:', businessName || '—'],
    ['Semana del:', weeklyData.week_start],
    ['Generado:', new Date().toLocaleString('es-CO')],
    ['', ''],
    ['SEMANA ACTUAL', ''],
    ['Ventas totales', comparison.revenue.current],
    ['Órdenes',        comparison.orders.current],
    ['Ticket promedio', comparison.avg_ticket.current],
    ['', ''],
    ['SEMANA ANTERIOR', ''],
    ['Ventas totales', comparison.revenue.prev],
    ['Órdenes',        comparison.orders.prev],
    ['Ticket promedio', comparison.avg_ticket.prev],
    ['', ''],
    ['VARIACIÓN WoW', ''],
    ['Ventas %',    `${comparison.revenue.delta_pct ?? '—'}%`],
    ['Órdenes %',   `${comparison.orders.delta_pct ?? '—'}%`],
    ['Ticket % ',   `${comparison.avg_ticket.delta_pct ?? '—'}%`],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen WoW');
  XLSX.utils.book_append_sheet(wb, ws, 'Por día');

  const fileName = `FERZU_Semanal_${weeklyData.week_start}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

// ── 2. Exportar inventario a Excel ────────────────────────────────────────────
export async function exportInventoryToExcel({ products, businessName }) {
  const XLSX = await loadXLSX()

  const rows = products.map(p => ({
    'SKU':              p.sku || '—',
    'Producto':         p.name,
    'Categoría':        p.category_name || '—',
    'Stock actual':     Number(p.quantity || 0),
    'Stock mínimo':     Number(p.min_stock || 0),
    'Estado':           p.quantity <= 0 ? 'Sin stock' : p.quantity <= p.min_stock ? 'Stock bajo' : 'OK',
    'Precio venta':     Number(p.price || 0),
    'Precio costo':     Number(p.cost_price || 0),
    'Margen (%)':       p.cost_price
                          ? (((p.price - p.cost_price) / p.price) * 100).toFixed(1) + '%'
                          : '—',
    'Activo':           p.is_active ? 'Sí' : 'No',
  }))

  const ws   = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 14 }, { wch: 30 }, { wch: 18 }, { wch: 12 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 8 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario')

  const fileName = `FERZU_Inventario_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, fileName)
  return fileName
}

// ── 3. PDF de resumen ejecutivo ───────────────────────────────────────────────
export async function exportSummaryPDF({ kpis, businessName, dateRange, topProducts }) {
  const JsPDF = await loadJsPDF()
  const doc   = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const W    = 210   // A4 width mm
  const pad  = 20
  let   y    = pad

  // Header
  doc.setFillColor(5, 150, 105)  // emerald-600
  doc.rect(0, 0, W, 35, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('FERZU POS', pad, 16)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text('Reporte Ejecutivo de Ventas', pad, 24)
  doc.text(new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }), W - pad, 24, { align: 'right' })
  y = 50

  // Business info
  doc.setTextColor(31, 41, 55)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(businessName || 'Mi Negocio', pad, y)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(107, 114, 128)
  doc.text(`Período: ${dateRange || 'Hoy'}`, pad, y + 7)
  y += 20

  // KPI Cards (2 por fila)
  const kpiData = [
    { label: 'Ventas del período',  value: COP(kpis?.totalSales),     color: [5, 150, 105]   },
    { label: 'Número de órdenes',   value: kpis?.totalOrders || '0',  color: [59, 130, 246]  },
    { label: 'Ticket promedio',     value: COP(kpis?.avgTicket),      color: [245, 158, 11]  },
    { label: 'Clientes únicos',     value: kpis?.uniqueCustomers || '—', color: [139, 92, 246] },
  ]

  const cardW = (W - pad * 2 - 10) / 2
  const cardH = 28

  kpiData.forEach((kpi, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x   = pad + col * (cardW + 10)
    const cy  = y + row * (cardH + 8)

    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, cy, cardW, cardH, 3, 3, 'F')
    doc.setDrawColor(...kpi.color)
    doc.setLineWidth(0.5)
    doc.line(x, cy, x, cy + cardH)

    doc.setFontSize(8)
    doc.setTextColor(107, 114, 128)
    doc.setFont('helvetica', 'normal')
    doc.text(kpi.label, x + 6, cy + 9)

    doc.setFontSize(14)
    doc.setTextColor(...kpi.color)
    doc.setFont('helvetica', 'bold')
    doc.text(String(kpi.value), x + 6, cy + 21)
  })

  y += Math.ceil(kpiData.length / 2) * (cardH + 8) + 14

  // Top productos
  if (topProducts?.length > 0) {
    doc.setFontSize(12)
    doc.setTextColor(31, 41, 55)
    doc.setFont('helvetica', 'bold')
    doc.text('Productos más vendidos', pad, y)
    y += 8

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')

    topProducts.slice(0, 8).forEach((p, i) => {
      const barW = Math.max(5, (p.quantity / (topProducts[0]?.quantity || 1)) * (W - pad * 2 - 60))
      doc.setFillColor(5, 150, 105)
      doc.rect(pad, y + i * 9, barW, 6, 'F')
      doc.setTextColor(31, 41, 55)
      doc.text(`${i + 1}. ${p.product_name || p.name}`, pad + barW + 4, y + i * 9 + 4.5)
      doc.text(`${p.quantity} uds`, W - pad, y + i * 9 + 4.5, { align: 'right' })
    })

    y += topProducts.slice(0, 8).length * 9 + 14
  }

  // Footer
  doc.setFillColor(243, 244, 246)
  doc.rect(0, 280, W, 17, 'F')
  doc.setFontSize(8)
  doc.setTextColor(107, 114, 128)
  doc.setFont('helvetica', 'normal')
  doc.text('Generado por FERZU POS · ferzu-pos.vercel.app', W / 2, 289, { align: 'center' })

  const fileName = `FERZU_Resumen_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(fileName)
  return fileName
}
