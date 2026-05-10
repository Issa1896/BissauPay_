// src/services/transactionService.js
// Motor de transações ACID — transferências P2P e extrato

const { withTransaction, query } = require('../config/database')
const logger = require('../config/logger')

const generateReference = () => {
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `TXN-${date}-${random}`
}

const calculateFee = (amount, type, senderLevel = 'basic') => {
  const rates = {
    transfer:       parseFloat(process.env.FEE_P2P)          || 0.005,
    payment:        parseFloat(process.env.FEE_PAYMENT)       || 0.010,
    remittance_out: parseFloat(process.env.FEE_REMITTANCE)    || 0.020,
  }
  const discount = senderLevel === 'verified' ? 0.5
                 : senderLevel === 'merchant' ? 0.3
                 : 1.0
  const rate = (rates[type] || 0) * discount
  return Math.floor(amount * rate)
}

const getWalletForUpdate = async (client, userId) => {
  const result = await client.query(
    `SELECT w.*, u.level, u.status AS user_status, u.full_name
     FROM wallets w
     JOIN users u ON u.id = w.user_id
     WHERE w.user_id = $1
     FOR UPDATE`,
    [userId]
  )
  if (result.rows.length === 0) throw new Error('Carteira não encontrada')

  const wallet = result.rows[0]
  if (wallet.is_frozen)               throw new Error(`Carteira bloqueada: ${wallet.frozen_reason || 'contacte o suporte'}`)
  if (wallet.user_status !== 'active') throw new Error('Conta inativa ou suspensa')

  return wallet
}

const transfer = async ({ senderId, receiverPhone, amount, description, ipAddress, deviceId }) => {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Valor inválido')

  const limitSingle = parseInt(process.env.LIMIT_SINGLE_TX) || 10_000_000
  if (amount > limitSingle) {
    throw new Error(`Valor excede o limite por transação (${(limitSingle / 100).toLocaleString()} XOF)`)
  }

  return withTransaction(async (client) => {
    const senderWallet = await getWalletForUpdate(client, senderId)

    const receiverResult = await client.query(
      `SELECT u.id, u.full_name, u.status, w.id AS wallet_id
       FROM users u JOIN wallets w ON w.user_id = u.id
       WHERE u.phone = $1`,
      [receiverPhone]
    )
    if (receiverResult.rows.length === 0) throw new Error('Destinatário não encontrado')

    const receiver = receiverResult.rows[0]
    if (receiver.status !== 'active') throw new Error('Conta do destinatário está inativa')
    if (receiver.id === senderId)     throw new Error('Não é possível transferir para si mesmo')

    const fee        = calculateFee(amount, 'transfer', senderWallet.level)
    const totalDebit = amount + fee
    const creditAmount = amount

    if (senderWallet.balance < totalDebit) throw new Error('Saldo insuficiente')

    // Verificar limite diário (reset se necessário)
    const todayStr  = new Date().toISOString().slice(0, 10)
    const dailySpent = senderWallet.daily_reset_at?.toISOString?.()?.slice(0, 10) < todayStr
      ? 0
      : senderWallet.daily_spent

    if (dailySpent + totalDebit > senderWallet.daily_limit) {
      throw new Error('Limite diário de transferência atingido')
    }

    const reference = generateReference()
    const txResult  = await client.query(
      `INSERT INTO transactions
         (reference, type, status, sender_id, receiver_id, amount, fee, description, ip_address, device_id)
       VALUES ($1,'transfer','processing',$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [reference, senderId, receiver.id, amount, fee, description || null, ipAddress, deviceId]
    )
    const transactionId = txResult.rows[0].id

    await client.query(
      `UPDATE wallets SET balance = balance - $1, daily_spent = daily_spent + $1 WHERE user_id = $2`,
      [totalDebit, senderId]
    )
    await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`,
      [creditAmount, receiver.id]
    )
    await client.query(
      `UPDATE transactions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [transactionId]
    )
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_data)
       VALUES ($1,'TRANSFER_COMPLETED','transaction',$2,$3)`,
      [senderId, transactionId, JSON.stringify({ amount, fee, receiver: receiver.full_name, reference })]
    )

    logger.info('Transferência concluída', { reference, senderId, receiverId: receiver.id, amount, fee })

    return {
      success: true, reference, transactionId,
      amount, fee, totalDebit,
      receiver: { name: receiver.full_name, phone: receiverPhone },
    }
  })
}

const deposit = async ({ userId, amount, description, operatorId }) => {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Valor inválido')

  return withTransaction(async (client) => {
    await getWalletForUpdate(client, userId)

    const reference = generateReference()
    const txResult  = await client.query(
      `INSERT INTO transactions (reference, type, status, receiver_id, amount, fee, description)
       VALUES ($1,'deposit','processing',$2,$3,0,$4) RETURNING id`,
      [reference, userId, amount, description || 'Depósito']
    )
    await client.query(
      `UPDATE wallets SET balance = balance + $1 WHERE user_id = $2`,
      [amount, userId]
    )
    await client.query(
      `UPDATE transactions SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [txResult.rows[0].id]
    )
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_data)
       VALUES ($1,'DEPOSIT_COMPLETED','transaction',$2,$3)`,
      [operatorId || userId, txResult.rows[0].id, JSON.stringify({ amount, reference })]
    )

    return { success: true, reference, amount }
  })
}

const getStatement = async (userId, { page = 1, limit = 20, type = null } = {}) => {
  const offset = (page - 1) * limit
  let where    = `WHERE (t.sender_id = $1 OR t.receiver_id = $1) AND t.status = 'completed'`
  const params = [userId]

  if (type) {
    params.push(type)
    where += ` AND t.type = $${params.length}`
  }

  const result = await query(
    `SELECT
       t.id, t.reference, t.type, t.status,
       CASE WHEN t.receiver_id = $1 THEN 'credit' ELSE 'debit' END AS direction,
       CASE WHEN t.receiver_id = $1 THEN t.net_amount ELSE -(t.amount) END AS amount_signed,
       t.amount, t.fee, t.net_amount, t.description,
       t.created_at, t.completed_at,
       su.full_name AS sender_name,   su.phone AS sender_phone,
       ru.full_name AS receiver_name, ru.phone AS receiver_phone
     FROM transactions t
     LEFT JOIN users su ON su.id = t.sender_id
     LEFT JOIN users ru ON ru.id = t.receiver_id
     ${where}
     ORDER BY t.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  )

  const countResult = await query(
    `SELECT COUNT(*) FROM transactions t ${where}`,
    params
  )

  return {
    transactions: result.rows,
    total: parseInt(countResult.rows[0].count),
    page, limit,
    pages: Math.ceil(parseInt(countResult.rows[0].count) / limit),
  }
}

module.exports = { transfer, deposit, getStatement, calculateFee, generateReference }
