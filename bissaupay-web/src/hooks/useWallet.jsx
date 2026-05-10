// src/hooks/useWallet.jsx
import { useState, useEffect, useCallback } from 'react'
import { walletAPI } from '../services/api'

export function useWallet(autoRefresh = false) {
  const [wallet,  setWallet]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetch = useCallback(async () => {
    try {
      setError(null)
      const res = await walletAPI.balance()
      setWallet(res.wallet)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    if (!autoRefresh) return
    const interval = setInterval(fetch, 30000) // 30s
    return () => clearInterval(interval)
  }, [fetch, autoRefresh])

  return { wallet, loading, error, refresh: fetch }
}
