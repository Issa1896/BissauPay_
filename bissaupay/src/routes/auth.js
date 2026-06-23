// src/routes/auth.js
// Registro, verificação OTP, login, logout e gestão de sessão

const express = require('express')
const router  = express.Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const crypto  = require('crypto')
const { body } = require('express-validator')

const { query, withTransaction } = require('../config/database')
const { createOTP, verifyOTP }   = require('../services/otpService')
const { authenticate }           = require('../middleware/auth')
const { validate }               = require('../middleware/validate')
const logger = require('../config/logger')

const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  })

// ─────────────────────────────────────────────────────────────
// POST /auth/register
// ─────────────────────────────────────────────────────────────
router.post('/register',
  [
    body('email')
      .optional({ values: 'falsy' })
      .isEmail().normalizeEmail()
      .withMessage('Email inválido'),
    body('phone')
      .customSanitizer(v => v.replace(/[^\d+]/g, '').replace(/^(\+?)(.*)/, (_, p, n) => p + n.replace(/\+/g, '')))
      .matches(/^\+?[0-9]{7,15}$/)
      .withMessage('Número de telefone inválido'),
    body('full_name')
      .trim().isLength({ min: 2, max: 120 })
      .withMessage('Nome deve ter entre 2 e 120 caracteres'),
    body('pin')
      .isLength({ min: 4, max: 6 }).isNumeric()
      .withMessage('PIN deve ter 4 a 6 dígitos numéricos'),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return

    const { email, phone, full_name, pin } = req.body

    try {
      const existing = await query(
        `SELECT id, status FROM users WHERE phone = $1`,
        [phone]
      )

      if (existing.rows.length > 0) {
        const user = existing.rows[0]
        if (user.status === 'pending') {
          await createOTP(phone, 'register', req.body.email)
          return res.json({
            success: true,
            message: 'Código de verificação reenviado',
            nextStep: 'verify_otp',
          })
        }
        return res.status(409).json({ success: false, error: 'Este número já está registado' })
      }

      if (email) {
        const emailExists = await query(`SELECT id FROM users WHERE email = $1`, [email])
        if (emailExists.rows.length > 0) {
          return res.status(409).json({ success: false, error: 'Este email já está registado' })
        }
      }

      const pinHash = await bcrypt.hash(pin, 12)

      await withTransaction(async (client) => {
        const userResult = await client.query(
          `INSERT INTO users (phone, email, full_name, pin_hash, status)
           VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
          [phone, email || null, full_name.trim(), pinHash]
        )
        const userId = userResult.rows[0].id

        await client.query(
          `INSERT INTO wallets (user_id, balance, daily_limit)
           VALUES ($1, 0, $2)`,
          [userId, parseInt(process.env.LIMIT_DAILY_BASIC) || 50_000_000]
        )
        await client.query(
          `INSERT INTO audit_log (user_id, action, new_data)
           VALUES ($1, 'USER_REGISTERED', $2)`,
          [userId, JSON.stringify({ phone, email, full_name })]
        )
      })

      await createOTP(phone, 'register')

      logger.info('Novo utilizador registado', { phone, email })

      res.status(201).json({
        success:  true,
        message:  'Código de verificação enviado por SMS',
        nextStep: 'verify_otp',
      })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// POST /auth/verify-otp
// ─────────────────────────────────────────────────────────────
router.post('/verify-otp',
  [
    body('phone').customSanitizer(v => v.replace(/[^\d+]/g, '').replace(/^(\+?)(.*)/, (_, p, n) => p + n.replace(/\+/g, ''))).matches(/^\+?[0-9]{7,15}$/),
    body('code').isLength({ min: 6, max: 6 }).isNumeric(),
    body('purpose').isIn(['register', 'login', 'reset_pin', 'confirm_tx']),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return

    const { phone, code, purpose } = req.body

    try {
      const otpResult = await verifyOTP(phone, code, purpose)
      if (!otpResult.valid) {
        return res.status(400).json({ success: false, error: otpResult.reason })
      }

      if (purpose === 'register') {
        await query(
          `UPDATE users SET status = 'active' WHERE phone = $1 AND status = 'pending'`,
          [phone]
        )
      }

      const userResult = await query(
        `SELECT id, full_name, status, level FROM users WHERE phone = $1`,
        [phone]
      )
      if (userResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Utilizador não encontrado' })
      }

      const user = userResult.rows[0]

      if (purpose === 'login' || purpose === 'register') {
        const token     = generateToken(user.id)
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

        await query(
          `INSERT INTO sessions (user_id, token_hash, ip_address, user_agent, expires_at)
           VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
          [user.id, tokenHash, req.ip, req.headers['user-agent'] || '']
        )
        await query(
          `INSERT INTO audit_log (user_id, action, ip_address)
           VALUES ($1, $2, $3)`,
          [user.id, purpose === 'register' ? 'REGISTER_COMPLETE' : 'LOGIN_SUCCESS', req.ip]
        )

        return res.json({
          success: true,
          message: 'Verificação concluída',
          token,
          user: { id: user.id, name: user.full_name, level: user.level },
        })
      }

      res.json({ success: true, message: 'OTP verificado com sucesso' })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────────────────────
router.post('/login',
  [
    body('phone')
      .customSanitizer(v => v.replace(/[^\d+]/g, '').replace(/^(\+?)(.*)/, (_, p, n) => p + n.replace(/\+/g, '')))
      .customSanitizer(v => v || undefined),
    body('email').optional({ values: 'falsy' }).isEmail().normalizeEmail(),
    body('pin').isLength({ min: 4, max: 6 }).isNumeric(),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return

    const { phone, email, pin } = req.body

    try {
      const userResult = await query(
        `SELECT id, pin_hash, status, failed_pin_attempts, locked_until
         FROM users WHERE ${
           email ? 'email = $1' : 'phone = $1'
         }`,
        [email || phone]
      )

      // Resposta genérica para não revelar se o número existe
      if (userResult.rows.length === 0) {
        return res.status(401).json({ success: false, error: 'Credenciais inválidas' })
      }

      const user = userResult.rows[0]

      // Verificar bloqueio temporário
      if (user.locked_until && new Date() < new Date(user.locked_until)) {
        const minutesLeft = Math.ceil((new Date(user.locked_until) - Date.now()) / 60_000)
        return res.status(423).json({
          success: false,
          error:   `Conta bloqueada. Tente novamente em ${minutesLeft} minuto(s).`,
        })
      }

      if (user.status !== 'active') {
        return res.status(403).json({
          success: false,
          error:   user.status === 'pending'
            ? 'Conta pendente de verificação. Complete o registo.'
            : 'Conta não está ativa.',
        })
      }

      const pinCorrect = await bcrypt.compare(pin, user.pin_hash)

      if (!pinCorrect) {
        const newAttempts = user.failed_pin_attempts + 1
        const shouldLock  = newAttempts >= 5
        await query(
          `UPDATE users SET failed_pin_attempts = $1, locked_until = $2 WHERE id = $3`,
          [shouldLock ? 0 : newAttempts,
           shouldLock ? new Date(Date.now() + 30 * 60_000) : null,
           user.id]
        )
        logger.warn('PIN incorreto', { identifier: email || phone, attempts: newAttempts })

        return res.status(401).json({
          success: false,
          error:   shouldLock
            ? 'Muitas tentativas. Conta bloqueada por 30 minutos.'
            : `PIN inválido. ${5 - newAttempts} tentativa(s) restante(s).`,
        })
      }

      // PIN correto
      await query(
        `UPDATE users SET failed_pin_attempts = 0, locked_until = NULL WHERE id = $1`,
        [user.id]
      )
      const userEmail = email || (await query(`SELECT email FROM users WHERE id = $1`, [user.id])).rows[0]?.email
      await createOTP(phone, 'login', userEmail)

      logger.info('Login iniciado — OTP enviado', { identifier: email || phone })

      res.json({
        success:  true,
        message:  'Código de verificação enviado por SMS',
        nextStep: 'verify_otp',
      })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// POST /auth/resend-otp
// ─────────────────────────────────────────────────────────────
router.post('/resend-otp',
  [
body('phone').customSanitizer(v => v.replace(/[^\d+]/g, '').replace(/^(\+?)(.*)/, (_, p, n) => p + n.replace(/\+/g, ''))).matches(/^\+?[0-9]{7,15}$/),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      await createOTP(req.body.phone, req.body.purpose, req.body.email)
      res.json({ success: true, message: 'Código reenviado' })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// POST /auth/reset-pin  (solicita OTP)
// ─────────────────────────────────────────────────────────────
router.post('/reset-pin/request',
  [body('phone').customSanitizer(v => v.replace(/[^\d+]/g, '').replace(/^(\+?)(.*)/, (_, p, n) => p + n.replace(/\+/g, ''))).matches(/^\+?[0-9]{7,15}$/)],
  async (req, res, next) => {
    if (validate(req, res)) return
    try {
      const userResult = await query(`SELECT id, status FROM users WHERE phone = $1`, [req.body.phone])
      if (userResult.rows.length === 0 || userResult.rows[0].status !== 'active') {
        // Resposta genérica por segurança
        return res.json({ success: true, message: 'Se o número existir, um código será enviado' })
      }
      const userEmail = (await query(`SELECT email FROM users WHERE phone = $1`, [req.body.phone])).rows[0]?.email
      await createOTP(req.body.phone, 'reset_pin', userEmail)
      res.json({ success: true, message: 'Código de redefinição enviado', nextStep: 'verify_otp' })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// POST /auth/reset-pin/confirm  (novo PIN)
// ─────────────────────────────────────────────────────────────
router.post('/reset-pin/confirm',
  [
    body('phone').customSanitizer(v => v.replace(/[^\d+]/g, '').replace(/^(\+?)(.*)/, (_, p, n) => p + n.replace(/\+/g, ''))).matches(/^\+?[0-9]{7,15}$/),
    body('code').isLength({ min: 6, max: 6 }).isNumeric(),
    body('new_pin').isLength({ min: 4, max: 6 }).isNumeric().withMessage('PIN deve ter 4-6 dígitos'),
  ],
  async (req, res, next) => {
    if (validate(req, res)) return
    const { phone, code, new_pin } = req.body
    try {
      const otpResult = await verifyOTP(phone, code, 'reset_pin')
      if (!otpResult.valid) {
        return res.status(400).json({ success: false, error: otpResult.reason })
      }

      const pinHash = await bcrypt.hash(new_pin, 12)
      await query(
        `UPDATE users SET pin_hash = $1, failed_pin_attempts = 0, locked_until = NULL WHERE phone = $2`,
        [pinHash, phone]
      )

      const userResult = await query(`SELECT id FROM users WHERE phone = $1`, [phone])
      if (userResult.rows.length > 0) {
        await query(
          `INSERT INTO audit_log (user_id, action, ip_address)
           VALUES ($1, 'PIN_RESET', $2)`,
          [userResult.rows[0].id, req.ip]
        )
        // Invalidar todas as sessões ativas (segurança)
        await query(
          `UPDATE sessions SET is_active = FALSE WHERE user_id = $1`,
          [userResult.rows[0].id]
        )
      }

      res.json({ success: true, message: 'PIN redefinido com sucesso. Faça login novamente.' })
    } catch (err) {
      next(err)
    }
  }
)

// ─────────────────────────────────────────────────────────────
// POST /auth/logout
// ─────────────────────────────────────────────────────────────
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const token     = req.headers.authorization.substring(7)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    await query(`UPDATE sessions SET is_active = FALSE WHERE token_hash = $1`, [tokenHash])
    await query(`INSERT INTO audit_log (user_id, action) VALUES ($1, 'LOGOUT')`, [req.userId])
    res.json({ success: true, message: 'Sessão encerrada com sucesso' })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// GET /auth/me  — dados do utilizador autenticado
// ─────────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.id, u.phone, u.email, u.full_name, u.status, u.level, u.language,
              u.kyc_status, u.kyc_verified_at, u.created_at,
              w.balance, w.daily_limit, w.daily_spent, w.is_frozen
       FROM users u JOIN wallets w ON w.user_id = u.id
       WHERE u.id = $1`,
      [req.userId]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Utilizador não encontrado' })
    }
    const u = result.rows[0]
    res.json({
      success: true,
      data: {
        id:          u.id,
        phone:       u.phone,
        email:       u.email,
        name:        u.full_name,
        status:      u.status,
        level:       u.level,
        language:    u.language,
        kyc_status:  u.kyc_status,
        kyc_verified: !!u.kyc_verified_at,
        member_since: u.created_at,
        wallet: {
          balance:          u.balance,
          balance_xof:      u.balance / 100,
          daily_limit_xof:  u.daily_limit / 100,
          daily_spent_xof:  u.daily_spent / 100,
          daily_remaining_xof: (u.daily_limit - u.daily_spent) / 100,
          is_frozen:        u.is_frozen,
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────────────────────
// GET /auth/sessions  — sessões ativas
// ─────────────────────────────────────────────────────────────
router.get('/sessions', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, device_name, ip_address, created_at, last_seen, expires_at
       FROM sessions
       WHERE user_id = $1 AND is_active = TRUE AND expires_at > NOW()
       ORDER BY last_seen DESC`,
      [req.userId]
    )
    res.json({ success: true, data: result.rows })
  } catch (err) {
    next(err)
  }
})

module.exports = router
