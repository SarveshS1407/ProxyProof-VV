import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getOrCreateDeviceKeys, signCanonicalPayload } from '../utils/crypto';
import { StatusPill } from '../components/common/StatusPill';
import { SignalMeter } from '../components/common/SignalMeter';
import { EmptyState } from '../components/common/EmptyState';
import {
  Device, AttendanceSession, StudentReport, DeviceChangeRequest, StudentHistoryItem
} from '../types';
import {
  Bluetooth, ShieldCheck, CheckCircle2, AlertTriangle, Smartphone,
  RefreshCw, Radio, Check, X, ArrowUpRight, Clock, BookOpen, User,
  Filter, Search, Layers, ChevronRight, Key, Sparkles
} from 'lucide-react';

export const StudentPortal: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'checkin' | 'courses' | 'device' | 'profile'>('checkin');
  const [devices, setDevices] = useState<Device[]>([]);
  const [report, setReport] = useState<StudentReport | null>(null);
  const [activeSessions, setActiveSessions] = useState<AttendanceSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
  
  // BLE Check-In State
  const [simulatedRssi, setSimulatedRssi] = useState<number>(-68);
  const [detectedToken, setDetectedToken] = useState<string | null>(null);
  const [checkInStep, setCheckInStep] = useState<'IDLE' | 'SCANNING' | 'SIGNING' | 'SUBMITTING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [checkInMessage, setCheckInMessage] = useState<string>('');

  // Device Change Modal
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [newDeviceModel, setNewDeviceModel] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [submittingChange, setSubmittingChange] = useState(false);

  // Filters
  const [courseFilter, setCourseFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [devList, rep, sessions] = await Promise.all([
        api.getDeviceStatus(),
        api.getStudentPercentages(),
        api.getActiveSessions()
      ]);

      setDevices(devList);
      setReport(rep);
      setActiveSessions(sessions);
      if (sessions.length > 0 && !selectedSession) {
        setSelectedSession(sessions[0]);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Error loading student records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const approvedDevice = devices.find((d) => d.status === 'APPROVED');

  // Check if student already checked in for the selected session
  const alreadyCheckedIn = report?.history.find(
    (h) => selectedSession && h.session_id === selectedSession.id
  );

  // Register current device (initial registration)
  const handleRegisterCurrentDevice = async () => {
    try {
      setLoading(true);
      const keyInfo = await getOrCreateDeviceKeys();
      await api.registerDevice({
        device_identifier: keyInfo.deviceIdentifier,
        public_key: keyInfo.publicKeyPem,
        device_model: keyInfo.deviceModel,
        os_version: keyInfo.osVersion
      });
      showToast('success', 'Device successfully bound and verified!');
      await fetchData();
    } catch (err: any) {
      showToast('error', `Device registration failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Perform full BLE scan + WebCrypto digital challenge + submission
  const handlePerformCheckIn = async () => {
    if (!selectedSession || !user) return;
    if (!approvedDevice) {
      showToast('error', 'No approved device found. Register this device first.');
      setActiveTab('device');
      return;
    }

    try {
      // Step 1: Scan BLE Beacon
      setCheckInStep('SCANNING');
      setCheckInMessage('Scanning nearby Bluetooth Low Energy beacon on UUID 0xFFF0...');
      
      const tokenData = await api.getCurrentToken(selectedSession.id);
      const token = tokenData.token_value;
      setDetectedToken(token);

      // Step 2: Proof of possession signing
      setCheckInStep('SIGNING');
      setCheckInMessage('Generating hardware proof-of-possession signature with WebCrypto P-256...');
      
      const nowTs = Math.floor(Date.now() / 1000);
      const nonce = `web-${Math.random().toString(36).substring(2, 12)}`;
      const canonicalPayload = `${user.id}:${selectedSession.id}:${token}:${nowTs}:${nonce}:${simulatedRssi}`;
      const signatureHex = await signCanonicalPayload(canonicalPayload);

      // Step 3: Server submission
      setCheckInStep('SUBMITTING');
      setCheckInMessage('Submitting attendance claim to server for verification...');

      const res = await api.submitAttendance({
        session_id: selectedSession.id,
        token: token,
        rssi: simulatedRssi,
        timestamp: nowTs,
        nonce: nonce,
        device_identifier: approvedDevice.device_identifier,
        signature: signatureHex
      });

      // Step 4: Success
      setCheckInStep('SUCCESS');
      setCheckInMessage(`Attendance Confirmed: Recorded as ${res.attendance_status} for ${selectedSession.course_code || 'course'}`);
      showToast('success', `Attendance Confirmed: ${selectedSession.title}`);
      await fetchData();
    } catch (err: any) {
      setCheckInStep('ERROR');
      setCheckInMessage(err.message || 'Check-in failed');
      showToast('error', err.message || 'Check-in failed');
    }
  };

  const handleDeviceChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeReason.trim()) return;

    try {
      setSubmittingChange(true);
      localStorage.removeItem('proxyproof_device_priv_jwk');
      localStorage.removeItem('proxyproof_device_pub_pem');
      localStorage.removeItem('proxyproof_device_identifier');
      const newKeys = await getOrCreateDeviceKeys();

      await api.requestDeviceChange({
        new_device_identifier: newKeys.deviceIdentifier,
        new_public_key: newKeys.publicKeyPem,
        new_device_model: newDeviceModel || newKeys.deviceModel,
        new_os_version: newKeys.osVersion,
        reason: changeReason.trim()
      });

      showToast('info', 'Device replacement request submitted! Awaiting administrator approval.');
      setShowDeviceModal(false);
      setChangeReason('');
      setNewDeviceModel('');
      await fetchData();
    } catch (e: any) {
      showToast('error', `Error submitting request: ${e.message}`);
    } finally {
      setSubmittingChange(false);
    }
  };

  // Filter history
  const filteredHistory = report?.history.filter((h) => {
    if (courseFilter === 'ALL') return true;
    return String(h.course_id) === courseFilter;
  }) || [];

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      
      {/* Student Welcome & Status Overview Banner */}
      <div className="card" style={{ marginBottom: '1.75rem', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                Welcome, {user?.full_name}
              </h1>
              <span className="badge badge-approved">STUDENT</span>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
              ID: <strong>{user?.student_profile?.student_id_number || 'STU-PROVISIONAL'}</strong> • Department: {user?.student_profile?.department || 'Engineering'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.875rem',
              borderRadius: '0.5rem',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              fontSize: '0.75rem',
              color: '#334155'
            }}>
              <Bluetooth size={16} color="#4f46e5" />
              <span>Adapter: <strong>BLE 5.x Ready</strong></span>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.875rem',
              borderRadius: '0.5rem',
              background: approvedDevice ? '#ecfdf5' : '#fffbeb',
              border: approvedDevice ? '1px solid #a7f3d0' : '1px solid #fde68a',
              fontSize: '0.75rem',
              color: approvedDevice ? '#065f46' : '#92400e'
            }}>
              <Smartphone size={16} />
              <span>Device: <strong>{approvedDevice ? 'Bound' : 'Not Registered'}</strong></span>
            </div>

            <button
              onClick={fetchData}
              disabled={loading}
              className="btn btn-secondary btn-sm"
              title="Refresh attendance records"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '1.75rem', gap: '0.5rem', overflowX: 'auto' }}>
        <button
          onClick={() => setActiveTab('checkin')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            borderBottom: activeTab === 'checkin' ? '2px solid #4f46e5' : '2px solid transparent',
            color: activeTab === 'checkin' ? '#4f46e5' : '#64748b',
            fontWeight: 600,
            fontSize: '0.875rem',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          <Radio size={16} />
          <span>Live BLE Check-In</span>
        </button>

        <button
          onClick={() => setActiveTab('courses')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            borderBottom: activeTab === 'courses' ? '2px solid #4f46e5' : '2px solid transparent',
            color: activeTab === 'courses' ? '#4f46e5' : '#64748b',
            fontWeight: 600,
            fontSize: '0.875rem',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          <BookOpen size={16} />
          <span>My Courses & Stats</span>
        </button>

        <button
          onClick={() => setActiveTab('device')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            borderBottom: activeTab === 'device' ? '2px solid #4f46e5' : '2px solid transparent',
            color: activeTab === 'device' ? '#4f46e5' : '#64748b',
            fontWeight: 600,
            fontSize: '0.875rem',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          <Smartphone size={16} />
          <span>Registered Device</span>
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            borderBottom: activeTab === 'profile' ? '2px solid #4f46e5' : '2px solid transparent',
            color: activeTab === 'profile' ? '#4f46e5' : '#64748b',
            fontWeight: 600,
            fontSize: '0.875rem',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          <User size={16} />
          <span>Account Profile</span>
        </button>
      </div>

      {/* TAB 1: LIVE BLE CHECK-IN */}
      {activeTab === 'checkin' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(320px, 1fr)', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* Active Session Card */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <div style={{ padding: '0.5rem', borderRadius: '0.5rem', background: '#dcfce7', color: '#15803d' }}>
                  <Radio size={20} className={selectedSession?.is_active ? 'animate-pulse-glow' : ''} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                    Nearby Classroom Session
                  </h2>
                  <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Target BLE session detected in physical range
                  </p>
                </div>
              </div>

              {selectedSession && (
                <StatusPill status={selectedSession.is_active ? 'LIVE' : 'CLOSED'} />
              )}
            </div>

            {activeSessions.length === 0 ? (
              <EmptyState
                icon={Radio}
                title="No Active Sessions In Range"
                description="Your instructors start attendance sessions during lectures. When a session begins nearby, it will automatically appear here."
              />
            ) : (
              <div>
                <div style={{ marginBottom: '1rem' }}>
                  <label className="input-label">Select Session to Verify</label>
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
                        {s.course_code || 'CRS'}: {s.title} ({s.location || 'Hall'})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedSession && (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1rem', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
                      <span style={{ color: '#64748b' }}>Course:</span>
                      <span style={{ fontWeight: 600 }}>{selectedSession.course_code || 'CS401'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
                      <span style={{ color: '#64748b' }}>Location:</span>
                      <span style={{ fontWeight: 600 }}>{selectedSession.location || 'Auditorium'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
                      <span style={{ color: '#64748b' }}>Token Rotation:</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>Every {selectedSession.token_rotation_seconds || 10}s</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem' }}>
                      <span style={{ color: '#64748b' }}>Signal Strength (RSSI):</span>
                      <SignalMeter rssi={simulatedRssi} minRssi={selectedSession.min_rssi || -85} />
                    </div>
                  </div>
                )}

                {/* Simulated Distance / Proximity Slider (For Testing/Verification) */}
                <div style={{ marginBottom: '1.25rem', background: '#f1f5f9', padding: '0.875rem', borderRadius: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#475569', marginBottom: '0.375rem' }}>
                    <span style={{ fontWeight: 600 }}>Simulate Distance / Signal:</span>
                    <span>{simulatedRssi} dBm</span>
                  </div>
                  <input
                    type="range"
                    min="-95"
                    max="-50"
                    value={simulatedRssi}
                    onChange={(e) => setSimulatedRssi(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: '#64748b', marginTop: '0.25rem' }}>
                    <span>Far (-95 dBm)</span>
                    <span style={{ color: simulatedRssi >= -85 ? '#059669' : '#e11d48' }}>Threshold: -85 dBm</span>
                    <span>Close (-50 dBm)</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Verification Controller Card */}
          <div className="card" style={{
            border: alreadyCheckedIn ? '2px solid #86efac' : '1px solid #e2e8f0',
            background: alreadyCheckedIn ? '#f0fdf4' : '#ffffff'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <div style={{ padding: '0.5rem', borderRadius: '0.5rem', background: '#e0e7ff', color: '#4338ca' }}>
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                    Cryptographic Verification
                  </h2>
                  <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Server-side validation & anti-proxy proof
                  </p>
                </div>
              </div>
            </div>

            {alreadyCheckedIn ? (
              <div style={{ padding: '1.5rem', background: '#ffffff', border: '1px solid #86efac', borderRadius: '0.75rem', textAlign: 'center' }}>
                <CheckCircle2 size={36} color="#15803d" style={{ margin: '0 auto 0.75rem auto' }} />
                <h3 style={{ fontWeight: 700, color: '#14532d', fontSize: '1.125rem', marginBottom: '0.25rem' }}>
                  Attendance Confirmed!
                </h3>
                <p style={{ fontSize: '0.8125rem', color: '#166534', marginBottom: '1rem' }}>
                  Your physical presence has been authenticated and recorded for this session.
                </p>
                <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center', background: '#dcfce7', padding: '0.375rem 0.75rem', borderRadius: '0.5rem', fontSize: '0.75rem', color: '#14532d' }}>
                  <Clock size={14} />
                  <span>Verified at {new Date(alreadyCheckedIn.recorded_at).toLocaleTimeString()} UTC</span>
                  <span>•</span>
                  <span>Method: {alreadyCheckedIn.verification_method}</span>
                </div>
              </div>
            ) : (
              <div>
                {/* Stepper Status Feedback */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: approvedDevice ? '#dcfce7' : '#fee2e2',
                      color: approvedDevice ? '#15803d' : '#b91c1c',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {approvedDevice ? <Check size={14} /> : <X size={14} />}
                    </div>
                    <span>Hardware Binding: <strong>{approvedDevice ? 'Device Approved' : 'No Approved Device'}</strong></span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: simulatedRssi >= -85 ? '#dcfce7' : '#fee2e2',
                      color: simulatedRssi >= -85 ? '#15803d' : '#b91c1c',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {simulatedRssi >= -85 ? <Check size={14} /> : <X size={14} />}
                    </div>
                    <span>Proximity Threshold: <strong>{simulatedRssi >= -85 ? 'Inside Classroom' : 'Too Far Away'}</strong></span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: detectedToken ? '#dcfce7' : '#f1f5f9',
                      color: detectedToken ? '#15803d' : '#64748b',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {detectedToken ? <Check size={14} /> : <Sparkles size={12} />}
                    </div>
                    <span>Rotating Beacon Token: <strong>{detectedToken ? detectedToken.substring(0, 12) + '...' : 'Awaiting Scan'}</strong></span>
                  </div>
                </div>

                {checkInStep === 'ERROR' && (
                  <div style={{ padding: '0.875rem 1rem', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '0.5rem', color: '#be123c', fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
                    {checkInMessage}
                  </div>
                )}

                {checkInStep === 'SCANNING' || checkInStep === 'SIGNING' || checkInStep === 'SUBMITTING' ? (
                  <div style={{ padding: '0.875rem 1rem', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '0.5rem', color: '#3730a3', fontSize: '0.8125rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>{checkInMessage}</span>
                  </div>
                ) : null}

                <button
                  onClick={handlePerformCheckIn}
                  disabled={checkInStep === 'SCANNING' || checkInStep === 'SIGNING' || checkInStep === 'SUBMITTING' || !approvedDevice || !selectedSession}
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%' }}
                >
                  <Bluetooth size={20} />
                  <span>
                    {!approvedDevice
                      ? 'Register Device First to Enable Check-In'
                      : !selectedSession
                      ? 'No Active Session Selected'
                      : 'Authenticate & Record Attendance via BLE'}
                  </span>
                </button>
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 2: MY COURSES & STATS */}
      {activeTab === 'courses' && (
        <div>
          {/* Summary Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Overall Attendance
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: (report?.overall_percentage || 0) >= 75 ? '#059669' : '#e11d48', marginTop: '0.25rem' }}>
                {report?.overall_percentage.toFixed(1) || '0.0'}%
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Across {report?.course_percentages.length || 0} registered courses
              </div>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Total Sessions Attended
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                {report?.history.filter((h) => h.status === 'PRESENT' || h.status === 'LATE').length || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                + {report?.history.filter((h) => h.status === 'EXCUSED').length || 0} approved excused sessions
              </div>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                Examination Eligibility
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.5rem', color: (report?.overall_percentage || 0) >= 75 ? '#059669' : '#b45309' }}>
                {(report?.overall_percentage || 0) >= 75 ? 'Eligible (≥ 75%)' : 'Caution (< 75%)'}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                University minimum threshold: 75.0%
              </div>
            </div>
          </div>

          {/* Course-Wise Percentage Breakdown Cards */}
          <div style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>
              Course Attendance Breakdown
            </h2>

            {report?.course_percentages.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No Enrolled Courses Found"
                description="You have not been enrolled in any courses yet. Ask your instructor to enroll your student ID."
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                {report?.course_percentages.map((c) => {
                  const pct = c.attendance_percentage;
                  const isEligible = pct >= 75;
                  return (
                    <div key={c.course_id} className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#0f172a' }}>
                            {c.course_code}: {c.course_title}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.125rem' }}>
                            {c.attended_sessions} attended • {c.excused_sessions} excused of {c.total_sessions} conducted
                          </div>
                        </div>

                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: isEligible ? '#059669' : '#e11d48' }}>
                          {pct.toFixed(1)}%
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div style={{ width: '100%', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(pct, 100)}%`,
                          height: '100%',
                          backgroundColor: isEligible ? '#059669' : '#e11d48',
                          borderRadius: '4px',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Historical Logs Table */}
          <div className="table-wrapper">
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>
                Attendance Verification History
              </div>

              {/* Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Filter size={15} color="#64748b" />
                <select
                  value={courseFilter}
                  onChange={(e) => setCourseFilter(e.target.value)}
                  className="input-field"
                  style={{ width: 'auto', padding: '0.35rem 0.75rem', fontSize: '0.8125rem' }}
                >
                  <option value="ALL">All Courses</option>
                  {report?.course_percentages.map((c) => (
                    <option key={c.course_id} value={String(c.course_id)}>
                      {c.course_code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp (UTC)</th>
                    <th>Course</th>
                    <th>Session Title</th>
                    <th>Status</th>
                    <th>Method</th>
                    <th>Signal (RSSI)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: '#94a3b8' }}>
                        No attendance records match your filter.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((h) => (
                      <tr key={h.record_id}>
                        <td style={{ color: '#64748b', fontSize: '0.8125rem' }}>
                          {new Date(h.recorded_at).toLocaleString()}
                        </td>
                        <td style={{ fontWeight: 600, color: '#0f172a' }}>
                          {h.course_code}
                        </td>
                        <td style={{ color: '#334155' }}>
                          {h.session_title}
                        </td>
                        <td>
                          <StatusPill status={h.status} size="sm" />
                        </td>
                        <td>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: h.verification_method === 'BLE' ? '#4f46e5' : '#b45309' }}>
                            {h.verification_method}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#64748b' }}>
                            {h.rssi !== null && h.rssi !== undefined ? `${h.rssi} dBm` : '—'}
                          </span>
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

      {/* TAB 3: REGISTERED DEVICE */}
      {activeTab === 'device' && (
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <div style={{ padding: '0.5rem', borderRadius: '0.5rem', background: '#e0e7ff', color: '#4338ca' }}>
                  <Smartphone size={22} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' }}>
                    Bound Device Identity
                  </h2>
                  <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                    Cryptographic hardware identity for anti-proxy verification
                  </p>
                </div>
              </div>

              {approvedDevice && <StatusPill status="APPROVED" />}
            </div>

            {approvedDevice ? (
              <div>
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.625rem' }}>
                    <span style={{ color: '#64748b' }}>Device Model:</span>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{approvedDevice.device_model || 'Registered Hardware'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.625rem' }}>
                    <span style={{ color: '#64748b' }}>Operating System:</span>
                    <span style={{ color: '#0f172a' }}>{approvedDevice.os_version || 'Web Client'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.625rem' }}>
                    <span style={{ color: '#64748b' }}>Hardware Fingerprint:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#475569' }}>{approvedDevice.device_identifier}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Registered Public Key (NIST P-256):</span>
                    <pre style={{
                      marginTop: '0.375rem',
                      padding: '0.625rem',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '0.375rem',
                      fontSize: '0.6875rem',
                      fontFamily: 'var(--font-mono)',
                      color: '#059669',
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all'
                    }}>
                      {approvedDevice.public_key}
                    </pre>
                  </div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '0.5rem', padding: '0.875rem 1rem', fontSize: '0.8125rem', color: '#1e40af', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                  <strong>Security Policy:</strong> You are permitted one approved device at a time. If you replace or lose your phone, you must submit a device replacement request for administrator approval.
                </div>

                <button
                  onClick={() => setShowDeviceModal(true)}
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                >
                  <span>Request Device Replacement / Upgrade</span>
                  <ArrowUpRight size={16} />
                </button>
              </div>
            ) : (
              <div>
                <div style={{ padding: '1.25rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.75rem', color: '#92400e', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>No Approved Device Registered</div>
                  ProxyProof requires a single verified device to authenticate attendance claims. Click the button below to generate your cryptographic keypair and bind this device to your student profile.
                </div>

                <button
                  onClick={handleRegisterCurrentDevice}
                  disabled={loading}
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%' }}
                >
                  <ShieldCheck size={20} />
                  <span>{loading ? 'Generating Keypair...' : 'Register & Verify This Device Now'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: ACCOUNT PROFILE */}
      {activeTab === 'profile' && (
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <div style={{ padding: '0.625rem', borderRadius: '0.5rem', background: '#e0e7ff', color: '#4338ca' }}>
                <User size={24} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' }}>
                  Student Identity Profile
                </h2>
                <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                  Institutional student credentials and enrollment details
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.625rem' }}>
                <span style={{ color: '#64748b' }}>Full Legal Name:</span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>{user?.full_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.625rem' }}>
                <span style={{ color: '#64748b' }}>Student ID Number:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#4f46e5' }}>
                  {user?.student_profile?.student_id_number || 'STU-2024-001'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.625rem' }}>
                <span style={{ color: '#64748b' }}>Academic Department:</span>
                <span style={{ fontWeight: 500, color: '#0f172a' }}>
                  {user?.student_profile?.department || 'Computer Science & Engineering'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.625rem' }}>
                <span style={{ color: '#64748b' }}>Batch / Class Cohort:</span>
                <span style={{ fontWeight: 500, color: '#0f172a' }}>
                  {user?.student_profile?.batch || '2024–2028'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ color: '#64748b' }}>Institutional Email:</span>
                <span style={{ fontWeight: 500, color: '#0f172a' }}>{user?.email}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Device Replacement Modal */}
      {showDeviceModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
              Request Device Replacement
            </h2>
            <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '1.25rem', lineHeight: 1.4 }}>
              To prevent attendance proxy abuse, changing your bound device requires administrator review. Your old device remains active until the change is approved.
            </p>

            <form onSubmit={handleDeviceChangeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="input-label">New Device Model Name</label>
                <input
                  type="text"
                  placeholder="e.g. Google Pixel 8 Pro / iPhone 15"
                  value={newDeviceModel}
                  onChange={(e) => setNewDeviceModel(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label className="input-label">Reason for Replacement (Required)</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Upgraded to a new phone; old device display broken"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowDeviceModal(false)}
                  disabled={submittingChange}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingChange || !changeReason.trim()}
                  className="btn btn-primary"
                >
                  {submittingChange ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
