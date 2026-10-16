import React, { useState, useEffect, useRef } from 'react';
import { api, WS_BASE_URL } from '../api/client';
import { useToast } from '../context/ToastContext';
import { StatusPill } from '../components/common/StatusPill';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { EmptyState } from '../components/common/EmptyState';
import { Course, AttendanceSession, AttendanceRecord, SessionTokenInfo } from '../types';
import {
  Play, Square, Download, Plus, Users, Clock, Radio, CheckCircle2,
  AlertCircle, Edit2, ShieldCheck, RefreshCw, Smartphone, BookOpen,
  UserPlus, Search, Filter, Calendar, MapPin, Sliders, ChevronRight
} from 'lucide-react';

export const OrganiserDashboard: React.FC = () => {
  const { showToast } = useToast();

  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [tokenInfo, setTokenInfo] = useState<SessionTokenInfo | null>(null);
  
  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
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

  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [c, activeList] = await Promise.all([
        api.getCourses(),
        api.getActiveSessions()
      ]);

      setCourses(c);
      if (c.length > 0 && !newCourseId) {
        setNewCourseId(c[0].id);
      }

      setSessions(activeList);
      if (activeList.length > 0 && !activeSession) {
        selectSession(activeList[0]);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Error loading organiser console');
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
          showToast('success', `Verified attendance: ${data.record.student_name}`);
        } else if (data.event === 'ATTENDANCE_OVERRIDE') {
          setAttendanceRecords((prev) => prev.map((r) => r.id === data.record.id ? data.record : r));
          showToast('info', `Attendance updated for: ${data.record.student_name}`);
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
      showToast('success', `Course "${created.code}: ${created.title}" created successfully!`);
    } catch (err: any) {
      showToast('error', `Error creating course: ${err.message}`);
    }
  };

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCourseId = enrollCourseId || (courses.length > 0 ? courses[0].id : 0);
    if (!targetCourseId) {
      showToast('error', 'Please select a course to enroll students in.');
      return;
    }
    if (!enrollStudentId.trim()) return;
    try {
      const res = await api.enrollStudent(targetCourseId, enrollStudentId.trim());
      setEnrollStudentId('');
      setShowEnrollModal(false);
      await fetchInitialData();
      showToast('success', res.message || 'Student enrolled successfully!');
    } catch (err: any) {
      showToast('error', `Error enrolling student: ${err.message}`);
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
      showToast('success', `Session "${created.title}" created!`);
    } catch (err: any) {
      showToast('error', `Error creating session: ${err.message}`);
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
      showToast('success', 'BLE attendance broadcast started!');
    } catch (err: any) {
      showToast('error', `Error starting session: ${err.message}`);
    }
  };

  const handleConfirmStopSession = async () => {
    if (!activeSession) return;
    try {
      await api.stopSession(activeSession.id);
      const updated = await api.getSessionDetail(activeSession.id);
      setActiveSession(updated);
      setTokenInfo(null);
      setShowStopConfirm(false);
      showToast('info', 'Attendance session concluded.');
    } catch (err: any) {
      showToast('error', `Error stopping session: ${err.message}`);
    }
  };

  const handleManualOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession || !selectedRecord) return;
    if (!overrideReason.trim()) {
      showToast('error', 'Audit reason is mandatory for manual overrides.');
      return;
    }
    try {
      const updated = await api.manualOverride({
        session_id: activeSession.id,
        student_id: selectedRecord.student_id,
        status: overrideStatus,
        reason: overrideReason.trim()
      });
      setAttendanceRecords((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      setShowOverrideModal(false);
      setSelectedRecord(null);
      setOverrideReason('');
      showToast('success', `Status updated to ${updated.status} for ${selectedRecord.student_name}`);
    } catch (err: any) {
      showToast('error', `Override failed: ${err.message}`);
    }
  };

  const handleExportCSV = async () => {
    if (!activeSession) return;
    try {
      const csvData = await api.exportAttendanceCSV(activeSession.id);
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `proxyproof_session_${activeSession.id}_attendance.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('success', 'Sanitized CSV report downloaded successfully.');
    } catch (err: any) {
      showToast('error', `Export error: ${err.message}`);
    }
  };

  // Filter attendance records by search and status
  const filteredRecords = attendanceRecords.filter((rec) => {
    const matchesSearch =
      rec.student_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.student_id_number.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || rec.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      
      {/* Top Header & Quick Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em' }}>
            Faculty Organiser Console
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            Broadcast rotating BLE beacons, track real-time physical check-ins, and manage attendance
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowCourseModal(true)}
            className="btn btn-secondary btn-sm"
            title="Create a new course"
          >
            <BookOpen size={16} />
            <span>New Course</span>
          </button>

          <button
            onClick={() => {
              if (courses.length > 0 && !enrollCourseId) {
                setEnrollCourseId(courses[0].id);
              }
              setShowEnrollModal(true);
            }}
            className="btn btn-secondary btn-sm"
            title="Enroll a student into a course"
          >
            <UserPlus size={16} />
            <span>Enroll Student</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary btn-sm"
          >
            <Plus size={16} />
            <span>Create Session</span>
          </button>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 360px) 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Left Column: Sessions List & Active Session Broadcaster */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Session Selector Card */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
              <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0f172a' }}>
                Attendance Sessions
              </h2>
              <span className="badge badge-revoked" style={{ fontSize: '0.625rem' }}>
                {sessions.length} TOTAL
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto' }}>
              {sessions.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.8125rem', textAlign: 'center', padding: '1.5rem 1rem' }}>
                  No sessions found. Click <strong>Create Session</strong> to start.
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
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0f172a' }}>
                        {s.title}
                      </span>
                      <StatusPill status={s.is_active ? 'LIVE' : s.is_closed ? 'CLOSED' : 'PENDING'} size="sm" />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                      {s.course_code || 'CS401'} • {s.attendance_count} / {s.enrolled_count} present
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Active Session Controller & BLE Broadcaster Card */}
          {activeSession && (
            <div className="card" style={{
              background: activeSession.is_active ? 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)' : '#ffffff',
              border: activeSession.is_active ? '2px solid #86efac' : '1px solid #e2e8f0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    padding: '0.45rem',
                    borderRadius: '0.5rem',
                    background: activeSession.is_active ? '#dcfce7' : '#f1f5f9',
                    color: activeSession.is_active ? '#15803d' : '#64748b'
                  }}>
                    <Radio size={18} className={activeSession.is_active ? 'animate-pulse-glow' : ''} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>
                      BLE Broadcast State
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                      {activeSession.is_active ? 'Broadcasting Proximity Beacons' : 'Session Inactive'}
                    </div>
                  </div>
                </div>

                <StatusPill status={activeSession.is_active ? 'LIVE' : 'CLOSED'} size="sm" />
              </div>

              {activeSession.is_active && tokenInfo ? (
                <div style={{ background: '#0f172a', borderRadius: '0.625rem', padding: '1rem', color: '#f8fafc', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
                    <span>ROTATING TOKEN (16-HEX)</span>
                    <span style={{ color: '#38bdf8', fontWeight: 600 }}>Expires in {tokenInfo.seconds_remaining}s</span>
                  </div>

                  <div style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    color: '#38bdf8',
                    textAlign: 'center',
                    padding: '0.5rem 0'
                  }}>
                    {tokenInfo.token_value}
                  </div>

                  {/* Token Rotation Progress Bar */}
                  <div style={{ width: '100%', height: '4px', background: '#334155', borderRadius: '2px', overflow: 'hidden', marginTop: '0.25rem' }}>
                    <div style={{
                      height: '100%',
                      background: '#38bdf8',
                      width: `${(tokenInfo.seconds_remaining / (activeSession.token_rotation_seconds || 10)) * 100}%`,
                      transition: 'width 1s linear'
                    }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: '#64748b', marginTop: '0.625rem' }}>
                    <span>UUID: 0xFFF0</span>
                    <span>Window Index: #{tokenInfo.window_index}</span>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem', textAlign: 'center', fontSize: '0.8125rem', color: '#64748b', marginBottom: '1rem', border: '1px solid #e2e8f0' }}>
                  Start session to broadcast short-lived rotating tokens over Bluetooth Low Energy.
                </div>
              )}

              {/* Session Controls */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                    onClick={() => setShowStopConfirm(true)}
                    className="btn btn-danger"
                    style={{ flex: 1 }}
                  >
                    <Square size={16} />
                    <span>End Session</span>
                  </button>
                ) : (
                  <div style={{ width: '100%', textAlign: 'center', fontSize: '0.8125rem', color: '#64748b', fontWeight: 600, padding: '0.5rem' }}>
                    Attendance Closed
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Verification Parameters Card */}
          {activeSession && (
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
                Session Configuration
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Location:</span>
                  <span style={{ fontWeight: 600 }}>{activeSession.location || 'Lecture Hall A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Duration:</span>
                  <span>{activeSession.duration_minutes} minutes</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Proximity Threshold:</span>
                  <span style={{ fontWeight: 600 }}>{activeSession.min_rssi || -85} dBm</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Live Attendance Feed & Attendee Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div className="table-wrapper">
            {/* Table Header & Controls */}
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a' }}>
                  {activeSession ? `${activeSession.title} — Attendee Roster` : 'Live Attendance Feed'}
                </h2>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.125rem' }}>
                  {activeSession ? `${activeSession.attendance_count} students verified of ${activeSession.enrolled_count} enrolled` : 'Select a session'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Search Bar */}
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    type="text"
                    placeholder="Search attendee..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input-field"
                    style={{ paddingLeft: '2rem', paddingRight: '0.75rem', paddingTop: '0.35rem', paddingBottom: '0.35rem', fontSize: '0.8125rem', width: '180px' }}
                  />
                </div>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="input-field"
                  style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.8125rem' }}
                >
                  <option value="ALL">All Status</option>
                  <option value="PRESENT">Present</option>
                  <option value="LATE">Late</option>
                  <option value="EXCUSED">Excused</option>
                  <option value="ABSENT">Absent</option>
                </select>

                {/* Export CSV Button */}
                {activeSession && (
                  <button
                    onClick={handleExportCSV}
                    className="btn btn-secondary btn-sm"
                    title="Export sanitized CSV report"
                  >
                    <Download size={14} />
                    <span>CSV</span>
                  </button>
                )}
              </div>
            </div>

            {/* Attendance Roster Table */}
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Student ID</th>
                    <th>Time (UTC)</th>
                    <th>Status</th>
                    <th>Method</th>
                    <th>Signal</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '3.5rem', textAlign: 'center', color: '#94a3b8' }}>
                        {activeSession ? 'No attendance records match your search query.' : 'Select an attendance session from the left.'}
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.student_name}</div>
                          {r.manual_override && (
                            <div style={{ fontSize: '0.6875rem', color: '#b45309' }}>
                              Manual override: {r.override_reason || 'Administrative correction'}
                            </div>
                          )}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: '#4f46e5' }}>
                          {r.student_id_number}
                        </td>
                        <td style={{ color: '#64748b', fontSize: '0.8125rem' }}>
                          {new Date(r.recorded_at).toLocaleTimeString()}
                        </td>
                        <td>
                          <StatusPill status={r.status} size="sm" />
                        </td>
                        <td>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: r.verification_method === 'BLE' ? '#4f46e5' : '#b45309' }}>
                            {r.verification_method}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#64748b' }}>
                            {r.rssi !== null && r.rssi !== undefined ? `${r.rssi} dBm` : '—'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            onClick={() => {
                              setSelectedRecord(r);
                              setOverrideStatus(r.status);
                              setOverrideReason('');
                              setShowOverrideModal(true);
                            }}
                            className="btn btn-secondary btn-sm"
                            title="Correct attendance record"
                          >
                            <Edit2 size={13} />
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
                <label className="input-label">Academic Course</label>
                {courses.length === 0 ? (
                  <div style={{ padding: '0.75rem', background: '#fef3c7', borderRadius: '0.375rem', color: '#92400e', fontSize: '0.8125rem' }}>
                    No courses found. Please create a course first before starting sessions.
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateModal(false);
                        setShowCourseModal(true);
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: '0.5rem', width: '100%' }}
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
                <label className="input-label">Session Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lecture 12: Distributed Consensus"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="input-label">Location / Room</label>
                  <input
                    type="text"
                    required
                    placeholder="Auditorium B"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="input-label">Duration (Minutes)</label>
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
                <label className="input-label">
                  Proximity Threshold ({newMinRssi} dBm)
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
                <button type="submit" disabled={courses.length === 0} className="btn btn-primary">
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
              Modifying status for student: <strong>{selectedRecord.student_name}</strong> ({selectedRecord.student_id_number}). This action is recorded in audit logs.
            </p>

            <form onSubmit={handleManualOverride} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="input-label">Corrected Attendance Status</label>
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
                <label className="input-label">Audit Reason (Mandatory)</label>
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
              Create Academic Course
            </h2>
            <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Define a new course to conduct attendance sessions.
            </p>

            <form onSubmit={handleCreateCourse} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="input-label">Course Code (e.g. CS401)</label>
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
                <label className="input-label">Course Title</label>
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
                <label className="input-label">Description (Optional)</label>
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
                <label className="input-label">Select Course</label>
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
                <label className="input-label">Student ID Number</label>
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

      {/* Confirm Modal: End Active Session */}
      <ConfirmModal
        isOpen={showStopConfirm}
        title="End Attendance Session?"
        message="Ending this session will revoke active BLE broadcast tokens. Students will no longer be able to check in. This action is recorded in the audit trail."
        confirmLabel="Yes, End Session"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmStopSession}
        onCancel={() => setShowStopConfirm(false)}
      />

    </div>
  );
};
