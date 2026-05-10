// src/components/Layout.jsx
import { Link, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import './Layout.css'

const NAV = [
  { path: '/',           label: 'Início',    icon: <HomeIcon /> },
  { path: '/send',       label: 'Enviar',    icon: <SendIcon /> },
  { path: '/topup',      label: 'Recarga',   icon: <TopupIcon /> },
  { path: '/remittance', label: 'Remessa',   icon: <GlobalIcon /> },
  { path: '/history',    label: 'Histórico', icon: <HistoryIcon /> },
]

export function ProtectedLayout({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageLoader />
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  return (
    <div className="app-shell">
      <TopBar />
      <main className="app-main">{children}</main>
      <BottomNav />
    </div>
  )
}

function TopBar() {
  const { user, logout } = useAuth()
  const firstName = user?.name?.split(' ')[0] || user?.full_name?.split(' ')[0] || 'Utilizador'
  return (
    <header className="topbar">
      <BissauPayLogo />
      <div className="topbar-right">
        <span className="topbar-greeting">Olá, {firstName}</span>
        <button className="topbar-avatar" onClick={logout} title="Terminar sessão" aria-label="Sair">
          <span>{firstName[0]?.toUpperCase()}</span>
        </button>
      </div>
    </header>
  )
}

function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav className="bottom-nav" role="navigation" aria-label="Navegação principal">
      {NAV.map(({ path, label, icon }) => {
        const active = pathname === path
        return (
          <Link key={path} to={path} className={`bnav-item ${active ? 'active' : ''}`}>
            <span className="bnav-icon">{icon}</span>
            <span className="bnav-label">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function PageHeader({ title, subtitle, back, action }) {
  return (
    <div className="page-header animate-in">
      <div className="page-header-top">
        {back && (
          <Link to={back} className="page-back">
            <ChevronLeft /> Voltar
          </Link>
        )}
        {action && <div className="page-header-action">{action}</div>}
      </div>
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
  )
}

export function FullPageLoader() {
  return (
    <div className="full-loader">
      <BissauPayLogo animated />
      <div className="spinner spinner-lg" style={{ color: 'var(--green-400)' }} />
    </div>
  )
}

export function BissauPayLogo({ animated = false }) {
  return (
    <div className={`logo ${animated ? 'logo-animated' : ''}`}>
      <svg className="logo-mark" width="34" height="34" viewBox="0 0 34 34" fill="none">
        <path d="M17 2L31 10V24L17 32L3 24V10Z" fill="var(--green-400)" fillOpacity=".15"/>
        <path d="M17 5L28 11.5V22.5L17 29L6 22.5V11.5Z" fill="none" stroke="var(--green-400)" strokeWidth="1.4"/>
        <path d="M13 17Q13 12.5 17 12.5Q21 12.5 21 17Q21 21.5 17 21.5Q13 21.5 13 17" fill="var(--gold-400)"/>
        <circle cx="17" cy="17" r="2.5" fill="var(--green-900)"/>
      </svg>
      <span className="logo-text">BissauPay</span>
    </div>
  )
}

export function ConfirmRow({ label, value, highlight, large }) {
  return (
    <div className="confirm-row">
      <span className="confirm-row-label">{label}</span>
      <span className={`confirm-row-value ${highlight ? 'text-green' : ''} ${large ? 'amount' : ''}`}
        style={{ fontSize: large ? '1.1rem' : undefined }}>
        {value}
      </span>
    </div>
  )
}

export function SectionHeader({ title, action }) {
  return (
    <div className="section-header">
      <h2 className="section-title">{title}</h2>
      {action}
    </div>
  )
}

export function LoadingCard({ lines = 3 }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 14, width: i === 0 ? '70%' : i === lines - 1 ? '45%' : '90%' }} />
      ))}
    </div>
  )
}

// ── ICONS ────────────────────────────────────────────────────
const s = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
export function HomeIcon()    { return <svg {...s}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
export function SendIcon()    { return <svg {...s}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> }
export function TopupIcon()   { return <svg {...s}><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> }
export function GlobalIcon()  { return <svg {...s}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> }
export function HistoryIcon() { return <svg {...s}><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/></svg> }
export function ChevronLeft() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg> }
export function EyeIcon()     { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> }
export function EyeOffIcon()  { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg> }
export function QRIcon()      { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h.01M18 14h.01M14 18h.01M18 18h.01M14 21h.01M21 14h.01M21 18h.01"/></svg> }
export function CopyIcon()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> }
export function CheckIcon()   { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> }
export function AlertIcon()   { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> }
export function BellIcon()    { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> }
export function RefreshIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> }
export function ShieldIcon()  { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
export function StoreIcon()   { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
