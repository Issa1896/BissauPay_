// src/services/topup/providers.js
// Adaptadores de integração com provedores de recarga
// Interface uniforme: recharge({ recipient, amount, reference, config }) → { success, providerRef, message }

const axios  = require('axios')
const logger = require('../../config/logger')

const simulateDelay = (ms = 1000) => new Promise(r => setTimeout(r, ms))

class BaseProvider {
  constructor(code, name) {
    this.code   = code
    this.name   = name
    this.isMock = process.env.NODE_ENV !== 'production' || process.env.TOPUP_MOCK === 'true'
  }
  log(level, msg, data = {}) {
    logger[level](`[${this.code}] ${msg}`, data)
  }
}

// ── MTN ──────────────────────────────────────────────────────
class MTNProvider extends BaseProvider {
  constructor() { super('mtn_gb', 'MTN Guiné-Bissau') }

  async recharge({ recipient, amount, reference, config = {} }) {
    this.log('info', 'Iniciando recarga', { recipient, amount, reference })

    if (this.isMock) {
      await simulateDelay(1200)
      if (Math.random() > 0.95) {
        return { success: false, reason: 'Número inativo na rede MTN', canRetry: false }
      }
      return {
        success:     true,
        providerRef: `MTN-${Date.now()}`,
        message:     `Recarga de ${amount / 100} XOF enviada para ${recipient}`,
      }
    }

    try {
      const AT      = require('africastalking')({ apiKey: config.apiKey || process.env.AT_API_KEY, username: config.username || process.env.AT_USERNAME })
      const result  = await AT.AIRTIME.send({
        recipients: [{
          phoneNumber:  recipient.startsWith('+') ? recipient : `+245${recipient}`,
          amount:       `XOF ${amount / 100}`,
          currencyCode: 'XOF',
        }],
      })
      const entry = result.responses[0]
      if (entry.status === 'Success') {
        return { success: true, providerRef: entry.requestId || `MTN-${Date.now()}`, message: 'Recarga realizada' }
      }
      return { success: false, reason: entry.errorMessage || 'Falha MTN', canRetry: true }
    } catch (err) {
      this.log('error', 'Falha na API MTN', { error: err.message })
      return { success: false, reason: 'Erro de comunicação com MTN', canRetry: true }
    }
  }
}

// ── ORANGE ────────────────────────────────────────────────────
class OrangeProvider extends BaseProvider {
  constructor() { super('orange_gb', 'Orange Guiné-Bissau') }

  async recharge({ recipient, amount, reference, config = {} }) {
    this.log('info', 'Iniciando recarga Orange', { recipient, amount, reference })

    if (this.isMock) {
      await simulateDelay(1500)
      if (Math.random() > 0.95) {
        return { success: false, reason: 'Número não identificado na rede Orange', canRetry: false }
      }
      return {
        success:     true,
        providerRef: `ORA-${Date.now()}`,
        message:     `Recarga Orange de ${amount / 100} XOF enviada`,
      }
    }

    try {
      const token    = config.bearerToken || process.env.ORANGE_BEARER_TOKEN
      const response = await axios.post(
        `https://api.orange.com/orange-money-webpay/GNB/v1/webpayment`,
        {
          merchant_key: config.merchantKey || process.env.ORANGE_MERCHANT_KEY,
          currency:     'XOF',
          order_id:     reference,
          amount:       amount / 100,
          return_url:   config.returnUrl || process.env.ORANGE_RETURN_URL,
          cancel_url:   config.cancelUrl || process.env.ORANGE_CANCEL_URL,
          notif_url:    config.notifUrl  || process.env.ORANGE_NOTIF_URL,
          lang:         'fr',
          reference:    recipient,
        },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 15000 }
      )

      if (response.data.status === 'SUCCESS') {
        return { success: true, providerRef: response.data.pay_token || `ORA-${Date.now()}`, message: 'Recarga realizada' }
      }
      return { success: false, reason: response.data.message || 'Falha Orange', canRetry: true }
    } catch (err) {
      this.log('error', 'Falha na API Orange', { error: err.message })
      return { success: false, reason: 'Erro de comunicação com Orange', canRetry: true }
    }
  }
}

