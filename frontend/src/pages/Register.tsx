import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Bluetooth, Lock, Mail, User, BookOpen, ArrowRight, Eye, EyeOff, AlertCircle, GraduationCap, UserCheck, Shield } from 'lucide-react';
import { UserRole } from '../types';

interface RegisterProps {
  onSwitchToLogin: () => void;
}

export const Register: React.FC<RegisterProps> = ({ onSwitchToLogin }) => {
  const { register } = useAuth();
  const [role, setRole] = useState<UserRole>('student');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [studentIdNumber, setStudentIdNumber] = useState('');
  const [department, setDepartment] = useState('Computer Science');
  const [batch, setBatch] = useState('2024-2028');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters in length.');
      return;
    }

    if (role === 'student' && !studentIdNumber.trim()) {
      setError('Student Roll / ID Number is required for student accounts.');
      return;
    }

    setLoading(true);
    try {
      await register({
        email,
        password,
        full_name: fullName,
        role,
        student_id_number: role === 'student' ? studentIdNumber.trim() : undefined,
        department: role === 'student' ? department.trim() : undefined,
        batch: role === 'student' ? batch.trim() : undefined,
      });
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please check your information and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--slate-100)' }}>
      <div style={{ maxWidth: '500px', width: '100%' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: '3.5rem',
            height: '3.5rem',
            borderRadius: 'var(--radius-xl)',
            background: 'linear-gradient(135deg, var(--primary-600) 0%, var(--primary-800) 100%)',
            color: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 20px -5px rgba(79, 70, 229, 0.35)',
            marginBottom: '0.75rem'
          }}>
            <Bluetooth size={26} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--slate-900)', letterSpacing: '-0.025em' }}>
            Create ProxyProof Account
          </h1>
          <p style={{ color: 'var(--slate-500)', fontSize: '0.875rem' }}>
            Select your university role and configure authentication
          </p>
        </div>

        {/* Form Card */}
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

          {/* Role Selection */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label className="input-label" style={{ marginBottom: '0.5rem' }}>
              Select Account Role
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setRole('student')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '0.625rem 0.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid',
                  borderColor: role === 'student' ? 'var(--primary-600)' : 'var(--slate-200)',
                  background: role === 'student' ? 'var(--primary-50)' : '#ffffff',
                  color: role === 'student' ? 'var(--primary-700)' : 'var(--slate-600)',
                  cursor: 'pointer',
                  gap: '0.25rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <GraduationCap size={16} />
                <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Student</span>
              </button>

              <button
                type="button"
                onClick={() => setRole('organiser')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '0.625rem 0.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid',
                  borderColor: role === 'organiser' ? 'var(--emerald-600)' : 'var(--slate-200)',
                  background: role === 'organiser' ? 'var(--emerald-50)' : '#ffffff',
                  color: role === 'organiser' ? 'var(--emerald-700)' : 'var(--slate-600)',
                  cursor: 'pointer',
                  gap: '0.25rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <UserCheck size={16} />
                <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Organiser</span>
              </button>

              <button
                type="button"
                onClick={() => setRole('admin')}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '0.625rem 0.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid',
                  borderColor: role === 'admin' ? 'var(--amber-600)' : 'var(--slate-200)',
                  background: role === 'admin' ? 'var(--amber-50)' : '#ffffff',
                  color: role === 'admin' ? 'var(--amber-700)' : 'var(--slate-600)',
                  cursor: 'pointer',
                  gap: '0.25rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <Shield size={16} />
                <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Admin</span>
              </button>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '0.375rem', textAlign: 'center' }}>
              {role === 'student' && 'Check into sessions, register physical device, and view attendance stats.'}
              {role === 'organiser' && 'Host BLE attendance sessions, inspect live check-ins, and export records.'}
              {role === 'admin' && 'Audit security logs, review replacement devices, and manage accounts.'}
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label htmlFor="reg-name" className="input-label">
                Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-400)' }} />
                <input
                  id="reg-name"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="e.g. Jonathan Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-email" className="input-label">
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-400)' }} />
                <input
                  id="reg-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="student@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-password" className="input-label">
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-400)' }} />
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="Minimum 6 characters"
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

            {role === 'student' && (
              <>
                <div>
                  <label htmlFor="reg-roll" className="input-label">
                    Student Roll / ID Number *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <BookOpen size={18} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-400)' }} />
                    <input
                      id="reg-roll"
                      type="text"
                      required
                      placeholder="e.g. CS-2024-042"
                      value={studentIdNumber}
                      onChange={(e) => setStudentIdNumber(e.target.value)}
                      className="input-field"
                      style={{ paddingLeft: '2.5rem' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label htmlFor="reg-dept" className="input-label">
                      Department
                    </label>
                    <input
                      id="reg-dept"
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-batch" className="input-label">
                      Batch / Class
                    </label>
                    <input
                      id="reg-batch"
                      type="text"
                      value={batch}
                      onChange={(e) => setBatch(e.target.value)}
                      className="input-field"
                    />
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              <span>{loading ? 'Creating Account...' : 'Complete Registration'}</span>
              <ArrowRight size={18} />
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--slate-500)' }}>
            Already have an account?{' '}
            <button
              onClick={onSwitchToLogin}
              style={{ background: 'none', border: 'none', color: 'var(--primary-600)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              Sign In
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
