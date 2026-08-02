// =============================================================================
// FERZU POS — useThermalPrinter
// Hook React para conectar/desconectar y usar impresora térmica ESC/POS
// vía Web USB API. Usa el singleton getPrinter() para persistir la conexión
// entre renders y entre componentes.
//
// Uso:
//   const { isConnected, connect, disconnect, printReceipt } = useThermalPrinter()
// =============================================================================

import { useState, useCallback } from 'react'
import { getPrinter }            from '../lib/thermalPrinter'
import toast                     from 'react-hot-toast'

export function useThermalPrinter({ width = 80 } = {}) {
  const printer = getPrinter({ width })

  // Inicializa desde el singleton: si ya fue conectado en otro componente, queda true
  const [isConnected, setIsConnected] = useState(() => !!printer.device?.opened)
  const [isPrinting,  setIsPrinting]  = useState(false)

  // connect() DEBE llamarse desde un click de usuario (requisito de Web USB)
  const connect = useCallback(async () => {
    try {
      await printer.connect()
      setIsConnected(true)
      toast.success('Impresora térmica conectada', { icon: '🖨️' })
    } catch (e) {
      toast.error(e.message || 'No se pudo conectar la impresora')
    }
  }, [printer])

  const disconnect = useCallback(async () => {
    await printer.disconnect()
    setIsConnected(false)
    toast('Impresora desconectada', { icon: '🖨️' })
  }, [printer])

  // printReceipt: intenta ESC/POS, retorna false si no conectada (para que el llamador
  // pueda hacer fallback a window.print())
  const printReceipt = useCallback(async (orderData) => {
    if (!printer.isSupported) {
      toast.error('Web USB no soportado. Usa Chrome o Edge en PC.', { duration: 4000 })
      return false
    }
    if (!printer.device?.opened) {
      toast('Conecta primero la impresora (ícono 🖨️ en el menú lateral)', {
        icon: '🖨️', duration: 4000,
      })
      return false
    }
    setIsPrinting(true)
    try {
      await printer.printReceipt(orderData)
      toast.success('Recibo impreso ✓')
      return true
    } catch (e) {
      toast.error('Error al imprimir: ' + (e.message || 'desconocido'))
      return false
    } finally {
      setIsPrinting(false)
    }
  }, [printer])

  const printCashReport = useCallback(async (reportData) => {
    if (!printer.device?.opened) {
      toast('Conecta primero la impresora (ícono 🖨️ en el menú lateral)', {
        icon: '🖨️', duration: 4000,
      })
      return false
    }
    setIsPrinting(true)
    try {
      await printer.printCashReport(reportData)
      toast.success('Informe de caja impreso ✓')
      return true
    } catch (e) {
      toast.error('Error al imprimir: ' + (e.message || 'desconocido'))
      return false
    } finally {
      setIsPrinting(false)
    }
  }, [printer])

  return {
    // isConnected chequea también el singleton por si se conectó en otro componente
    isConnected: isConnected || !!printer.device?.opened,
    isPrinting,
    isSupported: printer.isSupported,
    connect,
    disconnect,
    printReceipt,
    printCashReport,
  }
}
