// src/middleware/auth.js
// Verificação de JWT e controlo de acesso por nível

const jwt    = require('jsonwebtoken')
const crypto = require('crypto')
const { query } = require('../config/database')
const logger    = require('../config/logger')

/**
 * Middleware principal de autenticação.
 * Verifica o JWT no header Authorization: Bearer <token>
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token de acesso não fornecido',
      })
    }

    const token = authHeader.substring(7)

    // Verificar assinatura e expiração
    let decoded
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch (err) {
      const isExpired = err.name === 'TokenExpiredError'
      return res.status(401).json({
        success: false,
        error: isExpired ? 'Sessão expirada. Faça login novamente.' : 'Token inválido.',
      })
    }

    // Verificar se o utilizador existe e está ativo
    const userResult = await query(
      `SELECT u.id, u.phone, u.full_name, u.status, u.level, u.language
       FROM users u
       WHERE u.id = $1`,
      [decoded.userId]
    )

    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, error: 'Utilizador não encontrado' })
    }

    const user = userResult.rows[0]

    if (user.status === 'blocked') {
      return res.status(403).json({
        success: false,
        error: 'Conta bloqueada. Contacte o suporte: suporte@bissaupay.gw',
      })
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'Conta suspensa temporariamente.',
      })
    }

    if (user.status === 'pending') {
      return res.status(403).json({
        success: false,
        error: 'Conta pendente de verificação.',
      })
    }

    // Injetar dados do utilizador na request
    req.user   = user
    req.userId = user.id

    // Atualizar last_seen em background (não bloqueia)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    query(
      `UPDATE sessions SET last_seen = NOW()
       WHERE token_hash = $1 AND is_active = TRUE`,
      [tokenHash]
    ).catch(() => {})

    next()
  } catch (err) {
    logger.error('Erro no middleware de autenticação', { error: err.message })
    res.status(500).json({ success: false, error: 'Erro interno de autenticação' })
  }
}

/**
 * Acesso exclusivo para administradores
 */
const requireAdmin = (req, res, next) => {
  // Pode verificar header de admin secret em ambientes de staging
  const adminSecret = req.headers['x-admin-secret']
  if (adminSecret && adminSecret === process.env.ADMIN_SECRET) {
    return next()
  }
  if (req.user?.level !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Acesso restrito a administradores',
    })
  }
  next()
}

/**
 * Acesso exclusivo para comerciantes (ou admins)
 */
const requireMerchant = (req, res, next) => {
  if (!['merchant', 'admin'].includes(req.user?.level)) {
    return res.status(403).json({
      success: false,
      error: 'Acesso restrito a comerciantes',
    })
  }
  next()
}

/**
 * Acesso para utilizadores verificados (kyc) ou acima
 */
const requireVerified = (req, res, next) => {
  if (req.user?.level === 'basic' && !req.user?.kyc_verified_at) {
    return res.status(403).json({
      success: false,
      error: 'Verificação de identidade necessária para esta operação',
    })
  }
  next()
}

module.exports = { authenticate, requireAdmin, requireMerchant, requireVerified }
