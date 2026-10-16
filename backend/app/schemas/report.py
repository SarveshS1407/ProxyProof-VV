from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

from app.models.attendance import AttendanceStatus, VerificationMethod


class CourseAttendancePercentage(BaseModel):
    course_id: int
    course_code: str
    course_title: str
    total_sessions: int
    attended_sessions: int
    excused_sessions: int
    attendance_percentage: float


class StudentAttendanceHistoryItem(BaseModel):
    record_id: int
    session_id: int
    session_title: str
    course_id: int
    course_code: str
    course_title: str
    recorded_at: datetime
    status: AttendanceStatus
    verification_method: VerificationMethod
    rssi: Optional[int] = None
    manual_override: bool = False
    override_reason: Optional[str] = None


class StudentReportOut(BaseModel):
    student_id: int
    student_name: str
    student_id_number: str
    overall_percentage: float
    course_percentages: List[CourseAttendancePercentage]
    history: List[StudentAttendanceHistoryItem]
