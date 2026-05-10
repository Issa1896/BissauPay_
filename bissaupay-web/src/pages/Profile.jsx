// src/pages/Profile.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { PageHeader, ShieldIcon, CheckIcon, AlertIcon } from '../components/Layout'
import './Forms.css'

const LEVEL_LABELS = { basic: 'Básica', verified: 'Verificada', merchant: 'Comerciante', admin: 'Admin' }
const LEVEL_COLORS = { basic: 'badge-neutral', verified: 'badge-success', merchant: 'badge-warning', admin: 'badge-info' }

export default function Profile() {
  const { user, logout, isVerified, isMerchant } = useAuth()
  const navigate = useNavigate()
  const toast    = useToast()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const menuItems = [
    { icon: '🪪', label: 'Verificar identidade (KYC)', to: '/kyc',    show: !isVerified },
    { icon: '🏪', label: 'Registar negócio',           to: '/merchant/register', show: !isMerchant },
    { icon: '🏪', label: 'Minha loja',                 to: '/merchant', show: isMerchant },
    { icon: '📋', label: 'Histórico completo',         to: '/history', show: true },
    { icon: '🔒', label: 'Alterar PIN',                to: '/login',  show: true, note: 'Via redefinição' },
  ]

  return (
    <div className="form-page">
      <PageHeader title="Perfil" />

      <div className="form-body animate-in">
        {/* INFO CARD */}
        <div className="card" style={{ textAlign: 'center', padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, var(--green-600), var(--green-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', color: 'var(--warm-50)', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
            {(user?.name || user?.full_name || 'U')[0].toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 600, color: 'var(--warm-50)' }}>
              {user?.name || user?.full_name}
            </h2>
            <p className="text-muted text-sm" style={{ marginTop: 3 }}>{user?.phone}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className={`badge ${LEVEL_COLORS[user?.level] || 'badge-neutral'}`}>
              {LEVEL_LABELS[user?.level] || user?.level}
            </span>
            {isVerified && <span className="badge badge-success">✓ KYC</span>}
          </div>
        </div>

        {/* ACCOUNT INFO */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            { label: 'Membro desde', value: user?.member_since ? new Date(user.member_since).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' }) : '—' },
            { label: 'Nível da conta', value: LEVEL_LABELS[user?.level] || '—' },
            { label: 'KYC', value: isVerified ? 'Verificado ✓' : 'Pendente' },
            { label: 'Saldo', value: user?.wallet ? `${(user.wallet.balance_xof || 0).toLocaleString('pt-PT')} XOF` : '—' },
          ].map(({ label, value }, i, arr) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border-soft)' : 'none' }}>
              <span className="text-sm text-muted">{label}</span>
              <span className="text-sm" style={{ color: 'var(--warm-100)', fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>

        {/* MENU ITEMS */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {menuItems.filter(m => m.show).map((item, i, arr) => (
            <button key={item.label}
              onClick={() => navigate(item.to)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border-soft)' : 'none', textAlign: 'left', transition: 'opacity var(--t-base)' }}>
              <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '.9375rem', color: 'var(--warm-100)', fontWeight: 500 }}>{item.label}</span>
                {item.note && <p className="text-xs text-muted" style={{ marginTop: 2 }}>{item.note}</p>}
              </div>
              <span style={{ color: 'var(--warm-500)' }}>→</span>
            </button>
          ))}
        </div>

        {/* LOGOUT */}
        <button className="btn btn-danger btn-lg w-full" onClick={handleLogout}>
          Terminar sessão
        </button>

        <p className="text-xs text-muted text-center" style={{ paddingBottom: 8 }}>
          BissauPay v1.0 · Guiné-Bissau 🇬🇼
        </p>
      </div>
    </div>
  )
}
