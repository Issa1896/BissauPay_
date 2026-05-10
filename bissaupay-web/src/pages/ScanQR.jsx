// src/pages/ScanQR.jsx
// Pagamento via QR — input manual do payload + preview + confirmação
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { paymentAPI } from '../services/api'
import { useToast } from '../hooks/useToast'
import { PageHeader, ConfirmRow, CheckIcon, AlertIcon } from '../components/Layout'
import './Forms.css'

export default function ScanQR() {
  const toast    = useToast()
  const navigate = useNavigate()
  const [step,    setStep]    = useState('input')
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [result,  setResult]  = useState(null)

  const [qrPayload, setQrPayload] = useState('')
  const [manualAmount, setManualAmount] = useState('')

  const handlePreview = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const params = { qr_payload: qrPayload.trim() }
      if (manualAmount) params.amount = Math.round(parseFloat(manualAmount) * 100)
      const res = await paymentAPI.preview(params)
      setPreview(res.data)
      setStep('confirm')
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const handleConfirm = async () => {
    setLoading(true)
    try {
      const res = await paymentAPI.confirm({
        payment_request_id: preview.payment_request_id,
        amount:             preview.amount,
      })
      setResult(res.data)
      setStep('done')
      toast.success('Pagamento realizado!')
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="form-page">
      <PageHeader title="Pagar QR Code" subtitle="Escaneie ou cole o código" />

      {step === 'input' && (
        <form className="form-body animate-in" onSubmit={handlePreview}>
          <div className="info-banner">
            📷 Em produção, esta página terá leitura de câmara. Por agora, cole o payload JSON do QR ou o short code.
          </div>

          <div className="input-group">
            <label className="input-label">Payload do QR Code</label>
            <textarea className="input" rows={4}
              placeholder={'{"app":"bissaupay","v":1,"t":"s","m":"...","c":"BP-XXXXXXXX"}'}
              value={qrPayload} onChange={e => setQrPayload(e.target.value)} required
              style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '.8rem' }} />
          </div>

          <div className="input-group">
            <label className="input-label">Valor (XOF) — para QR estático</label>
            <div className="amount-input-wrap">
              <span className="amount-prefix">XOF</span>
              <input className="input amount-input" type="number" placeholder="0"
                value={manualAmount} onChange={e => setManualAmount(e.target.value)} min="1" />
            </div>
            <p className="text-xs text-muted">Deixe em branco para QR dinâmico (valor já definido)</p>
          </div>

          <div className="spacer" />
          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading || !qrPayload.trim()}>
            {loading ? <span className="spinner" /> : 'Ver detalhes →'}
          </button>
        </form>
      )}

      {step === 'confirm' && preview && (
        <div className="confirm-card animate-in-scale">
          <div className="confirm-icon-wrap" style={{ background: 'rgba(233,168,76,.1)', borderColor: 'rgba(233,168,76,.3)', color: 'var(--gold-400)' }}>
            <span style={{ fontSize: '1.6rem' }}>⬡</span>
          </div>
          <h2 className="confirm-title">Confirmar pagamento</h2>

          {!preview.has_sufficient_balance && (
            <div className="warn-banner w-full" style={{ fontSize: '.8rem' }}>
              <AlertIcon /> Saldo insuficiente para esta operação
            </div>
          )}

          <div className="confirm-details">
            <ConfirmRow label="Para"        value={preview.merchant?.business_name || preview.merchant?.name} />
            <ConfirmRow label="Valor"       value={`${preview.amount_xof?.toLocaleString('pt-PT')} XOF`} highlight large />
            <ConfirmRow label="Taxa loja"   value={`${preview.fee_xof?.toFixed(0)} XOF`} />
            <ConfirmRow label="Tipo de QR"  value={preview.qr_type === 'static' ? 'Estático' : 'Dinâmico'} />
            {preview.description && <ConfirmRow label="Descrição" value={preview.description} />}
          </div>

          <div className="confirm-actions">
            <button className="btn btn-ghost" onClick={() => setStep('input')}>← Editar</button>
            <button className="btn btn-gold btn-lg"
              onClick={handleConfirm}
              disabled={loading || !preview.has_sufficient_balance}>
              {loading ? <span className="spinner" /> : 'Pagar agora'}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="result-card animate-in-scale">
          <div className="result-icon result-icon-success"><CheckIcon /></div>
          <h2 className="result-title">Pagamento efectuado!</h2>
          <p className="result-ref">Ref: {result.reference}</p>

          <div className="confirm-details" style={{ width: '100%' }}>
            <ConfirmRow label="Para"  value={result.merchant_name} />
            <ConfirmRow label="Valor" value={`${result.amount_xof?.toLocaleString('pt-PT')} XOF`} highlight large />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            <button className="btn btn-primary btn-lg w-full"
              onClick={() => { setStep('input'); setQrPayload(''); setManualAmount(''); setPreview(null) }}>
              Novo pagamento
            </button>
            <button className="btn btn-ghost w-full" onClick={() => navigate('/')}>Voltar ao início</button>
          </div>
        </div>
      )}
    </div>
  )
}
