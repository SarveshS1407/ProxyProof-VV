export type UserRole = 'student' | 'organiser' | 'admin';

export interface StudentProfile {
  id: number;
  student_id_number: string;
  department?: string;
  batch?: string;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  student_profile?: StudentProfile;
}

export type DeviceStatus = 'PENDING' | 'APPROVED' | 'REVOKED';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface Device {
  id: number;
  student_profile_id: number;
  device_identifier: string;
  public_key: string;
  device_model?: string;
  os_version?: string;
  status: DeviceStatus;
  created_at: string;
  approved_at?: string;
}

export interface DeviceChangeRequest {
  id: number;
  student_profile_id: number;
  current_device_id?: number;
  new_device_identifier: string;
  new_public_key: string;
  new_device_model?: string;
  new_os_version?: string;
  reason: string;
  status: RequestStatus;
  admin_notes?: string;
  created_at: string;
  reviewed_at?: string;
}

export interface Course {
  id: number;
  code: string;
  title: string;
  description?: string;
  organiser_id: number;
  created_at: string;
  enrolled_count: number;
}

export interface AttendanceSession {
  id: number;
  course_id: number;
  course_title?: string;
  course_code?: string;
  organiser_id: number;
  title: string;
  location?: string;
  start_time?: string;
  end_time?: string;
  duration_minutes: number;
  is_active: boolean;
  is_closed: boolean;
  token_rotation_seconds: number;
  min_rssi: number;
  created_at: string;
  attendance_count: number;
  enrolled_count: number;
}

export interface SessionTokenInfo {
  session_id: number;
  token_value: string;
  window_index: number;
  seconds_remaining: number;
  valid_until: string;
  session_short_id: string;
  ble_service_uuid: string;
}

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'EXCUSED' | 'ABSENT';
export type VerificationMethod = 'BLE' | 'MANUAL_OVERRIDE';

export interface AttendanceRecord {
  id: number;
  session_id: number;
  student_id: number;
  student_name: string;
  student_id_number: string;
  device_id?: number;
  status: AttendanceStatus;
  verification_method: VerificationMethod;
  rssi?: number;
  recorded_at: string;
  manual_override: boolean;
  override_reason?: string;
}

export interface CoursePercentage {
  course_id: number;
  course_code: string;
  course_title: string;
  total_sessions: number;
  attended_sessions: number;
  excused_sessions: number;
  attendance_percentage: number;
}

export interface StudentHistoryItem {
  record_id: number;
  session_id: number;
  session_title: string;
  course_id: number;
  course_code: string;
  course_title: string;
  recorded_at: string;
  status: AttendanceStatus;
  verification_method: VerificationMethod;
  rssi?: number;
  manual_override: boolean;
  override_reason?: string;
}

export interface StudentReport {
  student_id: number;
  student_name: string;
  student_id_number: string;
  overall_percentage: number;
  course_percentages: CoursePercentage[];
  history: StudentHistoryItem[];
}

export interface AdminStats {
  total_users: number;
  total_students: number;
  total_organisers: number;
  total_courses: number;
  active_sessions: number;
  total_attendance_records: number;
  pending_device_requests: number;
}

export interface AuditLogItem {
  id: number;
  user_id?: number;
  user_email?: string;
  action: string;
  entity_type: string;
  entity_id?: number;
  details?: string;
  timestamp: string;
}
