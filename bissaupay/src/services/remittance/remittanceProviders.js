// src/services/remittance/remittanceProviders.js
// Adaptadores Wise e Wave para remessas internacionais

const axios  = require('axios')
const logger = require('../../config/logger')

const isMock = () =>
  process.env.NODE_ENV !== 'production' || process.env.REMITTANCE_PROVIDER === 'mock'

// ── WISE ─────────────────────────────────────────────────────
const WiseProvider = {
  name: 'Wise', code: 'wise',

  async send({ order, corridor }) {
    logger.info('[Wise] Iniciando remessa', { reference: order.reference })

    if (isMock()) {
      await new Promise(r => setTimeout(r, 2000))
      if (Math.random() > 0.97) {
        return { success: false, reason: 'Conta bancária do destinatário inválida', canRetry: false }
      }
      return {
        success:          true,
        providerRef:      `WISE-${Date.now()}`,
        message:          'Transferência iniciada no Wise',
        estimatedArrival: new Date(Date.now() + 2 * 86400_000).toISOString(),
        details:          { tracking_url: `https://wise.com/track/WISE-${Date.now()}`, eta_business_days: 1 },
      }
    }

    try {
      const apiKey  = process.env.WISE_API_KEY
      const profile = process.env.WISE_PROFILE_ID
      const base    = 'https://api.wise.com'
      const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }

      // 1. Quote
      const quoteRes = await axios.post(`${base}/v3/profiles/${profile}/quotes`, {
        sourceCurrency: order.send_currency, targetCurrency: order.receive_currency,
        sourceAmount: order.send_amount / 100, targetAmount: null,
        payOut: 'BANK_TRANSFER', preferredPayIn: 'BALANCE',
      }, { headers, timeout: 15000 })

      // 2. Recipient
      const deliveryDetails = order.delivery_details || {}
      const recipientRes = await axios.post(`${base}/v1/accounts`, {
        currency: order.receive_currency, type: 'iban', profile, ownedByCustomer: false,
        accountHolderName: order.recipient_name,
        details: { legalType: 'PRIVATE', IBAN: deliveryDetails.iban, BIC: deliveryDetails.bic },
      }, { headers, timeout: 15000 })

      // 3. Transfer
      const transferRes = await axios.post(`${base}/v1/transfers`, {
        targetAccount: recipientRes.data.id, quoteUuid: quoteRes.data.id,
        customerTransactionId: order.reference,
        details: { reference: `BissauPay-${order.reference}`, transferPurpose: 'verification.transfers.purpose.pay.bills', sourceOfFunds: 'verification.source.of.funds.salary' },
      }, { headers, timeout: 15000 })

      // 4. Fund
      await axios.post(
        `${base}/v3/profiles/${profile}/transfers/${transferRes.data.id}/payments`,
        { type: 'BALANCE' }, { headers, timeout: 15000 }
      )

      return {
        success: true, providerRef: String(transferRes.data.id),
        message: 'Remessa enviada via Wise',
        details: { wise_transfer_id: transferRes.data.id },
      }
    } catch (err) {
      const errMsg = err.response?.data?.errors?.[0]?.message || err.message
      logger.error('[Wise] Falha na API', { error: errMsg })
      return { success: false, reason: errMsg, canRetry: true }
    }
  },

  async getStatus({ providerRef }) {
    if (isMock()) return { status: 'processing', details: {} }
    try {
      const r = await axios.get(`https://api.wise.com/v1/transfers/${providerRef}`, {
        headers: { Authorization: `Bearer ${process.env.WISE_API_KEY}` }, timeout: 10000,
      })
      const map = {
        incoming_payment_waiting: 'processing', processing: 'processing',
        outgoing_payment_sent: 'completed', cancelled: 'failed',
        funds_refunded: 'refunded', bounced_back: 'failed',
      }
      return { status: map[r.data.status] || 'processing', details: r.data }
    } catch {
      return { status: 'processing', details: {} }
    }
  },
}

// ── WAVE ─────────────────────────────────────────────────────
const WaveProvider = {
  name: 'Wave', code: 'wave',

  async send({ order }) {
    logger.info('[Wave] Enviando para carteira móvel', { reference: order.reference })

    if (isMock()) {
      await new Promise(r => setTimeout(r, 1500))
      if (Math.random() > 0.96) {
        return { success: false, reason: 'Número Wave inválido ou conta não encontrada', canRetry: false }
      }
      return {
        success: true, providerRef: `WAVE-${Date.now()}`,
        message: 'Valor entregue na carteira Wave do destinatário',
        details: { delivery: 'instant' },
      }
    }

    try {
      const response = await axios.post(
        'https://api.wave.com/v1/checkout/sessions',
        {
          amount:           String(order.receive_amount / 100),
          currency:         order.receive_currency,
          client_reference: order.reference,
          success_url:      `${process.env.APP_URL}/remittance/success`,
          error_url:        `${process.env.APP_URL}/remittance/error`,
        },
        { headers: { Authorization: `Bearer ${process.env.WAVE_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 12000 }
      )
      return { success: true, providerRef: response.data.id, message: 'Pagamento Wave iniciado', details: { checkout_url: response.data.wave_launch_url } }
    } catch (err) {
      logger.error('[Wave] Falha na API', { error: err.message })
      return { success: false, reason: 'Erro na comunicação com Wave', canRetry: true }
    }
  },

  async getStatus({ providerRef }) {
    if (isMock()) return { status: 'completed', details: {} }
    try {
      const r   = await axios.get(`https://api.wave.com/v1/checkout/sessions/${providerRef}`, {
        headers: { Authorization: `Bearer ${process.env.WAVE_API_KEY}` }, timeout: 10000,
      })
      const map = { processing: 'processing', succeeded: 'completed', errored: 'failed' }
      return { status: map[r.data.payment_status] || 'processing', details: r.data }
    } catch {
      return { status: 'processing', details: {} }
    }
  },
}

const REGISTRY = { wise: WiseProvider, wave: WaveProvider }

const getRemittanceProvider = (code) => {
  const provider = REGISTRY[code]
  if (!provider) throw new Error(`Provedor de remessa '${code}' não implementado`)
  return provider
}

module.exports = { getRemittanceProvider }
