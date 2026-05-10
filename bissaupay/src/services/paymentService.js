// src/services/paymentService.js
// Motor de pagamento a comerciantes via QR Code

const { withTransaction, query } = require('../config/database')
const { decodeQRPayload }        = require('./qrService')
const logger = require('../config/logger')

const generateRef = () => {
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `PAY-${date}-${random}`
}

const previewPayment = async ({ customerId, qrPayload, customerAmount = null }) => {
  const decoded = decodeQRPayload(qrPayload)
  if (!decoded.valid) throw new Error(decoded.reason || 'QR Code inválido')

  const prResult = await query(
    `SELECT pr.*, m.id AS merchant_id, m.business_name, m.fee_rate, m.is_active,
            u.id AS merchant_user_id, u.full_name AS merchant_name, u.status AS merchant_status
     FROM payment_requests pr
     JOIN merchants m ON m.id = pr.merchant_id
     JOIN users u ON u.id = m.user_id
     WHERE pr.short_code = $1`,
    [decoded.shortCode]
  )
  if (prResult.rows.length === 0) throw new Error('QR Code não reconhecido')

  const pr = prResult.rows[0]
  if (!pr.is_active)                  throw new Error('Este comerciante não está ativo')
  if (pr.merchant_status !== 'active') throw new Error('Conta do comerciante suspensa')

  if (pr.qr_type === 'dynamic') {
    if (pr.status === 'paid')      throw new Error('Este QR já foi pago')
    if (pr.status === 'cancelled') throw new Error('Este QR foi cancelado pelo comerciante')
    if (pr.status === 'expired' || (pr.expires_at && new Date() > new Date(pr.expires_at))) {
      throw new Error('QR Code expirado')
    }
  }

  let amount
  if (pr.qr_type === 'dynamic') {
    amount = parseInt(pr.amount)
  } else {
    if (!customerAmount || !Number.isInteger(customerAmount) || customerAmount <= 0) {
      throw new Error('Informe o valor a pagar')
    }
    amount = customerAmount
  }
  if (amount < 100) throw new Error('Valor mínimo: 1 XOF')

  const fee = Math.floor(amount * parseFloat(pr.fee_rate))

  const walletResult = await query(
    `SELECT balance, daily_limit, daily_spent FROM wallets WHERE user_id = $1`,
    [customerId]
  )
  if (walletResult.rows.length === 0) throw new Error('Carteira não encontrada')

  const wallet = walletResult.rows[0]

  return {
    payment_request_id:     pr.id,
    short_code:             pr.short_code,
    qr_type:                pr.qr_type,
    merchant: {
      id:            pr.merchant_id,
      user_id:       pr.merchant_user_id,
      name:          pr.merchant_name,
      business_name: pr.business_name,
    },
    amount,
    fee,
    net_to_merchant:        amount - fee,
    description:            pr.description || `Pagamento a ${pr.business_name}`,
    customer_balance:       wallet.balance,
    has_sufficient_balance: wallet.balance >= amount,
    expires_at:             pr.expires_at,
  }
}

const confirmPayment = async ({ customerId, paymentRequestId, amount, ipAddress, deviceId }) => {
  return withTransaction(async (client) => {
    const prResult = await client.query(
      `SELECT pr.*, m.user_id AS merchant_user_id, m.fee_rate, m.business_name
       FROM payment_requests pr
       JOIN merchants m ON m.id = pr.merchant_id
       WHERE pr.id = $1 FOR UPDATE`,
      [paymentRequestId]
    )
    if (prResult.rows.length === 0) throw new Error('Requisição de pagamento não encontrada')

    const pr = prResult.rows[0]

    if (pr.qr_type === 'dynamic') {
      if (pr.status === 'paid')      throw new Error('Este QR já foi pago')
      if (pr.status === 'cancelled') throw new Error('QR cancelado pelo comerciante')
      if (pr.expires_at && new Date() > new Date(pr.expires_at)) {
        await client.query(`UPDATE payment_requests SET status = 'expired' WHERE id = $1`, [pr.id])
        throw new Error('QR Code expirado')
      }
    }

    const merchantUserId = pr.merchant_user_id
    const fee            = Math.floor(amount * parseFloat(pr.fee_rate))

    const cw = (await client.query(
      `SELECT w.balance, w.daily_limit, w.daily_spent, w.is_frozen, u.status
       FROM wallets w JOIN users u ON u.id = w.user_id
       WHERE w.user_id = $1 FOR UPDATE`,
      [customerId]
    )).rows[0]

    if (!cw)                   throw new Error('Carteira não encontrada')
    if (cw.is_frozen)          throw new Error('A sua carteira está bloqueada')
    if (cw.status !== 'active') throw new Error('Conta inativa')
    if (cw.balance < amount)   throw new Error('Saldo insuficiente')

    const limitSingle = parseInt(process.env.LIMIT_SINGLE_TX) || 10_000_000
    if (amount > limitSingle)  throw new Error('Valor excede o limite por transação')

    // Travar carteira do comerciante
    await client.query(`SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [merchantUserId])

    const reference = generateRef()
    const txResult  = await client.query(
      `INSERT INTO transactions
         (reference, type, status, sender_id, receiver_id, amount, fee, description, ip_address, device_id)
       VALUES ($1,'payment','processing',$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [reference, customerId, merchantUserId, amount, fee,
       pr.description || `Pagamento a ${pr.business_name}`, ipAddress, deviceId]
    )
    const transactionId = txResult.rows[0].id
    const netAmount     = amount - fee

    await client.query(
      `UPDATE wallets SET balance = balance - $1, daily_spent = daily_spent + $1 WHERE user_id = $2`,
      [amount, customerId]
    )
    await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`,
      [netAmount, merchantUserId]
    )
    await client.query(
      `UPDATE merchants SET total_received = total_received + $1 WHERE user_id = $2`,
      [netAmount, merchantUserId]
    )
    await client.query(
      `UPDATE transactions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [transactionId]
    )
    await client.query(
      `UPDATE payment_requests SET status = 'paid', transaction_id = $1, paid_at = NOW() WHERE id = $2`,
      [transactionId, paymentRequestId]
    )
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_data)
       VALUES ($1,'PAYMENT_COMPLETED','transaction',$2,$3)`,
      [customerId, transactionId, JSON.stringify({ amount, fee, netAmount, reference, merchant: pr.business_name })]
    )

    logger.info('Pagamento concluído', { reference, customerId, merchantUserId, amount, fee })

    return {
      success: true, reference, transactionId,
      amount, fee, net_to_merchant: netAmount,
      merchant_name: pr.business_name,
      paid_at: new Date().toISOString(),
    }
  })
}

const cancelPaymentRequest = async (paymentRequestId, merchantUserId) => {
  const result = await query(
    `UPDATE payment_requests pr
     SET status = 'cancelled'
     FROM merchants m
     WHERE pr.id = $1 AND pr.merchant_id = m.id AND m.user_id = $2
       AND pr.status = 'pending' AND pr.qr_type = 'dynamic'
     RETURNING pr.id`,
    [paymentRequestId, merchantUserId]
  )
  if (result.rows.length === 0) {
    throw new Error('QR não encontrado, já foi pago, ou sem permissão para cancelar')
  }
  return { cancelled: true }
}

module.exports = { previewPayment, confirmPayment, cancelPaymentRequest }
