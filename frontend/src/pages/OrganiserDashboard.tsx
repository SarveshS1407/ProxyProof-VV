import React, { useState, useEffect, useRef } from 'react';
import { api, WS_BASE_URL } from '../api/client';
import { Course, AttendanceSession, AttendanceRecord, SessionTokenInfo } from '../types';
import {
  Play, Square, Download, Plus, Users, Clock, Radio, CheckCircle,
  AlertCircle, Edit2, ShieldCheck, RefreshCw, Smartphone, BookOpen, UserPlus
} from 'lucide-react';

export const OrganiserDashboard: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [tokenInfo, setTokenInfo] = useState<SessionTokenInfo | null>(null);
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<string>('EXCUSED');
  const [overrideReason, setOverrideReason] = useState<string>('');
  
  // Course Management Modals
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseTitle, setNewCourseTitle] = useState('');
  const [newCourseDesc, setNewCourseDesc] = useState('');

  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollCourseId, setEnrollCourseId] = useState<number>(0);
  const [enrollStudentId, setEnrollStudentId] = useState('');

  // New Session Form
  const [newCourseId, setNewCourseId] = useState<number>(0);
  const [newTitle, setNewTitle] = useState('');
  const [newLocation, setNewLocation] = useState('Lecture Hall A');
  const [newDuration, setNewDuration] = useState(60);
  const [newMinRssi, setNewMinRssi] = useState(-85);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const c = await api.getCourses();
      setCourses(c);
      if (c.length > 0 && !newCourseId) {
        setNewCourseId(c[0].id);
      }

      const activeList = await api.getActiveSessions();
      setSessions(activeList);
      if (activeList.length > 0) {
        selectSession(activeList[0]);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const selectSession = async (session: AttendanceSession) => {
    setActiveSession(session);
    try {
      const records = await api.getSessionAttendance(session.id);
      setAttendanceRecords(records);

      if (session.is_active && !session.is_closed) {
        const token = await api.getCurrentToken(session.id);
        setTokenInfo(token);
      } else {
        setTokenInfo(null);
      }
    } catch (e: any) {
      console.error('Error fetching session details:', e);
    }
  };

  // Live WebSocket Connection
  useEffect(() => {
    if (!activeSession) return;

    const token = localStorage.getItem('proxyproof_token');
    const wsUrl = `${WS_BASE_URL}/ws/sessions/${activeSession.id}${token ? `?token=${token}` : ''}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'ATTENDANCE_RECORDED') {
          setAttendanceRecords((prev) => [data.record, ...prev.filter((r) => r.student_id !== data.record.student_id)]);
          setActiveSession((prev) => prev ? { ...prev, attendance_count: prev.attendance_count + 1 } : null);
        } else if (data.event === 'ATTENDANCE_OVERRIDE') {
          setAttendanceRecords((prev) => prev.map((r) => r.id === data.record.id ? data.record : r));
        } else if (data.event === 'SESSION_STATUS_CHANGED') {
          setActiveSession((prev) => prev ? { ...prev, is_active: data.is_active, is_closed: data.is_closed } : null);
        }
      } catch (err) {
        console.error('WS Parse Error:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, [activeSession?.id]);

  // Periodic Token & Countdown Polling
  useEffect(() => {
    if (!activeSession || !activeSession.is_active || activeSession.is_closed) return;

    const timer = setInterval(async () => {
      try {
        const info = await api.getCurrentToken(activeSession.id);
        setTokenInfo(info);
      } catch (e) {
        // Session might have been closed
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSession?.id, activeSession?.is_active, activeSession?.is_closed]);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseCode.trim() || !newCourseTitle.trim()) return;
    try {
      const created = await api.createCourse({
        code: newCourseCode.trim().toUpperCase(),
        title: newCourseTitle.trim(),
        description: newCourseDesc.trim() || undefined
      });
      setNewCourseCode('');
      setNewCourseTitle('');
      setNewCourseDesc('');
      setShowCourseModal(false);
      await fetchInitialData();
      setNewCourseId(created.id);
      alert(`Course "${created.code}: ${created.title}" created successfully!`);
    } catch (err: any) {
      alert(`Error creating course: ${err.message}`);
    }
  };

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCourseId = enrollCourseId || (courses.length > 0 ? courses[0].id : 0);
    if (!targetCourseId) {
      alert('Please select a course to enroll students in.');
      return;
    }
    if (!enrollStudentId.trim()) return;
    try {
      const res = await api.enrollStudent(targetCourseId, enrollStudentId.trim());
      setEnrollStudentId('');
      setShowEnrollModal(false);
      await fetchInitialData();
      alert(res.message || 'Student enrolled successfully!');
    } catch (err: any) {
      alert(`Error enrolling student: ${err.message}`);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createSession({
        course_id: newCourseId,
        title: newTitle,
        location: newLocation,
        duration_minutes: newDuration,
        token_rotation_seconds: 10,
        min_rssi: newMinRssi
      });
      setShowCreateModal(false);
      setNewTitle('');
      await fetchInitialData();
      selectSession(created);
    } catch (err: any) {
      alert(`Error creating session: ${err.message}`);
    }
  };

  const handleStartSession = async () => {
    if (!activeSession) return;
    try {
      await api.startSession(activeSession.id);
      const updated = await api.getSessionDetail(activeSession.id);
      setActiveSession(updated);
      const token = await api.getCurrentToken(activeSession.id);
      setTokenInfo(token);
    } catch (err: any) {
      alert(`Error starting session: ${err.message}`);
    }
  };

  const handleStopSession = async () => {
    if (!activeSession) return;
    if (!confirm('Are you sure you want to stop and close this attendance session?')) return;
    try {
      await api.stopSession(activeSession.id);
      const updated = await api.getSessionDetail(activeSession.id);
      setActiveSession(updated);
      setTokenInfo(null);
    } catch (err: any) {
      alert(`Error stopping session: ${err.message}`);
    }
  };

  const handleManualOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !selectedRecord) return;
    try {
      const updated = await api.manualOverride({
        session_id: activeSession.id,
        student_id: selectedRecord.student_id,
        status: overrideStatus,
        reason: overrideReason
      });
      setAttendanceRecords((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      setShowOverrideModal(false);
      setSelectedRecord(null);
      setOverrideReason('');
    } catch (err: any) {
      alert(`Override failed: ${err.message}`);
    }
  };

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>
            Organiser Attendance Console
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Broadcast rotating BLE beacons, track live student presence, and manage records
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowCourseModal(true)}
            className="btn btn-secondary"
            title="Create a new course"
          >
            <BookOpen size={18} />
            <span>New Course</span>
          </button>

          <button
            onClick={() => {
              if (courses.length > 0 && !enrollCourseId) {
                setEnrollCourseId(courses[0].id);
              }
              setShowEnrollModal(true);
            }}
            className="btn btn-secondary"
            title="Enroll a student into a course"
          >
            <UserPlus size={18} />
            <span>Enroll Student</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            <Plus size={18} />
            <span>Create Session</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Active Session Controller & Attendance Table */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Left Column: Session Controls & Token Broadcaster */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Active Session Selector Card */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: '1rem' }}>
              Select Attendance Session
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
              {sessions.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.875rem', textAlign: 'center', padding: '1rem' }}>
                  No active sessions found. Create one to begin.
                </div>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => selectSession(s)}
                    style={{
                      textAlign: 'left',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid',
                      borderColor: activeSession?.id === s.id ? '#4f46e5' : '#e2e8f0',
                      background: activeSession?.id === s.id ? '#eef2ff' : '#ffffff',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>
                        {s.title}
                      </span>
                      <span className={`badge ${s.is_active ? 'badge-present' : 'badge-revoked'}`}>
                        {s.is_active ? 'LIVE' : s.is_closed ? 'CLOSED' : 'PENDING'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                      {s.course_code || 'CS301'} • {s.attendance_count} / {s.enrolled_count} present
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {activeSession && (
            <>
              {/* Rotating BLE Broadcast Card */}
              <div className="card" style={{
                background: activeSession.is_active ? 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)' : '#ffffff',
                border: activeSession.is_active ? '2px solid #86efac' : '1px solid #e2e8f0'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      background: activeSession.is_active ? '#dcfce7' : '#f1f5f9',
                      color: activeSession.is_active ? '#15803d' : '#64748b'
                    }}>
                      <Radio size={20} className={activeSession.is_active ? 'animate-pulse-glow' : ''} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#0f172a' }}>
                        BLE Broadcast Status
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {activeSession.is_active ? 'Actively Advertising' : 'Beacon Inactive'}
                      </div>
                    </div>
                  </div>

                  <span className={`badge ${activeSession.is_active ? 'badge-present' : 'badge-revoked'}`}>
                    {activeSession.is_active ? 'ADVERTISING' : 'STOPPED'}
                  </span>
                </div>

                {activeSession.is_active && tokenInfo ? (
                  <div style={{ background: '#0f172a', borderRadius: '0.625rem', padding: '1rem', color: '#f8fafc', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
                      <span>ROTATING TOKEN (16-HEX)</span>
                      <span>Next in {tokenInfo.seconds_remaining}s</span>
                    </div>

                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '1.375rem',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      color: '#38bdf8',
                      textAlign: 'center',
                      padding: '0.5rem 0'
                    }}>
                      {tokenInfo.token_value}
                    </div>

                    {/* Progress Bar for Token Expiration */}
                    <div style={{ width: '100%', height: '4px', background: '#334155', borderRadius: '2px', overflow: 'hidden', marginTop: '0.5rem' }}>
                      <div style={{
                        height: '100%',
                        background: '#38bdf8',
                        width: `${(tokenInfo.seconds_remaining / 10) * 100}%`,
                        transition: 'width 1s linear'
                      }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: '#64748b', marginTop: '0.75rem' }}>
                      <span>UUID: 0xFD00</span>
                      <span>Window: #{tokenInfo.window_index}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem', textAlign: 'center', fontSize: '0.8125rem', color: '#64748b', marginBottom: '1.25rem' }}>
                    Start session to broadcast short-lived rotating tokens over Bluetooth Low Energy.
                  </div>
                )}

                {/* Session Action Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {!activeSession.is_active && !activeSession.is_closed ? (
                    <button
                      onClick={handleStartSession}
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                    >
                      <Play size={16} />
                      <span>Start Session</span>
                    </button>
                  ) : activeSession.is_active ? (
                    <button
                      onClick={handleStopSession}
                      className="btn btn-danger"
                      style={{ flex: 1 }}
                    >
                      <Square size={16} />
                      <span>Close Session</span>
                    </button>
                  ) : (
                    <div style={{ width: '100%', textAlign: 'center', fontSize: '0.8125rem', color: '#94a3b8', fontWeight: 600 }}>
                      Session Concluded
                    </div>
                  )}
                </div>
              </div>

              {/* Session Metadata Card */}
              <div className="card">
                <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Verification Parameters
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', fontSize: '0.8125rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Location:</span>
                    <span style={{ fontWeight: 600 }}>{activeSession.location || 'Main Auditorium'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Duration:</span>
                    <span style={{ fontWeight: 600 }}>{activeSession.duration_minutes} Minutes</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Token Refresh:</span>
                    <span style={{ fontWeight: 600 }}>Every {activeSession.token_rotation_seconds} Seconds</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Min Proximity RSSI:</span>
                    <span style={{ fontWeight: 600 }}>{activeSession.min_rssi} dBm</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Crypto Verification:</span>
                    <span style={{ fontWeight: 600, color: '#059669' }}>Ed25519 Device Sig</span>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>

        {/* Right Column: Attendance Metrics & Real-Time Check-In Stream */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Key Metrics Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Enrolled Students
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>
                {activeSession?.enrolled_count || 0}
              </div>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Verified Present
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>
                {attendanceRecords.length}
              </div>
            </div>

            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Attendance Rate
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#4f46e5', marginTop: '0.25rem' }}>
                {activeSession && activeSession.enrolled_count > 0
                  ? `${Math.round((attendanceRecords.length / activeSession.enrolled_count) * 100)}%`
                  : '0%'}
              </div>
            </div>
          </div>

          {/* Live Check-In Feed Table */}
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' }}>
                  Live Attendance Feed
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Real-time incoming verifications via WebSockets
                </p>
              </div>

              {activeSession && (
                <a
                  href={api.getExportCsvUrl(activeSession.id)}
                  download
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem 0.875rem' }}
                >
                  <Download size={16} />
                  <span>Export CSV</span>
                </a>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.75rem 1.5rem' }}>Student ID</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Full Name</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Signal (RSSI)</th>
                    <th style={{ padding: '0.75rem 1rem' }}>Time (UTC)</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#94a3b8' }}>
                        No students verified yet. When students arrive in BLE range, they will appear here in real time.
                      </td>
                    </tr>
                  ) : (
                    attendanceRecords.map((rec) => (
                      <tr key={rec.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.875rem 1.5rem', fontWeight: 600, color: '#1e293b' }}>
                          {rec.student_id_number}
                        </td>
                        <td style={{ padding: '0.875rem 1rem', color: '#334155' }}>
                          {rec.student_name}
                        </td>
                        <td style={{ padding: '0.875rem 1rem' }}>
                          <span className={`badge badge-${rec.status.toLowerCase()}`}>
                            {rec.status}
                          </span>
                          {rec.manual_override && (
                            <span style={{ fontSize: '0.6875rem', color: '#b45309', display: 'block', marginTop: '0.125rem' }}>
                              (Manual Edit)
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.875rem 1rem', color: '#475569', fontFamily: 'var(--font-mono)' }}>
                          {rec.rssi ? `${rec.rssi} dBm` : 'N/A'}
                        </td>
                        <td style={{ padding: '0.875rem 1rem', color: '#64748b', fontSize: '0.8125rem' }}>
                          {new Date(rec.recorded_at).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                          <button
                            onClick={() => {
                              setSelectedRecord(rec);
                              setOverrideStatus(rec.status);
                              setOverrideReason(rec.override_reason || '');
                              setShowOverrideModal(true);
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem' }}
                          >
                            <Edit2 size={14} />
                            <span>Correct</span>
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

      </div>

      {/* Modal: Create Attendance Session */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '1.25rem' }}>
              Create New Attendance Session
            </h2>
            <form onSubmit={handleCreateSession} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                  Course
                </label>
                {courses.length === 0 ? (
                  <div style={{ padding: '0.75rem', background: '#fef3c7', borderRadius: '0.375rem', color: '#92400e', fontSize: '0.8125rem' }}>
                    No courses found. Please create a course first before starting sessions.
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        setShowCourseModal(true);
                      }}
                      className="btn btn-secondary"
                      style={{ marginTop: '0.5rem', width: '100%', fontSize: '0.75rem' }}
                    >
                      + Create Course Now
                    </button>
                  </div>
                ) : (
                  <select
                    value={newCourseId}
                    onChange={(e) => setNewCourseId(Number(e.target.value))}
                    className="input-field"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}: {c.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                  Session Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lecture 08: Distributed Consensus"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                    Location / Room
                  </label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="300"
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value))}
                    className="input-field"
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                  Minimum RSSI Threshold ({newMinRssi} dBm)
                </label>
                <input
                  type="range"
                  min="-100"
                  max="-50"
                  value={newMinRssi}
                  onChange={(e) => setNewMinRssi(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: '#64748b' }}>
                  <span>Far (-100 dBm)</span>
                  <span>Close Proximity (-50 dBm)</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Manual Attendance Correction */}
      {showOverrideModal && selectedRecord && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
              Manual Attendance Correction
            </h2>
            <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Modifying status for student: <strong>{selectedRecord.student_name}</strong> ({selectedRecord.student_id_number}). This action is logged in audit records.
            </p>

            <form onSubmit={handleManualOverride} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                  Corrected Attendance Status
                </label>
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value)}
                  className="input-field"
                >
                  <option value="PRESENT">PRESENT</option>
                  <option value="LATE">LATE</option>
                  <option value="EXCUSED">EXCUSED</option>
                  <option value="ABSENT">ABSENT</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                  Audit Reason (Mandatory)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Medical certificate approved / device battery died"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create New Course */}
      {showCourseModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
              Create New Course
            </h2>
            <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Define a new academic course to host attendance sessions.
            </p>

            <form onSubmit={handleCreateCourse} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                  Course Code (e.g. CS401)
                </label>
                <input
                  type="text"
                  required
                  placeholder="CS401"
                  value={newCourseCode}
                  onChange={(e) => setNewCourseCode(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                  Course Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Distributed Systems & Security"
                  value={newCourseTitle}
                  onChange={(e) => setNewCourseTitle(e.target.value)}
                  className="input-field"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief syllabus or course notes..."
                  value={newCourseDesc}
                  onChange={(e) => setNewCourseDesc(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCourseModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Course
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Enroll Student into Course */}
      {showEnrollModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
              Enroll Student into Course
            </h2>
            <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Authorize a registered student to participate in sessions for this course.
            </p>

            <form onSubmit={handleEnrollStudent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                  Select Course
                </label>
                {courses.length === 0 ? (
                  <div style={{ padding: '0.75rem', background: '#fef3c7', borderRadius: '0.375rem', color: '#92400e', fontSize: '0.8125rem' }}>
                    No courses available. Please create a course first.
                  </div>
                ) : (
                  <select
                    value={enrollCourseId}
                    onChange={(e) => setEnrollCourseId(Number(e.target.value))}
                    className="input-field"
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}: {c.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}>
                  Student ID Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. STU-2024-001"
                  value={enrollStudentId}
                  onChange={(e) => setEnrollStudentId(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={courses.length === 0}
                  className="btn btn-primary"
                >
                  Enroll Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
