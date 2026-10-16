from datetime import datetime, timezone
import secrets
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    organiser_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    location = Column(String(255), nullable=True)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, default=60, nullable=False)
    is_active = Column(Boolean, default=False, nullable=False)
    is_closed = Column(Boolean, default=False, nullable=False)
    token_rotation_seconds = Column(Integer, default=10, nullable=False)
    min_rssi = Column(Integer, default=-85, nullable=False)
    session_secret = Column(String(128), default=lambda: secrets.token_hex(32), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    course = relationship("Course", back_populates="sessions")
    organiser = relationship("User", back_populates="sessions_organized")
    tokens = relationship("SessionToken", back_populates="session", cascade="all, delete-orphan")
    attendance_records = relationship("AttendanceRecord", back_populates="session", cascade="all, delete-orphan")


class SessionToken(Base):
    __tablename__ = "session_tokens"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("attendance_sessions.id", ondelete="CASCADE"), nullable=False)
    window_index = Column(Integer, nullable=False)
    token_value = Column(String(32), index=True, nullable=False)
    valid_from = Column(DateTime, nullable=False)
    valid_until = Column(DateTime, nullable=False)
    is_revoked = Column(Boolean, default=False, nullable=False)

    __table_args__ = (
        UniqueConstraint("session_id", "window_index", name="uq_session_window"),
    )

    # Relationships
    session = relationship("AttendanceSession", back_populates="tokens")
