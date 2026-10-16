import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Bluetooth, Lock, Mail, ArrowRight, ShieldCheck, UserCheck, GraduationCap } from 'lucide-react';

interface LoginProps {
  onSwitchToRegister: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSwitchToRegister }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: '#f1f5f9' }}>
      <div style={{ maxWidth: '440px', width: '100%' }}>
        
        {/* Header Icon */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '3.5rem',
            height: '3.5rem',
            borderRadius: '1rem',
            background: 'linear-gradient(135deg, #4f46e5 0%, #312e81 100%)',
            color: 'white',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.3)',
            marginBottom: '1rem'
          }}>
            <Bluetooth size={28} />
          </div>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em' }}>
            ProxyProof
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Cryptographic Bluetooth Low Energy Attendance System
          </p>
        </div>

        {/* Login Card */}
        <div className="card" style={{ padding: '2rem' }}>
          {error && (
            <div style={{ padding: '0.75rem 1rem', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '0.5rem', color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                University Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="email"
                  required
                  placeholder="name@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}
            >
              <span>{loading ? 'Authenticating...' : 'Sign In to Portal'}</span>
              <ArrowRight size={18} />
            </button>
          </form>

          {/* Quick Demo Selector */}
          <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', textAlign: 'center' }}>
              One-Click Demo Switcher
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => handleQuickDemo('student@university.edu', 'StudentPass123!')}
                className="btn btn-secondary"
                style={{ flexDirection: 'column', padding: '0.625rem 0.25rem', fontSize: '0.75rem', gap: '0.25rem' }}
              >
                <GraduationCap size={16} color="#4f46e5" />
                <span>Student</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('prof@university.edu', 'ProfPass123!')}
                className="btn btn-secondary"
                style={{ flexDirection: 'column', padding: '0.625rem 0.25rem', fontSize: '0.75rem', gap: '0.25rem' }}
              >
                <UserCheck size={16} color="#059669" />
                <span>Organiser</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('admin@proxyproof.edu', 'AdminPass123!')}
                className="btn btn-secondary"
                style={{ flexDirection: 'column', padding: '0.625rem 0.25rem', fontSize: '0.75rem', gap: '0.25rem' }}
              >
                <ShieldCheck size={16} color="#d97706" />
                <span>Admin</span>
              </button>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8125rem', color: '#64748b' }}>
            Don't have an account yet?{' '}
            <button
              onClick={onSwitchToRegister}
              style={{ background: 'none', border: 'none', color: '#4f46e5', fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              Register here
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
