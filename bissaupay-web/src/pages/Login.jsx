// src/pages/Login.jsx
import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { authAPI } from '../services/api'
import { useAuth }  from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { BissauPayLogo } from '../components/Layout'
import './Login.css'

const STEP = { PHONE: 'phone', OTP: 'otp', REG_NAME: 'reg_name', REG_PIN: 'reg_pin', REG_OTP: 'reg_otp', RESET: 'reset' }

export default function Login() {
  const { isAuthenticated, login } = useAuth()
  const toast    = useToast()
  const navigate = useNavigate()

  const [step,    setStep]    = useState(STEP.PHONE)
  const [mode,    setMode]    = useState('login')  // login | register
  const [loading, setLoading] = useState(false)

  const [phone,    setPhone]    = useState('')
  const [pin,      setPin]      = useState('')
  const [fullName, setFullName] = useState('')
  const [otp,      setOtp]      = useState('')

  if (isAuthenticated) return <Navigate to="/" replace />

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authAPI.login({ phone, pin })
      toast.success('Código enviado por SMS')
      setStep(STEP.OTP)
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    if (pin.length < 4) return toast.error('PIN deve ter pelo menos 4 dígitos')
    setLoading(true)
    try {
      await authAPI.register({ phone, pin, full_name: fullName })
      toast.success('Código enviado por SMS')
      setStep(STEP.REG_OTP)
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const handleVerifyOTP = async (e) => {
    e.preventDefault()
    if (otp.length < 6) return toast.error('Código deve ter 6 dígitos')
    setLoading(true)
    const purpose = step === STEP.REG_OTP ? 'register' : 'login'
    try {
      const res = await authAPI.verifyOTP({ phone, code: otp, purpose })
      login(res.token, res.user)
      toast.success(`Bem-vindo${purpose === 'register' ? ', ' + fullName.split(' ')[0] : ''}! 👋`)
      navigate('/')
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const handleResend = async () => {
    try {
      const purpose = step === STEP.REG_OTP ? 'register' : 'login'
      await authAPI.resendOTP({ phone, purpose })
      toast.info('Novo código enviado')
    } catch (err) { toast.error(err.message) }
  }

  const isOTPStep = step === STEP.OTP || step === STEP.REG_OTP

  return (
    <div className="login-page geo-pattern">
      <div className="login-bg-orb login-bg-orb-1" />
      <div className="login-bg-orb login-bg-orb-2" />

      <div className="login-container">
        <div className="login-hero animate-in">
          <BissauPayLogo animated />
          <p className="login-tagline">
            Dinheiro sem fronteiras,<br />
            <em>para a Guiné-Bissau</em>
          </p>
        </div>

        {/* OTP */}
        {isOTPStep && (
          <div className="login-card animate-in-scale">
            <div className="otp-icon-wrap">✉</div>
            <div className="text-center">
              <h2 className="login-card-title">Verificar código</h2>
              <p className="text-muted text-sm" style={{ marginTop: 4 }}>
                Enviámos 6 dígitos para <strong style={{ color: 'var(--warm-100)' }}>{phone}</strong>
              </p>
            </div>
            <form onSubmit={handleVerifyOTP} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <OTPInput value={otp} onChange={setOtp} />
              <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading || otp.length < 6}>
                {loading ? <span className="spinner" /> : 'Confirmar →'}
              </button>
            </form>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <button className="login-link" onClick={handleResend}>Reenviar código</button>
              <button className="login-link-muted" onClick={() => { setStep(STEP.PHONE); setOtp('') }}>
                ← Usar outro número
              </button>
            </div>
          </div>
        )}

        {/* LOGIN */}
        {!isOTPStep && mode === 'login' && (
          <div className="login-card animate-in-scale">
            <h2 className="login-card-title">Entrar na conta</h2>
            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="input-group">
                <label className="input-label">Número de telefone</label>
                <div className="input-wrap">
                  <span className="input-prefix-icon">🇬🇼</span>
                  <input className="input" type="tel" placeholder="+245 9XX XXX XXX"
                    value={phone} onChange={e => setPhone(cleanPhone(e.target.value))} required />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">PIN</label>
                <input className="input" type="password" placeholder="••••••"
                  maxLength={6} inputMode="numeric"
                  value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} required />
              </div>
              <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
                {loading ? <span className="spinner" /> : 'Entrar →'}
              </button>
            </form>
            <div className="login-footer-links">
              <button className="login-link-muted" onClick={() => { setMode('login'); setStep(STEP.RESET) }}>
                Esqueci o PIN
              </button>
              <span className="text-muted text-xs">·</span>
              <button className="login-link" onClick={() => setMode('register')}>
                Criar conta
              </button>
            </div>
          </div>
        )}

        {/* REGISTER */}
        {!isOTPStep && mode === 'register' && (
          <div className="login-card animate-in-scale">
            <h2 className="login-card-title">Criar conta</h2>
            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="input-group">
                <label className="input-label">Nome completo</label>
                <input className="input" type="text" placeholder="O seu nome completo"
                  value={fullName} onChange={e => setFullName(e.target.value)} required />
              </div>
              <div className="input-group">
                <label className="input-label">Número de telefone</label>
                <div className="input-wrap">
                  <span className="input-prefix-icon">🇬🇼</span>
                  <input className="input" type="tel" placeholder="+245 9XX XXX XXX"
                    value={phone} onChange={e => setPhone(cleanPhone(e.target.value))} required />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Criar PIN (4–6 dígitos)</label>
                <input className="input" type="password" placeholder="••••••"
                  maxLength={6} inputMode="numeric"
                  value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} required />
              </div>
              <button type="submit" className="btn btn-gold btn-lg w-full" disabled={loading}>
                {loading ? <span className="spinner" /> : 'Criar conta →'}
              </button>
            </form>
            <div style={{ textAlign: 'center' }}>
              <button className="login-link-muted" onClick={() => setMode('login')}>
                Já tenho conta → Entrar
              </button>
            </div>
          </div>
        )}

        {/* RESET PIN */}
        {!isOTPStep && mode === 'login' && step === STEP.RESET && (
          <ResetPinCard phone={phone} setPhone={setPhone} onBack={() => setStep(STEP.PHONE)} />
        )}

        <p className="login-legal">
          Ao continuar, aceita os{' '}
          <a href="#terms" style={{ color: 'var(--green-400)' }}>Termos de Uso</a>
          {' '}e a{' '}
          <a href="#privacy" style={{ color: 'var(--green-400)' }}>Política de Privacidade</a>
        </p>
      </div>
    </div>
  )
}

