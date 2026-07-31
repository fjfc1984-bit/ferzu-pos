// =============================================================================
// FERZU POS — Asistente Virtual IA (widget flotante)
// Conecta con POST /api/ai/chat → runFerzuAgent (Claude Tool Use)
// =============================================================================
import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

// Sugerencias contextuales por página
const PAGE_SUGGESTIONS = {
  '/dashboard':  ['¿Cómo van las ventas hoy?', '¿Qué productos vender más?', '¿Hay alertas urgentes?'],
  '/pos':        ['¿Cómo aplico un descuento?', '¿Cómo abro la caja?', '¿Cómo proceso una devolución?'],
  '/inventory':  ['¿Qué productos están por agotarse?', '¿Cómo ingreso mercancía?', 'Muestra alertas de stock'],
  '/dian':       ['¿Cómo configuro mi resolución DIAN?', '¿Qué es el régimen simple?', '¿Cómo clasifico el IVA?'],
  '/customers':  ['¿Cómo fidelizo clientes frecuentes?', '¿Quiénes son mis mejores clientes?'],
  '/barbershop': ['¿Cómo agenda una cita?', '¿Cómo bloqueo un horario?'],
  '/workshop':   ['¿Cómo creo una orden de trabajo?', '¿Cómo registro repuestos?'],
  default:       ['¿Qué puedes hacer?', '¿Cómo funciona FERZU POS?', '¿Cómo contacto soporte?'],
}

function getPageLabel(pathname) {
  const map = {
    '/dashboard': 'Dashboard', '/pos': 'POS', '/inventory': 'Inventario',
    '/dian': 'DIAN', '/customers': 'Clientes', '/barbershop': 'Barbería',
    '/workshop': 'Taller', '/minimarket': 'Minimarket',
  }
  return map[pathname] || 'FERZU POS'
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
        />
      ))}
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 mt-0.5">
          F
        </div>
      )}
      <div
        className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-emerald-600 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        }`}
      >
        {msg.content}
      </div>
    </div>
  )
}

export function AIAssistant() {
  const [open, setOpen]           = useState(false)
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [hasNew, setHasNew]       = useState(false)
  const messagesEndRef             = useRef(null)
  const inputRef                   = useRef(null)
  const location                   = useLocation()
  const { user }                   = useAuth()
  const branchId                   = localStorage.getItem('ferzu_branch_id')
  const pathname                   = location.pathname
  const suggestions                = PAGE_SUGGESTIONS[pathname] || PAGE_SUGGESTIONS.default

  // Mensaje de bienvenida al abrir por primera vez
  useEffect(() => {
    if (open && messages.length === 0) {
      const page = getPageLabel(pathname)
      setMessages([{
        role: 'assistant',
        content: `¡Hola${user?.full_name ? ', ' + user.full_name.split(' ')[0] : ''}! 👋 Soy el asistente de FERZU POS.\n\nEstás en **${page}**. ¿En qué te ayudo?`,
      }])
    }
    if (open) {
      setHasNew(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return

    setInput('')
    const userMsg = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    // Historial para contexto (últimos 6 mensajes)
    const history = messages.slice(-6).map(m => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const { data } = await api.post('/ai/chat', {
        message:              msg,
        branch_id:            branchId || undefined,
        conversation_history: history,
        page_context:         pathname,
      })
      setMessages(prev => [...prev, { role: 'assistant', content: data.text }])
      if (!open) setHasNew(true)
    } catch (err) {
      const errMsg = err.response?.data?.error || 'No pude procesar tu pregunta. Intenta de nuevo.'
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${errMsg}` }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, branchId, pathname, open])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
    setOpen(false)
    setTimeout(() => setOpen(true), 50)
  }

  return (
    <>
      {/* ── Panel de chat ─────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={{ height: '520px', maxHeight: 'calc(100vh - 6rem)' }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-emerald-600 text-white flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-base font-bold">
              F
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">Asistente FERZU</p>
              <p className="text-xs text-emerald-100 truncate">{getPageLabel(pathname)} · IA activa</p>
            </div>
            <button
              onClick={clearChat}
              className="text-emerald-100 hover:text-white transition-colors p-1 rounded"
              title="Nueva conversación"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-emerald-100 hover:text-white transition-colors p-1 rounded"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
            {loading && (
              <div className="flex justify-start mb-3">
                <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 mt-0.5">
                  F
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm">
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Sugerencias rápidas (solo si hay pocos mensajes) */}
          {messages.length <= 1 && !loading && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 flex-shrink-0">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1 hover:bg-emerald-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3 flex-shrink-0">
            <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-emerald-400 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Escribe tu pregunta…"
                rows={1}
                className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 resize-none outline-none max-h-24 leading-relaxed"
                style={{ minHeight: '24px' }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
            <p className="text-center text-[10px] text-gray-400 mt-1.5">Enter para enviar · IA puede cometer errores</p>
          </div>
        </div>
      )}

      {/* ── Botón flotante ────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
          open
            ? 'bg-gray-700 hover:bg-gray-800 scale-95'
            : 'bg-emerald-600 hover:bg-emerald-700 hover:scale-105'
        }`}
        title="Asistente IA"
        aria-label="Abrir asistente IA"
      >
        {open ? (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
          </svg>
        )}
        {/* Punto rojo de notificación */}
        {hasNew && !open && (
          <span className="absolute top-1 right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
        )}
      </button>
    </>
  )
}
