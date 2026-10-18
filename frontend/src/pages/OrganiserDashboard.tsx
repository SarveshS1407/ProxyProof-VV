import React, { useState, useEffect, useRef } from 'react';
import { api, WS_BASE_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { StatusPill } from '../components/common/StatusPill';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { EmptyState } from '../components/common/EmptyState';
import { Course, AttendanceSession, AttendanceRecord, SessionTokenInfo } from '../types';
import {
  Play, Square, Download, Plus, Users, Clock, Radio, CheckCircle2,
  AlertCircle, Edit2, ShieldCheck, RefreshCw, Smartphone, BookOpen,
  UserPlus, Search, Filter, Calendar, MapPin, Sliders, ChevronRight,
  Trash2, Award
} from 'lucide-react';

export const OrganiserDashboard: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [tokenInfo, setTokenInfo] = useState<SessionTokenInfo | null>(null);
  
  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [sessionScope, setSessionScope] = useState<'ALL' | 'ACTIVE' | 'UPCOMING' | 'PAST'>('ALL');
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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

  // Status helpers
  const isSessionActive = (s: AttendanceSession): boolean => {
    if (!s.is_active || s.is_closed) return false;
    if (!s.end_time) return true;
    return new Date(s.end_time) > new Date();
  };

  const isSessionUpcoming = (s: AttendanceSession): boolean => {
    return !s.is_active && !s.is_closed;
  };

  const isSessionPast = (s: AttendanceSession): boolean => {
    if (s.is_closed) return true;
    if (s.end_time && new Date(s.end_time) <= new Date()) return true;
    return false;
  };

  const getSessionPillStatus = (s: AttendanceSession): string => {
    if (isSessionActive(s)) return 'LIVE';
    if (isSessionUpcoming(s)) return 'SCHEDULED';
    return 'CONCLUDED';
  };

  const fetchInitialData = async (preferredSessionId?: number) => {
    try {
      setLoading(true);
      const [c, allSessions] = await Promise.all([
        api.getCourses(),
        api.getSessions()
      ]);

      setCourses(c);
      if (c.length > 0 && !newCourseId) {
        setNewCourseId(c[0].id);
      }

      setSessions(allSessions);

      // Restore preferred session, previous session, or active session
      const savedSessionId = preferredSessionId || Number(localStorage.getItem('proxyproof_selected_session_id'));
      const targetSession =
        (savedSessionId && allSessions.find((s) => s.id === savedSessionId)) ||
        allSessions.find((s) => isSessionActive(s)) ||
        (allSessions.length > 0 ? allSessions[0] : null);

      if (targetSession) {
        await selectSession(targetSession);
      } else {
        setActiveSession(null);
        setAttendanceRecords([]);
        setTokenInfo(null);
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
    localStorage.setItem('proxyproof_selected_session_id', String(session.id));
    try {
      const records = await api.getSessionAttendance(session.id);
      setAttendanceRecords(records);

      if (isSessionActive(session)) {
        const token = await api.getCurrentToken(session.id);
        setTokenInfo(token);
      } else {
        setTokenInfo(null);
      }
    } catch (e: any) {
      console.error('Error fetching session details:', e);
    }
  };

  // Live WebSocket Connection with Status Tracking
  useEffect(() => {
    if (!activeSession) {
      setWsStatus('disconnected');
      return;
    }

    setWsStatus('connecting');
    const token = localStorage.getItem('proxyproof_token');
    const wsUrl = `${WS_BASE_URL}/ws/sessions/${activeSession.id}${token ? `?token=${token}` : ''}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
    };

    ws.onclose = () => {
      setWsStatus('disconnected');
    };

    ws.onerror = () => {
      setWsStatus('disconnected');
    };

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
      setWsStatus('disconnected');
    };
  }, [activeSession?.id]);

  // Fallback Polling (Every 5 seconds if WebSocket is disconnected and session is live)
  useEffect(() => {
    if (!activeSession || !isSessionActive(activeSession)) return;
    if (wsStatus === 'connected') return;

    const fallbackTimer = setInterval(async () => {
      try {
        const records = await api.getSessionAttendance(activeSession.id);
        setAttendanceRecords(records);
      } catch (err) {
        // Silent poll
      }
    }, 5000);

    return () => clearInterval(fallbackTimer);
  }, [activeSession?.id, activeSession?.is_active, activeSession?.is_closed, wsStatus]);

  // Periodic Token & Countdown Polling
  useEffect(() => {
    if (!activeSession || !isSessionActive(activeSession)) return;

    const timer = setInterval(async () => {
      try {
        const info = await api.getCurrentToken(activeSession.id);
        setTokenInfo(info);
      } catch (e) {
        // Session might have elapsed
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [activeSession?.id, activeSession?.is_active, activeSession?.is_closed]);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseCode.trim() || !newCourseTitle.trim()) return;

    try {
      const created = await api.createCourse({
        code: newCourseCode.trim(),
        title: newCourseTitle.trim(),
        description: newCourseDesc.trim() || undefined
      });
      setShowCourseModal(false);
      setNewCourseCode('');
      setNewCourseTitle('');
      setNewCourseDesc('');
      await fetchInitialData();
      setNewCourseId(created.id);
      showToast('success', `Course ${created.code} created successfully!`);
    } catch (err: any) {
      showToast('error', `Error creating course: ${err.message}`);
    }
  };

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollCourseId || !enrollStudentId.trim()) {
      showToast('error', 'Select a course and enter student roll number');
      return;
    }

    try {
      const res = await api.enrollStudent(enrollCourseId, enrollStudentId.trim());
      setShowEnrollModal(false);
      setEnrollStudentId('');
      await fetchInitialData(activeSession?.id);
      showToast('success', res.message || 'Student enrolled successfully!');
    } catch (err: any) {
      showToast('error', `Enrollment failed: ${err.message}`);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseId) {
      showToast('error', 'Please select or create an academic course first.');
      return;
    }
    if (!newTitle.trim()) return;

    try {
      const created = await api.createSession({
        course_id: newCourseId,
        title: newTitle.trim(),
        location: newLocation.trim(),
        duration_minutes: Number(newDuration),
        token_rotation_seconds: 10,
        min_rssi: Number(newMinRssi)
      });

      setShowCreateModal(false);
      setNewTitle('');
      await fetchInitialData(created.id);
      showToast('success', `Session "${created.title}" created successfully!`);
    } catch (err: any) {
      showToast('error', `Error creating session: ${err.message}`);
    }
  };

  const handleStartSession = async () => {
    if (!activeSession) return;
    try {
      const startRes = await api.startSession(activeSession.id);
      if (startRes && startRes.token_info) {
        setTokenInfo(startRes.token_info);
      }
      const updated = await api.getSessionDetail(activeSession.id);
      setActiveSession(updated);
      await fetchInitialData(activeSession.id);
      showToast('success', `BLE attendance broadcast started for "${activeSession.title}"!`);
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
      await fetchInitialData(activeSession.id);
      showToast('info', 'Attendance session concluded.');
    } catch (err: any) {
      showToast('error', `Error stopping session: ${err.message}`);
    }
  };

  const handleConfirmDeleteSession = async () => {
    if (!activeSession) return;
    try {
      await api.deleteSession(activeSession.id);
      setShowDeleteConfirm(false);
      localStorage.removeItem('proxyproof_selected_session_id');
      await fetchInitialData();
      showToast('success', 'Attendance session deleted.');
    } catch (err: any) {
      showToast('error', `Error deleting session: ${err.message}`);
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

  // Filter sessions by scope (All / Active / Upcoming / Past)
  const activeCount = sessions.filter(isSessionActive).length;
  const upcomingCount = sessions.filter(isSessionUpcoming).length;
  const pastCount = sessions.filter(isSessionPast).length;

  const filteredSessions = sessions.filter((s) => {
    if (sessionScope === 'ACTIVE') return isSessionActive(s);
    if (sessionScope === 'UPCOMING') return isSessionUpcoming(s);
    if (sessionScope === 'PAST') return isSessionPast(s);
    return true;
  });

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
      
      {/* Top Header & Prominent Quick Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em' }}>
              Faculty Organiser Console
            </h1>
            <span className="badge badge-approved" style={{ fontSize: '0.6875rem', padding: '0.15rem 0.5rem', fontWeight: 700 }}>
              {user?.full_name || 'Faculty Organiser'}
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {user?.email} • Managing {courses.length} course{courses.length !== 1 ? 's' : ''} &amp; {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Action Buttons: Create Session is the most prominent */}
        <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
            onClick={() => fetchInitialData(activeSession?.id)}
            className="btn btn-ghost btn-sm"
            title="Refresh dashboard state"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          {/* Prominent Primary Action */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
            style={{
              padding: '0.625rem 1.25rem',
              boxShadow: '0 4px 12px -2px rgba(79, 70, 229, 0.4)',
              fontWeight: 700
            }}
          >
            <Plus size={18} />
            <span>Create Session</span>
          </button>
        </div>
      </div>

      {/* Main Content: If no sessions exist, show full clean EmptyState onboarding */}
      {sessions.length === 0 ? (
        <div className="card" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
          <div style={{
            width: '4rem',
            height: '4rem',
            borderRadius: '1rem',
            background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
            color: '#4f46e5',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.25rem'
          }}>
            <Calendar size={32} />
          </div>

          <h2 style={{ fontSize: '1.375rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>
            {courses.length === 0 ? `Welcome, ${user?.full_name || 'Organiser'}!` : 'No Attendance Sessions Yet'}
          </h2>

          <p style={{ color: '#64748b', fontSize: '0.9375rem', maxWidth: '480px', margin: '0 auto 1.75rem auto', lineHeight: 1.5 }}>
            {courses.length === 0
              ? 'You are logged in with your dedicated organiser account. To begin conducting proximity-verified BLE attendance sessions, define your first academic course.'
              : `You have ${courses.length} course(s) configured and ready. Click Create Session below to schedule your first proximity-verified class session.`}
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            {courses.length === 0 ? (
              <button
                onClick={() => setShowCourseModal(true)}
                className="btn btn-primary btn-lg"
              >
                <BookOpen size={18} />
                <span>Create Academic Course</span>
              </button>
            ) : (
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary btn-lg"
                style={{ boxShadow: '0 4px 14px -2px rgba(79, 70, 229, 0.4)' }}
              >
                <Plus size={18} />
                <span>Create Attendance Session</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Main Layout Grid when sessions exist */
        <div className="responsive-grid-main">
          
          {/* Left Column: Sessions List & Controller */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* Session Selector Card */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
                <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0f172a' }}>
                  Attendance Sessions
                </h2>
                <span className="badge badge-approved" style={{ fontSize: '0.6875rem' }}>
                  {filteredSessions.length} of {sessions.length} TOTAL
                </span>
              </div>

              {/* Scope Filter Pills: All / Active / Upcoming / Past */}
              <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.875rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setSessionScope('ALL')}
                  style={{
                    flex: 1,
                    minWidth: '55px',
                    padding: '0.35rem 0.4rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    border: 'none',
                    background: sessionScope === 'ALL' ? '#ffffff' : 'transparent',
                    color: sessionScope === 'ALL' ? '#0f172a' : '#64748b',
                    boxShadow: sessionScope === 'ALL' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  All ({sessions.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSessionScope('ACTIVE')}
                  style={{
                    flex: 1,
                    minWidth: '55px',
                    padding: '0.35rem 0.4rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    border: 'none',
                    background: sessionScope === 'ACTIVE' ? '#ffffff' : 'transparent',
                    color: sessionScope === 'ACTIVE' ? '#059669' : '#64748b',
                    boxShadow: sessionScope === 'ACTIVE' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  Active ({activeCount})
                </button>
                <button
                  type="button"
                  onClick={() => setSessionScope('UPCOMING')}
                  style={{
                    flex: 1,
                    minWidth: '55px',
                    padding: '0.35rem 0.4rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    border: 'none',
                    background: sessionScope === 'UPCOMING' ? '#ffffff' : 'transparent',
                    color: sessionScope === 'UPCOMING' ? '#b45309' : '#64748b',
                    boxShadow: sessionScope === 'UPCOMING' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  Upcoming ({upcomingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setSessionScope('PAST')}
                  style={{
                    flex: 1,
                    minWidth: '55px',
                    padding: '0.35rem 0.4rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    border: 'none',
                    background: sessionScope === 'PAST' ? '#ffffff' : 'transparent',
                    color: sessionScope === 'PAST' ? '#4f46e5' : '#64748b',
                    boxShadow: sessionScope === 'PAST' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer'
                  }}
                >
                  Past ({pastCount})
                </button>
              </div>

              {/* Sessions List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '280px', overflowY: 'auto' }}>
                {filteredSessions.length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: '0.8125rem', textAlign: 'center', padding: '1.75rem 1rem' }}>
                    {sessionScope === 'ACTIVE'
                      ? 'No active sessions currently running. Start one from the list or click Create Session.'
                      : sessionScope === 'UPCOMING'
                      ? 'No upcoming sessions scheduled.'
                      : sessionScope === 'PAST'
                      ? 'No past sessions on record.'
                      : 'No sessions found.'}
                  </div>
                ) : (
                  filteredSessions.map((s) => (
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
                        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>
                          {s.title}
                        </span>
                        <StatusPill status={getSessionPillStatus(s)} size="sm" />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                        {s.course_code}: {s.course_title || 'Course'} • {s.attendance_count} / {s.enrolled_count} present
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <MapPin size={11} /> {s.location || 'Lecture Hall A'}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Clock size={11} /> {s.duration_minutes}m
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Active Session Controller & BLE Broadcaster Card */}
            {activeSession && (
              <div className="card" style={{
                background: isSessionActive(activeSession) ? 'linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%)' : '#ffffff',
                border: isSessionActive(activeSession) ? '2px solid #86efac' : '1px solid #e2e8f0'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                      padding: '0.45rem',
                      borderRadius: '0.5rem',
                      background: isSessionActive(activeSession) ? '#dcfce7' : '#f1f5f9',
                      color: isSessionActive(activeSession) ? '#15803d' : '#64748b'
                    }}>
                      <Radio size={18} className={isSessionActive(activeSession) ? 'animate-pulse-glow' : ''} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>
                        BLE Broadcast State
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>
                        {isSessionActive(activeSession)
                          ? 'Broadcasting Proximity Beacons'
                          : isSessionUpcoming(activeSession)
                          ? 'Ready to Broadcast'
                          : 'Session Concluded'}
                      </div>
                    </div>
                  </div>

                  <StatusPill status={getSessionPillStatus(activeSession)} size="sm" />
                </div>

                {/* Rotating Token Display (Active Only) */}
                {isSessionActive(activeSession) && tokenInfo ? (
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
                    {isSessionUpcoming(activeSession)
                      ? 'Click Start Session below to broadcast rotating cryptographic tokens over Bluetooth Low Energy.'
                      : 'This attendance session has ended. BLE tokens are revoked.'}
                  </div>
                )}

                {/* Session Action Controls */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {isSessionUpcoming(activeSession) ? (
                    <button
                      onClick={handleStartSession}
                      className="btn btn-primary"
                      style={{ flex: 1, fontWeight: 700 }}
                    >
                      <Play size={16} />
                      <span>Start Session</span>
                    </button>
                  ) : isSessionActive(activeSession) ? (
                    <button
                      onClick={() => setShowStopConfirm(true)}
                      className="btn btn-danger"
                      style={{ flex: 1, fontWeight: 700 }}
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

            {/* Session Configuration & Delete Action */}
            {activeSession && (
              <div className="card" style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Session Configuration
                  </h3>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="btn btn-ghost btn-sm"
                    style={{ color: '#dc2626', padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                    title="Delete session"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Course:</span>
                    <span style={{ fontWeight: 600 }}>{activeSession.course_code}: {activeSession.course_title}</span>
                  </div>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a' }}>
                      {activeSession ? `${activeSession.title} — Attendee Roster` : 'Live Attendance Feed'}
                    </h2>
                    {activeSession && (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        background: wsStatus === 'connected' ? '#ecfdf5' : wsStatus === 'connecting' ? '#fffbeb' : '#f1f5f9',
                        color: wsStatus === 'connected' ? '#047857' : wsStatus === 'connecting' ? '#b45309' : '#64748b',
                        border: wsStatus === 'connected' ? '1px solid #a7f3d0' : wsStatus === 'connecting' ? '1px solid #fde68a' : '1px solid #e2e8f0'
                      }}>
                        <span style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: wsStatus === 'connected' ? '#10b981' : wsStatus === 'connecting' ? '#f59e0b' : '#94a3b8'
                        }} />
                        <span>{wsStatus === 'connected' ? 'Live Stream' : wsStatus === 'connecting' ? 'Connecting...' : 'Polling Fallback'}</span>
                      </div>
                    )}
                  </div>
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
                            <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                              {r.verification_method}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: r.rssi && r.rssi >= -75 ? '#059669' : '#b45309' }}>
                              {r.rssi ? `${r.rssi} dBm` : 'N/A'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => {
                                setSelectedRecord(r);
                                setOverrideStatus(r.status);
                                setShowOverrideModal(true);
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                              title="Manual attendance correction"
                            >
                              <Edit2 size={12} />
                              <span>Override</span>
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
      )}

      {/* Modal: Create New Session */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
              Create Attendance Session
            </h2>
            <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '1.25rem' }}>
              Configure cryptographic BLE attendance verification for your course.
            </p>

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

              <div className="responsive-grid-form" style={{ gap: '0.75rem' }}>
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
                <button type="submit" disabled={courses.length === 0} className="btn btn-primary" style={{ fontWeight: 700 }}>
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

      {/* Confirm Modal: Delete Session */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Attendance Session?"
        message={`Are you sure you want to permanently delete session "${activeSession?.title || ''}"? All related tokens and attendance records will be permanently removed. This action cannot be undone.`}
        confirmLabel="Yes, Delete Session"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDeleteSession}
        onCancel={() => setShowDeleteConfirm(false)}
      />

    </div>
  );
};
