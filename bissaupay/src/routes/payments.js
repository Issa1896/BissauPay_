// src/routes/payments.js
// Pagamento via QR Code — preview e confirmação

const express = require('express')
const router  = express.Router()
const { body } = require('express-validator')

const { authenticate }  = require('../middleware/auth')
const { validate }      = require('../middleware/validate')
const { previewPayment, confirmPayment } = require('../services/paymentService')
const { getMerchantByShortCode }         = require('../services/merchantService')

router.use(authenticate)

// ─────────────────────────────────────────────────────────────
// POST /payments/preview
// ─────────────────────────────────────────────────────────────
router.post('/preview',
  [
    body('qr_payload').notEmpty().withMessage('Payload do QR Code é obrigatório'),
    body('amount').optional().isInt({ min: 100 }).withMessage('Valor mínimo: 1 XOF'),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const preview = await previewPayment({
        customerId:     req.userId,
        qrPayload:      req.body.qr_payload,
        customerAmount: req.body.amount ? parseInt(req.body.amount) : null,
      })
      res.json({
        success: true,
        data: {
          ...preview,
          amount_xof:           preview.amount / 100,
          fee_xof:              preview.fee / 100,
          net_to_merchant_xof:  preview.net_to_merchant / 100,
          customer_balance_xof: preview.customer_balance / 100,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// POST /payments/confirm
// ─────────────────────────────────────────────────────────────
router.post('/confirm',
  [
    body('payment_request_id').isUUID().withMessage('ID da requisição inválido'),
    body('amount').isInt({ min: 100 }).withMessage('Valor inválido'),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const result = await confirmPayment({
        customerId:       req.userId,
        paymentRequestId: req.body.payment_request_id,
        amount:           parseInt(req.body.amount),
        ipAddress:        req.ip,
        deviceId:         req.headers['x-device-id'],
      })
      res.json({
        success: true,
        message: 'Pagamento realizado com sucesso!',
        data: {
          ...result,
          amount_xof: result.amount / 100,
          fee_xof:    result.fee / 100,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// GET /payments/merchant-info/:shortCode
// ─────────────────────────────────────────────────────────────
router.get('/merchant-info/:shortCode', async (req, res, next) => {
  try {
    const merchant = await getMerchantByShortCode(req.params.shortCode)
    if (!merchant) {
      return res.status(404).json({ success: false, error: 'Comerciante não encontrado' })
    }
    res.json({
      success: true,
      data: {
        business_name: merchant.business_name,
        business_type: merchant.business_type,
        is_active:     merchant.is_active,
      },
    })
  } catch (err) {
    next(err)
  }
})

module.exports = router
