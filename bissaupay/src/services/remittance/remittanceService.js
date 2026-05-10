// src/services/remittance/remittanceService.js
// Motor de remessas internacionais — cotação, envio, histórico, webhook

const { withTransaction, query } = require('../../config/database')
const { convert }                = require('./exchangeRateService')
const { getRemittanceProvider }  = require('./remittanceProviders')
const logger = require('../../config/logger')

const generateRef = () => {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `REM-${d}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
}
const generateTxRef = () => {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `TXN-${d}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
}

const listCorridors = async (direction = null) => {
  let sql    = `SELECT id, code, origin_country, dest_country, origin_currency, dest_currency,
                       direction, fee_rate, fee_fixed, fee_min, min_amount, max_amount,
                       kyc_threshold, delivery_methods, is_active
                FROM remittance_corridors WHERE is_active = TRUE`
  const params = []
  if (direction) { params.push(direction); sql += ` AND direction = $1` }
  sql += ` ORDER BY direction, code`
  return (await query(sql, params)).rows
}

const getCorridorById = async (corridorId) => {
  const r = await query(`SELECT * FROM remittance_corridors WHERE id = $1 AND is_active = TRUE`, [corridorId])
  return r.rows[0] || null
}

const quote = async ({ corridorId, sendAmount, userId }) => {
  const corridor = await getCorridorById(corridorId)
  if (!corridor) throw new Error('Corredor não disponível')
  if (!Number.isInteger(sendAmount) || sendAmount <= 0) throw new Error('Valor inválido')
  if (sendAmount < corridor.min_amount) throw new Error(`Valor mínimo: ${corridor.min_amount / 100} ${corridor.origin_currency}`)
  if (sendAmount > corridor.max_amount) throw new Error(`Valor máximo: ${corridor.max_amount / 100} ${corridor.origin_currency}`)

  const feeRate  = parseFloat(corridor.fee_rate)
  const feeFixed = parseInt(corridor.fee_fixed) || 0
  let   fee      = Math.floor(sendAmount * feeRate) + feeFixed
  const feeMin   = parseInt(corridor.fee_min) || 0
  if (fee < feeMin) fee = feeMin

  const sendNetXof = sendAmount - fee
  const conversion = await convert(sendNetXof, corridor.origin_currency, corridor.dest_currency, 0.005)

  const walletR  = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [userId])
  const balance  = walletR.rows.length ? parseInt(walletR.rows[0].balance) : 0

  const userR    = await query(`SELECT level, kyc_verified_at FROM users WHERE id = $1`, [userId])
  const user     = userR.rows[0]
  const kycRequired = sendAmount >= parseInt(corridor.kyc_threshold) && !user?.kyc_verified_at

  const ETAs = {
    wise: { min: 0, max: 2, unit: 'business_days', label: 'Até 2 dias úteis' },
    wave: { min: 0, max: 0, unit: 'minutes',        label: 'Instantâneo' },
    mock: { min: 0, max: 1, unit: 'business_days',  label: 'Até 1 dia útil' },
  }

  return {
    corridor: {
      id: corridor.id, code: corridor.code,
      origin_country: corridor.origin_country, dest_country: corridor.dest_country,
      origin_currency: corridor.origin_currency, dest_currency: corridor.dest_currency,
      direction: corridor.direction, delivery_methods: corridor.delivery_methods,
    },
    send_amount: sendAmount, send_currency: corridor.origin_currency,
    fee_amount: fee,
    fee_breakdown: { percentage: `${(feeRate * 100).toFixed(1)}%`, fixed: feeFixed / 100, total: fee / 100 },
    exchange_rate:   conversion.effective_rate,
    mid_market_rate: conversion.mid_rate,
    spread_pct:      conversion.spread_pct,
    receive_amount:  conversion.receive_amount,
    receive_currency: corridor.dest_currency,
    rate_valid_until: conversion.rate_valid_until,
    rate_source:      conversion.rate_source,
    has_sufficient_balance: balance >= sendAmount,
    current_balance: balance,
    kyc_required:    kycRequired,
    estimated_delivery: ETAs[corridor.preferred_provider] || ETAs.mock,
  }
}

const validateDeliveryDetails = (deliveryMethod, details) => {
  const errors = []
  if (deliveryMethod === 'bank_transfer') {
    if (!details.iban && !details.account_number) errors.push('IBAN ou número de conta obrigatório')
    if (details.iban && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(details.iban.replace(/\s/g, ''))) {
      errors.push('IBAN inválido')
    }
  }
  if (deliveryMethod === 'mobile_wallet') {
    if (!details.phone)    errors.push('Número de telefone obrigatório')
    if (!details.provider) errors.push('Provedor da carteira obrigatório (ex: wave, orange_money)')
  }
  if (deliveryMethod === 'cash_pickup' && !details.location_name) {
    errors.push('Local de levantamento obrigatório')
  }
  return errors
}

