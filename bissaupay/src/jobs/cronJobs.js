// src/jobs/cronJobs.js
// Jobs automáticos — limpeza, atualização de taxas, expiração de QRs

const cron   = require('node-cron')
const { query }          = require('../config/database')
const { refreshAllRates } = require('../services/remittance/exchangeRateService')
const logger = require('../config/logger')

/**
 * Expira QR Codes dinâmicos que passaram do prazo
 */
const expireQRCodes = async () => {
  try {
    const result = await query(
      `UPDATE payment_requests
       SET status = 'expired'
       WHERE status = 'pending'
         AND qr_type = 'dynamic'
         AND expires_at IS NOT NULL
         AND expires_at < NOW()
       RETURNING id`
    )
    if (result.rowCount > 0) {
      logger.info(`[CRON] QR Codes expirados: ${result.rowCount}`)
    }
  } catch (err) {
    logger.error('[CRON] Falha ao expirar QRs', { error: err.message })
  }
}

/**
 * Limpa OTPs expirados da tabela (mantém banco limpo)
 */
const cleanExpiredOTPs = async () => {
  try {
    const result = await query(
      `DELETE FROM otp_codes WHERE expires_at < NOW() - INTERVAL '1 day' RETURNING id`
    )
    if (result.rowCount > 0) {
      logger.debug(`[CRON] OTPs expirados removidos: ${result.rowCount}`)
    }
  } catch (err) {
    logger.error('[CRON] Falha ao limpar OTPs', { error: err.message })
  }
}

/**
 * Limpa sessões expiradas
 */
const cleanExpiredSessions = async () => {
  try {
    const result = await query(
      `UPDATE sessions SET is_active = FALSE
       WHERE is_active = TRUE AND expires_at < NOW()
       RETURNING id`
    )
    if (result.rowCount > 0) {
      logger.debug(`[CRON] Sessões expiradas desativadas: ${result.rowCount}`)
    }
  } catch (err) {
    logger.error('[CRON] Falha ao limpar sessões', { error: err.message })
  }
}

/**
 * Atualiza taxas de câmbio
 */
const updateExchangeRates = async () => {
  try {
    logger.info('[CRON] Atualizando taxas de câmbio...')
    const results = await refreshAllRates()
    const success = results.filter(r => r.ok).length
    logger.info(`[CRON] Taxas atualizadas: ${success}/${results.length}`)
  } catch (err) {
    logger.error('[CRON] Falha ao atualizar taxas', { error: err.message })
  }
}

/**
 * Reset diário do limite de gastos das carteiras
 * (o trigger no banco faz isso automaticamente, mas este job garante)
 */
const resetDailyLimits = async () => {
  try {
    const result = await query(
      `UPDATE wallets
       SET daily_spent = 0, daily_reset_at = CURRENT_DATE
       WHERE daily_reset_at < CURRENT_DATE
       RETURNING id`
    )
    if (result.rowCount > 0) {
      logger.info(`[CRON] Limites diários resetados: ${result.rowCount} carteiras`)
    }
  } catch (err) {
    logger.error('[CRON] Falha ao resetar limites diários', { error: err.message })
  }
}

/**
 * Verificar remessas em processamento há mais de 48h
 * Alerta para revisão manual
 */
const checkStuckRemittances = async () => {
  try {
    const result = await query(
      `SELECT r.id, r.reference, r.send_amount, r.provider_name,
              r.created_at, u.phone AS sender_phone
       FROM remittance_orders r
       JOIN users u ON u.id = r.sender_id
       WHERE r.status IN ('pending', 'processing')
         AND r.created_at < NOW() - INTERVAL '48 hours'`
    )
    if (result.rows.length > 0) {
      logger.warn(`[CRON] ${result.rows.length} remessa(s) paradas há mais de 48h`, {
        remittances: result.rows.map(r => ({ id: r.id, reference: r.reference, sender: r.sender_phone }))
      })
    }
  } catch (err) {
    logger.error('[CRON] Falha ao verificar remessas paradas', { error: err.message })
  }
}

/**
 * Verificar recargas em processamento há mais de 10min
 */
const checkStuckTopups = async () => {
  try {
    const result = await query(
      `SELECT id, reference, recipient, amount, created_at
       FROM topup_orders
       WHERE status = 'processing'
         AND created_at < NOW() - INTERVAL '10 minutes'`
    )
    if (result.rows.length > 0) {
      logger.warn(`[CRON] ${result.rows.length} recarga(s) paradas há mais de 10min`, {
        orders: result.rows.map(r => r.reference)
      })
    }
  } catch (err) {
    logger.error('[CRON] Falha ao verificar recargas paradas', { error: err.message })
  }
}

/**
 * Inicializa todos os cron jobs
 */
const start = () => {
  // A cada 5 minutos — expirar QR Codes
  cron.schedule('*/5 * * * *', expireQRCodes, { name: 'expire-qrcodes' })

  // A cada 30 minutos — atualizar taxas de câmbio
  cron.schedule('*/30 * * * *', updateExchangeRates, { name: 'exchange-rates' })

  // A cada hora — limpar OTPs e sessões expiradas
  cron.schedule('0 * * * *', () => {
    cleanExpiredOTPs()
    cleanExpiredSessions()
  }, { name: 'cleanup' })

  // Todo dia à meia-noite — reset dos limites diários
  cron.schedule('0 0 * * *', resetDailyLimits, { name: 'daily-reset', timezone: 'Africa/Bissau' })

  // A cada 6 horas — verificar remessas paradas
  cron.schedule('0 */6 * * *', checkStuckRemittances, { name: 'check-remittances' })

  // A cada 15 minutos — verificar recargas paradas
  cron.schedule('*/15 * * * *', checkStuckTopups, { name: 'check-topups' })

  logger.info('⏰ Cron jobs registados:', [
    'expire-qrcodes (5min)',
    'exchange-rates (30min)',
    'cleanup (1h)',
    'daily-reset (00:00 GMT+0)',
    'check-remittances (6h)',
    'check-topups (15min)',
  ])
}

module.exports = { start, expireQRCodes, cleanExpiredOTPs, updateExchangeRates, resetDailyLimits }
