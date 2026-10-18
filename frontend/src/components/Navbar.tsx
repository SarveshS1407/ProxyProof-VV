import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Bluetooth, Shield, LogOut, Calendar, CheckCircle2, LayoutDashboard, Smartphone, User } from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab }) => {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <>
      {/* Top Header */}
      <header style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
      }}>
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '4rem' }}>
          
          {/* Logo and Brand */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
            onClick={() => {
              if (user.role === 'organiser') setCurrentTab('organiser');
              else if (user.role === 'student') setCurrentTab('student');
              else if (user.role === 'admin') setCurrentTab('admin');
            }}
          >
            <div style={{
              backgroundColor: '#4f46e5',
              color: '#ffffff',
              padding: '0.45rem',
              borderRadius: '0.625rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(79, 70, 229, 0.25)'
            }}>
              <Bluetooth size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.125rem', color: '#0f172a', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
                ProxyProof
              </div>
              <div style={{ fontSize: '0.6875rem', color: '#64748b', fontWeight: 500, letterSpacing: '0.01em' }}>
                BLE Attendance Shield
              </div>
            </div>
          </div>

          {/* Desktop Navigation Tabs (Hidden on small mobile screens) */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} className="hide-mobile">
            {(user.role === 'organiser' || user.role === 'admin') && (
              <button
                onClick={() => setCurrentTab('organiser')}
                className={`btn btn-sm ${currentTab === 'organiser' ? 'btn-primary' : 'btn-ghost'}`}
              >
                <Calendar size={15} />
                <span>Organiser</span>
              </button>
            )}

            {(user.role === 'student' || user.role === 'admin') && (
              <button
                onClick={() => setCurrentTab('student')}
                className={`btn btn-sm ${currentTab === 'student' ? 'btn-primary' : 'btn-ghost'}`}
              >
                <CheckCircle2 size={15} />
                <span>Student Check-In</span>
              </button>
            )}

            {user.role === 'admin' && (
              <button
                onClick={() => setCurrentTab('admin')}
                className={`btn btn-sm ${currentTab === 'admin' ? 'btn-primary' : 'btn-ghost'}`}
              >
                <Shield size={15} />
                <span>Admin Console</span>
              </button>
            )}
          </nav>

          {/* User Profile & Logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', maxWidth: '120px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#0f172a', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                {user.full_name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.15rem' }}>
                <span className={`badge badge-${user.role === 'admin' ? 'late' : user.role === 'organiser' ? 'excused' : 'approved'}`} style={{ fontSize: '0.625rem', padding: '0.1rem 0.45rem' }}>
                  {user.role}
                </span>
                {user.student_profile?.student_id_number && (
                  <span style={{ fontSize: '0.6875rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                    {user.student_profile.student_id_number}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={logout}
              className="btn btn-secondary btn-sm"
              title="Sign Out"
              aria-label="Sign out of account"
              style={{ padding: '0.45rem 0.65rem' }}
            >
              <LogOut size={15} />
            </button>
          </div>

        </div>
      </header>

      {/* Mobile Bottom Navigation Bar (Visible on mobile screens <= 768px) */}
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {(user.role === 'student' || user.role === 'admin') && (
          <button
            onClick={() => setCurrentTab('student')}
            className={`mobile-nav-btn ${currentTab === 'student' ? 'active' : ''}`}
          >
            <CheckCircle2 size={18} />
            <span>Check-In</span>
          </button>
        )}

        {(user.role === 'organiser' || user.role === 'admin') && (
          <button
            onClick={() => setCurrentTab('organiser')}
            className={`mobile-nav-btn ${currentTab === 'organiser' ? 'active' : ''}`}
          >
            <Calendar size={18} />
            <span>Organiser</span>
          </button>
        )}

        {user.role === 'admin' && (
          <button
            onClick={() => setCurrentTab('admin')}
            className={`mobile-nav-btn ${currentTab === 'admin' ? 'active' : ''}`}
          >
            <Shield size={18} />
            <span>Admin</span>
          </button>
        )}
      </nav>
    </>
  );
};
