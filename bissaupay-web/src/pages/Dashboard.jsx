// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { walletAPI } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { EyeIcon, EyeOffIcon, SendIcon, QRIcon, TopupIcon, GlobalIcon, BellIcon, StoreIcon, AlertIcon, RefreshIcon } from '../components/Layout'
import './Dashboard.css'

export default function Dashboard() {
  const { user, isMerchant } = useAuth()
  const [wallet,  setWallet]  = useState(null)
  const [txs,     setTxs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const [walRes, stRes] = await Promise.all([
        walletAPI.balance(),
        walletAPI.statement({ limit: 6 }),
      ])
      setWallet(walRes.wallet)
      setTxs(stRes.data?.transactions || [])
    } catch {}
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { loadData() }, [])

  return (
    <div className="dashboard">
      {/* ── HERO ─────────────────────────────────────────── */}
      <div className="balance-hero geo-pattern">
        <div className="balance-hero-inner">
          <div className="balance-top">
            <div>
              <p className="balance-label">Saldo disponível</p>
              <div className="balance-row">
                {loading ? (
                  <div className="skeleton" style={{ width: 160, height: 48, borderRadius: 8 }} />
                ) : visible ? (
                  <>
                    <span className="balance-currency">XOF</span>
                    <span className="balance-value amount">
                      {wallet ? (wallet.balance / 100).toLocaleString('pt-PT') : '0'}
                    </span>
                  </>
                ) : (
                  <span className="balance-hidden">••••••</span>
                )}
              </div>
              {wallet && !loading && (
                <p className="balance-sub">
                  Limite restante:&nbsp;
                  <span style={{ color: 'var(--gold-400)' }}>
                    {wallet.daily_remaining.toLocaleString('pt-PT')} XOF
                  </span>
                </p>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <button className="balance-btn" onClick={() => setVisible(v => !v)} aria-label="Mostrar/ocultar saldo">
                {visible ? <EyeOffIcon /> : <EyeIcon />}
              </button>
              <button className="balance-btn" onClick={() => loadData(true)} aria-label="Atualizar">
                <span className={refreshing ? 'spin-once' : ''}><RefreshIcon /></span>
              </button>
            </div>
          </div>

          {wallet?.is_frozen && (
            <div className="warn-banner" style={{ marginTop: 12, fontSize: '.8rem' }}>
              <AlertIcon /> Carteira bloqueada — contacte o suporte
            </div>
          )}
        </div>
        <div className="hero-deco" />
      </div>

      {/* ── QUICK ACTIONS ──────────────────────────────── */}
      <section className="quick-actions">
        <QuickAction to="/send"       icon={<SendIcon />}   label="Enviar"   color="var(--green-400)" />
        <QuickAction to="/scan"       icon={<QRIcon />}     label="Pagar QR" color="var(--gold-400)"  />
        <QuickAction to="/topup"      icon={<TopupIcon />}  label="Recarga"  color="var(--info)"      />
        <QuickAction to="/remittance" icon={<GlobalIcon />} label="Remessa"  color="#B388FF"           />
        {isMerchant && (
          <QuickAction to="/merchant" icon={<StoreIcon />} label="Loja" color="var(--gold-300)" />
        )}
      </section>

      {/* ── KYC BANNER ─────────────────────────────────── */}
      {!loading && user?.kyc_status !== 'approved' && (
        <div className="kyc-card animate-in stagger-1">
          <span className="kyc-icon">🪪</span>
          <div className="kyc-text">
            <strong>Verificar identidade</strong>
            <span>Aumente o seu limite diário</span>
          </div>
          <Link to="/kyc" className="btn btn-ghost btn-sm">Verificar</Link>
        </div>
      )}

      {/* ── MERCHANT BANNER ────────────────────────────── */}
      {!loading && !isMerchant && (
        <div className="merchant-card animate-in stagger-2">
          <span style={{ fontSize: '1.5rem' }}>🏪</span>
          <div className="kyc-text">
            <strong style={{ color: 'var(--gold-400)' }}>Aceitar pagamentos</strong>
            <span>Registe o seu negócio e gere QR Codes</span>
          </div>
          <Link to="/merchant/register" className="btn btn-gold btn-sm">Aderir</Link>
        </div>
      )}

      {/* ── TRANSAÇÕES ─────────────────────────────────── */}
      <section className="dashboard-section animate-in stagger-3">
        <div className="section-header">
          <h2 className="section-title">Últimas movimentações</h2>
          <Link to="/history" className="section-link text-sm">Ver todas →</Link>
        </div>

        {loading ? (
          <div className="tx-list">
            {[1,2,3].map(i => <TxSkeleton key={i} />)}
          </div>
        ) : txs.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">💳</span>
            <p className="empty-title">Sem movimentações</p>
            <p className="empty-subtitle">As suas transferências e pagamentos<br />aparecerão aqui.</p>
          </div>
        ) : (
          <div className="tx-list">
            {txs.map((tx, i) => <TxItem key={tx.id} tx={tx} index={i} />)}
          </div>
        )}
      </section>
    </div>
  )
}

function QuickAction({ to, icon, label, color }) {
  return (
    <Link to={to} className="quick-action" style={{ '--qa-color': color }}>
      <div className="qa-icon">{icon}</div>
      <span className="qa-label">{label}</span>
    </Link>
  )
}

export function TxItem({ tx, index = 0 }) {
  const isCredit = tx.direction === 'credit'
  const amount   = Math.abs(tx.amount_signed ?? tx.amount)
  const sign     = isCredit ? '+' : '-'
  const counterpart = isCredit
    ? (tx.sender_name || 'Crédito')
    : (tx.receiver_name || tx.description || 'Débito')

  const TYPE_LABELS = {
    transfer:       'Transferência',
    payment:        'Pagamento',
    topup:          'Recarga',
    remittance_out: 'Remessa enviada',
    remittance_in:  'Remessa recebida',
    deposit:        'Depósito',
    reversal:       'Estorno',
  }

  return (
    <div className={`tx-item animate-in stagger-${Math.min(index + 1, 4)}`}>
      <div className="tx-icon" style={{ background: isCredit ? 'rgba(82,183,136,.12)' : 'rgba(255,255,255,.05)' }}>
        <span>{isCredit ? '↙' : '↗'}</span>
      </div>
      <div className="tx-info">
        <span className="tx-name">{counterpart}</span>
        <span className="tx-type">{tx.description || TYPE_LABELS[tx.type] || tx.type}</span>
      </div>
      <div className="tx-right">
        <span className="tx-amount amount" style={{ color: isCredit ? 'var(--green-400)' : 'var(--warm-100)' }}>
          {sign}{(amount / 100).toLocaleString('pt-PT')}
        </span>
        <span className="tx-date">
          {new Date(tx.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}
        </span>
      </div>
    </div>
  )
}

export function TxSkeleton() {
  return (
    <div className="tx-item">
      <div className="skeleton" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div className="skeleton" style={{ width: '58%', height: 13 }} />
        <div className="skeleton" style={{ width: '38%', height: 11 }} />
      </div>
      <div className="skeleton" style={{ width: 68, height: 14 }} />
    </div>
  )
}
