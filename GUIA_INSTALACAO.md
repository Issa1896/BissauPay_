# 🇬🇼 BissauPay — Guia Completo de Instalação
> Passo a passo para executar no VS Code sem erros

---

## Índice

| # | Etapa |
|---|---|
| 1 | Instalar Node.js + PostgreSQL + VS Code |
| 2 | Criar base de dados |
| 3 | Organizar pastas e abrir no VS Code |
| 4 | Configurar e iniciar o Backend |
| 5 | Configurar e iniciar o Frontend |
| 6 | Testar o sistema |
| 7 | Resolução de erros comuns |

---

## Passo 1 — Instalar as ferramentas

### Node.js

**Windows:**
1. Acesse https://nodejs.org → descarregue a versão **LTS** (ex: 20.x)
2. Execute o instalador `.msi` → marque **"Add to PATH"** e **"Automatically install tools"**
3. **Reinicie o computador** após instalar

**macOS:**
```bash
brew install node
```

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Verificar:**
```bash
node --version    # v18.x.x ou superior
npm --version     # 9.x.x ou superior
```

---

### PostgreSQL

**Windows:**
1. Acesse https://www.postgresql.org/download/windows/
2. Descarregue versão **16.x** para Windows x86-64
3. Execute o instalador — anote a **senha do utilizador postgres** (ex: `postgres123`)
4. Deixe a porta **5432** (padrão) e marque **pgAdmin 4** e **Command Line Tools**
5. Após instalar, adicione ao PATH:
   - Painel de Controlo → Sistema → Variáveis de Ambiente → Path → Editar → Novo
   - Adicione: `C:\Program Files\PostgreSQL\16\bin`
   - Clique OK → reinicie o terminal

**macOS:**
```bash
brew install postgresql@16
brew services start postgresql@16
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Linux:**
```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl start postgresql && sudo systemctl enable postgresql
```

**Verificar:**
```bash
psql --version    # psql (PostgreSQL) 14.x ou superior
```

---

## Passo 2 — Criar a base de dados

### Abrir o psql

**Windows:** Menu Iniciar → **"SQL Shell (psql)"** → Enter nas 4 primeiras perguntas → escreva a senha do postgres

**macOS:** `psql postgres`

**Linux:** `sudo -u postgres psql`

### Executar os comandos (um a um)

```sql
CREATE USER bissaupay_user WITH PASSWORD 'bissaupay2024';
CREATE DATABASE bissaupay OWNER bissaupay_user;
GRANT ALL PRIVILEGES ON DATABASE bissaupay TO bissaupay_user;
\c bissaupay
GRANT ALL ON SCHEMA public TO bissaupay_user;
\q
```

> Anote bem: senha = `bissaupay2024` — vai precisar no Passo 4.

---

## Passo 3 — Organizar as pastas

### Estrutura correcta

```
BissauPay/                    ← Abrir esta pasta no VS Code
├── .vscode/                  ← Já incluído neste ZIP
│   ├── tasks.json
│   ├── launch.json
│   ├── settings.json
│   └── extensions.json
├── bissaupay/                ← Extrair bissaupay-backend.zip aqui
│   ├── src/
│   ├── package.json
│   └── .env.example
└── bissaupay-web/            ← Extrair bissaupay-web.zip aqui
    ├── src/
    ├── package.json
    └── vite.config.js
```

### Passo a passo

1. Use a pasta **BissauPay/** deste ZIP (já tem a pasta `.vscode/`)
2. Extraia `bissaupay-backend.zip` para dentro de `BissauPay/`
3. Extraia `bissaupay-web.zip` para dentro de `BissauPay/`
4. Abra o VS Code → **File → Open Folder** → seleccione `BissauPay/`
5. Abra o terminal: **Ctrl+\`** (acento grave)

> Com o `tasks.json` incluído, pode iniciar os dois servidores com **Ctrl+Shift+B**.

---

## Passo 4 — Configurar e iniciar o Backend

Abra o terminal no VS Code (**Ctrl+\`**).

### 4.1 — Instalar dependências

```bash
cd bissaupay
npm install
```

Aguarde 1-2 minutos até ver `added NNN packages`.

### 4.2 — Criar o ficheiro .env

```bash
# Windows
copy .env.example .env

# macOS/Linux
cp .env.example .env
```

### 4.3 — Gerar a chave JWT (obrigatório)

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copie o resultado — vai usar no próximo passo.

### 4.4 — Editar o ficheiro .env

Abra o `.env` no VS Code e preencha:

```env
NODE_ENV=development
PORT=3000
API_VERSION=v1

DB_HOST=localhost
DB_PORT=5432
DB_NAME=bissaupay
DB_USER=bissaupay_user
DB_PASSWORD=bissaupay2024

JWT_SECRET=COLE_AQUI_O_RESULTADO_DO_COMANDO_ACIMA
JWT_EXPIRES_IN=7d

SMS_PROVIDER=mock

FEE_P2P=0.005
FEE_PAYMENT=0.010
FEE_REMITTANCE=0.020
LIMIT_DAILY_BASIC=50000000
LIMIT_DAILY_VERIFIED=200000000
LIMIT_DAILY_MERCHANT=500000000
LIMIT_SINGLE_TX=10000000

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

