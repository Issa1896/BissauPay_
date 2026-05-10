# BissauPay — Backend API

> Infraestrutura financeira digital para a Guiné-Bissau  
> Carteira digital · Pagamentos QR · Recargas · Remessas internacionais

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express.js 4 |
| Banco de dados | PostgreSQL 14+ |
| Autenticação | JWT + OTP via SMS |
| Rate limiting | express-rate-limit |
| Logs | Winston |
| Jobs | node-cron |
| QR Code | qrcode |
| Hashing | bcryptjs |

---

## Requisitos

- **Node.js** v18 ou superior
- **PostgreSQL** 14 ou superior
- **npm** v9+

---

## Instalação e Configuração

### 1. Clonar e instalar dependências

```bash
git clone <repositorio>
cd bissaupay
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Editar `.env` com os valores reais:

```env
NODE_ENV=development
PORT=3000

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=bissaupay
DB_USER=bissaupay_user
DB_PASSWORD=sua_senha

# JWT — gerar chave forte:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=chave_aleatoria_de_pelo_menos_64_caracteres

# SMS — usar 'mock' em desenvolvimento
SMS_PROVIDER=mock
```

### 3. Criar banco de dados

```sql
-- No psql como superuser:
CREATE DATABASE bissaupay;
CREATE USER bissaupay_user WITH PASSWORD 'sua_senha';
GRANT ALL PRIVILEGES ON DATABASE bissaupay TO bissaupay_user;
\c bissaupay
GRANT ALL ON SCHEMA public TO bissaupay_user;
```

### 4. Inicializar o schema

```bash
npm run db:init
```

Este comando executa todos os schemas na ordem correta:
1. `schema.sql` — tabelas principais
2. `merchant_schema.sql` — módulo de comerciantes
3. `topup_schema.sql` — recargas e utilitários
4. `remittance_schema.sql` — remessas internacionais

### 5. Inserir dados de teste (desenvolvimento)

```bash
npm run db:seed
```

Cria 3 utilizadores de teste:
| Telefone | PIN | Perfil |
|---|---|---|
| +245955000001 | 123456 | Admin |
| +245955000002 | 123456 | Comerciante |
| +245955000003 | 123456 | Cliente |

### 6. Iniciar o servidor

```bash
# Desenvolvimento (hot reload)
npm run dev

# Produção
npm start
```

O servidor estará disponível em `http://localhost:3000`

---

## Estrutura de Pastas

```
bissaupay/
├── src/
│   ├── app.js                    ← Entry point
│   ├── config/
│   │   ├── database.js           ← Pool PostgreSQL + transações ACID
│   │   ├── logger.js             ← Winston (console + arquivo)
│   │   ├── initDb.js             ← Script de inicialização do banco
│   │   └── seedDb.js             ← Dados de teste
│   ├── middleware/
│   │   ├── auth.js               ← JWT + controlo de acesso
│   │   ├── validate.js           ← Helper express-validator
│   │   └── errorHandler.js       ← Handler global de erros
│   ├── models/
│   │   ├── schema.sql            ← Tabelas principais
│   │   ├── merchant_schema.sql   ← Módulo comerciantes
│   │   ├── topup_schema.sql      ← Módulo recargas
│   │   └── remittance_schema.sql ← Módulo remessas
│   ├── routes/
│   │   ├── auth.js               ← Registo, login, OTP, logout
│   │   ├── wallet.js             ← Saldo, transferências, extrato
│   │   ├── merchants.js          ← Dashboard e QR comerciante
│   │   ├── payments.js           ← Pagamento QR cliente
│   │   ├── topup.js              ← Recargas e utilitários
│   │   ├── remittance.js         ← Remessas internacionais
│   │   ├── kyc.js                ← Verificação de identidade
│   │   └── admin.js              ← Painel administrativo
│   ├── services/
│   │   ├── otpService.js         ← Geração e validação de OTPs
│   │   ├── transactionService.js ← Motor de transferências ACID
│   │   ├── merchantService.js    ← Gestão de comerciantes
│   │   ├── qrService.js          ← Geração de QR Codes
│   │   ├── paymentService.js     ← Pagamentos via QR
│   │   ├── kycService.js         ← Verificação de identidade
│   │   ├── notificationService.js← Notificações SMS + in-app
│   │   ├── topup/
│   │   │   ├── providers.js      ← Adaptadores MTN, Orange, EAGB, SAAB
│   │   │   └── topupService.js   ← Motor de recargas
│   │   └── remittance/
│   │       ├── exchangeRateService.js ← Cache de câmbio
│   │       ├── remittanceProviders.js ← Adaptadores Wise, Wave
│   │       └── remittanceService.js   ← Motor de remessas
│   ├── jobs/
│   │   └── cronJobs.js           ← Jobs automáticos (cron)
│   └── utils/
│       └── helpers.js            ← Utilitários gerais
├── .env.example
├── .gitignore
└── package.json
```

