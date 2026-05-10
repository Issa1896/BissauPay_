// src/hooks/useToast.jsx
import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev.slice(-4), { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, duration)
  }, [])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = {
    success: (msg, dur)  => addToast(msg, 'success', dur),
    error:   (msg, dur)  => addToast(msg, 'error',   dur || 5000),
    info:    (msg, dur)  => addToast(msg, 'info',    dur),
    warning: (msg, dur)  => addToast(msg, 'warning', dur),
  }

  const ICONS = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' }

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container" role="alert" aria-live="polite">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            onClick={() => dismiss(t.id)}
          >
            <span className="toast-icon">{ICONS[t.type]}</span>
            <span className="toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
