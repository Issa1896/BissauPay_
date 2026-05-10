// src/pages/History.jsx
import { useState, useEffect } from 'react'
import { walletAPI } from '../services/api'
import { PageHeader } from '../components/Layout'
import { TxItem, TxSkeleton } from './Dashboard'
import './Forms.css'

const FILTERS = [
  { value: 'all',           label: 'Tudo' },
  { value: 'transfer',      label: 'Transferências' },
  { value: 'payment',       label: 'Pagamentos' },
  { value: 'topup',         label: 'Recargas' },
  { value: 'remittance_out', label: 'Remessas' },
  { value: 'deposit',       label: 'Depósitos' },
]

export default function History() {
  const [txs,     setTxs]     = useState([])
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(1)
  const [total,   setTotal]   = useState(0)
  const [filter,  setFilter]  = useState('all')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const params = { page, limit: 20 }
        if (filter !== 'all') params.type = filter
        const res = await walletAPI.statement(params)
        setTxs(res.data?.transactions || [])
        setTotal(res.data?.total || 0)
      } catch {}
      setLoading(false)
    }
    load()
  }, [page, filter])

  const handleFilter = (f) => { setFilter(f); setPage(1) }

  return (
    <div className="form-page">
      <PageHeader title="Histórico" subtitle={`${total} movimentações`} />

      <div className="filter-tabs">
        {FILTERS.map(f => (
          <button key={f.value} className={`filter-tab ${filter === f.value ? 'active' : ''}`}
            onClick={() => handleFilter(f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="form-body" style={{ paddingTop: 0 }}>
        {loading ? (
          Array(8).fill(0).map((_, i) => <TxSkeleton key={i} />)
        ) : txs.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📭</span>
            <p className="empty-title">Nenhuma movimentação</p>
            <p className="empty-subtitle">Sem resultados para este filtro.</p>
          </div>
        ) : (
          txs.map((tx, i) => <TxItem key={tx.id} tx={tx} index={i} />)
        )}

        {total > 20 && (
          <div className="pagination">
            <button className="btn btn-ghost btn-sm" disabled={page === 1 || loading}
              onClick={() => setPage(p => p - 1)}>← Anterior</button>
            <span className="text-muted text-sm">Página {page} de {Math.ceil(total / 20)}</span>
            <button className="btn btn-ghost btn-sm" disabled={txs.length < 20 || loading}
              onClick={() => setPage(p => p + 1)}>Próxima →</button>
          </div>
        )}
      </div>
    </div>
  )
}
