// src/middleware/errorHandler.js
// Handler global de erros — último middleware da cadeia

const logger = require('../config/logger')

/**
 * Classifica erros do PostgreSQL em mensagens amigáveis
 */
const pgErrorMessage = (code) => {
  const map = {
    '23505': 'Registo duplicado — este dado já existe',
    '23503': 'Referência inválida — dado relacionado não encontrado',
    '23502': 'Campo obrigatório em falta',
    '22001': 'Valor demasiado longo para o campo',
    '08006': 'Falha na conexão com o banco de dados',
    '40001': 'Conflito de transação — tente novamente',
    '57014': 'Query cancelada por tempo limite',
  }
  return map[code] || null
}

/**
 * Erros que o cliente pode ter causado (não logar como erro interno)
 */
const isClientError = (err) => {
  const clientMessages = [
    'Saldo insuficiente',
    'Limite diário',
    'Destinatário não encontrado',
    'Carteira bloqueada',
    'Conta inativa',
    'Valor excede',
    'QR Code',
    'expirado',
    'cancelado',
    'inválido',
    'não encontrado',
    'Informe o valor',
    'Carteira não encontrada',
    'Provedor não encontrado',
    'KYC necessário',
  ]
  return clientMessages.some(msg => err.message?.includes(msg))
}

const errorHandler = (err, req, res, next) => {
  // Erro de CORS
  if (err.message?.includes('CORS')) {
    return res.status(403).json({ success: false, error: 'Origem não permitida' })
  }

  // Erro do PostgreSQL
  if (err.code && err.code.length === 5) {
    const pgMsg = pgErrorMessage(err.code)
    if (pgMsg) {
      logger.warn('Erro PostgreSQL', { code: err.code, detail: err.detail })
      return res.status(409).json({ success: false, error: pgMsg })
    }
  }

  // Erro de JSON malformado
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'JSON inválido no corpo da requisição' })
  }

  // Erro operacional (negócios)
  if (isClientError(err)) {
    return res.status(400).json({ success: false, error: err.message })
  }

  // Erro inesperado — logar e retornar mensagem genérica
  logger.error('Erro interno não tratado', {
    message: err.message,
    stack:   err.stack,
    path:    req.path,
    method:  req.method,
    userId:  req.userId,
    body:    process.env.NODE_ENV !== 'production' ? req.body : '[hidden]',
  })

  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor. A nossa equipa foi notificada.',
    ...(process.env.NODE_ENV !== 'production' && { debug: err.message }),
  })
}

module.exports = errorHandler
