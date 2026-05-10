// src/services/qrService.js
// Geração de QR Codes para pagamentos BissauPay

const QRCode = require('qrcode')
const logger  = require('../config/logger')

const generateShortCode = () => {
  const chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const random = Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')
  return `BP-${random}`
}

const buildPayload = ({ type, merchantId, shortCode, amount = null, expiresAt = null }) => {
  const payload = {
    app: 'bissaupay',
    v:   1,
    t:   type === 'static' ? 's' : 'd',
    m:   merchantId,
    c:   shortCode,
  }
  if (amount   !== null) payload.a = amount
  if (expiresAt !== null) payload.e = Math.floor(expiresAt.getTime() / 1000)
  return JSON.stringify(payload)
}

const generateQRImage = async (payload, options = {}) => {
  try {
    return await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      type:    'image/png',
      margin:  2,
      width:   options.width || 300,
      color: {
        dark:  options.darkColor  || '#1a1a2e',
        light: options.lightColor || '#ffffff',
      },
    })
  } catch (err) {
    logger.error('Erro ao gerar QR Code', { error: err.message })
    throw new Error('Falha ao gerar QR Code')
  }
}

const generateStaticQR = async (merchantId) => {
  const shortCode = generateShortCode()
  const payload   = buildPayload({ type: 'static', merchantId, shortCode })
  const qrImage   = await generateQRImage(payload)
  return { shortCode, payload, qrImage }
}

const generateDynamicQR = async (merchantId, { amount, description = null, expiresInMinutes = 30 }) => {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Valor inválido para QR dinâmico')
  }
  const shortCode = generateShortCode()
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60_000)
  const payload   = buildPayload({ type: 'dynamic', merchantId, shortCode, amount, expiresAt })
  const qrImage   = await generateQRImage(payload)
  return { shortCode, payload, qrImage, expiresAt }
}

const decodeQRPayload = (raw) => {
  try {
    const data = JSON.parse(raw)
    if (data.app !== 'bissaupay') throw new Error('QR Code não pertence ao BissauPay')
    if (!data.m || !data.c)       throw new Error('QR Code inválido ou corrompido')

    const type = data.t === 's' ? 'static' : 'dynamic'

    if (type === 'dynamic' && data.e) {
      if (new Date() > new Date(data.e * 1000)) {
        throw new Error('QR Code expirado')
      }
    }

    return {
      valid:      true,
      type,
      merchantId: data.m,
      shortCode:  data.c,
      amount:     data.a || null,
      expiresAt:  data.e ? new Date(data.e * 1000) : null,
    }
  } catch (err) {
    if (err.message.includes('JSON')) {
      return { valid: false, reason: 'QR Code não é um pagamento BissauPay' }
    }
    return { valid: false, reason: err.message }
  }
}

module.exports = { generateStaticQR, generateDynamicQR, decodeQRPayload, generateShortCode }
