import time
from datetime import datetime, timezone, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.models.user import User, UserRole
from app.models.course import Course, CourseEnrollment
from app.models.session import AttendanceSession, SessionToken
from app.models.attendance import AttendanceRecord
from app.models.audit import AuditLog
from app.schemas.session import SessionCreate, SessionOut, SessionTokenOut, SessionStatusOut
from app.core.deps import get_current_user, get_current_organiser
from app.core.ble_token import get_current_token_info, get_session_short_id
from app.core.websocket import manager

router = APIRouter(prefix="/sessions", tags=["Attendance Sessions"])


@router.post("/", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    session_in: SessionCreate,
    current_user: User = Depends(get_current_organiser),
    db: Session = Depends(get_db)
):
    course = db.query(Course).filter(Course.id == session_in.course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    if current_user.role == UserRole.ORGANISER and course.organiser_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to create sessions for this course"
        )

    session = AttendanceSession(
        course_id=session_in.course_id,
        organiser_id=current_user.id,
        title=session_in.title.strip(),
        location=session_in.location,
        duration_minutes=session_in.duration_minutes,
        token_rotation_seconds=session_in.token_rotation_seconds,
        min_rssi=session_in.min_rssi,
        is_active=False,
        is_closed=False
    )
    db.add(session)
    db.flush()

    audit = AuditLog(
        user_id=current_user.id,
        action="SESSION_CREATED",
        entity_type="AttendanceSession",
        entity_id=session.id,
        details=f"Session '{session.title}' created for course {course.code}"
    )
    db.add(audit)
    db.commit()
    db.refresh(session)

    enrolled = db.query(CourseEnrollment).filter(
        CourseEnrollment.course_id == course.id,
        CourseEnrollment.is_active == True
    ).count()

    return SessionOut(
        id=session.id,
        course_id=session.course_id,
        course_title=course.title,
        course_code=course.code,
        organiser_id=session.organiser_id,
        title=session.title,
        location=session.location,
        start_time=session.start_time,
        end_time=session.end_time,
        duration_minutes=session.duration_minutes,
        is_active=session.is_active,
        is_closed=session.is_closed,
        token_rotation_seconds=session.token_rotation_seconds,
        min_rssi=session.min_rssi,
        created_at=session.created_at,
        attendance_count=0,
        enrolled_count=enrolled
    )


@router.get("/active", response_model=List[SessionOut])
def list_active_sessions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    sessions = db.query(AttendanceSession).filter(
        AttendanceSession.is_active == True,
        AttendanceSession.is_closed == False
    ).order_by(AttendanceSession.created_at.desc()).all()

    results = []
    for s in sessions:
        enrolled = db.query(CourseEnrollment).filter(
            CourseEnrollment.course_id == s.course_id,
            CourseEnrollment.is_active == True
        ).count()
        attended = db.query(AttendanceRecord).filter(
            AttendanceRecord.session_id == s.id
        ).count()
        results.append(SessionOut(
            id=s.id,
            course_id=s.course_id,
            course_title=s.course.title if s.course else None,
            course_code=s.course.code if s.course else None,
            organiser_id=s.organiser_id,
            title=s.title,
            location=s.location,
            start_time=s.start_time,
            end_time=s.end_time,
            duration_minutes=s.duration_minutes,
            is_active=s.is_active,
            is_closed=s.is_closed,
            token_rotation_seconds=s.token_rotation_seconds,
            min_rssi=s.min_rssi,
            created_at=s.created_at,
            attendance_count=attended,
            enrolled_count=enrolled
        ))
    return results


