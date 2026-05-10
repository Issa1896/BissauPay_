// src/routes/wallet.js
// Saldo, transferências P2P e extrato

const express = require('express')
const router  = express.Router()
const { body, query: qParam } = require('express-validator')

const { query }               = require('../config/database')
const { transfer, getStatement, deposit } = require('../services/transactionService')
const { authenticate, requireAdmin }      = require('../middleware/auth')
const { validate }            = require('../middleware/validate')
const logger = require('../config/logger')

router.use(authenticate)

// ─────────────────────────────────────────────────────────────
// GET /wallet/balance
// ─────────────────────────────────────────────────────────────
router.get('/balance', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT w.balance, w.daily_limit, w.daily_spent, w.daily_reset_at,
              w.is_frozen, w.frozen_reason,
              u.full_name, u.phone, u.level, u.status
       FROM wallets w JOIN users u ON u.id = w.user_id
       WHERE w.user_id = $1`,
      [req.userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Carteira não encontrada' })
    }

    const w = result.rows[0]

    // Reset automático do limite diário se necessário
    const todayStr = new Date().toISOString().slice(0, 10)
    const isResetNeeded = w.daily_reset_at?.toISOString?.()?.slice(0, 10) < todayStr
    const dailySpent = isResetNeeded ? 0 : parseInt(w.daily_spent)

    res.json({
      success: true,
      wallet: {
        balance:          w.balance,
        balance_xof:      w.balance / 100,
        daily_limit:      w.daily_limit / 100,
        daily_spent:      dailySpent / 100,
        daily_remaining:  (w.daily_limit - dailySpent) / 100,
        is_frozen:        w.is_frozen,
        frozen_reason:    w.frozen_reason,
        currency:         'XOF',
      },
      user: {
        name:   w.full_name,
        phone:  w.phone,
        level:  w.level,
        status: w.status,
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// POST /wallet/transfer
// ─────────────────────────────────────────────────────────────
router.post('/transfer',
  [
    body('receiver_phone')
      .matches(/^\+?[0-9]{7,15}$/)
      .withMessage('Número do destinatário inválido'),
    body('amount')
      .isInt({ min: 100 })
      .withMessage('Valor mínimo: 1 XOF (100 centavos)'),
    body('description')
      .optional().isLength({ max: 150 })
      .withMessage('Descrição muito longa (máx. 150 caracteres)'),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return

    const { receiver_phone, amount, description } = req.body

    try {
      const result = await transfer({
        senderId:      req.userId,
        receiverPhone: receiver_phone,
        amount:        parseInt(amount),
        description,
        ipAddress:     req.ip,
        deviceId:      req.headers['x-device-id'],
      })

      res.json({
        success: true,
        message: 'Transferência realizada com sucesso',
        data: result,
      })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// GET /wallet/statement
// ─────────────────────────────────────────────────────────────
router.get('/statement',
  [
    qParam('page').optional().isInt({ min: 1 }),
    qParam('limit').optional().isInt({ min: 1, max: 100 }),
    qParam('type').optional().isIn([
      'transfer', 'deposit', 'withdrawal', 'payment',
      'topup', 'remittance_in', 'remittance_out', 'reversal',
    ]),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const statement = await getStatement(req.userId, {
        page:  parseInt(req.query.page)  || 1,
        limit: parseInt(req.query.limit) || 20,
        type:  req.query.type || null,
      })
      res.json({ success: true, data: statement })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// GET /wallet/transaction/:reference
// ─────────────────────────────────────────────────────────────
router.get('/transaction/:reference', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT t.id, t.reference, t.type, t.status,
              t.amount, t.fee, t.net_amount, t.description,
              t.created_at, t.completed_at, t.failed_reason,
              su.full_name AS sender_name,   su.phone AS sender_phone,
              ru.full_name AS receiver_name, ru.phone AS receiver_phone
       FROM transactions t
       LEFT JOIN users su ON su.id = t.sender_id
       LEFT JOIN users ru ON ru.id = t.receiver_id
       WHERE t.reference = $1
         AND (t.sender_id = $2 OR t.receiver_id = $2)`,
      [req.params.reference, req.userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Transação não encontrada' })
    }
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// POST /wallet/deposit  (admin only — depósito manual)
// ─────────────────────────────────────────────────────────────
router.post('/deposit',
  requireAdmin,
  [
    body('user_id').isUUID().withMessage('ID do utilizador inválido'),
    body('amount').isInt({ min: 100 }).withMessage('Valor mínimo: 1 XOF'),
    body('description').optional().isLength({ max: 200 }),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const result = await deposit({
        userId:      req.body.user_id,
        amount:      parseInt(req.body.amount),
        description: req.body.description || 'Depósito manual',
        operatorId:  req.userId,
      })
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// POST /wallet/freeze  (admin only)
// ─────────────────────────────────────────────────────────────
router.post('/freeze',
  requireAdmin,
  [
    body('user_id').isUUID(),
    body('reason').notEmpty().isLength({ max: 255 }),
    body('action').isIn(['freeze', 'unfreeze']),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const { user_id, reason, action } = req.body
      const freeze = action === 'freeze'
      await query(
        `UPDATE wallets SET is_frozen = $1, frozen_reason = $2, frozen_at = $3 WHERE user_id = $4`,
        [freeze, freeze ? reason : null, freeze ? new Date() : null, user_id]
      )
      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_data)
         VALUES ($1, $2, 'wallet', $3, $4)`,
        [req.userId, freeze ? 'WALLET_FROZEN' : 'WALLET_UNFROZEN', user_id, JSON.stringify({ reason, by: req.userId })]
      )
      res.json({ success: true, message: freeze ? 'Carteira bloqueada' : 'Carteira desbloqueada' })
    } catch (err) {
      next(err)
    }
  }
)

module.exports = router
