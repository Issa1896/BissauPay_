// src/config/database.js
// Pool de conexões PostgreSQL com suporte a transações ACID

const { Pool } = require('pg')
const logger   = require('./logger')

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'bissaupay',
  user:     process.env.DB_USER     || 'bissaupay_user',
  password: process.env.DB_PASSWORD,
  max:      parseInt(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis:    30_000,
  connectionTimeoutMillis: 60_000,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : false,
})

pool.on('error', (err) => {
  logger.error('Erro inesperado no pool PostgreSQL', { error: err.message })
})

pool.on('connect', () => {
  logger.debug('Nova conexão PostgreSQL aberta')
})

/**
 * Executa uma query SQL simples (sem transação)
 */
const query = async (text, params) => {
  const start = Date.now()
  try {
    const result = await pool.query(text, params)
    const duration = Date.now() - start
    logger.debug('Query executada', {
      sql:      text.substring(0, 100).replace(/\s+/g, ' '),
      duration: `${duration}ms`,
      rows:     result.rowCount,
    })
    return result
  } catch (err) {
    logger.error('Erro na query', {
      sql:   text.substring(0, 100).replace(/\s+/g, ' '),
      error: err.message,
      code:  err.code,
    })
    throw err
  }
}

/**
 * Executa um conjunto de queries dentro de uma transação ACID.
 * Se qualquer query falhar → ROLLBACK automático.
 *
 * @param {Function} callback - recebe `client` e deve retornar o resultado final
 */
const withTransaction = async (callback) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    logger.debug('Transação COMMIT realizado')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    logger.warn('Transação ROLLBACK executado', { error: err.message })
    throw err
  } finally {
    client.release()
  }
}

/**
 * Verifica se o banco de dados está acessível
 */
const healthCheck = async () => {
  try {
    const result = await query('SELECT NOW() as time, version() as pg_version')
    return {
      ok:         true,
      time:       result.rows[0].time,
      pg_version: result.rows[0].pg_version.split(' ')[0],
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

/**
 * Retorna métricas do pool de conexões
 */
const poolStats = () => ({
  total:   pool.totalCount,
  idle:    pool.idleCount,
  waiting: pool.waitingCount,
})

module.exports = { query, withTransaction, healthCheck, poolStats, pool }
