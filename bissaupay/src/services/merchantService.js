// src/services/merchantService.js

const { query, withTransaction } = require('../config/database')
const { generateStaticQR }       = require('./qrService')
const logger = require('../config/logger')

const registerMerchant = async (userId, { businessName, businessType }) => {
  const existing = await query(`SELECT id FROM merchants WHERE user_id = $1`, [userId])
  if (existing.rows.length > 0) throw new Error('Utilizador já está registado como comerciante')

  return withTransaction(async (client) => {
    const { shortCode, payload, qrImage } = await generateStaticQR(userId)

    const result = await client.query(
      `INSERT INTO merchants (user_id, business_name, business_type, qr_code_static, fee_rate)
       VALUES ($1, $2, $3, $4, 0.0100) RETURNING id`,
      [userId, businessName.trim(), businessType || null, shortCode]
    )
    const merchantId = result.rows[0].id

    await client.query(
      `INSERT INTO payment_requests
         (merchant_id, short_code, qr_type, qr_payload, qr_image, expires_at)
       VALUES ($1, $2, 'static', $3, $4, NULL)`,
      [merchantId, shortCode, payload, qrImage]
    )
    await client.query(
      `UPDATE users SET level = 'merchant' WHERE id = $1`,
      [userId]
    )
    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_data)
       VALUES ($1,'MERCHANT_REGISTERED','merchant',$2,$3)`,
      [userId, merchantId, JSON.stringify({ businessName, businessType })]
    )

    logger.info('Comerciante registado', { userId, merchantId, businessName })

    return { merchantId, businessName, staticQR: { shortCode, qrImage } }
  })
}

const getMerchantByUser = async (userId) => {
  const result = await query(
    `SELECT
       m.id, m.business_name, m.business_type, m.fee_rate,
       m.total_received, m.is_active, m.qr_code_static, m.created_at,
       pr.qr_image AS static_qr_image, pr.short_code AS static_short_code
     FROM merchants m
     LEFT JOIN payment_requests pr ON pr.merchant_id = m.id AND pr.qr_type = 'static'
     WHERE m.user_id = $1`,
    [userId]
  )
  return result.rows[0] || null
}

const getMerchantDashboard = async (merchantId) => {
  const [summaryResult, recentResult, dailyResult] = await Promise.all([
    query(`SELECT * FROM v_merchant_sales WHERE merchant_id = $1`, [merchantId]),
    query(
      `SELECT * FROM v_merchant_recent_transactions
       WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [merchantId]
    ),
    query(
      `SELECT DATE(t.created_at) AS day,
              COUNT(t.id) AS tx_count,
              SUM(t.amount) AS gross,
              SUM(t.net_amount) AS net
       FROM transactions t
       JOIN merchants m ON m.user_id = t.receiver_id
       WHERE m.id = $1 AND t.type = 'payment' AND t.status = 'completed'
         AND t.created_at >= NOW() - INTERVAL '7 days'
       GROUP BY DATE(t.created_at) ORDER BY day DESC`,
      [merchantId]
    ),
  ])

  const s = summaryResult.rows[0] || {}

  return {
    summary: {
      total_transactions: parseInt(s.total_transactions || 0),
      total_gross:        parseInt(s.total_gross        || 0),
      total_fees:         parseInt(s.total_fees         || 0),
      total_net:          parseInt(s.total_net          || 0),
      today_gross:        parseInt(s.today_gross        || 0),
      month_gross:        parseInt(s.month_gross        || 0),
      fee_rate:           parseFloat(s.fee_rate         || 0.01),
    },
    recent_transactions: recentResult.rows,
    daily_chart:         dailyResult.rows,
  }
}

const getMerchantByShortCode = async (shortCode) => {
  const result = await query(
    `SELECT
       m.id, m.user_id, m.business_name, m.business_type,
       m.fee_rate, m.is_active,
       u.full_name, u.phone, u.status AS user_status
     FROM merchants m
     JOIN users u ON u.id = m.user_id
     JOIN payment_requests pr ON pr.merchant_id = m.id AND pr.short_code = $1
     LIMIT 1`,
    [shortCode]
  )
  return result.rows[0] || null
}

module.exports = { registerMerchant, getMerchantByUser, getMerchantDashboard, getMerchantByShortCode }
