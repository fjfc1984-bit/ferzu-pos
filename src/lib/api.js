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

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) { await supabase.auth.signOut(); window.location.href = "/login" }
    return Promise.reject(error)
  }
)

export const cashAPI = {
  open:  (payload) => api.post("/cash-sessions/open",  payload).then(r => r.data),
  close: (id, payload) => api.post(`/cash-sessions/${id}/close`, payload).then(r => r.data),
  current: () => api.get("/cash-sessions/current").then(r => r.data),
}