---

## Endpoints da API

**Base URL:** `http://localhost:3000/api/v1`

### Autenticação
| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/register` | Registar novo utilizador |
| POST | `/auth/verify-otp` | Verificar OTP (registo/login) |
| POST | `/auth/login` | Login com telefone + PIN |
| POST | `/auth/logout` | Encerrar sessão |
| GET  | `/auth/me` | Dados do utilizador autenticado |
| POST | `/auth/reset-pin/request` | Solicitar redefinição de PIN |
| POST | `/auth/reset-pin/confirm` | Confirmar novo PIN |

### Carteira
| Método | Rota | Descrição |
|---|---|---|
| GET  | `/wallet/balance` | Saldo e informações da carteira |
| POST | `/wallet/transfer` | Transferência P2P |
| GET  | `/wallet/statement` | Extrato com paginação |
| GET  | `/wallet/transaction/:ref` | Detalhe de uma transação |

### Comerciantes
| Método | Rota | Descrição |
|---|---|---|
| POST | `/merchants/register` | Registar como comerciante |
| GET  | `/merchants/me` | Perfil do comerciante |
| GET  | `/merchants/dashboard` | Resumo de vendas |
| GET  | `/merchants/qr/static` | QR estático permanente |
| POST | `/merchants/qr/dynamic` | Gerar QR dinâmico |
| GET  | `/merchants/qr/requests` | Listar QRs dinâmicos |
| DELETE | `/merchants/qr/requests/:id` | Cancelar QR |
| GET  | `/merchants/transactions` | Extrato de recebimentos |

### Pagamentos (cliente)
| Método | Rota | Descrição |
|---|---|---|
| POST | `/payments/preview` | Pré-visualizar pagamento QR |
| POST | `/payments/confirm` | Confirmar pagamento |
| GET  | `/payments/merchant-info/:code` | Info pública do comerciante |

### Recargas
| Método | Rota | Descrição |
|---|---|---|
| GET  | `/topup/providers` | Listar provedores |
| POST | `/topup/preview` | Pré-visualizar recarga |
| POST | `/topup/execute` | Executar recarga |
| GET  | `/topup/history` | Histórico de recargas |
| GET  | `/topup/orders/:id` | Detalhe de pedido |

### Remessas
| Método | Rota | Descrição |
|---|---|---|
| GET  | `/remittance/corridors` | Listar corredores disponíveis |
| POST | `/remittance/quote` | Cotação em tempo real |
| POST | `/remittance/send` | Enviar remessa |
| GET  | `/remittance/history` | Histórico de remessas |
| GET  | `/remittance/orders/:id` | Detalhe de remessa |
| GET  | `/remittance/rates/current` | Taxas de câmbio atuais |
| POST | `/remittance/webhook/:provider` | Webhook do provedor |

### KYC
| Método | Rota | Descrição |
|---|---|---|
| GET  | `/kyc/status` | Status do KYC |
| POST | `/kyc/submit` | Submeter documentos |
| GET  | `/kyc/pending` | Listar KYCs pendentes (admin) |
| POST | `/kyc/:id/approve` | Aprovar KYC (admin) |
| POST | `/kyc/:id/reject` | Rejeitar KYC (admin) |

### Admin
| Método | Rota | Descrição |
|---|---|---|
| GET  | `/admin/metrics` | Métricas gerais do sistema |
| GET  | `/admin/users` | Listar utilizadores |
| GET  | `/admin/users/:id` | Detalhe de utilizador |
| PATCH | `/admin/users/:id/status` | Alterar status |
| GET  | `/admin/audit` | Log de auditoria |
| GET  | `/admin/transactions` | Todas as transações |

---

## Fluxo de Autenticação

```
1. POST /auth/register { phone, full_name, pin }
   → Cria utilizador com status 'pending'
   → Envia OTP por SMS

