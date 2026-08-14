import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Analytics } from "@vercel/analytics/react"
import App from "./App"
import { Toaster } from "react-hot-toast"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { initSentry } from "./lib/sentry.js"
import "./index.css"

// Inicializar Sentry antes de montar la app
initSentry()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: (count, error) => {
        if (error?.status >= 400 && error?.status < 500) return false
        return count < 2
      },
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: { fontSize: '14px', maxWidth: '380px' },
              success: { style: { background: '#059669', color: '#fff' } },
              error:   { style: { background: '#dc2626', color: '#fff' }, duration: 6000 },
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
    <Analytics />
  </React.StrictMode>
)
