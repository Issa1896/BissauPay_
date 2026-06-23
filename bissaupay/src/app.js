// src/app.js
// Ponto de entrada da API BissauPay

require('dotenv').config()

const express   = require('express')
const cors      = require('cors')
const helmet    = require('helmet')
const morgan    = require('morgan')
const rateLimit = require('express-rate-limit')

const logger          = require('./config/logger')
const { healthCheck } = require('./config/database')
const errorHandler    = require('./middleware/errorHandler')

const app = express()
const API = `/api/${process.env.API_VERSION || 'v1'}`

// ── Segurança ────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // desativado para permitir API pura
}))

// ── CORS ─────────────────────────────────────────────────────
const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
const allowedOrigins = (process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'])
  .concat(vercelUrl ? [vercelUrl] : [])
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return cb(null, true)
    }
    cb(new Error(`Origin '${origin}' não permitida por CORS`))
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-ID', 'X-Signature'],
  credentials: true,
}))

// ── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))
app.set('trust proxy', 1)

// ── HTTP Logging ─────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }))
}

// ── Rate Limiting geral ──────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900_000,
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message:  { success: false, error: 'Muitas requisições. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders:   false,
  skip: (req) => req.path === '/health', // health check sem limite
})

// Rate limit mais restrito para autenticação
const authLimiter = rateLimit({
  windowMs: 900_000,        // 15 min
  max:      20,
  message:  { success: false, error: 'Muitas tentativas. Aguarde 15 minutos.' },
})

// Rate limit para operações financeiras
const txLimiter = rateLimit({
  windowMs: 60_000,         // 1 min
  max:      10,
  message:  { success: false, error: 'Limite de operações por minuto atingido.' },
})

app.use(globalLimiter)

// ── Rotas ────────────────────────────────────────────────────
app.use(`${API}/auth`,       authLimiter, require('./routes/auth'))
app.use(`${API}/wallet`,     txLimiter,   require('./routes/wallet'))
app.use(`${API}/merchants`,               require('./routes/merchants'))
app.use(`${API}/payments`,   txLimiter,   require('./routes/payments'))
app.use(`${API}/topup`,      txLimiter,   require('./routes/topup'))
app.use(`${API}/remittance`,              require('./routes/remittance'))
app.use(`${API}/admin`,                   require('./routes/admin'))
app.use(`${API}/kyc`,                     require('./routes/kyc'))
app.use(`${API}/notifications`,           require('./routes/notifications'))

// ── Health check ─────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const db = await healthCheck()
  const status = db.ok ? 'ok' : 'degraded'
  res.status(db.ok ? 200 : 503).json({
    status,
    version:   process.env.API_VERSION || 'v1',
    timestamp: new Date().toISOString(),
    database:  db,
    uptime:    process.uptime(),
    memory:    process.memoryUsage(),
  })
})

app.get('/', (req, res) => res.json({
  name:    'BissauPay API',
  version: process.env.API_VERSION || 'v1',
  status:  'online',
  docs:    `${API}/docs`,
}))

// ── 404 ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Rota '${req.path}' não encontrada` })
})

// ── Error handler global ─────────────────────────────────────
app.use(errorHandler)

// ── Inicializar ──────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 3000

if (require.main === module) {
  app.listen(PORT, async () => {
    logger.info(`🚀 BissauPay API na porta ${PORT} [${process.env.NODE_ENV || 'development'}]`)
    const db = await healthCheck()
    if (db.ok) {
      logger.info('✅ PostgreSQL conectado')
    } else {
      logger.error('❌ Falha na conexão com PostgreSQL', { error: db.error })
    }

    // Iniciar jobs automáticos em produção (não na Vercel serverless)
    if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
      require('./jobs/cronJobs').start()
      logger.info('⏰ Cron jobs iniciados')
    }
  })
}

module.exports = app
