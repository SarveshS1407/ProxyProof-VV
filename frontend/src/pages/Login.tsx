import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Bluetooth, Lock, Mail, ArrowRight, ShieldCheck, UserCheck, GraduationCap, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface LoginProps {
  onSwitchToRegister: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSwitchToRegister }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--slate-100)' }}>
      <div style={{ maxWidth: '440px', width: '100%' }}>
        
        {/* Header Icon */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            width: '3.75rem',
            height: '3.75rem',
            borderRadius: 'var(--radius-xl)',
            background: 'linear-gradient(135deg, var(--primary-600) 0%, var(--primary-800) 100%)',
            color: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 20px -5px rgba(79, 70, 229, 0.35)',
            marginBottom: '1rem'
          }}>
            <Bluetooth size={30} />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--slate-900)', letterSpacing: '-0.03em' }}>
            ProxyProof
          </h1>
          <p style={{ color: 'var(--slate-500)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Cryptographic Bluetooth Attendance Platform
          </p>
        </div>

        {/* Login Card */}
        <div className="card" style={{ padding: '2rem', boxShadow: 'var(--shadow-md)' }}>
          {error && (
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                background: 'var(--rose-50)',
                border: '1px solid var(--rose-200)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--rose-700)',
                fontSize: '0.875rem',
                marginBottom: '1.25rem'
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label htmlFor="login-email" className="input-label">
                University Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-400)' }} />
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="input-label">
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-400)' }} />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--slate-400)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0
                  }}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              <span>{loading ? 'Authenticating...' : 'Sign In to Portal'}</span>
              <ArrowRight size={18} />
            </button>
          </form>

          {/* Quick Demo Selector */}
          <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid var(--slate-200)' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', textAlign: 'center' }}>
              One-Click Role Demonstration
            </div>
            <div className="responsive-grid-triples">
              <button
                type="button"
                onClick={() => handleQuickDemo('student@university.edu', 'StudentPass123!')}
                className="btn btn-secondary"
                style={{ flexDirection: 'column', padding: '0.625rem 0.25rem', fontSize: '0.75rem', gap: '0.25rem' }}
                title="Student login demo"
              >
                <GraduationCap size={16} color="var(--primary-600)" />
                <span style={{ fontWeight: 600 }}>Student</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('sarvesh@university.edu', 'SarveshPass123!')}
                className="btn btn-secondary"
                style={{ flexDirection: 'column', padding: '0.625rem 0.25rem', fontSize: '0.75rem', gap: '0.25rem' }}
                title="Organiser login demo (Sarvesh S)"
              >
                <UserCheck size={16} color="var(--emerald-600)" />
                <span style={{ fontWeight: 600 }}>Organiser</span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickDemo('admin@proxyproof.edu', 'AdminPass123!')}
                className="btn btn-secondary"
                style={{ flexDirection: 'column', padding: '0.625rem 0.25rem', fontSize: '0.75rem', gap: '0.25rem' }}
                title="Admin login demo"
              >
                <ShieldCheck size={16} color="var(--amber-600)" />
                <span style={{ fontWeight: 600 }}>Admin</span>
              </button>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--slate-500)' }}>
            Don't have an account yet?{' '}
            <button
              onClick={onSwitchToRegister}
              style={{ background: 'none', border: 'none', color: 'var(--primary-600)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              Register here
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
