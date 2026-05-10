// src/services/remittance/exchangeRateService.js
// Taxas de câmbio com cache no PostgreSQL + memória

const axios    = require('axios')
const { query } = require('../../config/database')
const logger   = require('../../config/logger')

const memoryCache = new Map()
const CACHE_TTL   = 30 * 60 * 1000 // 30 min

const SUPPORTED_PAIRS = [
  { base: 'XOF', quote: 'EUR' }, { base: 'XOF', quote: 'BRL' },
  { base: 'XOF', quote: 'USD' }, { base: 'EUR', quote: 'XOF' },
  { base: 'BRL', quote: 'XOF' }, { base: 'USD', quote: 'XOF' },
]

// Taxas de fallback (último recurso)
const FALLBACK_RATES = {
  XOF_EUR: 0.001524, XOF_BRL: 0.008500, XOF_USD: 0.001660,
  EUR_XOF: 655.957,  BRL_XOF: 117.647,  USD_XOF: 602.410,
}

const getRateFromDB = async (base, quote) => {
  const result = await query(
    `SELECT rate, fetched_at FROM exchange_rates
     WHERE base_currency = $1 AND quote_currency = $2
       AND fetched_at > NOW() - INTERVAL '30 minutes'`,
    [base, quote]
  )
  return result.rows[0] || null
}

const saveRateToDB = async (base, quote, rate, source) => {
  await query(
    `INSERT INTO exchange_rates (base_currency, quote_currency, rate, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (base_currency, quote_currency)
     DO UPDATE SET rate = $3, source = $4, fetched_at = NOW()`,
    [base, quote, rate, source]
  )
}

const fetchFromAPI = async (base, quote) => {
  const apiKey = process.env.EXCHANGE_API_KEY

  // Modo dev sem chave — simula flutuação de mercado
  if (!apiKey || process.env.NODE_ENV !== 'production') {
    const key  = `${base}_${quote}`
    const base_rate = FALLBACK_RATES[key]
    if (!base_rate) throw new Error(`Par ${base}/${quote} não suportado`)
    const rate = parseFloat((base_rate * (1 + (Math.random() - 0.5) * 0.01)).toFixed(8))
    return { rate, source: 'mock' }
  }

  try {
    const url      = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${base}/${quote}`
    const response = await axios.get(url, { timeout: 8000 })
    if (response.data.result !== 'success') {
      throw new Error(`API: ${response.data['error-type']}`)
    }
    return { rate: response.data.conversion_rate, source: 'exchangerate-api' }
  } catch (err) {
    logger.warn('ExchangeRate-API falhou, tentando OXR', { error: err.message })

    try {
      const oxrKey = process.env.OXR_API_KEY
      if (oxrKey) {
        const r     = await axios.get(`https://openexchangerates.org/api/latest.json?app_id=${oxrKey}&base=USD`, { timeout: 8000 })
        const rates = r.data.rates
        const rate  = parseFloat(((rates[quote] || 1) / (rates[base] || 1)).toFixed(8))
        return { rate, source: 'openexchangerates' }
      }
    } catch (oxrErr) {
      logger.warn('OXR também falhou', { error: oxrErr.message })
    }

    const key = `${base}_${quote}`
    if (FALLBACK_RATES[key]) {
      logger.warn('Usando taxa de fallback estática', { base, quote })
      return { rate: FALLBACK_RATES[key], source: 'fallback' }
    }

    throw new Error(`Não foi possível obter taxa para ${base}/${quote}`)
  }
}

const getRate = async (base, quote) => {
  if (base === quote) return { rate: 1.0, source: 'identity', cached: true }

  const cacheKey = `${base}_${quote}`

  // Cache em memória
  const memCached = memoryCache.get(cacheKey)
  if (memCached && Date.now() - memCached.timestamp < CACHE_TTL) {
    return { ...memCached.data, cached: true }
  }

  // Cache no banco
  try {
    const dbCached = await getRateFromDB(base, quote)
    if (dbCached) {
      const result = { rate: parseFloat(dbCached.rate), source: 'db_cache', cached: true }
      memoryCache.set(cacheKey, { data: result, timestamp: Date.now() })
      return result
    }
  } catch (dbErr) {
    logger.warn('Falha ao consultar cache de câmbio', { error: dbErr.message })
  }

  // Buscar da API
  const fetched = await fetchFromAPI(base, quote)
  saveRateToDB(base, quote, fetched.rate, fetched.source).catch(() => {})

  const result = { ...fetched, cached: false }
  memoryCache.set(cacheKey, { data: result, timestamp: Date.now() })

  return result
}

const convert = async (amount, fromCurrency, toCurrency, spreadPct = 0.005) => {
  const { rate, source, cached } = await getRate(fromCurrency, toCurrency)
  const effectiveRate   = rate * (1 - spreadPct)
  const convertedAmount = Math.floor(amount * effectiveRate)

  return {
    from_currency:    fromCurrency,
    to_currency:      toCurrency,
    send_amount:      amount,
    mid_rate:         rate,
    spread_pct:       spreadPct,
    effective_rate:   effectiveRate,
    receive_amount:   convertedAmount,
    rate_source:      source,
    rate_cached:      cached,
    rate_valid_until: new Date(Date.now() + CACHE_TTL).toISOString(),
  }
}

const refreshAllRates = async () => {
  logger.info('Atualizando todas as taxas de câmbio...')
  const results = []

  for (const { base, quote } of SUPPORTED_PAIRS) {
    try {
      const { rate, source } = await fetchFromAPI(base, quote)
      await saveRateToDB(base, quote, rate, source)
      results.push({ pair: `${base}/${quote}`, rate, source, ok: true })
    } catch (err) {
      results.push({ pair: `${base}/${quote}`, ok: false, error: err.message })
    }
  }

  const success = results.filter(r => r.ok).length
  logger.info(`Taxas atualizadas: ${success}/${results.length}`)

  return results
}

module.exports = { getRate, convert, refreshAllRates }