EXCHANGE_API_KEY=
LOG_LEVEL=info
LOG_FILE=logs/bissaupay.log
APP_URL=http://localhost:3000
ADMIN_SECRET=admin123
```

### 4.5 — Inicializar a base de dados

```bash
npm run db:init
```

**Resultado esperado:**
```
✅ schema.sql executado com sucesso
✅ merchant_schema.sql executado com sucesso
✅ topup_schema.sql executado com sucesso
✅ remittance_schema.sql executado com sucesso
✅ notifications_schema.sql executado com sucesso
✨ Banco de dados inicializado com sucesso!
```

### 4.6 — Inserir dados de teste

```bash
npm run db:seed
```

**Resultado esperado:**
```
✅ Admin: +245955000001 | PIN: 123456
✅ Comerciante: +245955000002 | PIN: 123456
✅ Cliente: +245955000003 | PIN: 123456
✨ Seed concluído!
```

### 4.7 — Iniciar o servidor

```bash
npm run dev
```

**Resultado esperado:**
```
🚀 BissauPay API na porta 3000 [development]
✅ PostgreSQL conectado
```

Confirme abrindo: **http://localhost:3000/health** → deve ver `"status":"ok"`.

---

## Passo 5 — Configurar e iniciar o Frontend

Abra um **segundo terminal** no VS Code: clique em **+** no painel de terminais.

### 5.1 — Instalar e iniciar

```bash
cd bissaupay-web
npm install
npm run dev
```

**Resultado esperado:**
```
  VITE v5.x  ready in 523 ms
  ➜  Local:   http://localhost:5173/
```

Abra o browser em **http://localhost:5173** → deve ver a página de login.

### Atalho com tasks.json

Com os dois servidores parados, pressione **Ctrl+Shift+B** no VS Code → seleccione **"Iniciar BissauPay"** → os dois terminais abrem automaticamente.

---

## Passo 6 — Testar o sistema

### Credenciais de teste

| Tipo | Telefone | PIN |
|---|---|---|
| Admin | +245955000001 | 123456 |
| Comerciante | +245955000002 | 123456 |
| Cliente | +245955000003 | 123456 |

> Os códigos OTP aparecem no **terminal do backend**:
> `[SMS MOCK] Para: +245... | Msg: ... código é XXXXXX`

### Fluxo de login

1. Acesse `http://localhost:5173`
2. Telefone: `+245955000003` | PIN: `123456` → **Entrar**
3. Copie o código OTP do terminal do backend
4. Cole no ecrã de verificação → **Confirmar**
5. Dashboard deve carregar com saldo de 1.000.000 XOF

### Testar transferência

1. Dashboard → **Enviar**
2. Destinatário: `+245955000001` | Valor: `1000`
3. Continuar → Confirmar → "Transferência realizada!"

### Testar recarga

1. **Recarga** → MTN — Crédito de Voz
2. Número: `+245955111222` | Valor: 200 (preset)
3. Calcular → Confirmar → "Recarga realizada!"

### Testar remessa

1. **Remessa** → Portugal
2. Valor: `50000` | Transferência bancária
3. Nome do destinatário + IBAN de teste
4. Ver cotação → Enviar → cotação XOF/EUR em tempo real

### Testar dashboard de comerciante

1. Logout → Login com `+245955000002` / `123456`
2. **Loja** na navegação → ver vendas e QR Code

---

## Passo 7 — Resolução de erros comuns

### ❌ Cannot connect to database

**Windows:** Menu Iniciar → Serviços → `postgresql-x64-16` → Iniciar
**macOS:** `brew services start postgresql@16`
**Linux:** `sudo systemctl start postgresql`

Confirme também que `DB_PASSWORD=bissaupay2024` no `.env`.

---

### ❌ relation "users" does not exist

```bash
cd bissaupay && npm run db:init
```

---

### ❌ Port 3000 already in use

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID NUMERO /F

# macOS/Linux
kill -9 $(lsof -t -i:3000)
```

---

### ❌ password authentication failed

No psql como superuser:
```sql
ALTER USER bissaupay_user WITH PASSWORD 'bissaupay2024';
```

---

### ❌ JWT_SECRET is not defined

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Cole o resultado no `.env` → reinicie o backend.

---

### ❌ 'node' not recognized (Windows)

Desinstale o Node.js → reinstale de nodejs.org marcando **"Add to PATH"** → **reinicie o computador**.

---

### ❌ Frontend não conecta (404 na API)

1. Confirme: `http://localhost:3000/health` retorna OK
2. Confirme o `vite.config.js` tem o proxy para `http://localhost:3000`
3. Reinicie: `Ctrl+C` → `npm run dev`

---

## Referência Rápida

```bash
# Iniciar backend
cd bissaupay && npm run dev        # → http://localhost:3000

# Iniciar frontend
cd bissaupay-web && npm run dev    # → http://localhost:5173

# Recomeçar base de dados
cd bissaupay
npm run db:init
npm run db:seed

# Atalho VS Code (com tasks.json)
Ctrl+Shift+B → "Iniciar BissauPay"
```

---

## Checklist Final

- [ ] `node --version` mostra v18+
- [ ] `psql --version` mostra 14+
- [ ] Base de dados e utilizador criados no psql
- [ ] Ficheiro `bissaupay/.env` criado com JWT_SECRET real
- [ ] `npm run db:init` sem erros
- [ ] `npm run db:seed` sem erros
- [ ] Backend a correr → `http://localhost:3000/health` OK
- [ ] Frontend a correr → `http://localhost:5173` mostra login
- [ ] Login com `+245955000003` e PIN `123456` funciona
- [ ] OTP aparece no terminal do backend
- [ ] Dashboard mostra saldo
- [ ] Transferência de teste funciona

---

*BissauPay — Guiné-Bissau 🇬🇼*
