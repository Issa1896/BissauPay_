// src/hooks/useAuth.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authAPI } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('bp_user')
    const token  = localStorage.getItem('bp_token')

    if (stored && token) {
      try {
        setUser(JSON.parse(stored))
        // Revalidar token em background
        authAPI.me()
          .then(res => {
            setUser(res.data)
            localStorage.setItem('bp_user', JSON.stringify(res.data))
          })
          .catch(() => logout())
      } catch {
        logout()
      }
    }

    if (!localStorage.getItem('bp_device_id')) {
      localStorage.setItem(
        'bp_device_id',
        `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
      )
    }

    setLoading(false)
  }, [])

  const login = useCallback((token, userData) => {
    localStorage.setItem('bp_token', token)
    localStorage.setItem('bp_user',  JSON.stringify(userData))
    setUser(userData)
  }, [])

  const logout = useCallback(async () => {
    try { await authAPI.logout() } catch {}
    localStorage.removeItem('bp_token')
    localStorage.removeItem('bp_user')
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const res = await authAPI.me()
      setUser(res.data)
      localStorage.setItem('bp_user', JSON.stringify(res.data))
      return res.data
    } catch { return null }
  }, [])

  return (
    <AuthContext.Provider value={{
      user, loading,
      login, logout, refreshUser,
      isAuthenticated: !!user,
      isMerchant: ['merchant', 'admin'].includes(user?.level),
      isAdmin:    user?.level === 'admin',
      isVerified: user?.kyc_verified || user?.kyc_status === 'approved',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
