// =============================================================================
// FERZU POS — CopilotChat (embebible)
// Panel lateral del Co-Piloto IA — NO flotante, se monta inline en el Dashboard.
// v2: Confirmación inline, tablas HTML, action cards, tool status
// =============================================================================

import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Bot, Send, RefreshCw, ChevronDown, Zap, CheckCircle, XCircle, ShoppingCart, Ban } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

// ── Chips de sugerencias contextuales ────────────────────────────────────────
const COPILOT_SUGGESTIONS = [
  '¿Hay alertas urgentes?',
  '¿Qué productos se están agotando?',
  '¿Cómo van las ventas hoy?',
  'Anula la última venta',
  'Genera una orden de compra',
]

// ── Detectores de patrones para confirmación inline ──────────────────────────
const CONFIRM_PATTERNS = [
  /¿Confirmas la anulación\?/i,
  /¿Confirmas la creación de esta orden\?/i,
  /¿Confirmas esta orden de compra\?/i,
  /¿Confirmas\?/i,
  /confirmar.*anulación/i,
  /¿deseas (continuar|proceder|confirmar)/i,
]

const SUCCESS_PATTERNS = [
  /^✅/,
  /anulad[ao] exitosamente/i,
  /orden de compra creada exitosamente/i,
  /creado exitosamente/i,
]

function needsConfirmation(text) {
  return CONFIRM_PATTERNS.some(p => p.test(text))
}

function isSuccessAction(text) {
  return SUCCESS_PATTERNS.some(p => p.test(text))
}

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

// ── Renderizado de tablas Markdown (pipe tables) ──────────────────────────────
function renderTable(lines) {
  const rows = lines.filter(l => !l.match(/^\|[-:| ]+\|$/))
  return (
    <div className="overflow-x-auto my-2 rounded-lg border border-gray-200">
      <table className="text-[10px] w-full border-collapse">
        {rows.map((row, i) => {
          const cells = row.split('|').map(c => c.trim()).filter((_, j, arr) => j > 0 && j < arr.length - 1)
          const Tag = i === 0 ? 'th' : 'td'
          return (
            <tr key={i} className={i === 0 ? 'bg-emerald-50' : i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
              {cells.map((cell, j) => (
                <Tag key={j} className={`px-2 py-1.5 text-left border-b border-gray-100 ${i === 0 ? 'font-semibold text-emerald-700' : 'text-gray-700'}`}>
                  {cell}
                </Tag>
              ))}
            </tr>
          )
        })}
      </table>
    </div>
  )
}

// ── Renderizado de texto con bold, viñetas y tablas ──────────────────────────
function FormatText({ text }) {
  if (!text) return null

  const lines = text.split('\n')
  const elements = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Detectar bloque de tabla
    if (line.startsWith('|') && i + 1 < lines.length && lines[i + 1]?.match(/^\|[-:| ]+\|$/)) {
      const tableLines = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      elements.push(<div key={`table-${i}`}>{renderTable(tableLines)}</div>)
      continue
    }

    // Parsear bold dentro de línea
    const parseBold = (str) =>
      str.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
          : part
      )

    if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('* ')) {
      elements.push(
        <div key={i} className="flex gap-1.5 leading-snug">
          <span className="text-emerald-500 shrink-0 mt-0.5 text-[10px]">•</span>
          <span>{parseBold(line.replace(/^[-•*] /, ''))}</span>
        </div>
      )
    } else if (line.match(/^\d+\. /)) {
      elements.push(
        <div key={i} className="flex gap-1.5 leading-snug">
          <span className="text-emerald-600 shrink-0 font-semibold text-[10px]">{line.match(/^\d+/)[0]}.</span>
          <span>{parseBold(line.replace(/^\d+\. /, ''))}</span>
        </div>
      )
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />)
    } else {
      elements.push(<div key={i} className="leading-snug">{parseBold(line)}</div>)
    }

    i++
  }

  return <div className="space-y-0.5 text-xs">{elements}</div>
}

