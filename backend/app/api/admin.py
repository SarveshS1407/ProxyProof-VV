from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole, StudentProfile
from app.models.device import Device, DeviceChangeRequest, RequestStatus
from app.models.session import AttendanceSession
from app.models.attendance import AttendanceRecord
from app.models.audit import AuditLog
from app.schemas.auth import UserOut
from app.core.deps import get_current_admin

router = APIRouter(prefix="/admin", tags=["Administrator"])


class AdminStats(BaseModel):
    total_users: int
    total_students: int
    total_organisers: int
    total_courses: int
    active_sessions: int
    total_attendance_records: int
    pending_device_requests: int


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[int]
    user_email: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[int]
    details: Optional[str]
    timestamp: str


class UserStatusUpdate(BaseModel):
    is_active: bool


@router.get("/stats", response_model=AdminStats)
def get_system_stats(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    from app.models.course import Course
    total_users = db.query(User).count()
    total_students = db.query(User).filter(User.role == UserRole.STUDENT).count()
    total_organisers = db.query(User).filter(User.role == UserRole.ORGANISER).count()
    total_courses = db.query(Course).count()
    active_sessions = db.query(AttendanceSession).filter(
        AttendanceSession.is_active == True,
        AttendanceSession.is_closed == False
    ).count()
    total_records = db.query(AttendanceRecord).count()
    pending_devices = db.query(DeviceChangeRequest).filter(
        DeviceChangeRequest.status == RequestStatus.PENDING
    ).count()

    return AdminStats(
        total_users=total_users,
        total_students=total_students,
        total_organisers=total_organisers,
        total_courses=total_courses,
        active_sessions=active_sessions,
        total_attendance_records=total_records,
        pending_device_requests=pending_devices
    )


@router.get("/audit-logs", response_model=List[AuditLogOut])
def get_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    action: Optional[str] = None,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    logs = query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit).all()

    results = []
    for log in logs:
        results.append(AuditLogOut(
            id=log.id,
            user_id=log.user_id,
            user_email=log.user.email if log.user else "System",
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            details=log.details,
            timestamp=log.timestamp.isoformat()
        ))
    return results


@router.get("/users", response_model=List[UserOut])
def list_users(
    role: Optional[UserRole] = None,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    users = query.order_by(User.created_at.desc()).all()
    return users


@router.put("/users/{user_id}/status", response_model=UserOut)
def update_user_status(
    user_id: int,
    status_in: UserStatusUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot alter your own active status")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = status_in.is_active
    audit = AuditLog(
        user_id=current_user.id,
        action="USER_STATUS_UPDATED",
        entity_type="User",
        entity_id=user.id,
        details=f"Admin {current_user.email} updated user {user.email} is_active={status_in.is_active}"
    )
    db.add(audit)
    db.commit()
    db.refresh(user)

    return user
