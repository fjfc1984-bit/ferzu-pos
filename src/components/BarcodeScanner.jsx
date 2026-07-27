/**
 * FERZU POS — Escáner de Código de Barras
 *
 * Estrategia triple:
 * 1. Lector físico USB/Bluetooth (HID) — captura el input como teclado rápido
 * 2. BarcodeDetector API nativa (Chrome 88+, Android)
 * 3. Fallback: campo de texto manual
 *
 * Uso: <BarcodeScanner onScan={(barcode) => addProductByBarcode(barcode)} />
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { Scan, X, Camera, Keyboard } from 'lucide-react'

// ── Detector de lector físico USB ─────────────────────────────────────────────
// Los lectores USB envían caracteres muy rápido (< 50ms entre chars) + Enter
function usePhysicalScanner(onScan) {
  const buffer  = useRef('')
  const lastKey = useRef(Date.now())

  useEffect(() => {
    function handleKey(e) {
      const now  = Date.now()
      const gap  = now - lastKey.current
      lastKey.current = now

      // Lector físico: chars muy rápidos (< 50ms)
      // Si el gap es largo → el usuario está tipando normal
      if (e.key === 'Enter') {
        if (buffer.current.length >= 4) {
          onScan(buffer.current.trim())
        }
        buffer.current = ''
        return
      }

      // Acumular solo si viene rápido (lector) o es el primer char
      if (gap < 50 || buffer.current.length === 0) {
        if (e.key.length === 1) buffer.current += e.key
      } else {
        // Gap largo → usuario tipando → resetear buffer
        buffer.current = e.key.length === 1 ? e.key : ''
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onScan])
}

// ── Componente principal ──────────────────────────────────────────────────────
export function BarcodeScanner({ onScan, compact = false }) {
  const [mode,        setMode]        = useState('usb')   // 'usb' | 'camera' | 'manual'
  const [manualCode,  setManualCode]  = useState('')
  const [scanning,    setScanning]    = useState(false)
  const [lastScanned, setLastScanned] = useState(null)
  const videoRef   = useRef(null)
  const streamRef  = useRef(null)
  const detectorRef= useRef(null)
  const animFrameRef = useRef(null)

  // Lector físico activo siempre
  const handleScan = useCallback((code) => {
    setLastScanned(code)
    onScan(code)
    // Flash visual
    setTimeout(() => setLastScanned(null), 1500)
  }, [onScan])

  usePhysicalScanner(handleScan)

  // Verificar si BarcodeDetector está disponible
  const hasCameraScanner = 'BarcodeDetector' in window

  // ── Cámara con BarcodeDetector API ─────────────────────────────────────────
  async function startCamera() {
    if (!hasCameraScanner) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 640, height: 480 }
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream

      detectorRef.current = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e']
      })
      setScanning(true)
      scanFrame()
    } catch (err) {
      console.warn('Camera access denied:', err)
      setMode('manual')
    }
  }

  function scanFrame() {
    if (!videoRef.current || !detectorRef.current) return
    detectorRef.current.detect(videoRef.current).then(barcodes => {
      if (barcodes.length > 0) {
        const code = barcodes[0].rawValue
        handleScan(code)
        stopCamera()  // Un scan por vez
      } else {
        animFrameRef.current = requestAnimationFrame(scanFrame)
      }
    }).catch(() => {
      animFrameRef.current = requestAnimationFrame(scanFrame)
    })
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    setScanning(false)
    setMode('usb')
  }

  useEffect(() => {
    return () => stopCamera()
  }, [])

  function handleManualSubmit(e) {
    e.preventDefault()
    if (manualCode.trim().length >= 4) {
      handleScan(manualCode.trim())
      setManualCode('')
    }
  }

  // ── Vista compacta (solo input) ─────────────────────────────────────────────
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <form onSubmit={handleManualSubmit} className="flex gap-1 flex-1">
          <div className="relative flex-1">
            <Scan className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="Código de barras..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              autoComplete="off"
            />
          </div>
          <button type="submit" className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700">
            OK
          </button>
        </form>
        {lastScanned && (
          <span className="text-xs text-emerald-600 font-medium animate-pulse">✓ {lastScanned}</span>
        )}
      </div>
    )
  }

  // ── Vista completa ──────────────────────────────────────────────────────────
  return (
    <div className="relative">
      {/* Badge de último escaneo */}
      {lastScanned && (
        <div className="absolute -top-8 left-0 right-0 text-center z-10">
          <span className="bg-emerald-600 text-white text-xs px-3 py-1 rounded-full animate-bounce inline-block">
            ✓ Escaneado: {lastScanned}
          </span>
        </div>
      )}

      {/* Selector de modo */}
      <div className="flex gap-1 mb-3 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => { stopCamera(); setMode('usb') }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
            mode === 'usb' ? 'bg-white shadow text-emerald-700' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Scan className="w-3.5 h-3.5" /> Lector USB
        </button>
        {hasCameraScanner && (
          <button
            onClick={() => { setMode('camera'); startCamera() }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
              mode === 'camera' ? 'bg-white shadow text-emerald-700' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Camera className="w-3.5 h-3.5" /> Cámara
          </button>
        )}
        <button
          onClick={() => { stopCamera(); setMode('manual') }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-all ${
            mode === 'manual' ? 'bg-white shadow text-emerald-700' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Keyboard className="w-3.5 h-3.5" /> Manual
        </button>
      </div>

      {/* Modo USB */}
      {mode === 'usb' && (
        <div className="border-2 border-dashed border-emerald-300 rounded-xl p-6 text-center bg-emerald-50">
          <Scan className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-emerald-700">Lector USB activo</p>
          <p className="text-xs text-emerald-500 mt-1">Apunta el lector al código de barras del producto</p>
        </div>
      )}

      {/* Modo cámara */}
      {mode === 'camera' && (
        <div className="relative rounded-xl overflow-hidden bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-48 object-cover" />
          {/* Guía de escaneo */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-48 h-24 border-2 border-emerald-400 rounded-lg">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-emerald-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-emerald-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-emerald-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-emerald-400 rounded-br" />
            </div>
          </div>
          {scanning && (
            <div className="absolute bottom-2 left-0 right-0 text-center">
              <span className="bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                Apunta el código al marco
              </span>
            </div>
          )}
          <button
            onClick={stopCamera}
            className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modo manual */}
      {mode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            placeholder="Ingresa el código de barras..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoFocus
            autoComplete="off"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
          >
            Buscar
          </button>
        </form>
      )}
    </div>
  )
}

export default BarcodeScanner
