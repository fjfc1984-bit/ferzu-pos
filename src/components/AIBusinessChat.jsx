// =============================================================================
// FERZU POS — AIBusinessChat
// Panel flotante de asistente financiero. Llama a POST /ai/business-chat.
// Usa snapshot real del negocio inyectado en el backend (sin tool calling).
// =============================================================================
import { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '../lib/api'

// ── Íconos inline (no depende de lucide-react por compatibilidad) ─────────────
const IconSend  = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
const IconBot   = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
const IconClose = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconSpark = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>
const IconTrash = () => <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>

// ── Sugerencias rápidas por rol ───────────────────────────────────────────────
const QUICK_QUESTIONS_OWNER = [
  '¿Cuánto vendí esta semana?',
  '¿Cuál fue mi producto más vendido?',
  '¿Qué productos están por agotarse?',
  '¿Cómo van las sesiones de caja?',
  '¿Cuál es el ticket promedio del día?',
]

const QUICK_QUESTIONS_CASHIER = [
  '¿Cuánto efectivo tengo en caja?',
  '¿A qué hora abrí la caja?',
  '¿Cuántas ventas llevo hoy?',
]

// ── Formatea el texto de la IA: convierte **bold** y viñetas ─────────────────
function formatAIText(text) {
  if (!text) return null
  return text.split('\n').map((line, i) => {
    // Bold
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={j} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
      }
      return part
    })
    // Bullet lines
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <div key={i} className="flex gap-1.5 mt-0.5">
          <span className="text-purple-500 mt-1 shrink-0">•</span>
          <span>{parts}</span>
        </div>
      )
    }
    if (line.trim() === '') return <div key={i} className="h-1.5" />
    return <div key={i}>{parts}</div>
  })
}

// =============================================================================
// Componente principal
// Props:
//   isOpen     {boolean}  — si el panel está visible
//   onClose    {fn}       — callback para cerrar
//   branchId   {string}   — branch activa
//   userRole   {string}   — rol del usuario (owner/admin/manager/cashier)
// =============================================================================
export default function AIBusinessChat({ isOpen, onClose, branchId, userRole }) {
  const [messages,   setMessages]   = useState([])   // [{ role, text, ts }]
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  const isCashier = ['cashier', 'cajero'].includes((userRole || '').toLowerCase())
  const quickQs   = isCashier ? QUICK_QUESTIONS_CASHIER : QUICK_QUESTIONS_OWNER

  // Bienvenida inicial al abrir
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        text: isCashier
          ? '¡Hola! Puedo ayudarte con tu sesión de caja activa. ¿Qué necesitas saber?'
          : '¡Hola! Soy tu asistente. Tengo el reporte de los últimos 7 días cargado. ¿Qué quieres saber sobre tu negocio?',
        ts: Date.now(),
      }])
    }
  }, [isOpen])

  // Scroll al último mensaje
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Focus al input al abrir
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100)
  }, [isOpen])

  // ── Historial de conversación para el backend (solo últimos 10 turnos) ──────
  const buildHistory = useCallback(() => {
    return messages
      .filter(m => m.role !== 'system')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.text }))
  }, [messages])

  // ── Envío de mensaje ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return

    setInput('')
    setError(null)
    setMessages(prev => [...prev, { role: 'user', text: msg, ts: Date.now() }])
    setLoading(true)

    try {
      const { data } = await api.post('/ai/business-chat', {
        message:              msg,
        branch_id:            branchId || null,
        conversation_history: buildHistory(),
      })

      setMessages(prev => [...prev, {
        role: 'assistant',
        text: data.text,
        ts:   Date.now(),
      }])
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Error de conexión. Intenta de nuevo.'
      setError(errMsg)
      setMessages(prev => [...prev, {
        role: 'error',
        text: errMsg,
        ts:   Date.now(),
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, loading, branchId, buildHistory])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const clearChat = () => {
    setMessages([])
    setError(null)
    // Re-trigger welcome
    setTimeout(() => {
      setMessages([{
        role: 'assistant',
        text: isCashier
          ? '¡Hola! Puedo ayudarte con tu sesión de caja activa.'
          : '¡Hola! Soy tu asistente. ¿Qué quieres saber sobre tu negocio?',
        ts: Date.now(),
      }])
    }, 50)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Overlay sutil */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed bottom-20 right-4 z-50 w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
        style={{ height: '540px' }}>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-700 to-purple-600 text-white shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <IconSpark />
            </div>
            <div>
              <p className="font-semibold text-sm leading-none">Asistente</p>
              <p className="text-xs text-purple-200 leading-none mt-0.5">
                {isCashier ? 'Acceso Cajero' : 'Análisis en tiempo real'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={clearChat}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              title="Limpiar chat">
              <IconTrash />
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
              <IconClose />
            </button>
          </div>
        </div>

        {/* ── Mensajes ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 bg-gray-50">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role !== 'user' && (
                <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                  <span className="text-white" style={{ fontSize: 10 }}>IA</span>
                </div>
              )}
              <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-purple-600 text-white rounded-br-sm'
                  : m.role === 'error'
                    ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-sm'
                    : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm'
              }`}>
                {m.role === 'assistant' ? formatAIText(m.text) : m.text}
              </div>
            </div>
          ))}

          {/* Indicador de escritura */}
          {loading && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center shrink-0 mr-2">
                <span className="text-white" style={{ fontSize: 10 }}>IA</span>
              </div>
              <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                {[0, 150, 300].map(d => (
                  <span key={d} className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"
                    style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Preguntas rápidas (solo si no hay conversación) ────── */}
        {messages.length <= 1 && !loading && (
          <div className="px-3 pb-2 bg-gray-50 shrink-0">
            <div className="flex flex-wrap gap-1.5">
              {quickQs.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)}
                  className="text-xs bg-white border border-purple-200 text-purple-700 px-2.5 py-1 rounded-full hover:bg-purple-50 hover:border-purple-400 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Input ──────────────────────────────────────────────── */}
        <div className="px-3 pb-3 pt-2 bg-white border-t border-gray-100 shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pregunta sobre tu negocio..."
              rows={1}
              style={{ resize: 'none', minHeight: '38px', maxHeight: '80px' }}
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent placeholder-gray-400"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className="shrink-0 w-9 h-9 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 text-white rounded-xl flex items-center justify-center transition-colors">
              <IconSend />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">
            Respuestas basadas en datos reales · Enter para enviar
          </p>
        </div>
      </div>
    </>
  )
}
