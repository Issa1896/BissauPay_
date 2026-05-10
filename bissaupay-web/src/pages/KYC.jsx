// src/pages/KYC.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { kycAPI } from '../services/api'
import { useToast } from '../hooks/useToast'
import { PageHeader, CheckIcon, ShieldIcon } from '../components/Layout'
import './Forms.css'

const DOC_TYPES = [
  { value: 'bi',             label: 'Bilhete de Identidade' },
  { value: 'passport',       label: 'Passaporte' },
  { value: 'residence',      label: 'Título de Residência' },
  { value: 'driving_license', label: 'Carta de Condução' },
]

const STATUS_CONFIG = {
  none:     { color: 'var(--warm-400)', label: 'Não iniciado',  badge: 'badge-neutral' },
  pending:  { color: 'var(--gold-400)', label: 'Em análise',    badge: 'badge-warning' },
  approved: { color: 'var(--green-400)', label: 'Verificado',   badge: 'badge-success' },
  rejected: { color: 'var(--error)',    label: 'Rejeitado',     badge: 'badge-error'   },
}

export default function KYC() {
  const toast    = useToast()
  const navigate = useNavigate()
  const [status,  setStatus]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [docType,   setDocType]   = useState('bi')
  const [docNumber, setDocNumber] = useState('')
  const [docUrl,    setDocUrl]    = useState('')
  const [selfieUrl, setSelfieUrl] = useState('')

  useEffect(() => {
    kycAPI.status()
      .then(r => setStatus(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!docUrl || !selfieUrl) return toast.error('Forneça as URLs dos documentos')
    setSubmitting(true)
    try {
      const res = await kycAPI.submit({
        document_type:      docType,
        document_number:    docNumber,
        document_photo_url: docUrl,
        selfie_url:         selfieUrl,
      })
      toast.success('Documentos enviados! Análise em até 24h.')
      setStatus({ ...status, kyc_status: 'pending' })
    } catch (err) { toast.error(err.message) }
    finally { setSubmitting(false) }
  }

  if (loading) return (
    <div className="form-page">
      <div className="form-body animate-in">
        {Array(3).fill(0).map((_, i) => <div key={i} className="skeleton" style={{ height: 70, borderRadius: 12 }} />)}
      </div>
    </div>
  )

  const cfg = STATUS_CONFIG[status?.kyc_status || 'none']

  return (
    <div className="form-page">
      <PageHeader title="Verificação KYC" subtitle="Confirme a sua identidade" />

      <div className="form-body animate-in">
        {/* STATUS CARD */}
        <div className="card" style={{ textAlign: 'center', padding: '24px 20px' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: `${cfg.color}18`, border: `2px solid ${cfg.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '1.6rem', color: cfg.color }}>
            {status?.kyc_status === 'approved' ? <CheckIcon /> : <ShieldIcon />}
          </div>
          <span className={`badge ${cfg.badge}`} style={{ marginBottom: 10 }}>{cfg.label}</span>
          <p className="text-muted text-sm" style={{ lineHeight: 1.5 }}>
            {status?.kyc_status === 'approved'
              ? 'A sua identidade foi verificada. Limite diário aumentado.'
              : status?.kyc_status === 'pending'
              ? 'Os seus documentos estão em análise. Pode demorar até 24 horas.'
              : status?.kyc_status === 'rejected'
              ? `Verificação rejeitada: ${status.kyc_rejected_reason || 'Documentos inválidos'}. Submeta novamente.`
              : 'Verifique a sua identidade para aumentar os seus limites de transacção.'}
          </p>
        </div>

        {/* BENEFÍCIOS */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="input-label">Benefícios da verificação</p>
          {[
            ['Limite diário', '500.000 → 2.000.000 XOF'],
            ['Remessas internacionais', 'Valores acima de 500.000 XOF'],
            ['Conta verificada', 'Maior confiança nos pagamentos'],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-sm text-muted">{label}</span>
              <span className="text-sm" style={{ color: 'var(--green-400)', fontWeight: 500 }}>{val}</span>
            </div>
          ))}
        </div>

        {/* FORMULÁRIO — só se não aprovado */}
        {status?.kyc_status !== 'approved' && status?.kyc_status !== 'pending' && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p className="input-label" style={{ fontSize: '.9rem', color: 'var(--warm-200)' }}>
              Submeter documentos
            </p>

            <div className="input-group">
              <label className="input-label">Tipo de documento</label>
              <select className="input" value={docType} onChange={e => setDocType(e.target.value)}>
                {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>

            <div className="input-group">
              <label className="input-label">Número do documento</label>
              <input className="input" type="text" placeholder="Ex: GB123456"
                value={docNumber} onChange={e => setDocNumber(e.target.value)} required />
            </div>

            <div className="input-group">
              <label className="input-label">URL da foto do documento</label>
              <input className="input" type="url" placeholder="https://..."
                value={docUrl} onChange={e => setDocUrl(e.target.value)} required />
              <p className="text-xs text-muted">Faça upload num serviço como Cloudinary ou ImgBB e cole a URL</p>
            </div>

            <div className="input-group">
              <label className="input-label">URL da selfie com documento</label>
              <input className="input" type="url" placeholder="https://..."
                value={selfieUrl} onChange={e => setSelfieUrl(e.target.value)} required />
            </div>

            <div className="info-banner text-sm">
              🔒 Os seus documentos são processados de forma segura e confidencial,
              em conformidade com as normas da BCEAO.
            </div>

            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={submitting}>
              {submitting ? <span className="spinner" /> : 'Submeter documentos'}
            </button>
          </form>
        )}

        {status?.kyc_status === 'approved' && (
          <button className="btn btn-ghost w-full" onClick={() => navigate('/')}>Voltar ao início</button>
        )}
      </div>
    </div>
  )
}
