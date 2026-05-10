// src/config/seedDb.js
// Insere dados de teste para desenvolvimento
// Executar: node src/config/seedDb.js

require('dotenv').config()
const bcrypt   = require('bcryptjs')
const { pool } = require('./database')
const logger   = require('./logger')

async function seed() {
  logger.info('🌱 Iniciando seed do banco de dados...')
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // ── Usuário admin de teste ───────────────────────────────
    const pinHash = await bcrypt.hash('123456', 12)

    const adminResult = await client.query(`
      INSERT INTO users (phone, full_name, pin_hash, status, level)
      VALUES ($1, $2, $3, 'active', 'basic')
      ON CONFLICT (phone) DO NOTHING
      RETURNING id
    `, ['+245955000001', 'Issa Teste Admin', pinHash])

    if (adminResult.rows.length > 0) {
      const adminId = adminResult.rows[0].id

      await client.query(`
        INSERT INTO wallets (user_id, balance, daily_limit)
        VALUES ($1, 500000000, 200000000)
        ON CONFLICT (user_id) DO NOTHING
      `, [adminId])

      logger.info('  ✅ Usuário admin criado', { phone: '+245955000001', pin: '123456' })
    } else {
      logger.info('  ⏭  Usuário admin já existe')
    }

    // ── Usuário comerciante de teste ─────────────────────────
    const merchantResult = await client.query(`
      INSERT INTO users (phone, full_name, pin_hash, status, level)
      VALUES ($1, $2, $3, 'active', 'merchant')
      ON CONFLICT (phone) DO NOTHING
      RETURNING id
    `, ['+245955000002', 'Mercado Central Bissau', pinHash])

    if (merchantResult.rows.length > 0) {
      const merchantUserId = merchantResult.rows[0].id

      await client.query(`
        INSERT INTO wallets (user_id, balance, daily_limit)
        VALUES ($1, 0, 500000000)
        ON CONFLICT (user_id) DO NOTHING
      `, [merchantUserId])

      await client.query(`
        INSERT INTO merchants (user_id, business_name, business_type, fee_rate, is_active)
        VALUES ($1, 'Mercado Central Bissau', 'retail', 0.0100, true)
        ON CONFLICT (user_id) DO NOTHING
      `, [merchantUserId])

      logger.info('  ✅ Comerciante de teste criado', { phone: '+245955000002' })
    }

    // ── Usuário cliente de teste ─────────────────────────────
    const clientResult = await client.query(`
      INSERT INTO users (phone, full_name, pin_hash, status, level)
      VALUES ($1, $2, $3, 'active', 'basic')
      ON CONFLICT (phone) DO NOTHING
      RETURNING id
    `, ['+245955000003', 'Fatumata Silva', pinHash])

    if (clientResult.rows.length > 0) {
      const clientId = clientResult.rows[0].id

      await client.query(`
        INSERT INTO wallets (user_id, balance)
        VALUES ($1, 100000000)
        ON CONFLICT (user_id) DO NOTHING
      `, [clientId])

      logger.info('  ✅ Cliente de teste criado', { phone: '+245955000003', saldo: '1.000.000 XOF' })
    }

    await client.query('COMMIT')

    logger.info('✨ Seed concluído com sucesso!')
    logger.info('─────────────────────────────────────')
    logger.info('  Usuários de teste:')
    logger.info('  Admin:      +245955000001 | PIN: 123456')
    logger.info('  Comerciante: +245955000002 | PIN: 123456')
    logger.info('  Cliente:    +245955000003 | PIN: 123456')
    logger.info('─────────────────────────────────────')

  } catch (err) {
    await client.query('ROLLBACK')
    logger.error('❌ Erro no seed', { error: err.message })
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

seed()
