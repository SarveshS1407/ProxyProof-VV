import {
  User, Course, AttendanceSession, SessionTokenInfo, AttendanceRecord,
  Device, DeviceChangeRequest, StudentReport, AdminStats, AuditLogItem,
  UserProfileUpdateData, AttendanceInvestigationItem
} from '../types';

const envApiUrl = import.meta.env.VITE_API_URL;
export const API_BASE_URL = (envApiUrl !== undefined && envApiUrl !== null && envApiUrl !== '')
  ? envApiUrl.replace(/\/+$/, '') + (envApiUrl.endsWith('/api/v1') ? '' : '/api/v1')
  : (typeof window !== 'undefined' ? '/api/v1' : 'http://localhost:8000/api/v1');

const envWsUrl = import.meta.env.VITE_WS_URL;
export const WS_BASE_URL = (envWsUrl !== undefined && envWsUrl !== null && envWsUrl !== '')
  ? envWsUrl.replace(/\/+$/, '') + (envWsUrl.endsWith('/api/v1') ? '' : '/api/v1')
  : (typeof window !== 'undefined'
      ? (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/api/v1'
      : 'ws://localhost:8000/api/v1');

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('proxyproof_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function handleResponse<T>(res: Response): Promise<T> {
  // Read response body as text exactly once
  const rawText = await res.text();

  let data: any = null;
  if (rawText && rawText.trim().length > 0) {
    try {
      data = JSON.parse(rawText);
    } catch {
      // Body is plain text, HTML, or non-JSON
      data = null;
    }
  }

  if (!res.ok) {
    let errorDetail = '';

    if (data && typeof data === 'object') {
      if (typeof data.detail === 'string') {
        errorDetail = data.detail;
      } else if (Array.isArray(data.detail)) {
        // Handle FastAPI validation error array [{msg, loc, ...}]
        errorDetail = data.detail.map((err: any) => err.msg || JSON.stringify(err)).join(', ');
      } else if (data.message && typeof data.message === 'string') {
        errorDetail = data.message;
      } else {
        errorDetail = JSON.stringify(data);
      }
    } else if (rawText && rawText.trim().length > 0) {
      errorDetail = rawText.trim();
    }

    throw new Error(errorDetail || `Request failed with status ${res.status}`);
  }

  // Handle successful response
  if (data !== null) {
    return data as T;
  }

  // If status is 204 or body is empty, return empty object safely
  return (rawText ? rawText : {}) as unknown as T;
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

  async updateProfile(data: UserProfileUpdateData): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
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

  async getSessions(courseId?: number, isClosed?: boolean, isActive?: boolean): Promise<AttendanceSession[]> {
    const params = new URLSearchParams();
    if (courseId !== undefined) params.append('course_id', String(courseId));
    if (isClosed !== undefined) params.append('is_closed', String(isClosed));
    if (isActive !== undefined) params.append('is_active', String(isActive));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE_URL}/sessions/${qs}`, {
      headers: { ...getAuthHeader() },
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

  async deleteSession(sessionId: number): Promise<{ message: string; session_id: number }> {
    const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async deleteCourse(courseId: number): Promise<{ message: string; course_id: number }> {
    const res = await fetch(`${API_BASE_URL}/courses/${courseId}`, {
      method: 'DELETE',
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

  async exportAttendanceCSV(sessionId: number): Promise<string> {
    const res = await fetch(`${API_BASE_URL}/attendance/session/${sessionId}/export-csv`, {
      headers: { ...getAuthHeader() },
    });
    const text = await res.text();
    if (!res.ok) {
      let errorDetail = '';
      try {
        const json = JSON.parse(text);
        errorDetail = json.detail || json.message;
      } catch {
        errorDetail = text;
      }
      throw new Error(errorDetail || `Export failed with status ${res.status}`);
    }
    return text;
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

  async updateUserRole(userId: number, role: string): Promise<User> {
    const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ role }),
    });
    return handleResponse(res);
  },

  async revokeDevice(deviceId: number): Promise<{ message: string; device_id: number; status: string }> {
    const res = await fetch(`${API_BASE_URL}/admin/devices/${deviceId}/revoke`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },

  async investigateAttendance(params?: {
    session_id?: number;
    student_id?: number;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<AttendanceInvestigationItem[]> {
    const urlParams = new URLSearchParams();
    if (params?.session_id !== undefined) urlParams.append('session_id', String(params.session_id));
    if (params?.student_id !== undefined) urlParams.append('student_id', String(params.student_id));
    if (params?.status) urlParams.append('status', params.status);
    if (params?.search) urlParams.append('search', params.search);
    if (params?.limit !== undefined) urlParams.append('limit', String(params.limit));
    if (params?.offset !== undefined) urlParams.append('offset', String(params.offset));
    const qs = urlParams.toString() ? `?${urlParams.toString()}` : '';
    const res = await fetch(`${API_BASE_URL}/admin/attendance/investigate${qs}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse(res);
  },
};

