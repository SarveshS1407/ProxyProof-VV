import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Bluetooth, Shield, LogOut, User as UserIcon, Calendar, CheckCircle2 } from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab }) => {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '4.25rem' }}>
        
        {/* Logo and Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => setCurrentTab('home')}>
          <div style={{
            background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
            color: 'white',
            padding: '0.5rem',
            borderRadius: '0.625rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)'
          }}>
            <Bluetooth size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              ProxyProof
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500 }}>
              BLE Anti-Proxy Attendance
            </div>
          </div>
        </div>

        {/* Role-based Navigation Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {user.role === 'organiser' || user.role === 'admin' ? (
            <button
              onClick={() => setCurrentTab('organiser')}
              className={`btn ${currentTab === 'organiser' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem 1rem' }}
            >
              <Calendar size={16} />
              <span>Organiser Dashboard</span>
            </button>
          ) : null}

          {user.role === 'student' || user.role === 'admin' ? (
            <button
              onClick={() => setCurrentTab('student')}
              className={`btn ${currentTab === 'student' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem 1rem' }}
            >
              <CheckCircle2 size={16} />
              <span>Student Check-In</span>
            </button>
          ) : null}

          {user.role === 'admin' ? (
            <button
              onClick={() => setCurrentTab('admin')}
              className={`btn ${currentTab === 'admin' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '0.5rem 1rem' }}
            >
              <Shield size={16} />
              <span>Admin Console</span>
            </button>
          ) : null}
        </div>

        {/* User Profile and Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', textAlign: 'right' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1e293b' }}>
                {user.full_name}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {user.student_profile?.student_id_number || user.email}
              </div>
            </div>
            <span className={`badge badge-${user.role === 'admin' ? 'late' : user.role === 'organiser' ? 'excused' : 'approved'}`}>
              {user.role}
            </span>
          </div>

          <button
            onClick={logout}
            className="btn btn-secondary"
            title="Log Out"
            style={{ padding: '0.5rem 0.75rem' }}
          >
            <LogOut size={16} />
          </button>
        </div>

      </div>
    </header>
  );
};
