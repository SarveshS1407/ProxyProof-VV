from datetime import datetime, timezone
import enum
from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, Boolean, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class AttendanceStatus(str, enum.Enum):
    PRESENT = "PRESENT"
    LATE = "LATE"
    EXCUSED = "EXCUSED"
    ABSENT = "ABSENT"


class VerificationMethod(str, enum.Enum):
    BLE = "BLE"
    MANUAL_OVERRIDE = "MANUAL_OVERRIDE"


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    status = Column(Enum(AttendanceStatus), default=AttendanceStatus.PRESENT, nullable=False)
    verification_method = Column(Enum(VerificationMethod), default=VerificationMethod.BLE, nullable=False)
    rssi = Column(Integer, nullable=True)
    client_timestamp = Column(DateTime, nullable=True)
    nonce = Column(String(64), nullable=True)
    recorded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    
    # Manual correction support
    manual_override = Column(Boolean, default=False, nullable=False)
    override_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    override_reason = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("session_id", "student_id", name="uq_session_student_attendance"),
    )

    # Relationships
    session = relationship("AttendanceSession", back_populates="attendance_records")
    student = relationship("User", foreign_keys=[student_id], back_populates="attendance_records")
    device = relationship("Device", back_populates="attendance_records")
    override_by = relationship("User", foreign_keys=[override_by_id])
