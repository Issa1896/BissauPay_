// src/services/topup/topupService.js
// Motor de recargas — débito ACID + chamada ao provedor + reembolso automático

const { withTransaction, query } = require('../../config/database')
const { getProvider }            = require('./providers')
const logger = require('../../config/logger')

const generateRef = () => {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `REC-${d}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
}
const generateTxRef = () => {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `TXN-${d}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
}

const listProviders = async (category = null) => {
  let sql    = `SELECT id, code, name, category, min_amount, max_amount,
                       preset_amounts, fee_rate, recipient_label, recipient_type,
                       recipient_regex, logo_url, is_active
                FROM topup_providers WHERE is_active = TRUE`
  const params = []
  if (category) { params.push(category); sql += ` AND category = $1` }
  sql += ` ORDER BY category, name`
  const result = await query(sql, params)
  return result.rows
}

const getProviderById = async (providerId) => {
  const result = await query(
    `SELECT * FROM topup_providers WHERE id = $1 AND is_active = TRUE`,
    [providerId]
  )
  return result.rows[0] || null
}

const previewTopup = async ({ userId, providerId, amount, recipient }) => {
  const provider = await getProviderById(providerId)
  if (!provider) throw new Error('Provedor não encontrado ou inativo')

  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Valor inválido')
  if (provider.min_amount && amount < provider.min_amount) {
    throw new Error(`Valor mínimo para ${provider.name}: ${provider.min_amount / 100} XOF`)
  }
  if (provider.max_amount && amount > provider.max_amount) {
    throw new Error(`Valor máximo para ${provider.name}: ${provider.max_amount / 100} XOF`)
  }
  if (provider.recipient_regex) {
    if (!new RegExp(provider.recipient_regex).test(recipient)) {
      throw new Error(`${provider.recipient_label} inválido para ${provider.name}`)
    }
  }

  const fee     = Math.floor(amount * parseFloat(provider.fee_rate))
  const total   = amount + fee
  const walletR = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [userId])
  if (walletR.rows.length === 0) throw new Error('Carteira não encontrada')

  const balance = parseInt(walletR.rows[0].balance)

  return {
    provider: { id: provider.id, code: provider.code, name: provider.name, category: provider.category, logo_url: provider.logo_url },
    amount, fee, total, recipient,
    recipient_label:        `${provider.name} — ${recipient}`,
    has_sufficient_balance: balance >= total,
    current_balance:        balance,
    preset_amounts:         provider.preset_amounts,
  }
}

