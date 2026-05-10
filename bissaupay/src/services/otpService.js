// src/services/otpService.js
// Geração, envio e validação de OTPs via SMS

const { query } = require('../config/database')
const logger    = require('../config/logger')

const generateCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString()

const sendSMS = async (phone, message) => {
  const provider = process.env.SMS_PROVIDER || 'mock'

  if (provider === 'mock' || process.env.NODE_ENV !== 'production') {
    logger.info(`[SMS MOCK] Para: ${phone} | Msg: ${message}`)
    return { success: true, mock: true }
  }

  if (provider === 'africastalking') {
    const AT = require('africastalking')({
      apiKey:   process.env.AT_API_KEY,
      username: process.env.AT_USERNAME,
    })
    const result = await AT.SMS.send({
      to:      [phone],
      message,
      from:    process.env.AT_SENDER_ID || 'BissauPay',
    })
    return { success: true, result }
  }

  if (provider === 'twilio') {
    const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN)
    const result = await twilio.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE,
      to:   phone,
    })
    return { success: true, result }
  }

  throw new Error(`Provedor SMS desconhecido: ${provider}`)
}

const createOTP = async (phone, purpose) => {
  // Invalidar OTPs anteriores do mesmo telefone/propósito
  await query(
    `UPDATE otp_codes SET used = TRUE
     WHERE phone = $1 AND purpose = $2 AND used = FALSE`,
    [phone, purpose]
  )

  const code      = generateCode()
  const expiresAt = new Date(
    Date.now() + (parseInt(process.env.OTP_EXPIRES_MINUTES) || 10) * 60_000
  )

  await query(
    `INSERT INTO otp_codes (phone, code, purpose, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [phone, code, purpose, expiresAt]
  )

  const messages = {
    register:   `BissauPay: O seu código de registo é ${code}. Válido por 10 minutos. Não partilhe.`,
    login:      `BissauPay: O seu código de acesso é ${code}. Válido por 10 minutos.`,
    reset_pin:  `BissauPay: Código para redefinir PIN: ${code}. Válido por 10 minutos.`,
    confirm_tx: `BissauPay: Confirme a transação com o código ${code}. Válido por 10 minutos.`,
  }

  const message = messages[purpose] || `BissauPay: O seu código é ${code}.`

  try {
    await sendSMS(phone, message)
    logger.info('OTP enviado', { phone, purpose })
  } catch (err) {
    logger.error('Falha ao enviar SMS', { phone, purpose, error: err.message })
    // Não bloqueia — OTP foi salvo, utilizador pode tentar reenviar
  }

  return { sent: true }
}

const verifyOTP = async (phone, code, purpose) => {
  const maxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS) || 3

  const result = await query(
    `SELECT id, code, attempts, expires_at, used
     FROM otp_codes
     WHERE phone = $1 AND purpose = $2 AND used = FALSE
     ORDER BY created_at DESC
     LIMIT 1`,
    [phone, purpose]
  )

  if (result.rows.length === 0) {
    return { valid: false, reason: 'OTP não encontrado ou já utilizado' }
  }

  const otp = result.rows[0]

  if (new Date() > new Date(otp.expires_at)) {
    await query(`UPDATE otp_codes SET used = TRUE WHERE id = $1`, [otp.id])
    return { valid: false, reason: 'OTP expirado. Solicite um novo código.' }
  }

  if (otp.attempts >= maxAttempts) {
    await query(`UPDATE otp_codes SET used = TRUE WHERE id = $1`, [otp.id])
    return { valid: false, reason: 'Número máximo de tentativas atingido. Solicite um novo código.' }
  }

  if (otp.code !== code) {
    await query(
      `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`,
      [otp.id]
    )
    const remaining = maxAttempts - (otp.attempts + 1)
    return {
      valid:  false,
      reason: `Código inválido. ${remaining} tentativa(s) restante(s).`,
    }
  }

  // Código correto — marcar como usado
  await query(`UPDATE otp_codes SET used = TRUE WHERE id = $1`, [otp.id])

  return { valid: true }
}

module.exports = { createOTP, verifyOTP }
