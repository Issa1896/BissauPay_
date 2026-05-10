// src/pages/NotFound.jsx
import { useNavigate } from 'react-router-dom'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24, textAlign: 'center' }}>
      <span style={{ fontSize: '4rem' }}>🌍</span>
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 600, color: 'var(--warm-50)' }}>
          Página não encontrada
        </h1>
        <p style={{ color: 'var(--warm-400)', marginTop: 8 }}>Esta rota não existe no BissauPay.</p>
      </div>
      <button className="btn btn-primary btn-lg" onClick={() => navigate('/')}>
        Voltar ao início
      </button>
    </div>
  )
}