const cleanPhone = (value) => value.replace(/[^\d+]/g, '').replace(/^(\+?)(.*)/, (_, p, n) => p + n.replace(/\+/g, ''))

function ResetPinCard({ phone, setPhone, onBack }) {
  const toast    = useToast()
  const [step,    setStep]    = useState('phone')
  const [otp,     setOtp]     = useState('')
  const [newPin,  setNewPin]  = useState('')
  const [loading, setLoading] = useState(false)

  const requestReset = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authAPI.requestResetPin({ phone })
      toast.success('Código de redefinição enviado')
      setStep('otp')
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const confirmReset = async (e) => {
    e.preventDefault()
    if (newPin.length < 4) return toast.error('PIN deve ter pelo menos 4 dígitos')
    setLoading(true)
    try {
      await authAPI.confirmResetPin({ phone, code: otp, new_pin: newPin })
      toast.success('PIN redefinido! Faça login.')
      onBack()
    } catch (err) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="login-card animate-in-scale">
      <h2 className="login-card-title">Redefinir PIN</h2>
      {step === 'phone' ? (
        <form onSubmit={requestReset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="input-group">
            <label className="input-label">Número de telefone</label>
            <div className="input-wrap">
              <span className="input-prefix-icon">🇬🇼</span>
              <input className="input" type="tel" placeholder="+245 9XX XXX XXX"
                value={phone} onChange={e => setPhone(cleanPhone(e.target.value))} required />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
            {loading ? <span className="spinner" /> : 'Enviar código'}
          </button>
        </form>
      ) : (
        <form onSubmit={confirmReset} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <OTPInput value={otp} onChange={setOtp} />
          <div className="input-group">
            <label className="input-label">Novo PIN (4–6 dígitos)</label>
            <input className="input" type="password" placeholder="••••••"
              maxLength={6} inputMode="numeric"
              value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} required />
          </div>
          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
            {loading ? <span className="spinner" /> : 'Confirmar novo PIN'}
          </button>
        </form>
      )}
      <button className="login-link-muted" onClick={onBack}>← Voltar ao login</button>
    </div>
  )
}

function OTPInput({ value, onChange }) {
  const digits = Array(6).fill('').map((_, i) => value[i] || '')

  const handleChange = (e, idx) => {
    const char = e.target.value.replace(/\D/g, '').slice(-1)
    const arr  = value.split('')
    arr[idx]   = char
    onChange(arr.join('').slice(0, 6))
    if (char && idx < 5) document.getElementById(`otp-${idx + 1}`)?.focus()
  }
  const handleKeyDown = (e, idx) => {
    if (e.key === 'Backspace' && !value[idx] && idx > 0) {
      document.getElementById(`otp-${idx - 1}`)?.focus()
    }
    if (e.key === 'ArrowLeft'  && idx > 0) document.getElementById(`otp-${idx - 1}`)?.focus()
    if (e.key === 'ArrowRight' && idx < 5) document.getElementById(`otp-${idx + 1}`)?.focus()
  }
  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    onChange(pasted)
    const lastIdx = Math.min(pasted.length, 5)
    document.getElementById(`otp-${lastIdx}`)?.focus()
  }

  return (
    <div className="otp-row">
      {digits.map((d, i) => (
        <input key={i} id={`otp-${i}`} className="otp-cell"
          type="text" inputMode="numeric" maxLength={1}
          value={d} autoComplete="one-time-code"
          onChange={e => handleChange(e, i)}
          onKeyDown={e => handleKeyDown(e, i)}
          onPaste={i === 0 ? handlePaste : undefined}
        />
      ))}
    </div>
  )
}