2. POST /auth/verify-otp { phone, code, purpose: "register" }
   → Ativa a conta
   → Retorna JWT token

3. POST /auth/login { phone, pin }
   → Verifica PIN (bloqueia após 5 falhas)
   → Envia OTP por SMS

4. POST /auth/verify-otp { phone, code, purpose: "login" }
   → Retorna JWT token

5. Todas as rotas protegidas:
   → Header: Authorization: Bearer <token>
```

## Fluxo de Pagamento QR

```
COMERCIANTE:
1. POST /merchants/qr/dynamic { amount, description }
   → Gera QR com valor fixo e expiração

CLIENTE:
2. POST /payments/preview { qr_payload, amount? }
   → Ver comerciante, valor e taxa antes de pagar

3. POST /payments/confirm { payment_request_id, amount }
   → Debita cliente, credita comerciante (ACID)
   → Retorna comprovativo
```

---

## Segurança

- **PIN** armazenado com bcrypt (12 rounds)
- **JWT** com expiração configurável (padrão 7 dias)
- **OTP** expiram em 10 minutos, máximo 3 tentativas
- **Rate limiting** — 100 req/15min global, 20 req/15min em auth
- **Transações ACID** — PostgreSQL `FOR UPDATE` + transações atômicas
- **Audit log** imutável para todas as ações sensíveis
- Carteira com **saldo mínimo zero** (constraint no banco)
- **Limite diário** por utilizador reset automático à meia-noite

---

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DB_PASSWORD` | Sim | Senha do PostgreSQL |
| `JWT_SECRET` | Sim | Chave secreta JWT (64+ chars) |
| `SMS_PROVIDER` | Não | `mock` (dev) / `africastalking` / `twilio` |
| `EXCHANGE_API_KEY` | Não | Chave ExchangeRate-API (câmbio) |
| `WISE_API_KEY` | Não | Chave Wise (remessas) |
| `WAVE_API_KEY` | Não | Chave Wave (remessas Senegal) |
| `AT_API_KEY` | Não | Africa's Talking (SMS produção) |

---

## Desenvolvimento

```bash
# Instalar dependências
npm install

# Iniciar em modo desenvolvimento (hot reload)
npm run dev

# Verificar health
curl http://localhost:3000/health
```

### Mock de SMS
Em desenvolvimento, os códigos OTP aparecem no **console** do servidor:
```
[SMS MOCK] Para: +245955000001 | Msg: BissauPay: O seu código de acesso é 847291...
```

### Mock de provedores externos
Todos os provedores (MTN, Orange, EAGB, SAAB, Wise, Wave) funcionam em modo mock em desenvolvimento com 95% de taxa de sucesso simulada.

---

## Modelo de Dados

- **Moeda base:** XOF (Franco CFA)
- **Valores:** BIGINT em centavos (1 XOF = 100 centavos)
- Exemplo: 10.000 XOF = `1000000` no banco
- Razão: evita erros de ponto flutuante em operações financeiras

---

## Roadmap

### Fase 1 — MVP (atual)
- [x] Carteira digital (wallet)
- [x] Transferências P2P
- [x] Pagamentos via QR Code
- [x] Recargas (MTN, Orange, EAGB, SAAB)
- [x] Remessas internacionais (Wise, Wave)
- [x] KYC básico
- [x] Painel admin

### Fase 2 — Expansão
- [ ] App mobile (React Native)
- [ ] Notificações push
- [ ] Agentes físicos (cash-in/cash-out)
- [ ] USSD para utilizadores sem smartphone

### Fase 3 — Regulação
- [ ] Licença BCEAO (estabelecimento de moeda eletrónica)
- [ ] Parceria com banco local
- [ ] Interoperabilidade com outros wallets

---

## Licença

Propriedade de BissauPay. Todos os direitos reservados.
