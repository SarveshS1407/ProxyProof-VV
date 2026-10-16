from datetime import datetime, timezone
import enum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class UserRole(str, enum.Enum):
    STUDENT = "student"
    ORGANISER = "organiser"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.STUDENT, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    student_profile = relationship("StudentProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    courses_organized = relationship("Course", back_populates="organiser")
    sessions_organized = relationship("AttendanceSession", back_populates="organiser")
    attendance_records = relationship("AttendanceRecord", back_populates="student", foreign_keys="[AttendanceRecord.student_id]")
    audit_logs = relationship("AuditLog", back_populates="user")


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    student_id_number = Column(String(64), unique=True, index=True, nullable=False)
    department = Column(String(128), nullable=True)
    batch = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    user = relationship("User", back_populates="student_profile")
    devices = relationship("Device", back_populates="student_profile", cascade="all, delete-orphan")
    device_change_requests = relationship("DeviceChangeRequest", back_populates="student_profile", cascade="all, delete-orphan")
    enrollments = relationship("CourseEnrollment", back_populates="student_profile", cascade="all, delete-orphan")