const executeTopup = async ({ userId, providerId, amount, recipient, ipAddress, deviceId }) => {
  const provider = await getProviderById(providerId)
  if (!provider) throw new Error('Provedor não encontrado')

  const fee       = Math.floor(amount * parseFloat(provider.fee_rate))
  const total     = amount + fee
  const reference = generateRef()
  const txRef     = generateTxRef()

  let orderId, transactionId

  // ── FASE 1: débito atômico ───────────────────────────────
  await withTransaction(async (client) => {
    const walletR = await client.query(
      `SELECT balance, is_frozen FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [userId]
    )
    if (walletR.rows.length === 0) throw new Error('Carteira não encontrada')
    const wallet = walletR.rows[0]
    if (wallet.is_frozen)       throw new Error('A sua carteira está bloqueada')
    if (wallet.balance < total) throw new Error('Saldo insuficiente')

    const txResult = await client.query(
      `INSERT INTO transactions
         (reference, type, status, sender_id, amount, fee, description, ip_address, device_id)
       VALUES ($1,'topup','processing',$2,$3,$4,$5,$6,$7) RETURNING id`,
      [txRef, userId, amount, fee, `${provider.name} — ${recipient}`, ipAddress, deviceId]
    )
    transactionId = txResult.rows[0].id

    await client.query(
      `UPDATE wallets SET balance = balance - $1, daily_spent = daily_spent + $1 WHERE user_id = $2`,
      [total, userId]
    )

    const orderResult = await client.query(
      `INSERT INTO topup_orders
         (reference, user_id, provider_id, transaction_id, category,
          status, amount, fee, recipient, recipient_label)
       VALUES ($1,$2,$3,$4,$5,'processing',$6,$7,$8,$9) RETURNING id`,
      [reference, userId, providerId, transactionId, provider.category,
       amount, fee, recipient, `${provider.name} — ${recipient}`]
    )
    orderId = orderResult.rows[0].id

    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_data)
       VALUES ($1,'TOPUP_INITIATED','topup_order',$2,$3)`,
      [userId, orderId, JSON.stringify({ reference, amount, fee, recipient, provider: provider.code })]
    )
  })

  logger.info('Recarga debitada, chamando provedor', { reference, provider: provider.code, amount })

  // ── FASE 2: chamada ao provedor ──────────────────────────
  let providerResult
  try {
    const adapter = getProvider(provider.code)
    providerResult = await adapter.recharge({ recipient, amount, reference, config: provider.api_config || {} })
  } catch (err) {
    logger.error('Erro no adaptador do provedor', { error: err.message })
    providerResult = { success: false, reason: 'Falha na comunicação com o provedor', canRetry: true }
  }

  // ── FASE 3: confirmar ou reembolsar ──────────────────────
  if (providerResult.success) {
    await query(
      `UPDATE topup_orders SET status='completed', provider_ref=$1, provider_response=$2, completed_at=NOW() WHERE id=$3`,
      [providerResult.providerRef, JSON.stringify(providerResult), orderId]
    )
    await query(`UPDATE transactions SET status='completed', completed_at=NOW() WHERE id=$1`, [transactionId])

    logger.info('Recarga concluída', { reference, providerRef: providerResult.providerRef })

    return {
      success: true, reference, orderId,
      provider: provider.name, recipient, amount, fee,
      message:      providerResult.message || 'Recarga realizada com sucesso',
      provider_ref: providerResult.providerRef,
      metadata:     providerResult.metadata || {},
    }
  }

  // Falha → reembolso automático
  logger.warn('Falha no provedor — reembolsando', { reference, reason: providerResult.reason })
  const refundRef = `REF-${generateRef().slice(4)}`
  let refundTxId  = null

  try {
    await withTransaction(async (client) => {
      const refundResult = await client.query(
        `INSERT INTO transactions
           (reference, type, status, receiver_id, amount, fee, description, reversed_by)
         VALUES ($1,'reversal','completed',$2,$3,0,$4,$5) RETURNING id`,
        [refundRef, userId, total, `Reembolso automático: ${reference}`, transactionId]
      )
      refundTxId = refundResult.rows[0].id

      await client.query(
        `UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`,
        [total, userId]
      )
      await client.query(
        `UPDATE topup_orders SET status='failed', failed_reason=$1, failed_at=NOW(),
         refund_transaction_id=$2, refunded_at=NOW(), provider_response=$3 WHERE id=$4`,
        [providerResult.reason, refundTxId, JSON.stringify(providerResult), orderId]
      )
      await client.query(
        `UPDATE transactions SET status='reversed', failed_reason=$1, failed_at=NOW() WHERE id=$2`,
        [providerResult.reason, transactionId]
      )
    })
    logger.info('Reembolso processado', { reference, refundRef })
  } catch (refundErr) {
    logger.error('CRÍTICO: falha no reembolso automático', { orderId, userId, total, error: refundErr.message })
  }

  return {
    success: false, reference, orderId,
    error:     providerResult.reason || 'Falha no provedor',
    refunded:  refundTxId !== null,
    can_retry: providerResult.canRetry || false,
  }
}

const getTopupHistory = async (userId, { page = 1, limit = 20, category = null } = {}) => {
  const offset = (page - 1) * limit
  let where    = `WHERE o.user_id = $1`
  const params = [userId]

  if (category) { params.push(category); where += ` AND o.category = $${params.length}` }

  const result = await query(
    `SELECT o.id, o.reference, o.category, o.status, o.amount, o.fee,
            o.recipient, o.recipient_label, o.provider_ref,
            o.created_at, o.completed_at, o.failed_reason,
            p.name AS provider_name, p.code AS provider_code, p.logo_url
     FROM topup_orders o JOIN topup_providers p ON p.id = o.provider_id
     ${where} ORDER BY o.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )
  const countR = await query(`SELECT COUNT(*) FROM topup_orders o ${where}`, params)

  return { orders: result.rows, total: parseInt(countR.rows[0].count), page, limit }
}

const getTopupOrder = async (orderId, userId) => {
  const result = await query(
    `SELECT o.*, p.name AS provider_name, p.code AS provider_code, p.logo_url
     FROM topup_orders o JOIN topup_providers p ON p.id = o.provider_id
     WHERE o.id = $1 AND o.user_id = $2`,
    [orderId, userId]
  )
  return result.rows[0] || null
}

module.exports = { listProviders, getProviderById, previewTopup, executeTopup, getTopupHistory, getTopupOrder }
