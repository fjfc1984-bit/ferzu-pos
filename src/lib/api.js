import axios from "axios"
import { supabase } from "./supabase"

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001/api",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
})

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) config.headers.Authorization = `Bearer ${session.access_token}`
  const branchId = localStorage.getItem("ferzu_branch_id")
  if (branchId) config.headers["x-branch-id"] = branchId
  return config
})

// ── Manejo de 401 con refresh token ──────────────────────────────────────────
// En lugar de hacer signOut inmediato, intenta renovar el JWT primero.
// Si el refresh falla, ahí sí se desloguea. Manejo de concurrencia incluido
// para evitar múltiples refreshes en paralelo cuando varios requests fallan.
let _isRefreshing = false
let _refreshQueue = []   // waiters: { resolve, reject }

function _processQueue(error, token = null) {
  _refreshQueue.forEach(p => error ? p.reject(error) : p.resolve(token))
  _refreshQueue = []
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config

    // Solo interceptar 401s que no sean del endpoint de refresh mismo
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    // Marcar como reintento para evitar bucle infinito
    originalRequest._retry = true

    // Si ya hay un refresh en curso, encolar este request
    if (_isRefreshing) {
      return new Promise((resolve, reject) => {
        _refreshQueue.push({ resolve, reject })
      }).then(token => {
        originalRequest.headers.Authorization = `Bearer ${token}`
        return api(originalRequest)
      }).catch(() => Promise.reject(error))
    }

    _isRefreshing = true

    try {
      // Intentar renovar la sesión con el refresh_token almacenado en Supabase
      const { data, error: refreshError } = await supabase.auth.refreshSession()

      if (refreshError || !data?.session?.access_token) {
        throw refreshError || new Error("Refresh session vacío")
      }

      const newToken = data.session.access_token
      _processQueue(null, newToken)

      // Reintentar el request original con el nuevo token
      originalRequest.headers.Authorization = `Bearer ${newToken}`
      return api(originalRequest)

    } catch (refreshErr) {
      _processQueue(refreshErr, null)
      // Refresh falló — sesión expirada definitivamente → logout
      await supabase.auth.signOut()
      window.location.href = "/login"
      return Promise.reject(refreshErr)

    } finally {
      _isRefreshing = false
    }
  }
)

export const cashAPI = {
  open:  (payload) => api.post("/cash-sessions/open",  payload).then(r => r.data),
  close: (id, payload) => api.post(`/cash-sessions/${id}/close`, payload).then(r => r.data),
  current: () => api.get("/cash-sessions/current").then(r => r.data),
}
