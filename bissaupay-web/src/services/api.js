// src/services/api.js
// Cliente HTTP centralizado — todas as chamadas ao backend passam aqui

import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Injeta token e device ID automaticamente ─────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bp_token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  const deviceId = localStorage.getItem('bp_device_id')
  if (deviceId) config.headers['X-Device-ID'] = deviceId

  return config
})

// ── Trata erros globais ───────────────────────────────────────
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status  = error.response?.status
    const data    = error.response?.data
    const raw     = data?.error || data?.message || error.message
    const message = typeof raw === 'string' ? raw : raw?.message || 'Erro desconhecido'

    if (status === 401) {
      localStorage.removeItem('bp_token')
      localStorage.removeItem('bp_user')
      window.location.href = '/login'
      return Promise.reject(new Error('Sessão expirada'))
    }

    // Erros de validação (422) — concatenar mensagens
    if (status === 422 && error.response?.data?.errors) {
      const msgs = error.response.data.errors.map(e => e.message).join('. ')
      return Promise.reject(new Error(msgs))
    }

    return Promise.reject(new Error(message || 'Erro desconhecido'))
  }
)

// ── AUTH ─────────────────────────────────────────────────────
export const authAPI = {
  register:       (data) => api.post('/auth/register', data),
  verifyOTP:      (data) => api.post('/auth/verify-otp', data),
  login:          (data) => api.post('/auth/login', data),
  logout:         ()     => api.post('/auth/logout'),
  me:             ()     => api.get('/auth/me'),
  resendOTP:      (data) => api.post('/auth/resend-otp', data),
  requestResetPin: (data) => api.post('/auth/reset-pin/request', data),
  confirmResetPin: (data) => api.post('/auth/reset-pin/confirm', data),
  sessions:       ()     => api.get('/auth/sessions'),
}

// ── WALLET ───────────────────────────────────────────────────
export const walletAPI = {
  balance:     ()       => api.get('/wallet/balance'),
  transfer:    (data)   => api.post('/wallet/transfer', data),
  statement:   (params) => api.get('/wallet/statement', { params }),
  transaction: (ref)    => api.get(`/wallet/transaction/${ref}`),
}

// ── MERCHANTS ────────────────────────────────────────────────
export const merchantAPI = {
  register:     (data)   => api.post('/merchants/register', data),
  me:           ()       => api.get('/merchants/me'),
  dashboard:    ()       => api.get('/merchants/dashboard'),
  qrStatic:     ()       => api.get('/merchants/qr/static'),
  qrDynamic:    (data)   => api.post('/merchants/qr/dynamic', data),
  qrRequests:   (params) => api.get('/merchants/qr/requests', { params }),
  cancelQR:     (id)     => api.delete(`/merchants/qr/requests/${id}`),
  transactions: (params) => api.get('/merchants/transactions', { params }),
}

// ── PAYMENTS ─────────────────────────────────────────────────
export const paymentAPI = {
  preview:      (data) => api.post('/payments/preview', data),
  confirm:      (data) => api.post('/payments/confirm', data),
  merchantInfo: (code) => api.get(`/payments/merchant-info/${code}`),
}

// ── TOPUP ────────────────────────────────────────────────────
export const topupAPI = {
  providers: (params) => api.get('/topup/providers', { params }),
  preview:   (data)   => api.post('/topup/preview', data),
  execute:   (data)   => api.post('/topup/execute', data),
  history:   (params) => api.get('/topup/history', { params }),
  order:     (id)     => api.get(`/topup/orders/${id}`),
}

// ── REMITTANCE ───────────────────────────────────────────────
export const remittanceAPI = {
  corridors: (params) => api.get('/remittance/corridors', { params }),
  quote:     (data)   => api.post('/remittance/quote', data),
  send:      (data)   => api.post('/remittance/send', data),
  history:   (params) => api.get('/remittance/history', { params }),
  order:     (id)     => api.get(`/remittance/orders/${id}`),
  rates:     ()       => api.get('/remittance/rates/current'),
}

// ── KYC ──────────────────────────────────────────────────────
export const kycAPI = {
  status: ()     => api.get('/kyc/status'),
  submit: (data) => api.post('/kyc/submit', data),
}

// ── NOTIFICATIONS ────────────────────────────────────────────
export const notificationsAPI = {
  list:    (params) => api.get('/notifications', { params }),
  markRead: (data)  => api.post('/notifications/read', data),
}

export default api
