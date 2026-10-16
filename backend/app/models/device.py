from datetime import datetime, timezone
import enum
from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.database import Base


class DeviceStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REVOKED = "REVOKED"


class RequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    student_profile_id = Column(Integer, ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False)
    device_identifier = Column(String(128), unique=True, index=True, nullable=False)
    public_key = Column(Text, nullable=False)
    device_model = Column(String(128), nullable=True)
    os_version = Column(String(64), nullable=True)
    status = Column(Enum(DeviceStatus), default=DeviceStatus.APPROVED, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    approved_at = Column(DateTime, nullable=True)
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    student_profile = relationship("StudentProfile", back_populates="devices")
    attendance_records = relationship("AttendanceRecord", back_populates="device")


class DeviceChangeRequest(Base):
    __tablename__ = "device_change_requests"

    id = Column(Integer, primary_key=True, index=True)
    student_profile_id = Column(Integer, ForeignKey("student_profiles.id", ondelete="CASCADE"), nullable=False)
    current_device_id = Column(Integer, ForeignKey("devices.id", ondelete="SET NULL"), nullable=True)
    new_device_identifier = Column(String(128), nullable=False)
    new_public_key = Column(Text, nullable=False)
    new_device_model = Column(String(128), nullable=True)
    new_os_version = Column(String(64), nullable=True)
    reason = Column(Text, nullable=False)
    status = Column(Enum(RequestStatus), default=RequestStatus.PENDING, nullable=False)
    admin_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Relationships
    student_profile = relationship("StudentProfile", back_populates="device_change_requests")
    current_device = relationship("Device", foreign_keys=[current_device_id])
