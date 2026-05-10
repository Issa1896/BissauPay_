// src/routes/merchants.js
// Onboarding, dashboard, QR codes e transações do comerciante

const express = require('express')
const router  = express.Router()
const { body, query: qParam } = require('express-validator')

const { authenticate, requireMerchant } = require('../middleware/auth')
const { validate }   = require('../middleware/validate')
const { query }      = require('../config/database')
const {
  registerMerchant, getMerchantByUser, getMerchantDashboard,
} = require('../services/merchantService')
const { generateDynamicQR }    = require('../services/qrService')
const { cancelPaymentRequest } = require('../services/paymentService')
const logger = require('../config/logger')

router.use(authenticate)

// ─────────────────────────────────────────────────────────────
// POST /merchants/register
// ─────────────────────────────────────────────────────────────
router.post('/register',
  [
    body('business_name')
      .trim().isLength({ min: 2, max: 150 })
      .withMessage('Nome do negócio deve ter 2-150 caracteres'),
    body('business_type')
      .optional()
      .isIn(['retail', 'restaurant', 'services', 'transport', 'health', 'education', 'other'])
      .withMessage('Tipo de negócio inválido'),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const result = await registerMerchant(req.userId, {
        businessName: req.body.business_name,
        businessType: req.body.business_type || 'other',
      })
      res.status(201).json({
        success: true,
        message: 'Negócio registado! O seu QR estático está pronto.',
        data:    result,
      })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// GET /merchants/me
// ─────────────────────────────────────────────────────────────
router.get('/me', requireMerchant, async (req, res, next) => {
  try {
    const merchant = await getMerchantByUser(req.userId)
    if (!merchant) {
      return res.status(404).json({ success: false, error: 'Perfil de comerciante não encontrado' })
    }
    res.json({ success: true, data: merchant })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// GET /merchants/dashboard
// ─────────────────────────────────────────────────────────────
router.get('/dashboard', requireMerchant, async (req, res, next) => {
  try {
    const merchant = await getMerchantByUser(req.userId)
    if (!merchant) {
      return res.status(404).json({ success: false, error: 'Comerciante não encontrado' })
    }
    const dashboard = await getMerchantDashboard(merchant.id)
    res.json({ success: true, data: dashboard })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// GET /merchants/qr/static
// ─────────────────────────────────────────────────────────────
router.get('/qr/static', requireMerchant, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT pr.short_code, pr.qr_image, pr.qr_payload, pr.created_at
       FROM payment_requests pr
       JOIN merchants m ON m.id = pr.merchant_id
       WHERE m.user_id = $1 AND pr.qr_type = 'static'
       LIMIT 1`,
      [req.userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'QR estático não encontrado' })
    }
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// POST /merchants/qr/dynamic
// ─────────────────────────────────────────────────────────────
router.post('/qr/dynamic',
  requireMerchant,
  [
    body('amount')
      .isInt({ min: 100 }).withMessage('Valor mínimo: 1 XOF (100 centavos)'),
    body('description').optional().isLength({ max: 200 }),
    body('expires_in_minutes').optional().isInt({ min: 1, max: 1440 })
      .withMessage('Expiração: 1 a 1440 minutos'),
    body('merchant_ref').optional().isLength({ max: 100 }),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const merchant = await getMerchantByUser(req.userId)
      if (!merchant) {
        return res.status(404).json({ success: false, error: 'Comerciante não encontrado' })
      }

      const { amount, description, expires_in_minutes = 30, merchant_ref } = req.body
      const { shortCode, payload, qrImage, expiresAt } = await generateDynamicQR(
        merchant.id,
        { amount: parseInt(amount), description, expiresInMinutes: parseInt(expires_in_minutes) }
      )

      await query(
        `INSERT INTO payment_requests
           (merchant_id, short_code, qr_type, status, amount, description,
            merchant_ref, qr_payload, qr_image, expires_at)
         VALUES ($1,$2,'dynamic','pending',$3,$4,$5,$6,$7,$8)`,
        [merchant.id, shortCode, parseInt(amount), description || null,
         merchant_ref || null, payload, qrImage, expiresAt]
      )

      res.status(201).json({
        success: true,
        message: 'QR Code gerado com sucesso',
        data: {
          short_code:         shortCode,
          amount,
          amount_xof:         amount / 100,
          description:        description || null,
          expires_at:         expiresAt,
          expires_in_minutes: parseInt(expires_in_minutes),
          qr_image:           qrImage,
          merchant_ref:       merchant_ref || null,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// GET /merchants/qr/requests
// ─────────────────────────────────────────────────────────────
router.get('/qr/requests',
  requireMerchant,
  [
    qParam('status').optional().isIn(['pending', 'paid', 'expired', 'cancelled']),
    qParam('page').optional().isInt({ min: 1 }),
    qParam('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const merchant = await getMerchantByUser(req.userId)
      if (!merchant) return res.status(404).json({ success: false, error: 'Comerciante não encontrado' })

      const page   = parseInt(req.query.page)  || 1
      const limit  = parseInt(req.query.limit) || 20
      const offset = (page - 1) * limit
      const status = req.query.status || null

      let where  = `WHERE pr.merchant_id = $1 AND pr.qr_type = 'dynamic'`
      const params = [merchant.id]
      if (status) { params.push(status); where += ` AND pr.status = $${params.length}` }

      const result = await query(
        `SELECT pr.id, pr.short_code, pr.status, pr.amount, pr.description,
                pr.merchant_ref, pr.expires_at, pr.paid_at, pr.created_at,
                t.reference AS transaction_reference
         FROM payment_requests pr
         LEFT JOIN transactions t ON t.id = pr.transaction_id
         ${where} ORDER BY pr.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      )
      const countR = await query(`SELECT COUNT(*) FROM payment_requests pr ${where}`, params)

      res.json({
        success: true,
        data: {
          requests: result.rows,
          total:    parseInt(countR.rows[0].count),
          page, limit,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// DELETE /merchants/qr/requests/:id
// ─────────────────────────────────────────────────────────────
router.delete('/qr/requests/:id', requireMerchant, async (req, res, next) => {
  try {
    await cancelPaymentRequest(req.params.id, req.userId)
    res.json({ success: true, message: 'QR cancelado com sucesso' })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// GET /merchants/transactions
// ─────────────────────────────────────────────────────────────
router.get('/transactions',
  requireMerchant,
  [
    qParam('page').optional().isInt({ min: 1 }),
    qParam('limit').optional().isInt({ min: 1, max: 100 }),
    qParam('from').optional().isISO8601(),
    qParam('to').optional().isISO8601(),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const page   = parseInt(req.query.page)  || 1
      const limit  = parseInt(req.query.limit) || 20
      const offset = (page - 1) * limit
      const from   = req.query.from || null
      const to     = req.query.to   || null

      let where  = `WHERE t.receiver_id = $1 AND t.type = 'payment' AND t.status = 'completed'`
      const params = [req.userId]
      if (from) { params.push(from); where += ` AND t.created_at >= $${params.length}` }
      if (to)   { params.push(to);   where += ` AND t.created_at <= $${params.length}` }

      const result = await query(
        `SELECT t.id, t.reference, t.amount, t.fee, t.net_amount,
                t.description, t.created_at, t.completed_at,
                u.full_name AS customer_name, u.phone AS customer_phone,
                pr.short_code, pr.merchant_ref, pr.qr_type
         FROM transactions t
         JOIN users u ON u.id = t.sender_id
         LEFT JOIN payment_requests pr ON pr.transaction_id = t.id
         ${where} ORDER BY t.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      )
      const aggR = await query(
        `SELECT COUNT(*) AS count, SUM(amount) AS total_amount, SUM(net_amount) AS total_net
         FROM transactions t ${where}`,
        params
      )
      const agg = aggR.rows[0]

      res.json({
        success: true,
        data: {
          transactions: result.rows,
          total:        parseInt(agg.count),
          total_amount: parseInt(agg.total_amount || 0),
          total_net:    parseInt(agg.total_net    || 0),
          page, limit,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

module.exports = router
