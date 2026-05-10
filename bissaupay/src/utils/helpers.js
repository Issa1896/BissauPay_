// src/utils/helpers.js
// Utilitários gerais do sistema

/**
 * Formata valor em centavos para XOF legível
 * Ex: 1500000 → "15.000 XOF"
 */
const formatXOF = (centavos, showCurrency = true) => {
  const value = (centavos / 100).toLocaleString('pt-PT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  return showCurrency ? `${value} XOF` : value
}

/**
 * Formata número de telefone para padrão +245XXXXXXXXX
 */
const formatPhone = (phone) => {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.startsWith('245')) return `+${cleaned}`
  if (cleaned.length === 9 && cleaned.startsWith('9')) return `+245${cleaned}`
  return phone
}

/**
 * Gera referência única
 * @param {string} prefix - Ex: 'TXN', 'PAY', 'REC', 'REM'
 */
const generateReference = (prefix = 'REF') => {
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}-${date}-${random}`
}

/**
 * Sanitiza string para evitar XSS / SQL injection em campos de texto livre
 */
const sanitizeText = (text, maxLength = 255) => {
  if (!text) return ''
  return String(text)
    .trim()
    .replace(/[<>]/g, '')
    .substring(0, maxLength)
}

/**
 * Valida número de telefone da Guiné-Bissau
 * Formatos válidos: +2459XXXXXXXX, 2459XXXXXXXX, 9XXXXXXXX
 */
const isValidGBPhone = (phone) => {
  return /^(\+245|245)?9[0-9]{8}$/.test(phone.replace(/\s/g, ''))
}

/**
 * Determina o nível de risco de uma transação (para compliance)
 */
const getRiskLevel = (amount, userLevel, isVerified) => {
  if (amount > 5_000_000 && !isVerified) return 'HIGH'    // > 50.000 XOF sem KYC
  if (amount > 10_000_000) return 'MEDIUM'                 // > 100.000 XOF
  if (userLevel === 'basic' && amount > 1_000_000) return 'LOW'  // > 10.000 XOF conta básica
  return 'NONE'
}

/**
 * Converte centavos para objeto de exibição
 */
const toDisplayAmount = (centavos, currency = 'XOF') => ({
  raw:      centavos,
  value:    centavos / 100,
  display:  `${(centavos / 100).toLocaleString('pt-PT')} ${currency}`,
  currency,
})

/**
 * Resposta de sucesso padronizada
 */
const successResponse = (data, message = null) => ({
  success: true,
  ...(message && { message }),
  data,
})

/**
 * Resposta de erro padronizada
 */
const errorResponse = (error, statusCode = 400) => ({
  success: false,
  error,
  statusCode,
})

/**
 * Pagina uma query — helper para cálculo de offset
 */
const paginate = (page = 1, limit = 20) => ({
  page:   parseInt(page),
  limit:  parseInt(limit),
  offset: (parseInt(page) - 1) * parseInt(limit),
})

/**
 * Calcula metadados de paginação
 */
const paginationMeta = (total, page, limit) => ({
  total: parseInt(total),
  page:  parseInt(page),
  limit: parseInt(limit),
  pages: Math.ceil(parseInt(total) / parseInt(limit)),
  has_next: parseInt(page) < Math.ceil(parseInt(total) / parseInt(limit)),
  has_prev: parseInt(page) > 1,
})

module.exports = {
  formatXOF,
  formatPhone,
  generateReference,
  sanitizeText,
  isValidGBPhone,
  getRiskLevel,
  toDisplayAmount,
  successResponse,
  errorResponse,
  paginate,
  paginationMeta,
}
