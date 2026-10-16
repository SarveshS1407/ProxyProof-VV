from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole, StudentProfile
from app.models.device import Device, DeviceChangeRequest, RequestStatus, DeviceStatus
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


class UserRoleUpdate(BaseModel):
    role: UserRole


class AttendanceInvestigationItem(BaseModel):
    id: int
    session_id: int
    session_title: str
    course_id: int
    course_code: str
    course_title: str
    student_id: int
    student_name: str
    student_email: str
    student_id_number: str
    device_id: Optional[int]
    device_identifier: Optional[str]
    device_model: Optional[str] = None
    device_public_key: Optional[str] = None
    status: str
    verification_method: str
    rssi: Optional[int]
    nonce: Optional[str]
    recorded_at: str
    manual_override: bool
    override_reason: Optional[str]


@router.put("/users/{user_id}/role", response_model=UserOut)
def update_user_role(
    user_id: int,
    role_in: UserRoleUpdate,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot alter your own administrative role"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    old_role = user.role.value
    user.role = role_in.role

    # If transitioning to student, ensure a StudentProfile exists
    if role_in.role == UserRole.STUDENT and not user.student_profile:
        new_profile = StudentProfile(
            user_id=user.id,
            student_id_number=f"STU-{user.id:04d}",
            department="General",
            batch=f"{datetime.now().year}-{datetime.now().year+4}"
        )
        db.add(new_profile)

    audit = AuditLog(
        user_id=current_user.id,
        action="USER_ROLE_UPDATED",
        entity_type="User",
        entity_id=user.id,
        details=f"Admin {current_user.email} changed role for {user.email} from {old_role} to {role_in.role.value}"
    )
    db.add(audit)
    db.commit()
    db.refresh(user)

    return user


@router.post("/devices/{device_id}/revoke")
def revoke_device_credential(
    device_id: int,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    device = db.query(Device).filter(Device.id == device_id).first()
    if not device:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")

    if device.status == DeviceStatus.REVOKED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Device is already revoked"
        )

    device.status = DeviceStatus.REVOKED
    audit = AuditLog(
        user_id=current_user.id,
        action="DEVICE_REVOKED_BY_ADMIN",
        entity_type="Device",
        entity_id=device.id,
        details=f"Admin {current_user.email} revoked device {device.device_identifier} (Student Profile #{device.student_profile_id})"
    )
    db.add(audit)
    db.commit()
    db.refresh(device)

    return {
        "message": f"Device {device.device_identifier} successfully revoked",
        "device_id": device.id,
        "status": device.status.value
    }


@router.get("/attendance/investigate", response_model=List[AttendanceInvestigationItem])
def investigate_attendance(
    session_id: Optional[int] = Query(None),
    student_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    query = db.query(AttendanceRecord)

    if session_id is not None:
        query = query.filter(AttendanceRecord.session_id == session_id)
    if student_id is not None:
        query = query.filter(AttendanceRecord.student_id == student_id)
    if status_filter:
        query = query.filter(AttendanceRecord.status == status_filter.upper())

    records = query.order_by(AttendanceRecord.recorded_at.desc()).offset(offset).limit(limit).all()

    results = []
    for r in records:
        student = r.student
        profile = student.student_profile if student else None
        session = r.session
        course = session.course if session else None
        device = r.device

        item = AttendanceInvestigationItem(
            id=r.id,
            session_id=r.session_id,
            session_title=session.title if session else "Session",
            course_id=course.id if course else 0,
            course_code=course.code if course else "N/A",
            course_title=course.title if course else "N/A",
            student_id=r.student_id,
            student_name=student.full_name if student else "Unknown",
            student_email=student.email if student else "N/A",
            student_id_number=profile.student_id_number if profile else "N/A",
            device_id=r.device_id,
            device_identifier=device.device_identifier if device else None,
            device_model=device.device_model if device else None,
            device_public_key=device.public_key if device else None,
            status=r.status.value,
            verification_method=r.verification_method.value,
            rssi=r.rssi,
            nonce=r.nonce,
            recorded_at=r.recorded_at.isoformat(),
            manual_override=r.manual_override,
            override_reason=r.override_reason
        )

        if search:
            q = search.lower()
            if not (
                q in item.student_name.lower() or
                q in item.student_email.lower() or
                q in item.student_id_number.lower() or
                q in item.course_code.lower() or
                q in item.session_title.lower() or
                (item.device_identifier and q in item.device_identifier.lower()) or
                (item.nonce and q in item.nonce.lower())
            ):
                continue

        results.append(item)

    return results

