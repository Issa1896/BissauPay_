// src/routes/admin.js
// Painel administrativo — métricas, gestão de utilizadores, auditoria

const express = require('express')
const router  = express.Router()
const { body, query: qParam } = require('express-validator')

const { authenticate, requireAdmin } = require('../middleware/auth')
const { validate }   = require('../middleware/validate')
const { query }      = require('../config/database')
const { poolStats }  = require('../config/database')
const logger = require('../config/logger')

router.use(authenticate)
router.use(requireAdmin)

// ─────────────────────────────────────────────────────────────
// GET /admin/metrics  — métricas gerais do sistema
// ─────────────────────────────────────────────────────────────
router.get('/metrics', async (req, res, next) => {
  try {
    const [
      usersResult, txResult, walletsResult,
      topupResult, remittanceResult,
    ] = await Promise.all([
      query(`SELECT
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'active') AS active,
               COUNT(*) FILTER (WHERE status = 'pending') AS pending,
               COUNT(*) FILTER (WHERE kyc_status = 'approved') AS kyc_approved,
               COUNT(*) FILTER (WHERE level = 'merchant') AS merchants,
               COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS new_today
             FROM users`),

      query(`SELECT
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'completed') AS completed,
               COUNT(*) FILTER (WHERE status = 'failed') AS failed,
               COUNT(*) FILTER (WHERE status IN ('pending','processing')) AS pending,
               COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS volume_total,
               COALESCE(SUM(fee)    FILTER (WHERE status = 'completed'), 0) AS fees_total,
               COALESCE(SUM(amount) FILTER (WHERE status = 'completed' AND created_at >= CURRENT_DATE), 0) AS volume_today,
               COALESCE(SUM(fee)    FILTER (WHERE status = 'completed' AND created_at >= CURRENT_DATE), 0) AS fees_today
             FROM transactions`),

      query(`SELECT
               COUNT(*) AS total_wallets,
               COALESCE(SUM(balance), 0) AS total_balance_xof,
               AVG(balance) AS avg_balance,
               COUNT(*) FILTER (WHERE is_frozen = TRUE) AS frozen_wallets
             FROM wallets`),

      query(`SELECT
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'completed') AS completed,
               COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS volume
             FROM topup_orders`),

      query(`SELECT
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status = 'completed') AS completed,
               COUNT(*) FILTER (WHERE status IN ('pending','processing')) AS in_transit,
               COALESCE(SUM(send_amount) FILTER (WHERE status = 'completed'), 0) AS volume
             FROM remittance_orders`),
    ])

    res.json({
      success: true,
      data: {
        users:       usersResult.rows[0],
        transactions: txResult.rows[0],
        wallets:     walletsResult.rows[0],
        topup:       topupResult.rows[0],
        remittances: remittanceResult.rows[0],
        system: {
          uptime:    process.uptime(),
          memory:    process.memoryUsage(),
          db_pool:   poolStats(),
          timestamp: new Date().toISOString(),
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// GET /admin/users  — lista de utilizadores
// ─────────────────────────────────────────────────────────────
router.get('/users',
  [
    qParam('page').optional().isInt({ min: 1 }),
    qParam('limit').optional().isInt({ min: 1, max: 100 }),
    qParam('status').optional().isIn(['pending', 'active', 'suspended', 'blocked']),
    qParam('level').optional().isIn(['basic', 'verified', 'merchant', 'admin']),
    qParam('search').optional().isLength({ max: 50 }),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const page   = parseInt(req.query.page)  || 1
      const limit  = parseInt(req.query.limit) || 20
      const offset = (page - 1) * limit

      let where  = 'WHERE 1=1'
      const params = []

      if (req.query.status) { params.push(req.query.status); where += ` AND u.status = $${params.length}` }
      if (req.query.level)  { params.push(req.query.level);  where += ` AND u.level  = $${params.length}` }
      if (req.query.search) {
        params.push(`%${req.query.search}%`)
        where += ` AND (u.phone ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`
      }

      const result = await query(
        `SELECT u.id, u.phone, u.full_name, u.status, u.level,
                u.kyc_status, u.created_at, u.updated_at,
                w.balance, w.is_frozen
         FROM users u LEFT JOIN wallets w ON w.user_id = u.id
         ${where} ORDER BY u.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      )
      const countR = await query(
        `SELECT COUNT(*) FROM users u ${where}`,
        params
      )

      res.json({
        success: true,
        data: {
          users: result.rows,
          total: parseInt(countR.rows[0].count),
          page, limit,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// GET /admin/users/:id  — detalhes de um utilizador
// ─────────────────────────────────────────────────────────────
router.get('/users/:id', async (req, res, next) => {
  try {
    const userR = await query(
      `SELECT u.*, w.balance, w.daily_limit, w.daily_spent, w.is_frozen, w.frozen_reason
       FROM users u LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.id = $1`,
      [req.params.id]
    )
    if (userR.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Utilizador não encontrado' })
    }

    const txCountR = await query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS volume
       FROM transactions WHERE (sender_id = $1 OR receiver_id = $1) AND status = 'completed'`,
      [req.params.id]
    )

    res.json({
      success: true,
      data: {
        user:         userR.rows[0],
        tx_summary:   txCountR.rows[0],
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// PATCH /admin/users/:id/status  — mudar status
// ─────────────────────────────────────────────────────────────
router.patch('/users/:id/status',
  [
    body('status').isIn(['active', 'suspended', 'blocked']).withMessage('Status inválido'),
    body('reason').optional().isLength({ max: 255 }),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      await query(
        `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`,
        [req.body.status, req.params.id]
      )
      await query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_data)
         VALUES ($1, $2, 'user', $3, $4)`,
        [req.userId, `USER_STATUS_${req.body.status.toUpperCase()}`, req.params.id,
         JSON.stringify({ status: req.body.status, reason: req.body.reason, by: req.userId })]
      )
      res.json({ success: true, message: `Status alterado para '${req.body.status}'` })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// GET /admin/audit  — log de auditoria
// ─────────────────────────────────────────────────────────────
router.get('/audit',
  [
    qParam('page').optional().isInt({ min: 1 }),
    qParam('limit').optional().isInt({ min: 1, max: 100 }),
    qParam('user_id').optional().isUUID(),
    qParam('action').optional().isLength({ max: 50 }),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const page   = parseInt(req.query.page)  || 1
      const limit  = parseInt(req.query.limit) || 50
      const offset = (page - 1) * limit

      let where  = 'WHERE 1=1'
      const params = []
      if (req.query.user_id) { params.push(req.query.user_id); where += ` AND a.user_id = $${params.length}` }
      if (req.query.action)  { params.push(`%${req.query.action}%`); where += ` AND a.action ILIKE $${params.length}` }

      const result = await query(
        `SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id,
                a.new_data, a.ip_address, a.created_at,
                u.phone, u.full_name
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
         ${where} ORDER BY a.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      )
      const countR = await query(`SELECT COUNT(*) FROM audit_log a ${where}`, params)

      res.json({
        success: true,
        data: { logs: result.rows, total: parseInt(countR.rows[0].count), page, limit },
      })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// GET /admin/transactions  — todas as transações
// ─────────────────────────────────────────────────────────────
router.get('/transactions',
  [
    qParam('page').optional().isInt({ min: 1 }),
    qParam('limit').optional().isInt({ min: 1, max: 100 }),
    qParam('status').optional().isIn(['pending', 'processing', 'completed', 'failed', 'reversed']),
    qParam('type').optional(),
    qParam('from').optional().isISO8601(),
    qParam('to').optional().isISO8601(),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const page   = parseInt(req.query.page)  || 1
      const limit  = parseInt(req.query.limit) || 20
      const offset = (page - 1) * limit

      let where  = 'WHERE 1=1'
      const params = []
      if (req.query.status) { params.push(req.query.status); where += ` AND t.status = $${params.length}` }
      if (req.query.type)   { params.push(req.query.type);   where += ` AND t.type   = $${params.length}` }
      if (req.query.from)   { params.push(req.query.from);   where += ` AND t.created_at >= $${params.length}` }
      if (req.query.to)     { params.push(req.query.to);     where += ` AND t.created_at <= $${params.length}` }

      const result = await query(
        `SELECT t.id, t.reference, t.type, t.status, t.amount, t.fee,
                t.description, t.created_at, t.completed_at,
                su.phone AS sender_phone, ru.phone AS receiver_phone
         FROM transactions t
         LEFT JOIN users su ON su.id = t.sender_id
         LEFT JOIN users ru ON ru.id = t.receiver_id
         ${where} ORDER BY t.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      )
      const countR = await query(`SELECT COUNT(*), COALESCE(SUM(amount),0) AS total_volume FROM transactions t ${where}`, params)
      const agg    = countR.rows[0]

      res.json({
        success: true,
        data: {
          transactions: result.rows,
          total:        parseInt(agg.count),
          total_volume: parseInt(agg.total_volume),
          page, limit,
        },
      })
    } catch (err) {
      next(err)
    }
  }
)

module.exports = router
