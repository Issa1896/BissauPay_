// src/pages/Send.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { walletAPI } from '../services/api'
import { useToast }  from '../hooks/useToast'
import { PageHeader, ConfirmRow, CheckIcon } from '../components/Layout'
import './Forms.css'

const PRESETS = [5000, 10000, 25000, 50000, 100000]

export default function Send() {
  const navigate = useNavigate()
  const toast    = useToast()
  const [step,    setStep]    = useState('form')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)

  const [phone,       setPhone]       = useState('')
  const [amount,      setAmount]      = useState('')
  const [description, setDescription] = useState('')

  const amountInt = amount ? Math.round(parseFloat(amount) * 100) : 0
  const fee       = Math.round(amountInt * 0.005)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const res = await walletAPI.transfer({
        receiver_phone: phone,
        amount: amountInt,
        description: description || undefined,
      })
      setResult(res.data)
      setStep('done')
      toast.success('Transferência realizada com sucesso!')
    } catch (err) {
      toast.error(err.message)
    } finally { setLoading(false) }
  }

  return (
    <div className="form-page">
      <PageHeader title="Enviar dinheiro" subtitle="Transferência imediata" />

      {step === 'form' && (
        <form className="form-body animate-in" onSubmit={e => { e.preventDefault(); if (amountInt >= 100) setStep('confirm') }}>
          <div className="input-group">
            <label className="input-label">Número do destinatário</label>
            <div className="input-wrap">
              <span className="input-prefix-icon">📱</span>
              <input className="input" type="tel" placeholder="+245 9XX XXX XXX"
                value={phone} onChange={e => setPhone(e.target.value)} required />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Valor (XOF)</label>
            <div className="amount-input-wrap">
              <span className="amount-prefix">XOF</span>
              <input className="input amount-input" type="number" placeholder="0"
                value={amount} onChange={e => setAmount(e.target.value)}
                min="1" step="1" required />
            </div>
          </div>

          <div className="presets-row">
            {PRESETS.map(v => (
              <button key={v} type="button" className={`preset-btn ${amountInt === v * 100 ? 'active' : ''}`}
                onClick={() => setAmount(String(v))}>
                {v.toLocaleString('pt-PT')}
              </button>
            ))}
          </div>

          <div className="input-group">
            <label className="input-label">Descrição (opcional)</label>
            <input className="input" type="text" placeholder="Ex: Almoço, renda, ..."
              value={description} onChange={e => setDescription(e.target.value)} maxLength={150} />
          </div>

          <div className="spacer" />
          <button type="submit" className="btn btn-primary btn-lg w-full"
            disabled={!phone || amountInt < 100}>
            Continuar →
          </button>
        </form>
      )}

      {step === 'confirm' && (
        <div className="confirm-card animate-in-scale">
          <div className="confirm-icon-wrap" style={{ background: 'rgba(82,183,136,.1)', borderColor: 'var(--border-bright)' }}>
            <span style={{ fontSize: '1.6rem' }}>↗</span>
          </div>
          <h2 className="confirm-title">Confirmar transferência</h2>

          <div className="confirm-details">
            <ConfirmRow label="Para"        value={phone} />
            <ConfirmRow label="Valor"       value={`${parseFloat(amount).toLocaleString('pt-PT')} XOF`} highlight large />
            <ConfirmRow label="Taxa (0.5%)" value={`${(fee / 100).toFixed(0)} XOF`} />
            <ConfirmRow label="Total debitado" value={`${((amountInt + fee) / 100).toLocaleString('pt-PT')} XOF`} />
            {description && <ConfirmRow label="Descrição" value={description} />}
          </div>

          <div className="confirm-actions">
            <button className="btn btn-ghost" onClick={() => setStep('form')}>← Editar</button>
            <button className="btn btn-primary btn-lg" onClick={handleConfirm} disabled={loading}>
              {loading ? <span className="spinner" /> : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="result-card animate-in-scale">
          <div className="result-icon result-icon-success"><CheckIcon /></div>
          <h2 className="result-title">Transferência enviada!</h2>
          <p className="result-ref">Ref: {result.reference}</p>

          <div className="confirm-details" style={{ width: '100%' }}>
            <ConfirmRow label="Para"  value={result.receiver?.name || phone} />
            <ConfirmRow label="Valor" value={`${(result.amount / 100).toLocaleString('pt-PT')} XOF`} highlight large />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            <button className="btn btn-primary btn-lg w-full" onClick={() => { setStep('form'); setPhone(''); setAmount(''); setDescription('') }}>
              Nova transferência
            </button>
            <button className="btn btn-ghost w-full" onClick={() => navigate('/')}>Voltar ao início</button>
          </div>
        </div>
      )}
    </div>
  )
}