// ── Action card (para resultados de operaciones exitosas) ─────────────────────
function ActionCard({ text }) {
  const isVoid   = /anulad[ao] exitosamente/i.test(text)
  const isPO     = /orden de compra creada/i.test(text)

  const Icon    = isVoid ? Ban : isPO ? ShoppingCart : CheckCircle
  const color   = 'emerald'

  return (
    <div className={`bg-${color}-50 border border-${color}-200 rounded-xl p-3 text-xs`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className={`text-${color}-600 shrink-0`} />
        <span className={`font-semibold text-${color}-700`}>
          {isVoid ? 'Venta anulada' : isPO ? 'Orden de compra creada' : 'Operación completada'}
        </span>
      </div>
      <FormatText text={text.replace(/^✅\s*/, '')} />
    </div>
  )
}

// ── Burbuja de mensaje ────────────────────────────────────────────────────────
function ChatMessage({ msg, onConfirm, onCancel, confirmed }) {
  const isUser    = msg.role === 'user'
  const isSuccess = !isUser && isSuccessAction(msg.content)
  const needsCon  = !isUser && !confirmed && needsConfirmation(msg.content)

  if (isSuccess) {
    return (
      <div className="mb-2.5">
        <ActionCard text={msg.content} />
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2.5`}>
      {!isUser && (
        <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-[10px] font-bold mr-1.5 flex-shrink-0 mt-0.5 shrink-0">
          F
        </div>
      )}
      <div className="flex flex-col gap-1.5 max-w-[88%]">
        <div
          className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
            isUser
              ? 'bg-emerald-600 text-white rounded-br-sm'
              : 'bg-gray-100 text-gray-800 rounded-bl-sm'
          }`}
        >
          {isUser ? msg.content : <FormatText text={msg.content} />}
        </div>

        {/* Botones de confirmación inline */}
        {needsCon && (
          <div className="flex gap-2 ml-0.5">
            <button
              onClick={onConfirm}
              className="flex items-center gap-1 text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-3 py-1.5 transition-colors"
            >
              <CheckCircle size={11} />
              Confirmar
            </button>
            <button
              onClick={onCancel}
              className="flex items-center gap-1 text-[10px] font-semibold bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg px-3 py-1.5 transition-colors"
            >
              <XCircle size={11} />
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// Componente principal
// =============================================================================
export default function CopilotChat({ className = '' }) {
  const [messages, setMessages]           = useState([])
  const [input, setInput]                 = useState('')
  const [loading, setLoading]             = useState(false)
  const [collapsed, setCollapsed]         = useState(false)
  const [confirmedIdx, setConfirmedIdx]   = useState(new Set())
  const messagesEndRef                     = useRef(null)
  const inputRef                           = useRef(null)
  const location                           = useLocation()
  const { user }                           = useAuth()
  const branchId                           = localStorage.getItem('ferzu_branch_id')
  const pathname                           = location.pathname
  const hasInitialized                     = useRef(false)

  // ── Enviar al endpoint ────────────────────────────────────────────────────
  const callCopilot = useCallback(async (text, history) => {
    const { data } = await api.post('/ai/copilot/chat', {
      message:              text,
      branch_id:            branchId || undefined,
      conversation_history: history,
      page_context:         pathname,
    }, { timeout: 90000 })
    return data.text || data.response
  }, [branchId, pathname])

  // ── Check proactivo al montar ─────────────────────────────────────────────
  useEffect(() => {
    if (hasInitialized.current) return
    hasInitialized.current = true
    const firstName = user?.full_name ? user.full_name.split(' ')[0] : null
    const proactiveMsg = `Saluda brevemente a${firstName ? ' ' + firstName : 'l usuario'} (está en el Dashboard). Usa get_system_health y get_inventory_alerts (severity_filter='critical_only') en paralelo. Resume en máximo 3 puntos lo urgente. Si todo está bien, confírmalo en una línea y ofrece ayuda.`
    setLoading(true)
    callCopilot(proactiveMsg, [])
      .then(text => setMessages([{ role: 'assistant', content: text }]))
      .catch(() => setMessages([{ role: 'assistant', content: `¡Hola${firstName ? ', ' + firstName : ''}! ⚡ Co-Piloto activo. ¿En qué te ayudo?` }]))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line

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
    const prevMessages = [...messages]
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    const history = prevMessages.slice(-8).map(m => ({ role: m.role, content: m.content }))
    try {
      const reply = await callCopilot(msg, history)
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      const errMsg = err.response?.data?.error || 'No pude procesar tu pregunta. Intenta de nuevo.'
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${errMsg}` }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, callCopilot])

  // ── Confirmar operación (botón inline) ───────────────────────────────────
  const handleConfirm = useCallback((msgIndex) => {
    setConfirmedIdx(prev => new Set([...prev, msgIndex]))
    sendMessage('Sí, confirmo. Procede.')
  }, [sendMessage])

  const handleCancel = useCallback((msgIndex) => {
    setConfirmedIdx(prev => new Set([...prev, msgIndex]))
    sendMessage('Cancela la operación.')
  }, [sendMessage])

  // ── Reiniciar chat ────────────────────────────────────────────────────────
  const resetChat = () => {
    hasInitialized.current = false
    setMessages([])
    setInput('')
    setConfirmedIdx(new Set())
    hasInitialized.current = true
    const firstName = user?.full_name ? user.full_name.split(' ')[0] : null
    const proactiveMsg = `Saluda brevemente a${firstName ? ' ' + firstName : 'l usuario'}. Usa get_system_health y get_inventory_alerts(severity_filter='critical_only'). Resume en máximo 3 puntos lo urgente.`
    setLoading(true)
    callCopilot(proactiveMsg, [])
      .then(text => setMessages([{ role: 'assistant', content: text }]))
      .catch(() => setMessages([{ role: 'assistant', content: '⚡ Co-Piloto listo. ¿En qué te ayudo?' }]))
      .finally(() => setLoading(false))
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const showSuggestions = !loading && messages.filter(m => m.role === 'user').length === 0 && messages.length > 0

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
              <p className="text-emerald-200 text-[10px]">
                {loading ? 'Procesando…' : 'Agente activo'}
              </p>
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
              <ChatMessage
                key={i}
                msg={msg}
                onConfirm={() => handleConfirm(i)}
                onCancel={() => handleCancel(i)}
                confirmed={confirmedIdx.has(i)}
              />
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

          {/* Chips de sugerencias */}
          {showSuggestions && (
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
          <div className="shrink-0 px-3 pb-3 pt-2 border-t border-gray-100">
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