const initiate = async ({
  userId, corridorId, sendAmount, deliveryMethod,
  recipientName, recipientPhone, recipientEmail, recipientCountry,
  deliveryDetails, purpose, sourceOfFunds, ipAddress,
}) => {
  const corridor = await getCorridorById(corridorId)
  if (!corridor) throw new Error('Corredor não disponível')

  const availableMethods = corridor.delivery_methods || []
  if (!availableMethods.includes(deliveryMethod)) {
    throw new Error(`Método '${deliveryMethod}' não disponível neste corredor`)
  }

  const validationErrors = validateDeliveryDetails(deliveryMethod, deliveryDetails || {})
  if (validationErrors.length > 0) throw new Error(validationErrors.join('. '))

  if (sendAmount >= parseInt(corridor.kyc_threshold)) {
    const userResult = await query(`SELECT kyc_verified_at FROM users WHERE id = $1`, [userId])
    if (!userResult.rows[0]?.kyc_verified_at) {
      throw new Error('Verificação de identidade (KYC) necessária para este valor.')
    }
  }

  const finalQuote = await quote({ corridorId, sendAmount, userId })
  const reference  = generateRef()
  const txRef      = generateTxRef()
  let   orderId, transactionId

  // ── FASE 1: débito ────────────────────────────────────────
  await withTransaction(async (client) => {
    const walletR = await client.query(
      `SELECT balance, is_frozen, daily_limit, daily_spent FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [userId]
    )
    if (!walletR.rows.length) throw new Error('Carteira não encontrada')
    const wallet = walletR.rows[0]
    if (wallet.is_frozen)           throw new Error('A sua carteira está bloqueada')
    if (wallet.balance < sendAmount) throw new Error('Saldo insuficiente')
    if (parseInt(wallet.daily_spent) + sendAmount > parseInt(wallet.daily_limit)) {
      throw new Error('Limite diário de transferências atingido')
    }

    const txResult = await client.query(
      `INSERT INTO transactions
         (reference, type, status, sender_id, amount, fee, description,
          currency_from, currency_to, exchange_rate, ip_address)
       VALUES ($1,'remittance_out','processing',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [txRef, userId, sendAmount, finalQuote.fee_amount,
       `Remessa para ${recipientName} (${corridor.dest_country})`,
       corridor.origin_currency, corridor.dest_currency, finalQuote.exchange_rate, ipAddress]
    )
    transactionId = txResult.rows[0].id

    await client.query(
      `UPDATE wallets SET balance = balance - $1, daily_spent = daily_spent + $1 WHERE user_id = $2`,
      [sendAmount, userId]
    )

    const orderResult = await client.query(
      `INSERT INTO remittance_orders
         (reference, corridor_id, sender_id, transaction_id, direction, status,
          delivery_method, send_amount, send_currency, fee_amount, exchange_rate,
          rate_locked_at, rate_expires_at, receive_amount, receive_currency,
          recipient_name, recipient_phone, recipient_email, recipient_country,
          delivery_details, provider_name, purpose, source_of_funds, ip_address)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,NOW(),NOW()+INTERVAL '30 minutes',
               $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
      [reference, corridorId, userId, transactionId, corridor.direction, deliveryMethod,
       sendAmount, corridor.origin_currency, finalQuote.fee_amount, finalQuote.exchange_rate,
       finalQuote.receive_amount, corridor.dest_currency,
       recipientName, recipientPhone || null, recipientEmail || null, recipientCountry,
       JSON.stringify(deliveryDetails || {}), corridor.preferred_provider,
       purpose || null, sourceOfFunds || null, ipAddress]
    )
    orderId = orderResult.rows[0].id

    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_data)
       VALUES ($1,'REMITTANCE_INITIATED','remittance_order',$2,$3)`,
      [userId, orderId, JSON.stringify({ reference, sendAmount, corridor: corridor.code })]
    )
  })

  // ── FASE 2: enviar ao provedor ────────────────────────────
  let providerResult
  try {
    const provider = getRemittanceProvider(corridor.preferred_provider)
    providerResult = await provider.send({
      order: { reference, send_amount: sendAmount, send_currency: corridor.origin_currency,
               receive_amount: finalQuote.receive_amount, receive_currency: corridor.dest_currency,
               recipient_name: recipientName, recipient_phone: recipientPhone,
               delivery_method: deliveryMethod, delivery_details: deliveryDetails || {} },
      corridor,
    })
  } catch (err) {
    logger.error('Erro no provedor de remessa', { error: err.message })
    providerResult = { success: false, reason: 'Falha na comunicação com o provedor', canRetry: true }
  }

  // ── FASE 3: confirmar ou reembolsar ───────────────────────
  if (providerResult.success) {
    await query(
      `UPDATE remittance_orders SET status='processing', provider_ref=$1, provider_response=$2, updated_at=NOW() WHERE id=$3`,
      [providerResult.providerRef, JSON.stringify(providerResult), orderId]
    )
    logger.info('Remessa enviada', { reference, providerRef: providerResult.providerRef })

    return {
      success: true, reference, orderId,
      send_amount: sendAmount, send_currency: corridor.origin_currency,
      fee_amount: finalQuote.fee_amount, exchange_rate: finalQuote.exchange_rate,
      receive_amount: finalQuote.receive_amount, receive_currency: corridor.dest_currency,
      recipient_name: recipientName, dest_country: corridor.dest_country,
      delivery_method: deliveryMethod, provider_ref: providerResult.providerRef,
      message: providerResult.message, estimated_delivery: providerResult.estimatedArrival,
      tracking_details: providerResult.details || {}, status: 'processing',
    }
  }

  // Reembolso automático
  logger.warn('Provedor rejeitou remessa — reembolsando', { reference, reason: providerResult.reason })
  const refundRef = `REF-${generateRef().slice(4)}`
  let   refundTxId = null

  try {
    await withTransaction(async (client) => {
      const rr = await client.query(
        `INSERT INTO transactions (reference, type, status, receiver_id, amount, fee, description, reversed_by)
         VALUES ($1,'reversal','completed',$2,$3,0,$4,$5) RETURNING id`,
        [refundRef, userId, sendAmount, `Reembolso: ${reference}`, transactionId]
      )
      refundTxId = rr.rows[0].id
      await client.query(`UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`, [sendAmount, userId])
      await client.query(
        `UPDATE remittance_orders SET status='failed', failed_reason=$1, failed_at=NOW(),
         refund_transaction_id=$2, refunded_at=NOW(), provider_response=$3 WHERE id=$4`,
        [providerResult.reason, refundTxId, JSON.stringify(providerResult), orderId]
      )
      await client.query(
        `UPDATE transactions SET status='reversed', failed_reason=$1 WHERE id=$2`,
        [providerResult.reason, transactionId]
      )
    })
    logger.info('Reembolso de remessa processado', { reference, refundRef })
  } catch (refundErr) {
    logger.error('CRÍTICO: falha no reembolso de remessa', { orderId, userId, sendAmount, error: refundErr.message })
  }

  return {
    success: false, reference, orderId,
    error:     providerResult.reason || 'Falha no envio da remessa',
    refunded:  refundTxId !== null,
    can_retry: providerResult.canRetry || false,
  }
}

const getHistory = async (userId, { page = 1, limit = 20, direction = null } = {}) => {
  const offset = (page - 1) * limit
  let   where  = `WHERE r.sender_id = $1`
  const params = [userId]

  if (direction) { params.push(direction); where += ` AND r.direction = $${params.length}` }

  const result = await query(
    `SELECT r.id, r.reference, r.direction, r.status,
            r.send_amount, r.send_currency, r.fee_amount, r.exchange_rate,
            r.receive_amount, r.receive_currency, r.recipient_name, r.recipient_country,
            r.delivery_method, r.provider_ref, r.purpose,
            r.created_at, r.completed_at, r.failed_reason,
            c.code AS corridor_code, c.origin_country, c.dest_country
     FROM remittance_orders r JOIN remittance_corridors c ON c.id = r.corridor_id
     ${where} ORDER BY r.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )
  const countR = await query(`SELECT COUNT(*) FROM remittance_orders r ${where}`, params)

  return { orders: result.rows, total: parseInt(countR.rows[0].count), page, limit }
}

const getOrderById = async (orderId, userId) => {
  const r = await query(
    `SELECT r.*, c.code AS corridor_code, c.preferred_provider
     FROM remittance_orders r JOIN remittance_corridors c ON c.id = r.corridor_id
     WHERE r.id = $1 AND r.sender_id = $2`,
    [orderId, userId]
  )
  return r.rows[0] || null
}

const handleProviderWebhook = async ({ providerRef, providerStatus, providerName, rawPayload }) => {
  const r = await query(
    `SELECT r.*, c.preferred_provider FROM remittance_orders r
     JOIN remittance_corridors c ON c.id = r.corridor_id
     WHERE r.provider_ref = $1`,
    [providerRef]
  )
  if (!r.rows.length) {
    logger.warn('Webhook para remessa desconhecida', { providerRef })
    return { handled: false }
  }

  const order     = r.rows[0]
  const statusMap = { completed: 'completed', failed: 'failed', cancelled: 'cancelled', processing: 'processing' }
  const newStatus = statusMap[providerStatus] || 'processing'

  if (newStatus === order.status) return { handled: true, changed: false }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE remittance_orders
       SET status = $1,
           completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE NULL END,
           failed_at    = CASE WHEN $1 = 'failed'    THEN NOW() ELSE NULL END,
           provider_response = provider_response || $2,
           updated_at = NOW()
       WHERE id = $3`,
      [newStatus, JSON.stringify({ webhook: rawPayload }), order.id]
    )
    if (newStatus === 'completed') {
      await client.query(
        `UPDATE transactions SET status='completed', completed_at=NOW() WHERE id=$1`,
        [order.transaction_id]
      )
    }
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_data)
       VALUES ($1,'REMITTANCE_STATUS_UPDATE','remittance_order',$2,$3)`,
      [order.sender_id, order.id, JSON.stringify({ from: order.status, to: newStatus, providerRef })]
    )
  })

  logger.info('Status de remessa atualizado via webhook', { reference: order.reference, from: order.status, to: newStatus })

  return { handled: true, changed: true, newStatus, reference: order.reference }
}

module.exports = { listCorridors, quote, initiate, getHistory, getOrderById, handleProviderWebhook }
