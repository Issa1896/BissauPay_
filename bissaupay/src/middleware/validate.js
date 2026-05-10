// src/middleware/validate.js
// Helpers para validação de requests com express-validator

const { validationResult } = require('express-validator')

/**
 * Extrai e formata erros de validação.
 * Uso: const err = validate(req, res); if (err) return;
 */
const validate = (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    res.status(422).json({
      success: false,
      error:   'Dados de entrada inválidos',
      errors:  errors.array().map(e => ({
        field:   e.path || e.param,
        message: e.msg,
        value:   process.env.NODE_ENV !== 'production' ? e.value : undefined,
      })),
    })
    return true // sinaliza que houve erro
  }
  return false
}

/**
 * Middleware que roda a validação e para se houver erros.
 * Uso: router.post('/rota', [...regras], validateMiddleware, handler)
 */
const validateMiddleware = (req, res, next) => {
  const hasError = validate(req, res)
  if (!hasError) next()
}

module.exports = { validate, validateMiddleware }
