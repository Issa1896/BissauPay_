// src/services/notificationService.js
// Notificações in-app e SMS para eventos financeiros

const { query } = require('../config/database')
const logger    = require('../config/logger')

/**
 * Templates de notificação por evento
 */
const TEMPLATES = {
  TRANSFER_SENT: (data) => ({
    title:   'Transferência enviada',
    body:    `${(data.amount / 100).toLocaleString()} XOF enviados para ${data.receiver_name}`,
    type:    'debit',
  }),
  TRANSFER_RECEIVED: (data) => ({
    title:   'Dinheiro recebido! 💚',
    body:    `${(data.amount / 100).toLocaleString()} XOF recebidos de ${data.sender_name}`,
    type:    'credit',
  }),
  PAYMENT_SENT: (data) => ({
    title:   'Pagamento realizado',
    body:    `${(data.amount / 100).toLocaleString()} XOF pagos a ${data.merchant_name}`,
    type:    'debit',
  }),
  PAYMENT_RECEIVED: (data) => ({
    title:   'Venda confirmada! 💚',
    body:    `Recebeu ${(data.net_amount / 100).toLocaleString()} XOF de ${data.customer_name}`,
    type:    'credit',
  }),
  TOPUP_SUCCESS: (data) => ({
    title:   'Recarga realizada',
    body:    `Recarga de ${(data.amount / 100).toLocaleString()} XOF para ${data.recipient} confirmada`,
    type:    'info',
  }),
  TOPUP_FAILED: (data) => ({
    title:   'Recarga falhou',
    body:    `Recarga falhou. Saldo reembolsado automaticamente.`,
    type:    'error',
  }),
  REMITTANCE_SENT: (data) => ({
    title:   'Remessa enviada ✈',
    body:    `${(data.send_amount / 100).toLocaleString()} XOF enviados para ${data.recipient_name} (${data.dest_country})`,
    type:    'debit',
  }),
  REMITTANCE_COMPLETED: (data) => ({
    title:   'Remessa entregue! ✅',
    body:    `A remessa para ${data.recipient_name} foi entregue com sucesso`,
    type:    'success',
  }),
  KYC_APPROVED: () => ({
    title:   'Identidade verificada ✅',
    body:    'O seu perfil foi verificado. Os seus limites foram aumentados.',
    type:    'success',
  }),
  KYC_REJECTED: (data) => ({
    title:   'Verificação rejeitada',
    body:    `A sua verificação foi rejeitada: ${data.reason}`,
    type:    'error',
  }),
  WALLET_FROZEN: (data) => ({
    title:   'Carteira bloqueada ⚠️',
    body:    `A sua carteira foi bloqueada: ${data.reason}`,
    type:    'warning',
  }),
  LOW_BALANCE: (data) => ({
    title:   'Saldo baixo',
    body:    `O seu saldo é de ${(data.balance / 100).toLocaleString()} XOF`,
    type:    'warning',
  }),
}

/**
 * Envia notificação para um utilizador
 */
const notify = async (userId, eventType, data = {}) => {
  try {
    const templateFn = TEMPLATES[eventType]
    if (!templateFn) {
      logger.warn('Template de notificação não encontrado', { eventType })
      return
    }

    const notification = templateFn(data)

    // Salvar notificação no banco (tabela in-app)
    await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [userId, notification.type, notification.title, notification.body, JSON.stringify(data)]
    ).catch(() => {
      // Tabela pode não existir ainda — não bloqueia
    })

    // Enviar SMS para eventos críticos
    const criticalEvents = ['TRANSFER_RECEIVED', 'PAYMENT_RECEIVED', 'WALLET_FROZEN']
    if (criticalEvents.includes(eventType)) {
      const userResult = await query(`SELECT phone FROM users WHERE id = $1`, [userId])
      if (userResult.rows.length > 0) {
        const { phone } = userResult.rows[0]
        const { createOTP } = require('./otpService')
        // Re-usa o sendSMS interno
        const sendSMS = require('./otpService')._sendSMS
        if (typeof sendSMS === 'function') {
          await sendSMS(phone, `BissauPay: ${notification.body}`).catch(() => {})
        }
      }
    }

    logger.debug('Notificação enviada', { userId, eventType })
  } catch (err) {
    // Notificações nunca devem quebrar o fluxo principal
    logger.error('Falha ao enviar notificação', { userId, eventType, error: err.message })
  }
}

/**
 * Lista notificações de um utilizador
 */
const getUserNotifications = async (userId, { page = 1, limit = 20 } = {}) => {
  try {
    const offset = (page - 1) * limit
    const result = await query(
      `SELECT id, type, title, body, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    )

    const unreadCount = await query(
      `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    )

    return {
      notifications: result.rows,
      unread:        parseInt(unreadCount.rows[0].count),
      page, limit,
    }
  } catch {
    return { notifications: [], unread: 0, page, limit }
  }
}

/**
 * Marca notificações como lidas
 */
const markAsRead = async (userId, notificationIds = []) => {
  try {
    if (notificationIds.length === 0) {
      await query(
        `UPDATE notifications SET is_read = TRUE WHERE user_id = $1`,
        [userId]
      )
    } else {
      await query(
        `UPDATE notifications SET is_read = TRUE
         WHERE user_id = $1 AND id = ANY($2::uuid[])`,
        [userId, notificationIds]
      )
    }
    return { success: true }
  } catch {
    return { success: false }
  }
}

module.exports = { notify, getUserNotifications, markAsRead }
