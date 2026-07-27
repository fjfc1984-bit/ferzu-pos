/**
 * FERZU POS — Botón de exportación de reportes
 * Dropdown para exportar ventas (.xlsx) o resumen ejecutivo (.pdf)
 * Integrar en DashboardPage header
 */

import { useState, useRef, useEffect } from 'react'
import { Download, FileSpreadsheet, FileText, Loader2, CheckCircle } from 'lucide-react'
import { exportSalesToExcel, exportSummaryPDF } from '../lib/exportReports.js'

export function ReportExporter({ kpis, orders = [], topProducts = [], businessName, dateRange }) {
  const [open,   setOpen]   = useState(false)
  const [status, setStatus] = useState(null)   // null | 'loading' | 'done'
  const ref = useRef(null)

  // Cerrar al clickear fuera
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function handleExport(type) {
    setOpen(false)
    setStatus('loading')
    try {
      if (type === 'xlsx') {
        await exportSalesToExcel({ orders, dateRange, businessName })
      } else {
        await exportSummaryPDF({ kpis, businessName, dateRange, topProducts })
      }
      setStatus('done')
      setTimeout(() => setStatus(null), 2000)
    } catch (err) {
      console.error('Export error', err)
      setStatus(null)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={status === 'loading'}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200
                   text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'loading' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : status === 'done' ? (
          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
        ) : (
          <Download className="w-3.5 h-3.5" />
        )}
        {status === 'done' ? 'Descargado' : 'Exportar'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-lg
                        border border-gray-100 py-1 z-20">
          <button
            onClick={() => handleExport('xlsx')}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700
                       hover:bg-gray-50 transition-colors text-left"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <p className="font-medium">Excel (.xlsx)</p>
              <p className="text-xs text-gray-400">Detalle de ventas</p>
            </div>
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700
                       hover:bg-gray-50 transition-colors text-left"
          >
            <FileText className="w-4 h-4 text-red-500 shrink-0" />
            <div>
              <p className="font-medium">PDF ejecutivo</p>
              <p className="text-xs text-gray-400">KPIs y top productos</p>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

export default ReportExporter
