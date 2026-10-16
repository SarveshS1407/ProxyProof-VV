import {
  User, Course, AttendanceSession, SessionTokenInfo, AttendanceRecord,
  Device, DeviceChangeRequest, StudentReport, AdminStats, AuditLogItem
} from '../types';

const API_BASE_URL = 'http://localhost:8000/api/v1';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('proxyproof_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = 'An unexpected error occurred';
    try {
      const errJson = await res.json();
      errorDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await res.text();
    }
    throw new Error(errorDetail || `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<{ access_token: string; user: User }> {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return handleResponse(res);
  },

  async register(data: {
    email: string;
    password: string;
    full_name: string;
    role: string;
    student_id_number?: string;
    department?: string;
    batch?: string;
  }): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async getMe(): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Devices
  async getDeviceStatus(): Promise<Device[]> {
    const res = await fetch(`${API_BASE_URL}/devices/status`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async registerDevice(data: {
    device_identifier: string;
    public_key: string;
    device_model?: string;
    os_version?: string;
  }): Promise<Device> {
    const res = await fetch(`${API_BASE_URL}/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async requestDeviceChange(data: {
    new_device_identifier: string;
    new_public_key: string;
    new_device_model?: string;
    new_os_version?: string;
    reason: string;
  }): Promise<DeviceChangeRequest> {
    const res = await fetch(`${API_BASE_URL}/devices/request-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async getDeviceRequests(): Promise<DeviceChangeRequest[]> {
    const res = await fetch(`${API_BASE_URL}/devices/requests`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async reviewDeviceRequest(requestId: number, approved: boolean, adminNotes?: string): Promise<DeviceChangeRequest> {
    const res = await fetch(`${API_BASE_URL}/devices/requests/${requestId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ approved, admin_notes: adminNotes }),
    });
    return handleResponse(res);
  },

  // Courses
  async getCourses(): Promise<Course[]> {
    const res = await fetch(`${API_BASE_URL}/courses/`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async createCourse(data: { code: string; title: string; description?: string }): Promise<Course> {
    const res = await fetch(`${API_BASE_URL}/courses/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async enrollStudent(courseId: number, studentIdNumber: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE_URL}/courses/${courseId}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ student_id_number: studentIdNumber }),
    });
    return handleResponse(res);
  },

  // Sessions
  async createSession(data: {
    course_id: number;
    title: string;
    location?: string;
    duration_minutes: number;
    token_rotation_seconds: number;
    min_rssi: number;
  }): Promise<AttendanceSession> {
    const res = await fetch(`${API_BASE_URL}/sessions/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async getActiveSessions(): Promise<AttendanceSession[]> {
    const res = await fetch(`${API_BASE_URL}/sessions/active`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async getSessionDetail(sessionId: number): Promise<AttendanceSession> {
    const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async startSession(sessionId: number): Promise<{ message: string; token_info: SessionTokenInfo }> {
    const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/start`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async stopSession(sessionId: number): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/stop`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async getCurrentToken(sessionId: number): Promise<SessionTokenInfo> {
    const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/current-token`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  // Attendance
  async submitAttendance(data: {
    session_id: number;
    token: string;
    rssi: number;
    timestamp: number;
    nonce: string;
    device_identifier: string;
    signature: string;
  }): Promise<{ status: string; record_id: number; course_title: string; attendance_status: string }> {
    const res = await fetch(`${API_BASE_URL}/attendance/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async getSessionAttendance(sessionId: number): Promise<AttendanceRecord[]> {
    const res = await fetch(`${API_BASE_URL}/attendance/session/${sessionId}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async manualOverride(data: {
    session_id: number;
    student_id: number;
    status: string;
    reason: string;
  }): Promise<AttendanceRecord> {
    const res = await fetch(`${API_BASE_URL}/attendance/manual-override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(res);
  },

  async getStudentPercentages(): Promise<StudentReport> {
    const res = await fetch(`${API_BASE_URL}/attendance/student/percentages`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  getExportCsvUrl(sessionId: number): string {
    return `${API_BASE_URL}/attendance/session/${sessionId}/export-csv`;
  },

  // Admin
  async getAdminStats(): Promise<AdminStats> {
    const res = await fetch(`${API_BASE_URL}/admin/stats`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async getAuditLogs(limit = 50, offset = 0): Promise<AuditLogItem[]> {
    const res = await fetch(`${API_BASE_URL}/admin/audit-logs?limit=${limit}&offset=${offset}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async getUsers(role?: string): Promise<User[]> {
    const url = role ? `${API_BASE_URL}/admin/users?role=${role}` : `${API_BASE_URL}/admin/users`;
    const res = await fetch(url, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async updateUserStatus(userId: number, isActive: boolean): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ is_active: isActive }),
    });
    return handleResponse(res);
  },
};
