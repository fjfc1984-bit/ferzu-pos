// =============================================================================
// FERZU POS — CopilotChat (embebible)
// Panel lateral del Co-Piloto IA — NO flotante, se monta inline en el Dashboard.
//
// Diferencias vs AIAssistant.jsx (botón flotante):
//   - Sin botón flotante ni modal overlay
//   - Siempre visible, siempre en modo Co-Piloto (usa /ai/copilot/chat)
//   - Check proactivo automático al montar (sistema + inventario crítico)
//   - Props: className para flexibilidad de layout
// =============================================================================

import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Bot, Send, RefreshCw, ChevronDown, Zap } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

// ── Chips de sugerencias contextuales ────────────────────────────────────────
const COPILOT_SUGGESTIONS = [
  '¿Hay alertas urgentes?',
  '¿Qué productos se están agotando?',
  '¿Cómo están las ventas hoy?',
  'Resumen del estado del sistema',
]

// ── Typing indicator ─────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
        />
      ))}
    </div>
  )
}

// ── Renderizado de mensajes con **bold** y viñetas ────────────────────────────
function FormatText({ text }) {
  if (!text) return null
  return (
    <div className="space-y-0.5">
      {text.split('\n').map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
            : part
        )
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <div key={i} className="flex gap-1.5">
              <span className="text-emerald-500 shrink-0 mt-0.5 text-xs">•</span>
              <span>{parts}</span>
            </div>
          )
        }
        if (line.trim() === '') return <div key={i} className="h-1" />
        return <div key={i}>{parts}</div>
      })}
    </div>
  )
}

// ── Burbuja de mensaje ────────────────────────────────────────────────────────
function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2.5`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-[10px] font-bold mr-1.5 flex-shrink-0 mt-0.5">
          F
        </div>
      )}
      <div
        className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
          isUser
            ? 'bg-emerald-600 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        }`}
      >
        {isUser ? msg.content : <FormatText text={msg.content} />}
      </div>
    </div>
  )
}

// =============================================================================
// Componente principal
// =============================================================================
export default function CopilotChat({ className = '' }) {
  const [messages, setMessages]   = useState([])
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const messagesEndRef             = useRef(null)
  const inputRef                   = useRef(null)
  const location                   = useLocation()
  const { user }                   = useAuth()
  const branchId                   = localStorage.getItem('ferzu_branch_id')
  const pathname                   = location.pathname
  const hasInitialized             = useRef(false)

  // ── Check proactivo al montar ─────────────────────────────────────────────
  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true

    const firstName = user?.full_name ? user.full_name.split(' ')[0] : null
    const proactiveMsg = `Saluda brevemente a${firstName ? ' ' + firstName : 'l usuario'} (está en el Dashboard). Usa get_system_health y get_inventory_alerts (severity_filter='critical_only') en paralelo para verificar el estado. Resume en máximo 3 puntos lo urgente. Si todo está bien, confírmalo en una línea y ofrece ayuda.`

    setLoading(true)
    api.post('/ai/copilot/chat', {
      message:              proactiveMsg,
      branch_id:            branchId || undefined,
      conversation_history: [],
      page_context:         pathname,
    }, { timeout: 60000 })
      .then(({ data }) => {
        setMessages([{ role: 'assistant', content: data.text || data.response }])
      })
      .catch(() => {
        setMessages([{
          role: 'assistant',
          content: `¡Hola${firstName ? ', ' + firstName : ''}! ⚡ Co-Piloto activo. ¿En qué te ayudo hoy?`,
        }])
      })
      .finally(() => setLoading(false))
  }, []) // solo al montar

  // ── Scroll automático ─────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Enviar mensaje ────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || loading) return

    setInput('')
    const userMsg = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }))

    try {
      const { data } = await api.post('/ai/copilot/chat', {
        message:              msg,
        branch_id:            branchId || undefined,
        conversation_history: history,
        page_context:         pathname,
      }, { timeout: 60000 })
      setMessages(prev => [...prev, { role: 'assistant', content: data.text || data.response }])
    } catch (err) {
      const errMsg = err.response?.data?.error || 'No pude procesar tu pregunta. Intenta de nuevo.'
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${errMsg}` }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, branchId, pathname])

  // ── Reiniciar chat ────────────────────────────────────────────────────────
  const resetChat = () => {
    hasInitialized.current = false
    setMessages([])
    setInput('')
    // Vuelve a disparar el proactivo
    const firstName = user?.full_name ? user.full_name.split(' ')[0] : null
    const proactiveMsg = `Saluda brevemente a${firstName ? ' ' + firstName : 'l usuario'}. Usa get_system_health y get_inventory_alerts(severity_filter='critical_only'). Resume en máximo 3 puntos lo urgente.`
    setLoading(true)
    hasInitialized.current = true
    api.post('/ai/copilot/chat', {
      message:              proactiveMsg,
      branch_id:            branchId || undefined,
      conversation_history: [],
      page_context:         pathname,
    }, { timeout: 60000 })
      .then(({ data }) => setMessages([{ role: 'assistant', content: data.text || data.response }]))
      .catch(() => setMessages([{ role: 'assistant', content: '⚡ Co-Piloto listo. ¿En qué te ayudo?' }]))
      .finally(() => setLoading(false))
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col bg-white ${className}`}>

      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-emerald-700 to-emerald-600">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
            <Bot size={14} className="text-white" />
          </div>
          <div>
            <p className="text-white text-xs font-semibold leading-tight">Co-Piloto FERZU</p>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              <p className="text-emerald-200 text-[10px]">Agente activo</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={resetChat}
            disabled={loading}
            title="Reiniciar"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-emerald-200 hover:text-white disabled:opacity-40"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expandir' : 'Colapsar'}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-emerald-200 hover:text-white"
          >
            <ChevronDown size={13} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Cuerpo (colapsable) */}
      {!collapsed && (
        <>
          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-6">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                  <Zap size={18} className="text-emerald-600" />
                </div>
                <p className="text-xs text-gray-400 max-w-[160px]">
                  Tu Co-Piloto está verificando el sistema…
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <ChatMessage key={i} msg={msg} />
            ))}

            {loading && (
              <div className="flex justify-start mb-2.5">
                <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-[10px] font-bold mr-1.5 flex-shrink-0 mt-0.5">
                  F
                </div>
                <div className="bg-gray-100 rounded-xl rounded-bl-sm">
                  <TypingDots />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chips de sugerencias — solo si no hay mensajes del usuario */}
          {!loading && messages.filter(m => m.role === 'user').length === 0 && messages.length > 0 && (
            <div className="shrink-0 px-3 pb-2 flex flex-wrap gap-1.5">
              {COPILOT_SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-1 hover:bg-emerald-100 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="shrink-0 px-3 pb-3 pt-1 border-t border-gray-100">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Pregunta al Co-Piloto…"
                rows={1}
                disabled={loading}
                className="flex-1 resize-none text-xs rounded-xl border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent placeholder-gray-400 text-gray-800 disabled:opacity-50 max-h-24 leading-relaxed"
                style={{ minHeight: '36px' }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="shrink-0 w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
