// src/config/initDb.js
// Inicializa o banco de dados — cria extensões, schemas e índices
// Executar: node src/config/initDb.js

require('dotenv').config()
const { pool } = require('./database')
const logger   = require('./logger')
const fs       = require('fs')
const path     = require('path')

const SCHEMA_FILES = [
  'schema.sql',
  'merchant_schema.sql',
  'topup_schema.sql',
  'remittance_schema.sql',
  'notifications_schema.sql',
]

async function initDb() {
  logger.info('🗄️  Iniciando setup do banco de dados BissauPay...')
  const client = await pool.connect()

  try {
    for (const file of SCHEMA_FILES) {
      const filePath = path.join(__dirname, '..', 'models', file)

      if (!fs.existsSync(filePath)) {
        logger.warn(`Arquivo não encontrado: ${file} — pulando`)
        continue
      }

      const sql = fs.readFileSync(filePath, 'utf8')
      logger.info(`  ▶ Executando ${file}...`)

      await client.query(sql)
      logger.info(`  ✅ ${file} executado com sucesso`)
    }

    logger.info('✨ Banco de dados inicializado com sucesso!')
    logger.info('💡 Execute "npm run db:seed" para inserir dados iniciais')

  } catch (err) {
    logger.error('❌ Erro ao inicializar o banco', { error: err.message })
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

initDb()
