// src/pages/Topup.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { topupAPI } from '../services/api'
import { useToast }  from '../hooks/useToast'
import { PageHeader, ConfirmRow, CheckIcon, AlertIcon } from '../components/Layout'
import './Forms.css'

const CAT_LABELS = {
  mobile_credit: { label: '📱 Crédito de voz',    emoji: '📱' },
  mobile_data:   { label: '🌐 Pacote de dados',    emoji: '🌐' },
  electricity:   { label: '⚡ Energia eléctrica',  emoji: '⚡' },
  water:         { label: '💧 Água',               emoji: '💧' },
}

export default function Topup() {
  const toast    = useToast()
  const navigate = useNavigate()

  const [providers, setProviders] = useState(null)
  const [selected,  setSelected]  = useState(null)
  const [step,      setStep]      = useState('list')
  const [loading,   setLoading]   = useState(false)
  const [preview,   setPreview]   = useState(null)
  const [result,    setResult]    = useState(null)

  const [amount,    setAmount]    = useState('')
  const [recipient, setRecipient] = useState('')

  useEffect(() => {
    topupAPI.providers()
      .then(r => setProviders(r.data?.providers || {}))
      .catch(() => setProviders({}))
  }, [])

  const amountInt = amount ? Math.round(parseFloat(amount) * 100) : 0

  const handlePreview = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await topupAPI.preview({ provider_id: selected.id, amount: amountInt, recipient })
      setPreview(res.data)
      setStep('confirm')
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const handleExecute = async () => {
    setLoading(true)
    try {
      const res = await topupAPI.execute({ provider_id: selected.id, amount: amountInt, recipient })
      if (res.success) { setResult(res.data); setStep('done'); toast.success('Recarga realizada!') }
      else {
        toast.error(res.error || 'Recarga falhou')
        if (res.refunded) toast.info('Saldo reembolsado automaticamente')
        setStep('form')
      }
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const resetFlow = () => { setStep('list'); setSelected(null); setAmount(''); setRecipient(''); setPreview(null) }

  return (
    <div className="form-page">
      <PageHeader title="Recargas & Utilitários" subtitle="Crédito, dados, energia, água" />

      {/* ── LISTA DE PROVEDORES ──────────────────────── */}
      {step === 'list' && (
        <div className="form-body animate-in">
          {!providers ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 68, borderRadius: 12 }} />
            ))
          ) : Object.keys(providers).length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📡</span>
              <p className="empty-title">Sem provedores</p>
              <p className="empty-subtitle">Nenhum provedor disponível no momento.</p>
            </div>
          ) : (
            Object.entries(providers).map(([cat, list]) => (
              <div key={cat}>
                <p className="input-label" style={{ marginBottom: 8 }}>
                  {CAT_LABELS[cat]?.label || cat}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {list.map(p => (
                    <button key={p.id} className="provider-card"
                      onClick={() => { setSelected(p); setStep('form') }}>
                      <div className="provider-icon">{CAT_LABELS[cat]?.emoji || '📡'}</div>
                      <div className="provider-info">
                        <span className="provider-name">{p.name}</span>
                        <span className="provider-sub">{p.recipient_label}</span>
                      </div>
                      <span className="provider-arrow">→</span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── FORMULÁRIO ──────────────────────────────── */}
      {step === 'form' && selected && (
        <form className="form-body animate-in" onSubmit={handlePreview}>
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
            onClick={resetFlow}>← Voltar</button>

          <div className="provider-card selected" style={{ cursor: 'default' }}>
            <div className="provider-icon">{CAT_LABELS[selected.category]?.emoji || '📡'}</div>
            <div className="provider-info">
              <span className="provider-name">{selected.name}</span>
              <span className="provider-sub">{selected.recipient_label}</span>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">{selected.recipient_label}</label>
            <input className="input" type="text"
              placeholder={selected.recipient_type === 'phone' ? '+245 9XX...' : 'Ex: 12345678'}
              value={recipient} onChange={e => setRecipient(e.target.value)} required />
          </div>

          <div className="input-group">
            <label className="input-label">Valor (XOF)</label>
            <div className="amount-input-wrap">
              <span className="amount-prefix">XOF</span>
              <input className="input amount-input" type="number" placeholder="0"
                value={amount} onChange={e => setAmount(e.target.value)}
                min={selected.min_amount ? selected.min_amount / 100 : 1}
                max={selected.max_amount ? selected.max_amount / 100 : undefined}
                required />
            </div>
          </div>

          {selected.preset_amounts?.length > 0 && (
            <div className="presets-row">
              {selected.preset_amounts.map(v => (
                <button key={v} type="button"
                  className={`preset-btn ${amountInt === v ? 'active' : ''}`}
                  onClick={() => setAmount(String(v / 100))}>
                  {(v / 100).toLocaleString('pt-PT')}
                </button>
              ))}
            </div>
          )}

          <div className="spacer" />
          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading || amountInt < 100}>
            {loading ? <span className="spinner" /> : 'Calcular →'}
          </button>
        </form>
      )}

      {/* ── CONFIRMAÇÃO ─────────────────────────────── */}
      {step === 'confirm' && preview && (
        <div className="confirm-card animate-in-scale">
          <div className="confirm-icon-wrap" style={{ background: 'rgba(93,168,208,.1)', borderColor: 'rgba(93,168,208,.3)', color: 'var(--info)' }}>
            <span style={{ fontSize: '1.6rem' }}>{CAT_LABELS[selected?.category]?.emoji}</span>
          </div>
          <h2 className="confirm-title">Confirmar recarga</h2>

          {!preview.has_sufficient_balance && (
            <div className="warn-banner w-full" style={{ fontSize: '.8rem' }}>
              <AlertIcon /> Saldo insuficiente para esta operação
            </div>
          )}

          <div className="confirm-details">
            <ConfirmRow label="Serviço"     value={selected.name} />
            <ConfirmRow label="Destinatário" value={preview.recipient} />
            <ConfirmRow label="Valor"       value={`${preview.amount_xof?.toLocaleString('pt-PT')} XOF`} highlight large />
            <ConfirmRow label="Taxa"        value={`${preview.fee_xof?.toFixed(0)} XOF`} />
            <ConfirmRow label="Total"       value={`${preview.total_xof?.toLocaleString('pt-PT')} XOF`} />
          </div>

          <div className="confirm-actions">
            <button className="btn btn-ghost" onClick={() => setStep('form')}>← Editar</button>
            <button className="btn btn-primary btn-lg" onClick={handleExecute}
              disabled={loading || !preview.has_sufficient_balance}>
              {loading ? <span className="spinner" /> : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {/* ── SUCESSO ─────────────────────────────────── */}
      {step === 'done' && (
        <div className="result-card animate-in-scale">
          <div className="result-icon result-icon-success"><CheckIcon /></div>
          <h2 className="result-title">Recarga realizada!</h2>
          {result?.message && <p className="text-muted text-sm">{result.message}</p>}
          {result?.provider_ref && (
            <p className="result-ref">Ref provedor: {result.provider_ref}</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            <button className="btn btn-primary btn-lg w-full" onClick={resetFlow}>Nova recarga</button>
            <button className="btn btn-ghost w-full" onClick={() => navigate('/')}>Voltar ao início</button>
          </div>
        </div>
      )}
    </div>
  )
}
