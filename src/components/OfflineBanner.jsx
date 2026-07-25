import { useState, useEffect } from "react"
export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener("online", on); window.addEventListener("offline", off)
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off) }
  }, [])
  if (online) return null
  return <div className="bg-yellow-500 text-yellow-950 text-xs font-semibold text-center py-1.5 px-4">⚡ Modo offline — Los datos se sincronizarán cuando vuelva la conexión</div>
}
