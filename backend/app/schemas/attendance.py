from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.attendance import AttendanceStatus, VerificationMethod


class AttendanceSubmit(BaseModel):
    session_id: int
    token: str = Field(..., min_length=4, max_length=64)
    rssi: int = Field(..., ge=-120, le=0)
    timestamp: int = Field(..., description="Client epoch seconds timestamp")
    nonce: str = Field(..., min_length=8, max_length=64)
    device_identifier: str = Field(..., min_length=4, max_length=128)
    signature: str = Field(..., min_length=16, description="Cryptographic signature of canonical check-in string")


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    student_id: int
    student_name: str
    student_id_number: str
    device_id: Optional[int] = None
    status: AttendanceStatus
    verification_method: VerificationMethod
    rssi: Optional[int] = None
    recorded_at: datetime
    manual_override: bool
    override_reason: Optional[str] = None


class ManualAttendanceUpdate(BaseModel):
    session_id: int
    student_id: int
    status: AttendanceStatus
    reason: str = Field(..., min_length=3)


class AttendanceSubmitResponse(BaseModel):
    status: str
    record_id: int
    session_id: int
    course_title: str
    recorded_at: datetime
    attendance_status: AttendanceStatus
    rssi: Optional[int] = None
    verification_method: VerificationMethod
