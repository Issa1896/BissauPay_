// src/routes/topup.js
// Recargas de crédito e pagamentos de utilidades

const express = require('express')
const router  = express.Router()
const { body, query: qParam, param } = require('express-validator')

const { authenticate }  = require('../middleware/auth')
const { validate }      = require('../middleware/validate')
const {
  listProviders, previewTopup, executeTopup,
  getTopupHistory, getTopupOrder,
} = require('../services/topup/topupService')

router.use(authenticate)

const VALID_CATEGORIES = ['mobile_credit', 'mobile_data', 'electricity', 'water']

// ─────────────────────────────────────────────────────────────
// GET /topup/providers
// ─────────────────────────────────────────────────────────────
router.get('/providers',
  [qParam('category').optional().isIn(VALID_CATEGORIES)],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const providers = await listProviders(req.query.category || null)
      const grouped   = providers.reduce((acc, p) => {
        if (!acc[p.category]) acc[p.category] = []
        acc[p.category].push({
          id:              p.id,
          code:            p.code,
          name:            p.name,
          min_amount:      p.min_amount,
          max_amount:      p.max_amount,
          preset_amounts:  p.preset_amounts,
          fee_rate:        parseFloat(p.fee_rate),
          recipient_label: p.recipient_label,
          recipient_type:  p.recipient_type,
          logo_url:        p.logo_url,
        })
        return acc
      }, {})

      res.json({ success: true, data: { providers: grouped, total: providers.length } })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// POST /topup/preview
// ─────────────────────────────────────────────────────────────
router.post('/preview',
  [
    body('provider_id').isUUID().withMessage('ID do provedor inválido'),
    body('amount').isInt({ min: 100 }).withMessage('Valor mínimo: 1 XOF'),
    body('recipient').trim().notEmpty().isLength({ max: 100 }),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const preview = await previewTopup({
        userId:     req.userId,
        providerId: req.body.provider_id,
        amount:     parseInt(req.body.amount),
        recipient:  req.body.recipient.trim(),
      })
      res.json({
        success: true,
        data: {
          ...preview,
          amount_xof:          preview.amount / 100,
          fee_xof:             preview.fee / 100,
          total_xof:           preview.total / 100,
          current_balance_xof: preview.current_balance / 100,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// POST /topup/execute
// ─────────────────────────────────────────────────────────────
router.post('/execute',
  [
    body('provider_id').isUUID().withMessage('ID do provedor inválido'),
    body('amount').isInt({ min: 100 }).withMessage('Valor inválido'),
    body('recipient').trim().notEmpty().isLength({ max: 100 }),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const result = await executeTopup({
        userId:     req.userId,
        providerId: req.body.provider_id,
        amount:     parseInt(req.body.amount),
        recipient:  req.body.recipient.trim(),
        ipAddress:  req.ip,
        deviceId:   req.headers['x-device-id'],
      })

      if (result.success) {
        return res.json({
          success: true,
          message: result.message,
          data: {
            reference:    result.reference,
            provider:     result.provider,
            recipient:    result.recipient,
            amount_xof:   result.amount / 100,
            fee_xof:      result.fee / 100,
            provider_ref: result.provider_ref,
            metadata:     result.metadata,
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
          ? 'A recarga falhou, mas o seu saldo foi reembolsado automaticamente.'
          : 'A recarga falhou. Contacte o suporte com a referência.',
      })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// GET /topup/history
// ─────────────────────────────────────────────────────────────
router.get('/history',
  [
    qParam('page').optional().isInt({ min: 1 }),
    qParam('limit').optional().isInt({ min: 1, max: 50 }),
    qParam('category').optional().isIn(VALID_CATEGORIES),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const history = await getTopupHistory(req.userId, {
        page:     parseInt(req.query.page)  || 1,
        limit:    parseInt(req.query.limit) || 20,
        category: req.query.category || null,
      })
      res.json({ success: true, data: history })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// GET /topup/orders/:id
// ─────────────────────────────────────────────────────────────
router.get('/orders/:id',
  [param('id').isUUID().withMessage('ID inválido')],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const order = await getTopupOrder(req.params.id, req.userId)
      if (!order) return res.status(404).json({ success: false, error: 'Pedido não encontrado' })
      res.json({ success: true, data: order })
    } catch (err) {
      next(err)
    }
  }
)

module.exports = router
