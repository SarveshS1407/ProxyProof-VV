import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../api/client';
import { AdminStats, DeviceChangeRequest, User, AuditLogItem, UserRole } from '../types';
import { useToast } from '../context/ToastContext';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { StatusPill } from '../components/common/StatusPill';
import { EmptyState } from '../components/common/EmptyState';
import {
  Shield, Users, Smartphone, FileText, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, Activity, Search, Filter, ShieldAlert,
  UserCheck, GraduationCap, Check, AlertTriangle, Clock
} from 'lucide-react';

export const AdminPortal: React.FC = () => {
  const { showToast } = useToast();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [requests, setRequests] = useState<DeviceChangeRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [activeTab, setActiveTab] = useState<'requests' | 'users' | 'audit'>('requests');
  const [loading, setLoading] = useState(false);

  // Filters & Search
  const [requestSearch, setRequestSearch] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');

  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [userStatusFilter, setUserStatusFilter] = useState<'ALL' | 'active' | 'suspended'>('ALL');

  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('ALL');

  // Review Modal State
  const [reviewTarget, setReviewTarget] = useState<{
    requestId: number;
    approved: boolean;
    deviceModel?: string;
    identifier?: string;
  } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // User Toggle Modal State
  const [userToggleTarget, setUserToggleTarget] = useState<User | null>(null);
  const [togglingUser, setTogglingUser] = useState(false);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const [s, reqs, u, logs] = await Promise.all([
        api.getAdminStats(),
        api.getDeviceRequests(),
        api.getUsers(),
        api.getAuditLogs(100, 0),
      ]);
      setStats(s);
      setRequests(reqs);
      setUsers(u);
      setAuditLogs(logs);
    } catch (err: any) {
      console.error('Error fetching admin data:', err);
      showToast('error', err.message || 'Failed to load administrator data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  // Filtered Device Requests
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (requestStatusFilter !== 'ALL' && r.status !== requestStatusFilter) {
        return false;
      }
      if (requestSearch.trim()) {
        const q = requestSearch.toLowerCase();
        const matchesId = `#${r.id}`.includes(q) || String(r.id).includes(q);
        const matchesModel = r.new_device_model?.toLowerCase().includes(q) ?? false;
        const matchesIdent = r.new_device_identifier.toLowerCase().includes(q);
        const matchesReason = r.reason.toLowerCase().includes(q);
        const matchesNotes = r.admin_notes?.toLowerCase().includes(q) ?? false;
        return matchesId || matchesModel || matchesIdent || matchesReason || matchesNotes;
      }
      return true;
    });
  }, [requests, requestStatusFilter, requestSearch]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (userRoleFilter !== 'ALL' && u.role !== userRoleFilter) {
        return false;
      }
      if (userStatusFilter === 'active' && !u.is_active) {
        return false;
      }
      if (userStatusFilter === 'suspended' && u.is_active) {
        return false;
      }
      if (userSearch.trim()) {
        const q = userSearch.toLowerCase();
        const matchesName = u.full_name.toLowerCase().includes(q);
        const matchesEmail = u.email.toLowerCase().includes(q);
        const matchesRoll = u.student_profile?.student_id_number.toLowerCase().includes(q) ?? false;
        const matchesDept = u.student_profile?.department?.toLowerCase().includes(q) ?? false;
        return matchesName || matchesEmail || matchesRoll || matchesDept;
      }
      return true;
    });
  }, [users, userRoleFilter, userStatusFilter, userSearch]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      if (auditActionFilter !== 'ALL' && log.action !== auditActionFilter) {
        return false;
      }
      if (auditSearch.trim()) {
        const q = auditSearch.toLowerCase();
        const matchesAction = log.action.toLowerCase().includes(q);
        const matchesActor = log.user_email?.toLowerCase().includes(q) ?? false;
        const matchesEntity = log.entity_type.toLowerCase().includes(q);
        const matchesDetails = log.details?.toLowerCase().includes(q) ?? false;
        return matchesAction || matchesActor || matchesEntity || matchesDetails;
      }
      return true;
    });
  }, [auditLogs, auditActionFilter, auditSearch]);

  // Unique actions in audit logs for filter dropdown
  const uniqueAuditActions = useMemo(() => {
    const set = new Set<string>();
    auditLogs.forEach((l) => set.add(l.action));
    return Array.from(set);
  }, [auditLogs]);

  // Open Review Modal
  const openReviewModal = (requestId: number, approved: boolean, deviceModel?: string, identifier?: string) => {
    setReviewTarget({ requestId, approved, deviceModel, identifier });
    setReviewNotes('');
  };

  const handleConfirmReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    if (!reviewTarget.approved && !reviewNotes.trim()) {
      showToast('error', 'Please provide a specific reason for rejecting this device replacement request.');
      return;
    }

    try {
      setSubmittingReview(true);
      await api.reviewDeviceRequest(
        reviewTarget.requestId,
        reviewTarget.approved,
        reviewNotes.trim() || undefined
      );
      showToast(
        'success',
        `Device replacement request #${reviewTarget.requestId} ${reviewTarget.approved ? 'approved' : 'rejected'} successfully.`
      );
      setReviewTarget(null);
      setReviewNotes('');
      await fetchAdminData();
    } catch (e: any) {
      showToast('error', e.message || 'Error reviewing device replacement request');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleConfirmToggleUser = async () => {
    if (!userToggleTarget) return;
    try {
      setTogglingUser(true);
      await api.updateUserStatus(userToggleTarget.id, !userToggleTarget.is_active);
      showToast(
        userToggleTarget.is_active ? 'info' : 'success',
        `User ${userToggleTarget.full_name} (${userToggleTarget.email}) has been ${userToggleTarget.is_active ? 'suspended' : 'activated'}.`
      );
      setUserToggleTarget(null);
      await fetchAdminData();
    } catch (e: any) {
      showToast('error', e.message || 'Error updating user status');
    } finally {
      setTogglingUser(false);
    }
  };

  const pendingRequestsCount = requests.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
            <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: 'var(--primary-100)', color: 'var(--primary-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={18} />
            </div>
            <h1 style={{ fontSize: '1.625rem', fontWeight: 800, color: 'var(--slate-900)', letterSpacing: '-0.025em' }}>
              System Administration
            </h1>
          </div>
          <p style={{ color: 'var(--slate-500)', fontSize: '0.875rem' }}>
            Manage user accounts, review cryptographic device requests, and audit security events
          </p>
        </div>

        <button
          onClick={fetchAdminData}
          disabled={loading}
          className="btn btn-secondary"
          style={{ padding: '0.5rem 0.875rem' }}
          title="Refresh administration data"
        >
          <RefreshCw size={15} className={loading ? 'animate-pulse-glow' : ''} />
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* System Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Users
            </span>
            <Users size={16} color="var(--slate-400)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--slate-900)', marginTop: '0.375rem' }}>
            {stats?.total_users ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '0.25rem' }}>
            {stats?.total_students ?? 0} Students • {stats?.total_organisers ?? 0} Organisers
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Sessions
            </span>
            <Activity size={16} color="var(--primary-600)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--primary-600)', marginTop: '0.375rem' }}>
            {stats?.active_sessions ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '0.25rem' }}>
            Across {stats?.total_courses ?? 0} registered courses
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Attendance Records
            </span>
            <CheckCircle2 size={16} color="var(--emerald-600)" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--emerald-600)', marginTop: '0.375rem' }}>
            {stats?.total_attendance_records ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '0.25rem' }}>
            Verified via P-256 signatures
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderColor: pendingRequestsCount > 0 ? 'var(--amber-300)' : 'var(--slate-200)', background: pendingRequestsCount > 0 ? 'var(--amber-50)' : '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: pendingRequestsCount > 0 ? 'var(--amber-800)' : 'var(--slate-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Pending Approvals
            </span>
            <Smartphone size={16} color={pendingRequestsCount > 0 ? 'var(--amber-600)' : 'var(--slate-400)'} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: pendingRequestsCount > 0 ? 'var(--amber-700)' : 'var(--slate-900)', marginTop: '0.375rem' }}>
            {pendingRequestsCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: pendingRequestsCount > 0 ? 'var(--amber-800)' : 'var(--slate-500)', marginTop: '0.25rem' }}>
            {pendingRequestsCount > 0 ? 'Action required by administrator' : 'All device requests reviewed'}
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--slate-200)', marginBottom: '1.5rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <button
          onClick={() => setActiveTab('requests')}
          style={{
            padding: '0.75rem 1.25rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            borderBottom: '2px solid',
            borderColor: activeTab === 'requests' ? 'var(--primary-600)' : 'transparent',
            color: activeTab === 'requests' ? 'var(--primary-600)' : 'var(--slate-500)',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            whiteSpace: 'nowrap'
          }}
        >
          <Smartphone size={16} />
          <span>Device Replacement Requests</span>
          {pendingRequestsCount > 0 && (
            <span style={{ background: 'var(--amber-600)', color: '#ffffff', fontSize: '0.6875rem', fontWeight: 700, padding: '0.125rem 0.4375rem', borderRadius: '9999px' }}>
              {pendingRequestsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '0.75rem 1.25rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            borderBottom: '2px solid',
            borderColor: activeTab === 'users' ? 'var(--primary-600)' : 'transparent',
            color: activeTab === 'users' ? 'var(--primary-600)' : 'var(--slate-500)',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            whiteSpace: 'nowrap'
          }}
        >
          <Users size={16} />
          <span>User Accounts ({users.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          style={{
            padding: '0.75rem 1.25rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            borderBottom: '2px solid',
            borderColor: activeTab === 'audit' ? 'var(--primary-600)' : 'transparent',
            color: activeTab === 'audit' ? 'var(--primary-600)' : 'var(--slate-500)',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            whiteSpace: 'nowrap'
          }}
        >
          <FileText size={16} />
          <span>Security Audit Trail</span>
        </button>
      </div>

      {/* TAB 1: DEVICE REPLACEMENT REQUESTS */}
      {activeTab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Controls: Search & Status Filter */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ position: 'relative', minWidth: '240px', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-400)' }} />
              <input
                type="text"
                placeholder="Search by hardware ID, model, reason, or request #..."
                value={requestSearch}
                onChange={(e) => setRequestSearch(e.target.value)}
                className="input-field"
                style={{ paddingLeft: '2.25rem' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setRequestStatusFilter(st)}
                  className={`btn btn-sm ${requestStatusFilter === st ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ textTransform: 'capitalize' }}
                >
                  {st === 'ALL' ? 'All Requests' : st.toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Table Container */}
          <div className="table-wrapper">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>ID</th>
                    <th>New Device Hardware</th>
                    <th>Reason for Change</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Review Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '3rem 1rem' }}>
                        <EmptyState
                          title="No device replacement requests"
                          description={
                            requestSearch || requestStatusFilter !== 'ALL'
                              ? 'No requests match your current search and filter settings.'
                              : 'No students have requested a device change.'
                          }
                          icon={Smartphone}
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 700, color: 'var(--slate-900)' }}>
                          #{r.id}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--slate-900)' }}>
                            {r.new_device_model || 'Unknown Smartphone'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)', fontFamily: 'var(--font-mono)', marginTop: '0.125rem' }}>
                            {r.new_device_identifier}
                          </div>
                          {r.new_os_version && (
                            <div style={{ fontSize: '0.6875rem', color: 'var(--slate-400)' }}>
                              OS: {r.new_os_version}
                            </div>
                          )}
                        </td>
                        <td style={{ maxWidth: '320px' }}>
                          <div style={{ color: 'var(--slate-800)', fontSize: '0.875rem' }}>
                            {r.reason}
                          </div>
                          {r.admin_notes && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--slate-600)', background: 'var(--slate-100)', padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)', marginTop: '0.375rem' }}>
                              <strong>Admin Remark:</strong> {r.admin_notes}
                            </div>
                          )}
                        </td>
                        <td style={{ color: 'var(--slate-500)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                          {new Date(r.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </td>
                        <td>
                          <StatusPill status={r.status} size="sm" />
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {r.status === 'PENDING' ? (
                            <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => openReviewModal(r.id, true, r.new_device_model, r.new_device_identifier)}
                                className="btn btn-success btn-sm"
                                title="Approve and register replacement device"
                              >
                                <CheckCircle2 size={13} />
                                <span>Approve</span>
                              </button>
                              <button
                                onClick={() => openReviewModal(r.id, false, r.new_device_model, r.new_device_identifier)}
                                className="btn btn-danger btn-sm"
                                title="Reject replacement request"
                              >
                                <XCircle size={13} />
                                <span>Reject</span>
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>
                              Reviewed
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* TAB 2: USER ACCOUNTS */}
      {activeTab === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Controls: Search, Role Filter, Status Filter */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ position: 'relative', minWidth: '240px', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-400)' }} />
              <input
                type="text"
                placeholder="Search by full name, email, roll number, or department..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="input-field"
                style={{ paddingLeft: '2.25rem' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Role Filter */}
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {(['ALL', 'student', 'organiser', 'admin'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setUserRoleFilter(r)}
                    className={`btn btn-sm ${userRoleFilter === r ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ textTransform: 'capitalize' }}
                  >
                    {r === 'ALL' ? 'All Roles' : r}
                  </button>
                ))}
              </div>

              {/* Status Filter */}
              <select
                value={userStatusFilter}
                onChange={(e) => setUserStatusFilter(e.target.value as any)}
                className="input-field"
                style={{ width: 'auto', padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
              >
                <option value="ALL">All Statuses</option>
                <option value="active">Active Accounts</option>
                <option value="suspended">Suspended Accounts</option>
              </select>
            </div>
          </div>

          {/* Table Container */}
          <div className="table-wrapper">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>User ID</th>
                    <th>User & Credentials</th>
                    <th>Assigned Role</th>
                    <th>Student Roll / Dept</th>
                    <th>Registered</th>
                    <th>Account Status</th>
                    <th style={{ textAlign: 'right' }}>Security Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '3rem 1rem' }}>
                        <EmptyState
                          title="No user accounts found"
                          description={
                            userSearch || userRoleFilter !== 'ALL' || userStatusFilter !== 'ALL'
                              ? 'No accounts match the current filter criteria.'
                              : 'No users registered in the database.'
                          }
                          icon={Users}
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 700, color: 'var(--slate-900)' }}>
                          #{u.id}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--slate-900)' }}>
                            {u.full_name}
                          </div>
                          <div style={{ fontSize: '0.8125rem', color: 'var(--slate-500)' }}>
                            {u.email}
                          </div>
                        </td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background: u.role === 'admin' ? 'var(--amber-100)' : u.role === 'organiser' ? 'var(--sky-100)' : 'var(--primary-100)',
                              color: u.role === 'admin' ? 'var(--amber-800)' : u.role === 'organiser' ? 'var(--sky-700)' : 'var(--primary-700)',
                              border: '1px solid transparent'
                            }}
                          >
                            {u.role === 'admin' && <Shield size={10} />}
                            {u.role === 'organiser' && <UserCheck size={10} />}
                            {u.role === 'student' && <GraduationCap size={10} />}
                            <span>{u.role}</span>
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--slate-600)' }}>
                          {u.student_profile ? (
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--slate-800)', fontFamily: 'var(--font-mono)' }}>
                                {u.student_profile.student_id_number}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                                {u.student_profile.department} ({u.student_profile.batch})
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--slate-400)' }}>—</span>
                          )}
                        </td>
                        <td style={{ color: 'var(--slate-500)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                          {new Date(u.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </td>
                        <td>
                          <StatusPill status={u.is_active ? 'ACTIVE' : 'SUSPENDED'} size="sm" />
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => setUserToggleTarget(u)}
                            className={`btn btn-sm ${u.is_active ? 'btn-secondary' : 'btn-primary'}`}
                          >
                            {u.is_active ? 'Suspend' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* TAB 3: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          {/* Controls: Search & Action Filter */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ position: 'relative', minWidth: '240px', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-400)' }} />
              <input
                type="text"
                placeholder="Search audit trail by actor email, action, entity, details..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="input-field"
                style={{ paddingLeft: '2.25rem' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Filter size={15} color="var(--slate-500)" />
              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="input-field"
                style={{ width: 'auto', padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}
              >
                <option value="ALL">All Logged Actions</option>
                {uniqueAuditActions.map((act) => (
                  <option key={act} value={act}>{act}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table Container */}
          <div className="table-wrapper">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '170px' }}>Timestamp</th>
                    <th>Action Event</th>
                    <th>Target Entity</th>
                    <th>Authorized Actor</th>
                    <th>Audit Details & Context</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '3rem 1rem' }}>
                        <EmptyState
                          title="No audit log entries"
                          description={
                            auditSearch || auditActionFilter !== 'ALL'
                              ? 'No audit entries match the current search.'
                              : 'Security log history will appear here.'
                          }
                          icon={ShieldAlert}
                        />
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ color: 'var(--slate-500)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <Clock size={12} color="var(--slate-400)" />
                            <span>{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                        </td>
                        <td>
                          <span
                            className="badge"
                            style={{
                              background: log.action.includes('REJECT') || log.action.includes('SUSPEND')
                                ? 'var(--rose-100)'
                                : log.action.includes('APPROVE') || log.action.includes('VERIFIED')
                                ? 'var(--emerald-100)'
                                : 'var(--slate-100)',
                              color: log.action.includes('REJECT') || log.action.includes('SUSPEND')
                                ? 'var(--rose-800)'
                                : log.action.includes('APPROVE') || log.action.includes('VERIFIED')
                                ? 'var(--emerald-800)'
                                : 'var(--slate-800)',
                              border: '1px solid transparent'
                            }}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td style={{ color: 'var(--slate-700)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                          <strong>{log.entity_type}</strong> {log.entity_id ? `#${log.entity_id}` : ''}
                        </td>
                        <td style={{ color: 'var(--primary-700)', fontSize: '0.8125rem', fontWeight: 600 }}>
                          {log.user_email || 'System'}
                        </td>
                        <td style={{ color: 'var(--slate-600)', fontSize: '0.8125rem', maxWidth: '380px' }}>
                          {log.details || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* MODAL: REVIEW DEVICE REPLACEMENT REQUEST */}
      {reviewTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="review-modal-title">
          <div className="modal-content">
            <h2 id="review-modal-title" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--slate-900)', marginBottom: '0.375rem' }}>
              {reviewTarget.approved ? 'Approve Replacement Device' : 'Reject Replacement Device'}
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--slate-500)', marginBottom: '1.25rem' }}>
              Request #{reviewTarget.requestId} • New Hardware: <strong>{reviewTarget.deviceModel || 'Smartphone'}</strong>
            </p>

            <div style={{ background: 'var(--slate-50)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--slate-200)', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--slate-500)', textTransform: 'uppercase' }}>
                Hardware Identifier (UUID)
              </div>
              <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--slate-700)', marginTop: '0.125rem', wordBreak: 'break-all' }}>
                {reviewTarget.identifier}
              </div>
            </div>

            <form onSubmit={handleConfirmReview} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="input-label" htmlFor="admin-notes">
                  {reviewTarget.approved ? 'Administrator Remarks (Optional)' : 'Rejection Reason (Required)'}
                </label>
                <textarea
                  id="admin-notes"
                  rows={3}
                  required={!reviewTarget.approved}
                  placeholder={
                    reviewTarget.approved
                      ? 'e.g. Identity confirmed with student department office.'
                      : 'e.g. Unable to verify student ownership or missing required verification documents.'
                  }
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  disabled={submittingReview}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className={`btn ${reviewTarget.approved ? 'btn-success' : 'btn-danger'}`}
                >
                  {submittingReview
                    ? 'Processing...'
                    : reviewTarget.approved
                    ? 'Confirm Approval'
                    : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL: USER ACCOUNT TOGGLE (SUSPEND / ACTIVATE) */}
      <ConfirmModal
        isOpen={userToggleTarget !== null}
        title={userToggleTarget?.is_active ? 'Suspend User Account' : 'Reactivate User Account'}
        variant={userToggleTarget?.is_active ? 'danger' : 'primary'}
        isLoading={togglingUser}
        confirmLabel={userToggleTarget?.is_active ? 'Yes, Suspend Account' : 'Yes, Reactivate Account'}
        message={
          userToggleTarget && (
            <div>
              <p style={{ marginBottom: '0.75rem' }}>
                Are you sure you want to {userToggleTarget.is_active ? 'suspend' : 'reactivate'} the account for{' '}
                <strong>{userToggleTarget.full_name}</strong> (<code>{userToggleTarget.email}</code>)?
              </p>
              {userToggleTarget.is_active ? (
                <div style={{ padding: '0.75rem', background: 'var(--amber-50)', border: '1px solid var(--amber-200)', borderRadius: 'var(--radius-md)', color: 'var(--amber-800)', fontSize: '0.8125rem' }}>
                  Suspended accounts cannot log in, generate BLE cryptographic tokens, or submit attendance check-ins.
                </div>
              ) : (
                <div style={{ padding: '0.75rem', background: 'var(--emerald-50)', border: '1px solid var(--emerald-200)', borderRadius: 'var(--radius-md)', color: 'var(--emerald-800)', fontSize: '0.8125rem' }}>
                  The user will regain immediate access to log in and participate in attendance sessions.
                </div>
              )}
            </div>
          )
        }
        onConfirm={handleConfirmToggleUser}
        onCancel={() => setUserToggleTarget(null)}
      />

    </div>
  );
};
