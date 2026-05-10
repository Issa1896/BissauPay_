// src/routes/remittance.js
// Remessas internacionais — cotação, envio, histórico, webhook

const express = require('express')
const router  = express.Router()
const { body, query: qParam, param } = require('express-validator')

const { authenticate }  = require('../middleware/auth')
const { validate }      = require('../middleware/validate')
const { query }         = require('../config/database')
const {
  listCorridors, quote, initiate,
  getHistory, getOrderById, handleProviderWebhook,
} = require('../services/remittance/remittanceService')
const { refreshAllRates } = require('../services/remittance/exchangeRateService')
const logger = require('../config/logger')

router.use(authenticate)

const DELIVERY_METHODS = ['bank_transfer', 'mobile_wallet', 'cash_pickup']
const PURPOSES = ['family_support', 'business', 'education', 'medical', 'savings', 'investment', 'other']

// ─────────────────────────────────────────────────────────────
// GET /remittance/corridors
// ─────────────────────────────────────────────────────────────
router.get('/corridors',
  [qParam('direction').optional().isIn(['inbound', 'outbound'])],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const corridors = await listCorridors(req.query.direction || null)
      const grouped   = corridors.reduce((acc, c) => {
        if (!acc[c.direction]) acc[c.direction] = []
        acc[c.direction].push({
          id: c.id, code: c.code,
          origin_country: c.origin_country, dest_country: c.dest_country,
          origin_currency: c.origin_currency, dest_currency: c.dest_currency,
          fee_rate: parseFloat(c.fee_rate),
          min_amount: c.min_amount, max_amount: c.max_amount,
          delivery_methods: c.delivery_methods,
        })
        return acc
      }, {})
      res.json({ success: true, data: { corridors: grouped, total: corridors.length } })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// POST /remittance/quote
// ─────────────────────────────────────────────────────────────
router.post('/quote',
  [
    body('corridor_id').isUUID().withMessage('ID do corredor inválido'),
    body('send_amount').isInt({ min: 100 }).withMessage('Valor mínimo: 1 XOF'),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const result = await quote({
        corridorId: req.body.corridor_id,
        sendAmount: parseInt(req.body.send_amount),
        userId:     req.userId,
      })
      res.json({
        success: true,
        data: {
          ...result,
          send_amount_display:    `${result.send_amount / 100} ${result.corridor.origin_currency}`,
          fee_display:            `${result.fee_amount / 100} ${result.corridor.origin_currency}`,
          receive_amount_display: `${(result.receive_amount / 100).toFixed(2)} ${result.corridor.dest_currency}`,
          rate_display:           `1 ${result.corridor.origin_currency} = ${result.exchange_rate.toFixed(6)} ${result.corridor.dest_currency}`,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// POST /remittance/send
// ─────────────────────────────────────────────────────────────
router.post('/send',
  [
    body('corridor_id').isUUID().withMessage('Corredor inválido'),
    body('send_amount').isInt({ min: 100 }).withMessage('Valor inválido'),
    body('delivery_method').isIn(DELIVERY_METHODS).withMessage(`Método inválido. Opções: ${DELIVERY_METHODS.join(', ')}`),
    body('recipient_name').trim().isLength({ min: 2, max: 150 }).withMessage('Nome do destinatário obrigatório'),
    body('recipient_country').isLength({ min: 2, max: 2 }).isAlpha().withMessage('País inválido (ISO 2 letras)'),
    body('delivery_details').isObject().withMessage('Dados de entrega obrigatórios'),
    body('purpose').optional().isIn(PURPOSES),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const result = await initiate({
        userId:           req.userId,
        corridorId:       req.body.corridor_id,
        sendAmount:       parseInt(req.body.send_amount),
        deliveryMethod:   req.body.delivery_method,
        recipientName:    req.body.recipient_name.trim(),
        recipientPhone:   req.body.recipient_phone  || null,
        recipientEmail:   req.body.recipient_email  || null,
        recipientCountry: req.body.recipient_country.toUpperCase(),
        deliveryDetails:  req.body.delivery_details,
        purpose:          req.body.purpose          || null,
        sourceOfFunds:    req.body.source_of_funds  || null,
        ipAddress:        req.ip,
      })

      if (result.success) {
        return res.status(201).json({
          success: true,
          message: `Remessa de ${result.send_amount / 100} ${result.send_currency} iniciada.`,
          data: {
            ...result,
            send_amount_display:    `${result.send_amount / 100} ${result.send_currency}`,
            receive_amount_display: `${(result.receive_amount / 100).toFixed(2)} ${result.receive_currency}`,
            fee_display:            `${result.fee_amount / 100} ${result.send_currency}`,
          },
        })
      }

      res.status(422).json({
        success:   false,
        error:     result.error,
        refunded:  result.refunded,
        can_retry: result.can_retry,
        reference: result.reference,
        message:   result.refunded
          ? 'A remessa falhou, mas o saldo foi reembolsado automaticamente.'
          : 'A remessa falhou. Contacte o suporte com a referência.',
      })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// GET /remittance/history
// ─────────────────────────────────────────────────────────────
router.get('/history',
  [
    qParam('page').optional().isInt({ min: 1 }),
    qParam('limit').optional().isInt({ min: 1, max: 50 }),
    qParam('direction').optional().isIn(['inbound', 'outbound']),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const history = await getHistory(req.userId, {
        page:      parseInt(req.query.page)  || 1,
        limit:     parseInt(req.query.limit) || 20,
        direction: req.query.direction || null,
      })
      res.json({ success: true, data: history })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// GET /remittance/orders/:id
// ─────────────────────────────────────────────────────────────
router.get('/orders/:id',
  [param('id').isUUID()],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const order = await getOrderById(req.params.id, req.userId)
      if (!order) return res.status(404).json({ success: false, error: 'Remessa não encontrada' })
      res.json({ success: true, data: order })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// GET /remittance/rates/current
// ─────────────────────────────────────────────────────────────
router.get('/rates/current', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT base_currency, quote_currency, rate, source, fetched_at
       FROM exchange_rates ORDER BY base_currency, quote_currency`
    )
    res.json({
      success: true,
      data: { rates: result.rows, last_update: result.rows[0]?.fetched_at || null },
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// POST /remittance/rates/refresh  (admin)
// ─────────────────────────────────────────────────────────────
router.post('/rates/refresh', async (req, res, next) => {
  try {
    const results = await refreshAllRates()
    res.json({ success: true, data: results })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// POST /remittance/webhook/:provider  (sem autenticação JWT)
// ─────────────────────────────────────────────────────────────
router.post('/webhook/:provider',
  // Remove autenticação JWT desta rota
  (req, res, next) => { req.isWebhook = true; next() },
  async (req, res, next) => {
    const { provider } = req.params
    try {
      const signature = req.headers['x-signature'] || req.headers['x-wise-signature']
      if (process.env.NODE_ENV === 'production' && !signature) {
        logger.warn('Webhook sem assinatura', { provider, ip: req.ip })
        return res.status(401).json({ error: 'Assinatura inválida' })
      }

      const rawPayload = req.body
      let providerRef, providerStatus

      if (provider === 'wise') {
        providerRef    = String(rawPayload.data?.resource?.id)
        providerStatus = {
          outgoing_payment_sent: 'completed',
          cancelled:             'failed',
          funds_refunded:        'refunded',
          bounced_back:          'failed',
        }[rawPayload.data?.current_state] || 'processing'
      } else if (provider === 'wave') {
        providerRef    = rawPayload.id
        providerStatus = { succeeded: 'completed', errored: 'failed' }[rawPayload.payment_status] || 'processing'
      } else {
        return res.status(400).json({ error: `Provedor desconhecido: ${provider}` })
      }

      if (!providerRef) {
        return res.status(400).json({ error: 'Referência do provedor não encontrada' })
      }

      const result = await handleProviderWebhook({
        providerRef, providerStatus, providerName: provider, rawPayload,
      })

      res.json({ received: true, ...result })
    } catch (err) {
      logger.error('Erro no webhook de remessa', { provider, error: err.message })
      // Retornar 200 — evita reenvio infinito pelo provedor
      res.status(200).json({ received: true, error: 'Erro interno — verificar logs' })
    }
  }
)

module.exports = router
