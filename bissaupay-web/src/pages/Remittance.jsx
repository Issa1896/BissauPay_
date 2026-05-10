// src/pages/Remittance.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { remittanceAPI } from '../services/api'
import { useToast }       from '../hooks/useToast'
import { PageHeader, ConfirmRow, CheckIcon, AlertIcon } from '../components/Layout'
import './Forms.css'

const FLAGS   = { PT:'🇵🇹', SN:'🇸🇳', BR:'🇧🇷', FR:'🇫🇷', GW:'🇬🇼', US:'🇺🇸' }
const NAMES   = { PT:'Portugal', SN:'Senegal', BR:'Brasil', FR:'França', GW:'Guiné-Bissau', US:'EUA' }
const METHODS = { bank_transfer:'🏦 Transferência bancária', mobile_wallet:'📱 Carteira móvel', cash_pickup:'💵 Levantamento' }
const PURPOSES = [
  { value:'family_support', label:'Apoio familiar' },
  { value:'education',      label:'Educação' },
  { value:'medical',        label:'Saúde' },
  { value:'business',       label:'Negócios' },
  { value:'savings',        label:'Poupança' },
  { value:'other',          label:'Outro' },
]

export default function Remittance() {
  const toast    = useToast()
  const navigate = useNavigate()

  const [step,      setStep]      = useState('corridor')
  const [corridors, setCorridors] = useState([])
  const [selected,  setSelected]  = useState(null)
  const [quote,     setQuote]     = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState(null)

  const [sendAmount,     setSendAmount]     = useState('')
  const [deliveryMethod, setDeliveryMethod] = useState('')
  const [recipientName,  setRecipientName]  = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [iban,           setIban]           = useState('')
  const [purpose,        setPurpose]        = useState('family_support')

  useEffect(() => {
    remittanceAPI.corridors({ direction: 'outbound' })
      .then(r => setCorridors(r.data?.corridors?.outbound || []))
      .catch(() => {})
  }, [])

  const amountInt = sendAmount ? Math.round(parseFloat(sendAmount) * 100) : 0

  const handleSelectCorridor = (c) => {
    setSelected(c)
    setDeliveryMethod(c.delivery_methods?.[0] || 'bank_transfer')
    setStep('form')
  }

  const handleGetQuote = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await remittanceAPI.quote({ corridor_id: selected.id, send_amount: amountInt })
      setQuote(res.data)
      setStep('quote')
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const handleSend = async () => {
    setLoading(true)
    try {
      const delivery_details = deliveryMethod === 'bank_transfer'
        ? { iban: iban.replace(/\s/g, ''), bic: '' }
        : { phone: recipientPhone, provider: 'wave' }

      const res = await remittanceAPI.send({
        corridor_id:      selected.id,
        send_amount:      amountInt,
        delivery_method:  deliveryMethod,
        recipient_name:   recipientName,
        recipient_phone:  recipientPhone || undefined,
        recipient_country: selected.dest_country,
        delivery_details,
        purpose,
      })

      if (res.success) {
        setResult(res.data)
        setStep('done')
        toast.success('Remessa enviada!')
      } else {
        toast.error(res.error)
        if (res.refunded) toast.info('Saldo reembolsado automaticamente')
        setStep('form')
      }
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const resetFlow = () => { setStep('corridor'); setSelected(null); setQuote(null); setSendAmount('') }

  return (
    <div className="form-page">
      <PageHeader title="Remessas" subtitle="Enviar dinheiro para o exterior" />

      {/* ── ESCOLHER CORREDOR ──────────────────────── */}
      {step === 'corridor' && (
        <div className="form-body animate-in">
          <p className="text-muted text-sm">Escolha o país de destino:</p>
          {corridors.length === 0 ? (
            Array(4).fill(0).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 72, borderRadius: 14 }} />
            ))
          ) : (
            corridors.map(c => (
              <button key={c.id} className="corridor-card" onClick={() => handleSelectCorridor(c)}>
                <span className="corridor-flag">{FLAGS[c.dest_country] || '🌍'}</span>
                <div className="corridor-info">
                  <span className="corridor-name">{NAMES[c.dest_country] || c.dest_country}</span>
                  <span className="corridor-sub">
                    {c.origin_currency} → {c.dest_currency} · Taxa: {(c.fee_rate * 100).toFixed(1)}%
                  </span>
                </div>
                <span style={{ color: 'var(--warm-500)' }}>→</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* ── FORMULÁRIO ──────────────────────────────── */}
      {step === 'form' && selected && (
        <form className="form-body animate-in" onSubmit={handleGetQuote}>
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
            onClick={() => setStep('corridor')}>← Voltar</button>

          <div className="corridor-card" style={{ cursor: 'default' }}>
            <span className="corridor-flag">{FLAGS[selected.dest_country]}</span>
            <div className="corridor-info">
              <span className="corridor-name">{NAMES[selected.dest_country]}</span>
              <span className="corridor-sub">{selected.origin_currency} → {selected.dest_currency}</span>
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Valor a enviar (XOF)</label>
            <div className="amount-input-wrap">
              <span className="amount-prefix">XOF</span>
              <input className="input amount-input" type="number" placeholder="0"
                value={sendAmount} onChange={e => setSendAmount(e.target.value)}
                min={selected.min_amount ? selected.min_amount / 100 : 1} required />
            </div>
          </div>

          <div className="presets-row">
            {[50000,100000,250000,500000].map(v => (
              <button key={v} type="button"
                className={`preset-btn ${amountInt === v ? 'active' : ''}`}
                onClick={() => setSendAmount(String(v / 100))}>
                {(v / 100).toLocaleString('pt-PT')}
              </button>
            ))}
          </div>

          <div className="input-group">
            <label className="input-label">Método de entrega</label>
            <select className="input" value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)}>
              {(selected.delivery_methods || []).map(m => (
                <option key={m} value={m}>{METHODS[m] || m}</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">Nome do destinatário</label>
            <input className="input" type="text" placeholder="Nome completo"
              value={recipientName} onChange={e => setRecipientName(e.target.value)} required />
          </div>

          {deliveryMethod === 'mobile_wallet' && (
            <div className="input-group">
              <label className="input-label">Número de telefone</label>
              <input className="input" type="tel" placeholder="+XX XXX..."
                value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)} required />
            </div>
          )}

          {deliveryMethod === 'bank_transfer' && (
            <div className="input-group">
              <label className="input-label">IBAN</label>
              <input className="input" type="text" placeholder="PT50 XXXX XXXX XXXX XXXX XXXX X"
                value={iban} onChange={e => setIban(e.target.value.toUpperCase())} required />
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Finalidade</label>
            <select className="input" value={purpose} onChange={e => setPurpose(e.target.value)}>
              {PURPOSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div className="spacer" />
          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading || amountInt < 100}>
            {loading ? <span className="spinner" /> : 'Ver cotação →'}
          </button>
        </form>
      )}

      {/* ── COTAÇÃO ─────────────────────────────────── */}
      {step === 'quote' && quote && (
        <div className="form-body animate-in">
          <div className="quote-card">
            <div className="quote-exchange">
              <div className="quote-block">
                <div className="quote-currency">{quote.corridor?.origin_currency}</div>
                <div className="quote-amount">{(quote.send_amount / 100).toLocaleString('pt-PT')}</div>
                <div className="text-xs text-muted" style={{ marginTop: 4 }}>você envia</div>
              </div>
              <div className="quote-arrow">→</div>
              <div className="quote-block">
                <div className="quote-currency">{quote.corridor?.dest_currency}</div>
                <div className="quote-amount receive">
                  {(quote.receive_amount / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs" style={{ marginTop: 4, color: 'var(--green-400)' }}>destinatário recebe</div>
              </div>
            </div>
            <div className="quote-rate">
              <span className="text-xs text-muted">Taxa:</span>
              <span className="text-xs font-mono" style={{ color: 'var(--warm-200)' }}>
                1 {quote.corridor?.origin_currency} = {quote.exchange_rate?.toFixed(6)} {quote.corridor?.dest_currency}
              </span>
              <span className="badge badge-info" style={{ fontSize: '.65rem' }}>{quote.rate_source}</span>
            </div>
          </div>

          <div className="confirm-details">
            <ConfirmRow label="Valor enviado"  value={`${(quote.send_amount / 100).toLocaleString('pt-PT')} XOF`} />
            <ConfirmRow label="Taxa BissauPay" value={quote.fee_display || `${(quote.fee_amount / 100)} XOF`} />
            <ConfirmRow label="Método"         value={METHODS[deliveryMethod] || deliveryMethod} />
            <ConfirmRow label="Destinatário"   value={recipientName} />
            <ConfirmRow label="Prazo"          value={quote.estimated_delivery?.label || 'Até 2 dias úteis'} />
            <ConfirmRow label="Recebe"
              value={`${(quote.receive_amount / 100).toFixed(2)} ${quote.corridor?.dest_currency}`}
              highlight large />
          </div>

          {quote.kyc_required && (
            <div className="warn-banner" style={{ fontSize: '.8rem' }}>
              🪪 Este valor requer verificação de identidade (KYC).{' '}
              <a href="/kyc" style={{ color: 'var(--gold-400)', fontWeight: 600 }}>Verificar agora</a>
            </div>
          )}
          {!quote.has_sufficient_balance && (
            <div className="warn-banner" style={{ fontSize: '.8rem' }}>
              <AlertIcon /> Saldo insuficiente para esta operação
            </div>
          )}

          <div className="confirm-actions">
            <button className="btn btn-ghost" onClick={() => setStep('form')}>← Editar</button>
            <button className="btn btn-gold btn-lg"
              onClick={handleSend}
              disabled={loading || quote.kyc_required || !quote.has_sufficient_balance}>
              {loading ? <span className="spinner" /> : 'Enviar ✈'}
            </button>
          </div>
        </div>
      )}

      {/* ── SUCESSO ─────────────────────────────────── */}
      {step === 'done' && result && (
        <div className="result-card animate-in-scale">
          <div className="result-icon result-icon-success"><CheckIcon /></div>
          <h2 className="result-title">Remessa enviada! ✈</h2>
          <p className="result-ref">Ref: {result.reference}</p>

          <div className="confirm-details" style={{ width: '100%' }}>
            <ConfirmRow label="Para"     value={result.recipient_name} />
            <ConfirmRow label="País"     value={`${FLAGS[result.dest_country] || ''} ${NAMES[result.dest_country] || result.dest_country}`} />
            <ConfirmRow label="Enviado"  value={`${(result.send_amount / 100).toLocaleString('pt-PT')} ${result.send_currency}`} />
            <ConfirmRow label="Recebe"   value={`${(result.receive_amount / 100).toFixed(2)} ${result.receive_currency}`} highlight large />
            <ConfirmRow label="Estado"   value="Em processamento" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            <button className="btn btn-primary btn-lg w-full" onClick={resetFlow}>Nova remessa</button>
            <button className="btn btn-ghost w-full" onClick={() => navigate('/')}>Voltar ao início</button>
          </div>
        </div>
      )}
    </div>
  )
}
