import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar } from './components/Navbar';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { OrganiserDashboard } from './pages/OrganiserDashboard';
import { StudentPortal } from './pages/StudentPortal';
import { AdminPortal } from './pages/AdminPortal';

const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [currentTab, setCurrentTab] = useState<string>('home');

  useEffect(() => {
    if (user) {
      if (user.role === 'organiser') setCurrentTab('organiser');
      else if (user.role === 'student') setCurrentTab('student');
      else if (user.role === 'admin') setCurrentTab('admin');
    }
  }, [user]);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#4f46e5', marginBottom: '0.5rem' }}>
            ProxyProof
          </div>
          <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Initializing secure cryptographic session...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return authView === 'login' ? (
      <Login onSwitchToRegister={() => setAuthView('register')} />
    ) : (
      <Register onSwitchToLogin={() => setAuthView('login')} />
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar currentTab={currentTab} setCurrentTab={setCurrentTab} />
      <main style={{ flex: 1 }}>
        {currentTab === 'organiser' && <OrganiserDashboard />}
        {currentTab === 'student' && <StudentPortal />}
        {currentTab === 'admin' && <AdminPortal />}
        {currentTab === 'home' && (
          user.role === 'student' ? <StudentPortal /> : <OrganiserDashboard />
        )}
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  );
};