@router.get("/{session_id}", response_model=SessionOut)
def get_session_detail(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    s = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    enrolled = db.query(CourseEnrollment).filter(
        CourseEnrollment.course_id == s.course_id,
        CourseEnrollment.is_active == True
    ).count()
    attended = db.query(AttendanceRecord).filter(
        AttendanceRecord.session_id == s.id
    ).count()

    return SessionOut(
        id=s.id,
        course_id=s.course_id,
        course_title=s.course.title if s.course else None,
        course_code=s.course.code if s.course else None,
        organiser_id=s.organiser_id,
        title=s.title,
        location=s.location,
        start_time=s.start_time,
        end_time=s.end_time,
        duration_minutes=s.duration_minutes,
        is_active=s.is_active,
        is_closed=s.is_closed,
        token_rotation_seconds=s.token_rotation_seconds,
        min_rssi=s.min_rssi,
        created_at=s.created_at,
        attendance_count=attended,
        enrolled_count=enrolled
    )


@router.post("/{session_id}/start")
async def start_session(
    session_id: int,
    current_user: User = Depends(get_current_organiser),
    db: Session = Depends(get_db)
):
    s = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if s.is_closed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot restart a closed session")
    if s.is_active:
        return {"message": "Session is already active"}

    now = datetime.now(timezone.utc)
    s.is_active = True
    s.start_time = now
    s.end_time = now + timedelta(minutes=s.duration_minutes)

    audit = AuditLog(
        user_id=current_user.id,
        action="SESSION_STARTED",
        entity_type="AttendanceSession",
        entity_id=s.id,
        details=f"Session '{s.title}' started. Duration: {s.duration_minutes}m"
    )
    db.add(audit)
    db.commit()

    token_info = get_current_token_info(s)

    # Broadcast event via WebSocket
    await manager.broadcast_to_session(s.id, {
        "event": "SESSION_STATUS_CHANGED",
        "session_id": s.id,
        "is_active": True,
        "is_closed": False,
        "start_time": s.start_time.isoformat(),
        "end_time": s.end_time.isoformat()
    })

    return {
        "message": "Session started successfully",
        "session_id": s.id,
        "token_info": token_info
    }


@router.post("/{session_id}/stop")
async def stop_session(
    session_id: int,
    current_user: User = Depends(get_current_organiser),
    db: Session = Depends(get_db)
):
    s = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    now = datetime.now(timezone.utc)
    s.is_active = False
    s.is_closed = True
    s.end_time = now

    audit = AuditLog(
        user_id=current_user.id,
        action="SESSION_STOPPED",
        entity_type="AttendanceSession",
        entity_id=s.id,
        details=f"Session '{s.title}' closed by {current_user.email}"
    )
    db.add(audit)
    db.commit()

    await manager.broadcast_to_session(s.id, {
        "event": "SESSION_STATUS_CHANGED",
        "session_id": s.id,
        "is_active": False,
        "is_closed": True,
        "end_time": now.isoformat()
    })

    return {"message": "Session closed successfully", "session_id": s.id}


@router.get("/{session_id}/current-token", response_model=SessionTokenOut)
def get_current_token(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    s = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if not s.is_active or s.is_closed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session is not active")

    info = get_current_token_info(s)
    return SessionTokenOut(
        session_id=s.id,
        token_value=info["token_value"],
        window_index=info["window_index"],
        seconds_remaining=info["seconds_remaining"],
        valid_until=info["valid_until"],
        session_short_id=info["session_short_id"],
        ble_service_uuid=settings.BLE_SERVICE_UUID
    )


@router.get("/{session_id}/status", response_model=SessionStatusOut)
def get_session_status(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    s = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    now = datetime.now(timezone.utc)
    elapsed = 0
    remaining = 0
    if s.start_time:
        start_naive_or_aware = s.start_time
        if start_naive_or_aware.tzinfo is None:
            start_naive_or_aware = start_naive_or_aware.replace(tzinfo=timezone.utc)
        elapsed = int((now - start_naive_or_aware).total_seconds())
        total_duration_sec = s.duration_minutes * 60
        remaining = max(0, total_duration_sec - elapsed)
        # Check automatic expiration
        if s.is_active and not s.is_closed and remaining <= 0:
            s.is_active = False
            s.is_closed = True
            db.commit()

    attended = db.query(AttendanceRecord).filter(AttendanceRecord.session_id == s.id).count()
    enrolled = db.query(CourseEnrollment).filter(
        CourseEnrollment.course_id == s.course_id,
        CourseEnrollment.is_active == True
    ).count()

    return SessionStatusOut(
        session_id=s.id,
        is_active=s.is_active,
        is_closed=s.is_closed,
        duration_minutes=s.duration_minutes,
        elapsed_seconds=max(0, elapsed),
        remaining_seconds=remaining,
        attendance_count=attended,
        enrolled_count=enrolled
    )
