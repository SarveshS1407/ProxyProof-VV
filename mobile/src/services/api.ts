import { Platform } from 'react-native';

// Use 10.0.2.2 for Android emulator, localhost for iOS simulator or web
const BASE_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const API_BASE_URL = `http://${BASE_HOST}:8000/api/v1`;

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = () => authToken;

const authHeaders = () => (authToken ? { Authorization: `Bearer ${authToken}` } : {});

export const mobileApi = {
  async login(email: string, pass: string) {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Login failed');
    }
    const data = await res.json();
    setAuthToken(data.access_token);
    return data;
  },

  async registerDevice(data: {
    device_identifier: string;
    public_key: string;
    device_model: string;
    os_version: string;
  }) {
    const res = await fetch(`${API_BASE_URL}/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Device registration failed');
    }
    return res.json();
  },

  async getDeviceStatus() {
    const res = await fetch(`${API_BASE_URL}/devices/status`, {
      headers: { ...authHeaders() },
    });
    return res.json();
  },

  async getActiveSessions() {
    const res = await fetch(`${API_BASE_URL}/sessions/active`, {
      headers: { ...authHeaders() },
    });
    return res.json();
  },

  async getCurrentToken(sessionId: number) {
    const res = await fetch(`${API_BASE_URL}/sessions/${sessionId}/current-token`, {
      headers: { ...authHeaders() },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Session inactive');
    }
    return res.json();
  },

  async submitAttendance(data: {
    session_id: number;
    token: string;
    rssi: number;
    timestamp: number;
    nonce: string;
    device_identifier: string;
    signature: string;
  }) {
    const res = await fetch(`${API_BASE_URL}/attendance/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Attendance check-in rejected');
    }
    return res.json();
  },

  async getStudentPercentages() {
    const res = await fetch(`${API_BASE_URL}/attendance/student/percentages`, {
      headers: { ...authHeaders() },
    });
    return res.json();
  },
};
