// src/config/logger.js
// Logger centralizado com Winston — níveis, formatação e transports

const { createLogger, format, transports } = require('winston')
const path = require('path')
const fs   = require('fs')

// Formato para o console (colorido e legível)
const consoleFormat = format.combine(
  format.colorize({ all: true }),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const extras = Object.keys(meta).length
      ? ` ${JSON.stringify(meta, null, 0)}`
      : ''
    return `${timestamp} [${level}] ${message}${extras}`
  })
)

// Formato para arquivo (JSON estruturado)
const fileFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.json()
)

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: {
    error: 0,
    warn:  1,
    info:  2,
    http:  3,
    debug: 4,
  },
  transports: [
    new transports.Console({
      format: consoleFormat,
      silent: process.env.NODE_ENV === 'test',
    }),
  ],
})

// Em produção: adicionar log em arquivo com rotação (apenas se escrevível)
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  const logDir = path.dirname(process.env.LOG_FILE || 'logs/bissaupay.log')
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })

  logger.add(new transports.File({
    filename: process.env.LOG_FILE || 'logs/bissaupay.log',
    format:   fileFormat,
    maxsize:  10 * 1024 * 1024,
    maxFiles: 10,
    tailable: true,
  }))

  logger.add(new transports.File({
    filename: 'logs/errors.log',
    level:    'error',
    format:   fileFormat,
    maxsize:  5 * 1024 * 1024,
    maxFiles: 5,
  }))
}

module.exports = logger
