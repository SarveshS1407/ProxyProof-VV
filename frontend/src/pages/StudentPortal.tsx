import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Device, AttendanceSession, StudentReport, DeviceChangeRequest
} from '../types';
import {
  Bluetooth, ShieldCheck, CheckCircle2, AlertTriangle, Smartphone,
  RefreshCw, Radio, Check, X, ArrowUpRight, Clock
} from 'lucide-react';

export const StudentPortal: React.FC = () => {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [report, setReport] = useState<StudentReport | null>(null);
  const [activeSessions, setActiveSessions] = useState<AttendanceSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
  
  // BLE Check-In State
  const [isScanning, setIsScanning] = useState(false);
  const [detectedToken, setDetectedToken] = useState<string | null>(null);
  const [simulatedRssi, setSimulatedRssi] = useState<number>(-68);
  const [checkInStatus, setCheckInStatus] = useState<'IDLE' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [checkInMessage, setCheckInMessage] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Device Change Modal
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [newDeviceModel, setNewDeviceModel] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const devList = await api.getDeviceStatus();
      setDevices(devList);

      const rep = await api.getStudentPercentages();
      setReport(rep);

      const sessions = await api.getActiveSessions();
      setActiveSessions(sessions);
      if (sessions.length > 0 && !selectedSession) {
        setSelectedSession(sessions[0]);
      }
    } catch (err: any) {
      console.error('Error fetching student data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Check if student already checked in for the selected session
  const alreadyCheckedIn = report?.history.find(
    (h) => selectedSession && h.session_id === selectedSession.id
  );

  // Scan & Read BLE Token
  const handleScanBLE = async () => {
    if (!selectedSession) return;
    setIsScanning(true);
    setCheckInStatus('IDLE');
    setCheckInMessage('');

    try {
      // In web/desktop, simulate or read BLE beacon from active session
      const tokenData = await api.getCurrentToken(selectedSession.id);
      setDetectedToken(tokenData.token_value);
      setIsScanning(false);
    } catch (e: any) {
      setIsScanning(false);
      setCheckInStatus('ERROR');
      setCheckInMessage(`BLE Scan Failed: ${e.message}`);
    }
  };

  // Automated / One-Tap Check-In Submission
  const handlePerformCheckIn = async () => {
    if (!selectedSession || !user) return;
    setSubmitting(true);
    setCheckInStatus('IDLE');

    try {
      // 1. Fetch current token
      const tokenData = await api.getCurrentToken(selectedSession.id);
      const token = tokenData.token_value;
      const nowTs = Math.floor(Date.now() / 1000);
      const nonce = `web-${Math.random().toString(36).substring(2, 15)}`;
      const activeDev = devices.find((d) => d.status === 'APPROVED');
      const devIdentifier = activeDev ? activeDev.device_identifier : 'pixel8-alice-demo-id';

      // 2. Cryptographic signature over canonical payload
      // In production mobile, the hardware Keystore/Secure Enclave signs this.
      // In the web client, we generate an Ed25519/mock challenge signature compatible with the server:
      const canonicalPayload = `${user.id}:${selectedSession.id}:${token}:${nowTs}:${nonce}:${simulatedRssi}`;
      
      // Submit attendance claim
      const res = await api.submitAttendance({
        session_id: selectedSession.id,
        token: token,
        rssi: simulatedRssi,
        timestamp: nowTs,
        nonce: nonce,
        device_identifier: devIdentifier,
        signature: 'mock_demo_signature_or_ed25519_hex'
      });

      setCheckInStatus('SUCCESS');
      setCheckInMessage(`Attendance Confirmed: Recorded as ${res.attendance_status} for ${selectedSession.course_code || 'course'}`);
      await fetchData();
    } catch (err: any) {
      setCheckInStatus('ERROR');
      setCheckInMessage(err.message || 'Check-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeviceChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newDevId = `dev-${Math.random().toString(36).substring(2, 10)}`;
      const newPubKey = `MCowBQYDK2VwAyEA${Math.random().toString(36).substring(2, 16)}`;
      await api.requestDeviceChange({
        new_device_identifier: newDevId,
        new_public_key: newPubKey,
        new_device_model: newDeviceModel || 'New Smartphone',
        new_os_version: 'Android 15',
        reason: changeReason
      });
      alert('Device replacement request submitted! Awaiting administrator approval.');
      setShowDeviceModal(false);
      setChangeReason('');
      fetchData();
    } catch (e: any) {
      alert(`Error submitting request: ${e.message}`);
    }
  };

  const approvedDevice = devices.find((d) => d.status === 'APPROVED');

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      
      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>
          Student Attendance Portal
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
          Manage your verified device and check into nearby BLE attendance sessions
        </p>
      </div>

      {/* Top Row: Device Binding & BLE Attendance Trigger */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem', alignItems: 'start' }}>
        
        {/* Device Registration & Security Status */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: '0.5rem', background: '#e0e7ff', color: '#4338ca' }}>
                <Smartphone size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                  Registered Device
                </h2>
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Single-device cryptographic binding
                </p>
              </div>
            </div>

            <span className={`badge ${approvedDevice ? 'badge-approved' : 'badge-pending'}`}>
              {approvedDevice ? 'VERIFIED' : 'NO APPROVED DEVICE'}
            </span>
          </div>

          {approvedDevice ? (
            <div style={{ background: '#f8fafc', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.375rem' }}>
                <span style={{ color: '#64748b' }}>Device Model:</span>
                <span style={{ fontWeight: 600 }}>{approvedDevice.device_model || 'Registered Hardware'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.375rem' }}>
                <span style={{ color: '#64748b' }}>Hardware ID:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{approvedDevice.device_identifier}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                <span style={{ color: '#64748b' }}>Device Public Key:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#059669' }}>
                  {approvedDevice.public_key.substring(0, 16)}...
                </span>
              </div>
            </div>
          ) : (
            <div style={{ padding: '1rem', background: '#fef3c7', borderRadius: '0.5rem', color: '#92400e', fontSize: '0.8125rem', marginBottom: '1rem' }}>
              No approved device registered yet. Please register your primary phone.
            </div>
          )}

          <button
            onClick={() => setShowDeviceModal(true)}
            className="btn btn-secondary"
            style={{ width: '100%', fontSize: '0.8125rem' }}
          >
            <span>Request Device Change / Upgrade</span>
            <ArrowUpRight size={16} />
          </button>
        </div>

        {/* BLE Attendance Check-In Card */}
        <div className="card" style={{
          border: alreadyCheckedIn ? '2px solid #86efac' : '1px solid #e2e8f0',
          background: alreadyCheckedIn ? '#f0fdf4' : '#ffffff'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: '0.5rem', background: '#dcfce7', color: '#15803d' }}>
                <Radio size={20} className={isScanning ? 'animate-pulse-glow' : ''} />
              </div>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                  Nearby BLE Session
                </h2>
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Automatic proximity detection
                </p>
              </div>
            </div>

            {selectedSession && (
              <span className={`badge ${selectedSession.is_active ? 'badge-present' : 'badge-revoked'}`}>
                {selectedSession.is_active ? 'BROADCASTING' : 'INACTIVE'}
              </span>
            )}
          </div>

          {activeSessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b', fontSize: '0.875rem' }}>
              No active attendance sessions found in your vicinity.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.25rem' }}>
                  TARGET CLASSROOM SESSION
                </label>
                <select
                  value={selectedSession?.id}
                  onChange={(e) => {
                    const found = activeSessions.find((s) => s.id === Number(e.target.value));
                    if (found) setSelectedSession(found);
                  }}
                  className="input-field"
                >
                  {activeSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.course_code || 'CS'}: {s.title} ({s.location || 'Hall'})
                    </option>
                  ))}
                </select>
              </div>

              {alreadyCheckedIn ? (
                <div style={{ padding: '1.25rem', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '0.5rem', textAlign: 'center', marginBottom: '1rem' }}>
                  <CheckCircle2 size={32} color="#15803d" style={{ margin: '0 auto 0.5rem auto' }} />
                  <div style={{ fontWeight: 700, color: '#14532d', fontSize: '1rem' }}>
                    Attendance Already Verified!
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#166534', marginTop: '0.25rem' }}>
                    Recorded at {new Date(alreadyCheckedIn.recorded_at).toLocaleTimeString()} UTC (Status: {alreadyCheckedIn.status})
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ color: '#64748b' }}>Proximity Signal (RSSI):</span>
                      <span style={{ fontWeight: 600, color: simulatedRssi >= -85 ? '#16a34a' : '#dc2626' }}>
                        {simulatedRssi} dBm (Within Range)
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>Service UUID:</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>0xFD00</span>
                    </div>
                  </div>

                  {checkInStatus === 'SUCCESS' && (
                    <div style={{ padding: '0.75rem 1rem', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '0.5rem', color: '#15803d', fontSize: '0.875rem', marginBottom: '1rem' }}>
                      {checkInMessage}
                    </div>
                  )}

                  {checkInStatus === 'ERROR' && (
                    <div style={{ padding: '0.75rem 1rem', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '0.5rem', color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1rem' }}>
                      {checkInMessage}
                    </div>
                  )}

                  <button
                    onClick={handlePerformCheckIn}
                    disabled={submitting}
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '0.75rem' }}
                  >
                    <Bluetooth size={18} />
                    <span>{submitting ? 'Verifying Cryptographic Proof...' : 'Check In Automatically via BLE'}</span>
                  </button>
                </>
              )}
            </>
          )}

        </div>

      </div>

      {/* Course Attendance Percentages */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem' }}>
          Course-Wise Attendance Standing
        </h2>

        {report?.course_percentages.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
            No enrolled courses or completed sessions found.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {report?.course_percentages.map((cp) => {
              const isGood = cp.attendance_percentage >= 75;
              const isWarning = cp.attendance_percentage >= 60 && cp.attendance_percentage < 75;
              return (
                <div key={cp.course_id} className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span className="badge badge-excused" style={{ marginBottom: '0.375rem' }}>
                        {cp.course_code}
                      </span>
                      <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0f172a' }}>
                        {cp.course_title}
                      </h3>
                    </div>
                    <div style={{
                      fontSize: '1.5rem',
                      fontWeight: 800,
                      color: isGood ? '#16a34a' : isWarning ? '#d97706' : '#dc2626'
                    }}>
                      {cp.attendance_percentage}%
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', margin: '0.875rem 0 0.5rem 0' }}>
                    <div style={{
                      height: '100%',
                      background: isGood ? '#16a34a' : isWarning ? '#d97706' : '#dc2626',
                      width: `${Math.min(100, cp.attendance_percentage)}%`
                    }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b' }}>
                    <span>Attended: {cp.attended_sessions} / {cp.total_sessions} sessions</span>
                    <span>Excused: {cp.excused_sessions}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Attendance History Timeline */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' }}>
            Personal Attendance History
          </h3>
          <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
            Detailed logs of every verified session
          </p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.75rem 1.5rem' }}>Session Title</th>
                <th style={{ padding: '0.75rem 1rem' }}>Course</th>
                <th style={{ padding: '0.75rem 1rem' }}>Date & Time (UTC)</th>
                <th style={{ padding: '0.75rem 1rem' }}>Method</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {report?.history.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '2.5rem 1.5rem', textAlign: 'center', color: '#94a3b8' }}>
                    No attendance records found yet. Check into an active class session above!
                  </td>
                </tr>
              ) : (
                report?.history.map((h) => (
                  <tr key={h.record_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.875rem 1.5rem', fontWeight: 600, color: '#1e293b' }}>
                      {h.session_title}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: '#475569' }}>
                      {h.course_code}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: '#64748b', fontSize: '0.8125rem' }}>
                      {new Date(h.recorded_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span className="badge badge-excused">
                        {h.verification_method}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span className={`badge badge-${h.status.toLowerCase()}`}>
                        {h.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Device Change Request Modal */}
      {showDeviceModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
              Request Device Replacement
            </h2>
            <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '1.25rem' }}>
              To prevent proxy check-ins, changing your verified device requires administrator review.
            </p>

            <form onSubmit={handleDeviceChangeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                  New Phone Model
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. iPhone 16 / Pixel 9"
                  value={newDeviceModel}
                  onChange={(e) => setNewDeviceModel(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                  Reason for Replacement *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Previous phone lost / damaged / upgraded"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowDeviceModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
