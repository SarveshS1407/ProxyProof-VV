import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { AdminStats, DeviceChangeRequest, User, AuditLogItem } from '../types';
import {
  Shield, Users, Smartphone, FileText, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, Activity, Lock
} from 'lucide-react';

export const AdminPortal: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [requests, setRequests] = useState<DeviceChangeRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [activeTab, setActiveTab] = useState<'requests' | 'users' | 'audit'>('requests');
  const [loading, setLoading] = useState(false);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const [s, reqs, u, logs] = await Promise.all([
        api.getAdminStats(),
        api.getDeviceRequests(),
        api.getUsers(),
        api.getAuditLogs(30, 0),
      ]);
      setStats(s);
      setRequests(reqs);
      setUsers(u);
      setAuditLogs(logs);
    } catch (err: any) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  // Review Modal State
  const [reviewTarget, setReviewTarget] = useState<{
    requestId: number;
    approved: boolean;
    deviceModel?: string;
  } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // User Toggle Modal State
  const [userToggleTarget, setUserToggleTarget] = useState<User | null>(null);

  const openReviewModal = (requestId: number, approved: boolean, deviceModel?: string) => {
    setReviewTarget({ requestId, approved, deviceModel });
    setReviewNotes('');
  };

  const handleConfirmReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    if (!reviewTarget.approved && !reviewNotes.trim()) {
      alert('Please provide a reason for rejecting this request.');
      return;
    }
    try {
      await api.reviewDeviceRequest(reviewTarget.requestId, reviewTarget.approved, reviewNotes.trim() || undefined);
      setReviewTarget(null);
      setReviewNotes('');
      await fetchAdminData();
    } catch (e: any) {
      alert(`Error reviewing request: ${e.message}`);
    }
  };

  const handleConfirmToggleUser = async () => {
    if (!userToggleTarget) return;
    try {
      await api.updateUserStatus(userToggleTarget.id, !userToggleTarget.is_active);
      setUserToggleTarget(null);
      await fetchAdminData();
    } catch (e: any) {
      alert(`Error updating user: ${e.message}`);
    }
  };

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>
            System Administration
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Review device change requests, manage users, and inspect security audit logs
          </p>
        </div>

        <button
          onClick={fetchAdminData}
          className="btn btn-secondary"
          style={{ padding: '0.5rem 0.875rem' }}
        >
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats Counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
            Total Users
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
            {stats?.total_users || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            {stats?.total_students || 0} Students • {stats?.total_organisers || 0} Faculty
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
            Active Sessions
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#4f46e5', marginTop: '0.25rem' }}>
            {stats?.active_sessions || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Across {stats?.total_courses || 0} registered courses
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
            Attendance Verified
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>
            {stats?.total_attendance_records || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Cryptographically signed
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
            Pending Device Requests
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#d97706', marginTop: '0.25rem' }}>
            {stats?.pending_device_requests || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Require admin review
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('requests')}
          style={{
            padding: '0.75rem 1.25rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            borderBottom: '2px solid',
            borderColor: activeTab === 'requests' ? '#4f46e5' : 'transparent',
            color: activeTab === 'requests' ? '#4f46e5' : '#64748b',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer'
          }}
        >
          Device Replacement Requests ({requests.filter((r) => r.status === 'PENDING').length})
        </button>

        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '0.75rem 1.25rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            borderBottom: '2px solid',
            borderColor: activeTab === 'users' ? '#4f46e5' : 'transparent',
            color: activeTab === 'users' ? '#4f46e5' : '#64748b',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer'
          }}
        >
          User Accounts ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          style={{
            padding: '0.75rem 1.25rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            borderBottom: '2px solid',
            borderColor: activeTab === 'audit' ? '#4f46e5' : 'transparent',
            color: activeTab === 'audit' ? '#4f46e5' : '#64748b',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer'
          }}
        >
          Security Audit Trail
        </button>
      </div>

      {/* Tab 1: Device Requests */}
      {activeTab === 'requests' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 1.5rem' }}>Request ID</th>
                  <th style={{ padding: '0.75rem 1rem' }}>New Device Model</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Reason for Replacement</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Requested At</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                      No device replacement requests found.
                    </td>
                  </tr>
                ) : (
                  requests.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.875rem 1.5rem', fontWeight: 600 }}>
                        #{r.id}
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.new_device_model || 'Smartphone'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>{r.new_device_identifier}</div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', color: '#334155' }}>
                        {r.reason}
                        {r.admin_notes && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                            Admin Note: {r.admin_notes}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 1rem', color: '#64748b', fontSize: '0.8125rem' }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span className={`badge badge-${r.status.toLowerCase()}`}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 1.5rem', textAlign: 'right' }}>
                        {r.status === 'PENDING' ? (
                          <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                            <button
                              onClick={() => openReviewModal(r.id, true, r.new_device_model)}
                              className="btn btn-success"
                              style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                            >
                              <CheckCircle2 size={14} />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => openReviewModal(r.id, false, r.new_device_model)}
                              className="btn btn-danger"
                              style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                            >
                              <XCircle size={14} />
                              <span>Reject</span>
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Processed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Users */}
      {activeTab === 'users' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 1.5rem' }}>User ID</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Full Name</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Email</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Role</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Student ID / Dept</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.875rem 1.5rem', fontWeight: 600 }}>#{u.id}</td>
                    <td style={{ padding: '0.875rem 1rem', fontWeight: 600, color: '#0f172a' }}>{u.full_name}</td>
                    <td style={{ padding: '0.875rem 1rem', color: '#475569' }}>{u.email}</td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span className={`badge badge-${u.role === 'admin' ? 'late' : u.role === 'organiser' ? 'excused' : 'approved'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: '#64748b' }}>
                      {u.student_profile?.student_id_number || '—'}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span className={`badge ${u.is_active ? 'badge-present' : 'badge-absent'}`}>
                        {u.is_active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1.5rem', textAlign: 'right' }}>
                      <button
                        onClick={() => setUserToggleTarget(u)}
                        className={`btn ${u.is_active ? 'btn-secondary' : 'btn-primary'}`}
                        style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                      >
                        {u.is_active ? 'Suspend' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Audit Trail */}
      {activeTab === 'audit' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 1.5rem' }}>Timestamp (UTC)</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Action</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Entity</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Actor</th>
                  <th style={{ padding: '0.75rem 1.5rem' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1.5rem', color: '#64748b', fontSize: '0.8125rem' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#1e293b' }}>
                      {log.action}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                      {log.entity_type} #{log.entity_id}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: '#4f46e5', fontWeight: 500 }}>
                      {log.user_email}
                    </td>
                    <td style={{ padding: '0.75rem 1.5rem', color: '#334155' }}>
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Review Device Replacement Request */}
      {reviewTarget && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
              {reviewTarget.approved ? 'Approve Device Replacement' : 'Reject Device Replacement'}
            </h2>
            <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Request #{reviewTarget.requestId} • New Model: <strong>{reviewTarget.deviceModel || 'Smartphone'}</strong>
            </p>

            <form onSubmit={handleConfirmReview} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                  {reviewTarget.approved ? 'Approval Remarks (Optional)' : 'Rejection Reason (Required)'}
                </label>
                <textarea
                  rows={3}
                  required={!reviewTarget.approved}
                  placeholder={reviewTarget.approved ? 'e.g. Identity verified via student services office' : 'e.g. Student ID verification failed'}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn ${reviewTarget.approved ? 'btn-success' : 'btn-danger'}`}
                >
                  {reviewTarget.approved ? 'Confirm Approval' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm User Status Modification */}
      {userToggleTarget && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
              {userToggleTarget.is_active ? 'Suspend User Account' : 'Activate User Account'}
            </h2>
            <p style={{ fontSize: '0.875rem', color: '#334155', margin: '1rem 0' }}>
              Are you sure you want to <strong>{userToggleTarget.is_active ? 'suspend' : 're-activate'}</strong> the account for{' '}
              <strong>{userToggleTarget.full_name}</strong> ({userToggleTarget.email})?
            </p>
            {userToggleTarget.is_active && (
              <div style={{ padding: '0.75rem', background: '#fef3c7', borderRadius: '0.375rem', color: '#92400e', fontSize: '0.8125rem', marginBottom: '1rem' }}>
                Suspended users will immediately be blocked from logging in and checking into attendance sessions.
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => setUserToggleTarget(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmToggleUser}
                className={`btn ${userToggleTarget.is_active ? 'btn-danger' : 'btn-primary'}`}
              >
                {userToggleTarget.is_active ? 'Yes, Suspend Account' : 'Yes, Activate Account'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
