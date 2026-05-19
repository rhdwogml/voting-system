import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { WalletProvider, useWallet } from './context/WalletContext';
import { VotingProvider, useVoting } from './context/VotingContext';
import { ToastProvider } from './components/common/Toast';
import Navbar from './components/common/Navbar';

import Connect from './pages/Connect';
import Home from './pages/Home';
import Vote from './pages/Vote';
import New from './pages/New';
import Result from './pages/Result';
import History from './pages/History';
import Me from './pages/Me';
import Dashboard from './pages/admin/Dashboard';
import Candidates from './pages/admin/Candidates';
import Control from './pages/admin/Control';

// ── Route guards ──────────────────────────────────────────────────────────────

function WalletRoute({ children }: { children: React.ReactElement }) {
  const { isConnected, isSepolia } = useWallet();
  if (!isConnected || !isSepolia) return <Navigate to="/connect" replace />;
  return children;
}

function OwnerRoute({ children }: { children: React.ReactElement }) {
  const { isConnected } = useWallet();
  const { isOwner } = useVoting();
  if (!isConnected || !isOwner) return <Navigate to="/" replace />;
  return children;
}

// ── App shell ─────────────────────────────────────────────────────────────────

function AppShell() {
  return (
    <div style={{ minHeight: '100vh', background: '#0B1B3B' }}>
      <Navbar />
      <Routes>
        {/* Public */}
        <Route path="/connect" element={<Connect />} />
        <Route path="/"        element={<Home />} />
        <Route path="/result"  element={<Result />} />
        <Route path="/history" element={<History />} />

        {/* Wallet required */}
        <Route path="/vote" element={<WalletRoute><Vote /></WalletRoute>} />
        <Route path="/me"   element={<WalletRoute><Me /></WalletRoute>} />

        {/* Owner only */}
        <Route path="/new"               element={<OwnerRoute><New /></OwnerRoute>} />
        <Route path="/admin"             element={<OwnerRoute><Dashboard /></OwnerRoute>} />
        <Route path="/admin/candidates"  element={<OwnerRoute><Candidates /></OwnerRoute>} />
        <Route path="/admin/control"     element={<OwnerRoute><Control /></OwnerRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <WalletProvider>
        <VotingProvider>
          <ToastProvider>
            <AppShell />
          </ToastProvider>
        </VotingProvider>
      </WalletProvider>
    </BrowserRouter>
  );
}
