// src/services/otpService.js
// Geração, envio e validação de OTPs via SMS e Email

const { query } = require('../config/database')
const logger    = require('../config/logger')

const generateCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString()

const sendSMS = async (phone, message) => {
  const provider = process.env.SMS_PROVIDER || 'mock'

  if (provider === 'mock') {
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

const sendEmail = async (to, subject, html) => {
  const host = process.env.SMTP_HOST
  if (!host) {
    logger.info(`[EMAIL MOCK] Para: ${to} | Assunto: ${subject}`)
    return { success: true, mock: true }
  }

  try {
    const nodemailer = require('nodemailer')
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
    await transporter.sendMail({
      from: `"BissauPay" <${process.env.SMTP_FROM || 'noreply@bissaupay.gw'}>`,
      to,
      subject,
      html,
    })
    logger.info('Email enviado', { to, subject })
    return { success: true }
  } catch (err) {
    logger.error('Falha ao enviar email', { to, error: err.message })
    throw err
  }
}

const smsMessages = {
  register:   (code) => `BissauPay: O seu código de registo é ${code}. Válido por 10 minutos. Não partilhe.`,
  login:      (code) => `BissauPay: O seu código de acesso é ${code}. Válido por 10 minutos.`,
  reset_pin:  (code) => `BissauPay: Código para redefinir PIN: ${code}. Válido por 10 minutos.`,
  confirm_tx: (code) => `BissauPay: Confirme a transação com o código ${code}. Válido por 10 minutos.`,
}

const emailSubjects = {
  register:   'Código de verificação — BissauPay',
  login:      'Código de acesso — BissauPay',
  reset_pin:  'Redefinição de PIN — BissauPay',
  confirm_tx: 'Confirmar transação — BissauPay',
}

const emailHtml = (code, purpose) => `
<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
  <div style="background: #0D1B14; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: #D4AF37; margin: 0; font-size: 24px;">BissauPay</h1>
  </div>
  <div style="background: #fff; padding: 32px 24px; border: 1px solid #e0e0e0;">
    <p style="color: #333; font-size: 16px; margin: 0 0 16px;">
      O seu código de verificação:
    </p>
    <div style="background: #f5f5f5; padding: 16px; text-align: center; border-radius: 8px; font-size: 36px; letter-spacing: 8px; font-weight: bold; color: #0D1B14;">
      ${code}
    </div>
    <p style="color: #666; font-size: 13px; margin-top: 16px;">
      Código válido por 10 minutos. Nunca partilhe este código com ninguém.
    </p>
  </div>
  <div style="background: #f0f0f0; padding: 16px; text-align: center; border-radius: 0 0 12px 12px; font-size: 12px; color: #999;">
    Guiné-Bissau — Dinheiro sem fronteiras
  </div>
</div>`

const createOTP = async (phone, purpose, email) => {
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

  const smsMsg = (smsMessages[purpose] || smsMessages.login)(code)

  try {
    await sendSMS(phone, smsMsg)
    logger.info('SMS OTP enviado', { phone, purpose })
  } catch (err) {
    logger.error('Falha ao enviar SMS', { phone, purpose, error: err.message })
  }

  if (email) {
    try {
      await sendEmail(email, emailSubjects[purpose] || 'Código BissauPay', emailHtml(code, purpose))
      logger.info('Email OTP enviado', { email, purpose })
    } catch (err) {
      logger.error('Falha ao enviar email OTP', { email, purpose, error: err.message })
    }
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
