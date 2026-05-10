// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import { AuthProvider }  from './hooks/useAuth'
import { ToastProvider } from './hooks/useToast'
import { ProtectedLayout } from './components/Layout'

import './styles/globals.css'

// Pages
import Login      from './pages/Login'
import Dashboard  from './pages/Dashboard'
import Send       from './pages/Send'
import Topup      from './pages/Topup'
import Remittance from './pages/Remittance'
import History    from './pages/History'
import ScanQR     from './pages/ScanQR'
import KYC        from './pages/KYC'
import Profile    from './pages/Profile'
import Merchant, { MerchantRegister } from './pages/Merchant'
import NotFound   from './pages/NotFound'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Pública */}
            <Route path="/login" element={<Login />} />

            {/* Protegidas — exigem login */}
            <Route path="/" element={
              <ProtectedLayout><Dashboard /></ProtectedLayout>
            } />
            <Route path="/send" element={
              <ProtectedLayout><Send /></ProtectedLayout>
            } />
            <Route path="/topup" element={
              <ProtectedLayout><Topup /></ProtectedLayout>
            } />
            <Route path="/remittance" element={
              <ProtectedLayout><Remittance /></ProtectedLayout>
            } />
            <Route path="/history" element={
              <ProtectedLayout><History /></ProtectedLayout>
            } />
            <Route path="/scan" element={
              <ProtectedLayout><ScanQR /></ProtectedLayout>
            } />
            <Route path="/kyc" element={
              <ProtectedLayout><KYC /></ProtectedLayout>
            } />
            <Route path="/profile" element={
              <ProtectedLayout><Profile /></ProtectedLayout>
            } />
            <Route path="/merchant" element={
              <ProtectedLayout><Merchant /></ProtectedLayout>
            } />
            <Route path="/merchant/register" element={
              <ProtectedLayout><MerchantRegister /></ProtectedLayout>
            } />

            {/* Redireccionamentos */}
            <Route path="/pay"  element={<Navigate to="/scan" replace />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
