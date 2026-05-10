// src/services/kycService.js
// Serviço de verificação de identidade (KYC)
// Fluxo: upload de documento + selfie → revisão manual (ou automática futura)

const { query, withTransaction } = require('../config/database')
const logger = require('../config/logger')

/**
 * Submete documentos para KYC
 */
const submitKYC = async (userId, { documentType, documentNumber, documentPhotoUrl, selfieUrl }) => {
  // Verificar se já tem KYC aprovado
  const userResult = await query(
    `SELECT kyc_status, level FROM users WHERE id = $1`,
    [userId]
  )

  if (userResult.rows.length === 0) throw new Error('Utilizador não encontrado')

  const user = userResult.rows[0]
  if (user.kyc_status === 'approved') {
    throw new Error('Identidade já verificada')
  }

  // Validar tipo de documento
  const validTypes = ['bi', 'passport', 'residence', 'driving_license']
  if (!validTypes.includes(documentType)) {
    throw new Error(`Tipo de documento inválido. Use: ${validTypes.join(', ')}`)
  }

  await query(
    `UPDATE users
     SET document_type   = $1,
         document_number = $2,
         document_photo  = $3,
         selfie_photo    = $4,
         kyc_status      = 'pending',
         updated_at      = NOW()
     WHERE id = $5`,
    [documentType, documentNumber, documentPhotoUrl, selfieUrl, userId]
  )

  await query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_data)
     VALUES ($1, 'KYC_SUBMITTED', 'user', $1, $2)`,
    [userId, JSON.stringify({ documentType, documentNumber })]
  )

  logger.info('KYC submetido para revisão', { userId, documentType })

  return {
    success: true,
    status:  'pending',
    message: 'Documentos enviados. A verificação será concluída em até 24 horas.',
  }
}

/**
 * Aprovação de KYC pelo admin
 */
const approveKYC = async (userId, adminId) => {
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE users
       SET kyc_status     = 'approved',
           kyc_verified_at = NOW(),
           level          = CASE WHEN level = 'basic' THEN 'verified' ELSE level END,
           updated_at     = NOW()
       WHERE id = $1 AND kyc_status = 'pending'
       RETURNING full_name, phone, kyc_status`,
      [userId]
    )

    if (result.rows.length === 0) {
      throw new Error('Utilizador não encontrado ou KYC não está pendente')
    }

    // Atualizar limite diário para conta verificada
    await client.query(
      `UPDATE wallets
       SET daily_limit = $1
       WHERE user_id = $2`,
      [parseInt(process.env.LIMIT_DAILY_VERIFIED) || 200_000_000, userId]
    )

    await client.query(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_data)
       VALUES ($1, 'KYC_APPROVED', 'user', $2, $3)`,
      [adminId, userId, JSON.stringify({ approvedBy: adminId })]
    )

    logger.info('KYC aprovado', { userId, adminId })

    return {
      success: true,
      user:    result.rows[0],
      message: 'KYC aprovado. Limites de conta atualizados.',
    }
  })
}

/**
 * Rejeição de KYC pelo admin
 */
const rejectKYC = async (userId, adminId, reason) => {
  await query(
    `UPDATE users
     SET kyc_status         = 'rejected',
         kyc_rejected_reason = $1,
         updated_at          = NOW()
     WHERE id = $2`,
    [reason, userId]
  )

  await query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_data)
     VALUES ($1, 'KYC_REJECTED', 'user', $2, $3)`,
    [adminId, userId, JSON.stringify({ rejectedBy: adminId, reason })]
  )

  logger.info('KYC rejeitado', { userId, adminId, reason })

  return { success: true, message: 'KYC rejeitado.' }
}

/**
 * Lista pedidos de KYC pendentes (para admin)
 */
const listPendingKYC = async ({ page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit
  const result = await query(
    `SELECT id, phone, full_name, document_type, document_number,
            document_photo, selfie_photo, kyc_status, created_at
     FROM users
     WHERE kyc_status = 'pending'
     ORDER BY created_at ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  )
  const countResult = await query(
    `SELECT COUNT(*) FROM users WHERE kyc_status = 'pending'`
  )

  return {
    users: result.rows,
    total: parseInt(countResult.rows[0].count),
    page, limit,
  }
}

/**
 * Status do KYC de um utilizador
 */
const getKYCStatus = async (userId) => {
  const result = await query(
    `SELECT kyc_status, kyc_verified_at, kyc_rejected_reason,
            document_type, level
     FROM users WHERE id = $1`,
    [userId]
  )
  if (result.rows.length === 0) throw new Error('Utilizador não encontrado')
  return result.rows[0]
}

module.exports = { submitKYC, approveKYC, rejectKYC, listPendingKYC, getKYCStatus }