// ── EAGB ─────────────────────────────────────────────────────
class EAGBProvider extends BaseProvider {
  constructor() { super('eagb', 'EAGB') }

  async recharge({ recipient, amount, reference, config = {} }) {
    this.log('info', 'Pagamento EAGB iniciado', { recipient, amount, reference })

    if (this.isMock) {
      await simulateDelay(2000)
      if (!/^[0-9]{8,12}$/.test(recipient)) {
        return { success: false, reason: 'Número de contador inválido', canRetry: false }
      }
      if (Math.random() > 0.95) {
        return { success: false, reason: 'Contador não encontrado no sistema EAGB', canRetry: false }
      }
      const kwh = Math.floor((amount / 100) / 155 * 10) / 10
      return {
        success:     true,
        providerRef: `EAGB-${Date.now()}`,
        message:     `Pagamento EAGB confirmado. Crédito aproximado: ${kwh} kWh`,
        metadata:    { kwh_estimate: kwh, meter_number: recipient },
      }
    }

    try {
      const response = await axios.post(
        `${config.baseUrl || process.env.EAGB_API_URL}/payments/electricity`,
        { meter_number: recipient, amount: amount / 100, currency: 'XOF', reference },
        { headers: { 'X-API-Key': config.apiKey || process.env.EAGB_API_KEY }, timeout: 20000 }
      )
      if (response.data.success) {
        return { success: true, providerRef: response.data.transaction_id, message: response.data.message, metadata: response.data.details || {} }
      }
      return { success: false, reason: response.data.error || 'Falha EAGB', canRetry: false }
    } catch (err) {
      this.log('error', 'Falha na API EAGB', { error: err.message })
      return { success: false, reason: 'Erro de comunicação com EAGB', canRetry: true }
    }
  }
}

// ── SAAB ─────────────────────────────────────────────────────
class SAABProvider extends BaseProvider {
  constructor() { super('saab', 'SAAB') }

  async recharge({ recipient, amount, reference, config = {} }) {
    this.log('info', 'Pagamento SAAB iniciado', { recipient, amount, reference })

    if (this.isMock) {
      await simulateDelay(1800)
      if (!/^[0-9]{6,10}$/.test(recipient)) {
        return { success: false, reason: 'Número de conta de água inválido', canRetry: false }
      }
      if (Math.random() > 0.95) {
        return { success: false, reason: 'Conta não encontrada no sistema SAAB', canRetry: false }
      }
      return {
        success:     true,
        providerRef: `SAAB-${Date.now()}`,
        message:     `Pagamento de água confirmado para a conta ${recipient}`,
      }
    }

    try {
      const response = await axios.post(
        `${config.baseUrl || process.env.SAAB_API_URL}/payments/water`,
        { account_number: recipient, amount: amount / 100, currency: 'XOF', reference },
        { headers: { 'X-API-Key': config.apiKey || process.env.SAAB_API_KEY }, timeout: 20000 }
      )
      if (response.data.success) {
        return { success: true, providerRef: response.data.receipt_number, message: 'Pagamento de água confirmado' }
      }
      return { success: false, reason: response.data.error || 'Falha SAAB', canRetry: false }
    } catch (err) {
      this.log('error', 'Falha na API SAAB', { error: err.message })
      return { success: false, reason: 'Erro de comunicação com SAAB', canRetry: true }
    }
  }
}

// ── REGISTRY ─────────────────────────────────────────────────
const PROVIDER_REGISTRY = {
  mtn_gb_credit:    new MTNProvider(),
  mtn_gb_data:      new MTNProvider(),
  orange_gb_credit: new OrangeProvider(),
  orange_gb_data:   new OrangeProvider(),
  eagb_electricity: new EAGBProvider(),
  saab_water:       new SAABProvider(),
}

const getProvider = (providerCode) => {
  const adapter = PROVIDER_REGISTRY[providerCode]
  if (!adapter) throw new Error(`Provedor '${providerCode}' não implementado`)
  return adapter
}

module.exports = { getProvider }
