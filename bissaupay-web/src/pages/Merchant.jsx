// src/pages/Merchant.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { merchantAPI } from '../services/api'
import { useToast } from '../hooks/useToast'
import { PageHeader, ConfirmRow, CheckIcon, QRIcon, CopyIcon } from '../components/Layout'
import './Merchant.css'

export default function Merchant() {
  const toast     = useToast()
  const navigate  = useNavigate()
  const [tab,     setTab]     = useState('dashboard')
  const [merchant, setMerchant] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.all([merchantAPI.me(), merchantAPI.dashboard()])
      .then(([mRes, dRes]) => { setMerchant(mRes.data); setDashboard(dRes.data) })
      .catch(() => navigate('/merchant/register'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="form-page">
      <div className="form-body animate-in">
        {Array(4).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
      </div>
    </div>
  )

  return (
    <div className="merchant-page">
      <PageHeader title="Minha Loja" subtitle={merchant?.business_name} />

      <div className="merch-tabs">
        {['dashboard', 'qr', 'transacoes'].map(t => (
          <button key={t} className={`filter-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {{ dashboard: 'Dashboard', qr: 'QR Code', transacoes: 'Transacções' }[t]}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && dashboard && (
        <MerchantDashboard dashboard={dashboard} merchant={merchant} />
      )}
      {tab === 'qr' && merchant && (
        <MerchantQR merchant={merchant} toast={toast} />
      )}
      {tab === 'transacoes' && (
        <MerchantTransactions />
      )}
    </div>
  )
}

function MerchantDashboard({ dashboard, merchant }) {
  const s = dashboard.summary
  const cards = [
    { label: 'Hoje',       value: s.today_gross,       color: 'var(--green-400)' },
    { label: 'Este mês',   value: s.month_gross,        color: 'var(--gold-400)'  },
    { label: 'Total recebido', value: s.total_net,      color: 'var(--info)'      },
    { label: 'Transacções', value: s.total_transactions, color: 'var(--warm-200)', isCount: true },
  ]
  return (
    <div className="merch-body animate-in">
      <div className="merch-stats">
        {cards.map((c, i) => (
          <div key={i} className={`stat-card animate-in stagger-${i + 1}`}>
            <span className="stat-label">{c.label}</span>
            <span className="stat-value amount" style={{ color: c.color }}>
              {c.isCount
                ? c.value.toLocaleString('pt-PT')
                : `${(c.value / 100).toLocaleString('pt-PT')} XOF`}
            </span>
          </div>
        ))}
      </div>

      <div>
        <p className="input-label" style={{ marginBottom: 10 }}>Últimas vendas</p>
        {dashboard.recent_transactions.length === 0 ? (
          <div className="empty-state" style={{ padding: '28px 0' }}>
            <span className="empty-icon">🏪</span>
            <p className="empty-title">Sem vendas ainda</p>
            <p className="empty-subtitle">Partilhe o seu QR Code para receber.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {dashboard.recent_transactions.map(tx => (
              <div key={tx.id} className="merch-tx">
                <div className="merch-tx-left">
                  <span className="merch-tx-name">{tx.customer_name || 'Cliente'}</span>
                  <span className="merch-tx-time text-xs text-muted">
                    {new Date(tx.created_at).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className="merch-tx-amount amount text-green">
                  +{(tx.net_amount / 100).toLocaleString('pt-PT')} XOF
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="input-label" style={{ marginBottom: 10 }}>Vendas (7 dias)</p>
        {dashboard.daily_chart.length === 0 ? (
          <p className="text-muted text-sm">Sem dados para exibir.</p>
        ) : (
          <div className="mini-chart">
            {dashboard.daily_chart.slice(0, 7).reverse().map(d => {
              const max = Math.max(...dashboard.daily_chart.map(x => parseInt(x.gross) || 0))
              const pct = max > 0 ? (parseInt(d.gross) / max) * 100 : 0
              return (
                <div key={d.day} className="chart-bar-wrap">
                  <div className="chart-bar" style={{ height: `${Math.max(pct, 4)}%` }} title={`${(parseInt(d.gross) / 100).toLocaleString('pt-PT')} XOF`} />
                  <span className="chart-label">
                    {new Date(d.day).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function MerchantQR({ merchant, toast }) {
  const [staticQR,  setStaticQR]  = useState(null)
  const [showDynamic, setShowDynamic] = useState(false)
  const [dynAmount, setDynAmount] = useState('')
  const [dynDesc,   setDynDesc]   = useState('')
  const [dynResult, setDynResult] = useState(null)
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    merchantAPI.qrStatic()
      .then(r => setStaticQR(r.data))
      .catch(() => {})
  }, [])

  const handleGenerateDynamic = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await merchantAPI.qrDynamic({
        amount:      Math.round(parseFloat(dynAmount) * 100),
        description: dynDesc || undefined,
        expires_in_minutes: 30,
      })
      setDynResult(res.data)
      toast.success('QR dinâmico gerado!')
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const copyShortCode = (code) => {
    navigator.clipboard?.writeText(code)
    toast.info(`Código copiado: ${code}`)
  }

  return (
    <div className="merch-body animate-in">
      {/* QR ESTÁTICO */}
      <div className="qr-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h3 className="qr-section-title">QR Estático</h3>
            <p className="text-muted text-xs">Permanente — cliente define o valor</p>
          </div>
          <span className="badge badge-success">Ativo</span>
        </div>
        {staticQR ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div className="qr-wrap">
              {staticQR.qr_image ? (
                <img src={staticQR.qr_image} alt="QR Code" width={200} height={200} />
              ) : (
                <QRCodeSVG value={staticQR.qr_payload || merchant.static_short_code} size={200} level="M" />
              )}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => copyShortCode(staticQR.short_code)}>
              <CopyIcon /> {staticQR.short_code}
            </button>
          </div>
        ) : (
          <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
        )}
      </div>

      {/* QR DINÂMICO */}
      <div className="qr-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h3 className="qr-section-title">QR Dinâmico</h3>
            <p className="text-muted text-xs">Valor fixo, válido por 30 min</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowDynamic(v => !v)}>
            <QRIcon /> Gerar
          </button>
        </div>

        {showDynamic && (
          <form onSubmit={handleGenerateDynamic} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="input-group">
              <label className="input-label">Valor (XOF)</label>
              <div className="amount-input-wrap">
                <span className="amount-prefix">XOF</span>
                <input className="input amount-input" type="number" placeholder="0"
                  value={dynAmount} onChange={e => setDynAmount(e.target.value)} min="1" required />
              </div>
            </div>
            <div className="input-group">
              <label className="input-label">Descrição (opcional)</label>
              <input className="input" type="text" placeholder="Ex: Produto X"
                value={dynDesc} onChange={e => setDynDesc(e.target.value)} maxLength={200} />
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Gerar QR Code'}
            </button>
          </form>
        )}

        {dynResult && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <div className="qr-wrap">
              <img src={dynResult.qr_image} alt="QR Dinâmico" width={200} height={200} />
            </div>
            <p className="text-sm" style={{ color: 'var(--warm-200)' }}>
              Valor: <strong className="text-green amount">{(dynResult.amount / 100).toLocaleString('pt-PT')} XOF</strong>
            </p>
            <p className="text-xs text-muted">
              Expira: {new Date(dynResult.expires_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <button className="btn btn-ghost btn-sm" onClick={() => setDynResult(null)}>Gerar outro</button>
          </div>
        )}
      </div>
    </div>
  )
}

function MerchantTransactions() {
  const [txs,     setTxs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(1)
  const [total,   setTotal]   = useState(0)

  useEffect(() => {
    merchantAPI.transactions({ page, limit: 20 })
      .then(r => { setTxs(r.data.transactions); setTotal(r.data.total) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page])

  return (
    <div className="merch-body animate-in">
      {loading ? (
        Array(5).fill(0).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 58, borderRadius: 10 }} />
        ))
      ) : txs.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">💳</span>
          <p className="empty-title">Sem transacções</p>
        </div>
      ) : (
        <>
          {txs.map(tx => (
            <div key={tx.id} className="merch-tx animate-in">
              <div className="merch-tx-left">
                <span className="merch-tx-name">{tx.customer_name || 'Cliente'}</span>
                <span className="text-xs text-muted">{tx.reference} · {tx.customer_phone}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="merch-tx-amount amount text-green">
                  +{(tx.net_amount / 100).toLocaleString('pt-PT')} XOF
                </div>
                <div className="text-xs text-muted">
                  {new Date(tx.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
                </div>
              </div>
            </div>
          ))}
          {total > 20 && (
            <div className="pagination">
              <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
              <span className="text-muted text-sm">Página {page}</span>
              <button className="btn btn-ghost btn-sm" disabled={txs.length < 20} onClick={() => setPage(p => p + 1)}>Próxima →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Página de Registo de Comerciante ────────────────────────
export function MerchantRegister() {
  const toast    = useToast()
  const navigate = useNavigate()
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState('retail')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await merchantAPI.register({ business_name: businessName, business_type: businessType })
      toast.success('Negócio registado! Bem-vindo, comerciante.')
      navigate('/merchant')
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="form-page">
      <PageHeader title="Registar negócio" subtitle="Comece a aceitar pagamentos QR" />
      <form className="form-body animate-in" onSubmit={handleSubmit}>
        <div className="info-banner">
          🏪 Ao registar o seu negócio, receberá um QR Code estático permanente
          e acesso ao dashboard de vendas.
        </div>

        <div className="input-group">
          <label className="input-label">Nome do negócio</label>
          <input className="input" type="text" placeholder="Ex: Mercado Central Bissau"
            value={businessName} onChange={e => setBusinessName(e.target.value)} required />
        </div>

        <div className="input-group">
          <label className="input-label">Tipo de negócio</label>
          <select className="input" value={businessType} onChange={e => setBusinessType(e.target.value)}>
            <option value="retail">Comércio retalhista</option>
            <option value="restaurant">Restaurante / Bar</option>
            <option value="services">Serviços</option>
            <option value="transport">Transporte</option>
            <option value="health">Saúde</option>
            <option value="education">Educação</option>
            <option value="other">Outro</option>
          </select>
        </div>

        <div className="spacer" />
        <button type="submit" className="btn btn-gold btn-lg w-full" disabled={loading || !businessName}>
          {loading ? <span className="spinner" /> : 'Registar negócio →'}
        </button>
      </form>
    </div>
  )
}
