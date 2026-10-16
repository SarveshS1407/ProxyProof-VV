import csv
import io
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole, StudentProfile
from app.models.course import Course, CourseEnrollment
from app.models.device import Device, DeviceStatus
from app.models.session import AttendanceSession
from app.models.attendance import AttendanceRecord, AttendanceStatus, VerificationMethod
from app.models.audit import AuditLog
from app.schemas.attendance import (
    AttendanceSubmit, AttendanceOut, ManualAttendanceUpdate, AttendanceSubmitResponse
)
from app.schemas.report import CourseAttendancePercentage, StudentAttendanceHistoryItem, StudentReportOut
from app.core.deps import get_current_user, get_current_student, get_current_organiser
from app.core.ble_token import verify_session_token
from app.core.crypto import verify_device_signature
from app.core.websocket import manager

router = APIRouter(prefix="/attendance", tags=["Attendance Management"])


def sanitize_csv_cell(value: str) -> str:
    """Prevents CSV formula injection by prepending single quote if starting with formula triggers."""
    if not value:
        return ""
    str_val = str(value).strip()
    if str_val.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{str_val}"
    return str_val


@router.post("/submit", response_model=AttendanceSubmitResponse, status_code=status.HTTP_201_CREATED)
async def submit_attendance(
    attendance_in: AttendanceSubmit,
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    # 1. Fetch Session
    session = db.query(AttendanceSession).filter(AttendanceSession.id == attendance_in.session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance session not found")

    if not session.is_active or session.is_closed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Attendance session is closed or not active. Check-in rejected."
        )

    # 2. Verify Student Profile & Course Enrollment
    profile = db.query(StudentProfile).filter(StudentProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Student profile not found")

    enrollment = db.query(CourseEnrollment).filter(
        CourseEnrollment.course_id == session.course_id,
        CourseEnrollment.student_profile_id == profile.id,
        CourseEnrollment.is_active == True
    ).first()
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not enrolled in the course associated with this session"
        )

    # 3. Duplicate Attendance / Replay Check
    existing_record = db.query(AttendanceRecord).filter(
        AttendanceRecord.session_id == session.id,
        AttendanceRecord.student_id == current_user.id
    ).first()
    if existing_record:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Attendance already recorded for this session at {existing_record.recorded_at.isoformat()} UTC (Status: {existing_record.status.value})"
        )

    # 4. Device Binding Verification
    approved_device = db.query(Device).filter(
        Device.student_profile_id == profile.id,
        Device.status == DeviceStatus.APPROVED
    ).first()

    if not approved_device:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No approved device registered for this student account. Please register your device first."
        )

    if approved_device.device_identifier != attendance_in.device_identifier.strip():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Device hardware identifier does not match your registered, approved device."
        )

    # 5. Cryptographic Proof of Possession (Device Signature Check)
    canonical_payload = (
        f"{current_user.id}:{session.id}:{attendance_in.token.strip()}:"
        f"{attendance_in.timestamp}:{attendance_in.nonce.strip()}:{attendance_in.rssi}"
    )

    is_sig_valid = verify_device_signature(
        public_key_str=approved_device.public_key,
        message=canonical_payload,
        signature_str=attendance_in.signature
    )

    if not is_sig_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cryptographic device signature verification failed. Attendance claim could not be authenticated."
        )

    # 6. Rotating Token Freshness & Validation
    is_token_valid, reason, window_idx = verify_session_token(
        session=session,
        submitted_token=attendance_in.token,
        client_timestamp=float(attendance_in.timestamp)
    )
    if not is_token_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"BLE token verification failed: {reason}"
        )

    # 7. Proximity / RSSI Threshold Verification
    min_rssi = session.min_rssi if session.min_rssi is not None else -85
    if attendance_in.rssi < min_rssi:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Signal strength too weak ({attendance_in.rssi} dBm < {min_rssi} dBm threshold). Physical proximity check failed."
        )

    # 8. Record Attendance
    now = datetime.now(timezone.utc)
    record = AttendanceRecord(
        session_id=session.id,
        student_id=current_user.id,
        device_id=approved_device.id,
        status=AttendanceStatus.PRESENT,
        verification_method=VerificationMethod.BLE,
        rssi=attendance_in.rssi,
        client_timestamp=datetime.fromtimestamp(attendance_in.timestamp, tz=timezone.utc),
        nonce=attendance_in.nonce.strip(),
        recorded_at=now,
        manual_override=False
    )
    db.add(record)
    db.flush()

    audit = AuditLog(
        user_id=current_user.id,
        action="ATTENDANCE_RECORDED_BLE",
        entity_type="AttendanceRecord",
        entity_id=record.id,
        details=f"Student {profile.student_id_number} verified attendance for session {session.id} (RSSI: {attendance_in.rssi} dBm)"
    )
    db.add(audit)
    db.commit()
    db.refresh(record)

    # 9. Real-time broadcast to Organiser Dashboard
    await manager.broadcast_to_session(session.id, {
        "event": "ATTENDANCE_RECORDED",
        "record": {
            "id": record.id,
            "session_id": session.id,
            "student_id": current_user.id,
            "student_name": current_user.full_name,
            "student_id_number": profile.student_id_number,
            "status": record.status.value,
            "verification_method": record.verification_method.value,
            "rssi": record.rssi,
            "recorded_at": record.recorded_at.isoformat(),
            "manual_override": False
        }
    })

    return AttendanceSubmitResponse(
        status="confirmed",
        record_id=record.id,
        session_id=session.id,
        course_title=session.course.title if session.course else "Course",
        recorded_at=record.recorded_at,
        attendance_status=record.status,
        rssi=record.rssi,
        verification_method=record.verification_method
    )


@router.get("/session/{session_id}", response_model=List[AttendanceOut])
def get_session_attendance(
    session_id: int,
    current_user: User = Depends(get_current_organiser),
    db: Session = Depends(get_db)
):
    session = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    records = db.query(AttendanceRecord).filter(
        AttendanceRecord.session_id == session_id
    ).order_by(AttendanceRecord.recorded_at.desc()).all()

    results = []
    for r in records:
        student_user = r.student
        profile = student_user.student_profile if student_user else None
        results.append(AttendanceOut(
            id=r.id,
            session_id=r.session_id,
            student_id=r.student_id,
            student_name=student_user.full_name if student_user else "Unknown",
            student_id_number=profile.student_id_number if profile else "N/A",
            device_id=r.device_id,
            status=r.status,
            verification_method=r.verification_method,
            rssi=r.rssi,
            recorded_at=r.recorded_at,
            manual_override=r.manual_override,
            override_reason=r.override_reason
        ))
    return results


@router.post("/manual-override", response_model=AttendanceOut)
async def manual_attendance_override(
    override_in: ManualAttendanceUpdate,
    current_user: User = Depends(get_current_organiser),
    db: Session = Depends(get_db)
):
    session = db.query(AttendanceSession).filter(AttendanceSession.id == override_in.session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    student = db.query(User).filter(User.id == override_in.student_id).first()
    if not student or student.role != UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    record = db.query(AttendanceRecord).filter(
        AttendanceRecord.session_id == override_in.session_id,
        AttendanceRecord.student_id == override_in.student_id
    ).first()

    now = datetime.now(timezone.utc)
    if record:
        old_status = record.status.value
        record.status = override_in.status
        record.manual_override = True
        record.override_by_id = current_user.id
        record.override_reason = override_in.reason.strip()
        details_msg = f"Status modified from {old_status} to {override_in.status.value}. Reason: {override_in.reason}"
    else:
        record = AttendanceRecord(
            session_id=override_in.session_id,
            student_id=override_in.student_id,
            device_id=None,
            status=override_in.status,
            verification_method=VerificationMethod.MANUAL_OVERRIDE,
            rssi=None,
            recorded_at=now,
            manual_override=True,
            override_by_id=current_user.id,
            override_reason=override_in.reason.strip()
        )
        db.add(record)
        details_msg = f"Manual attendance added as {override_in.status.value}. Reason: {override_in.reason}"

    db.flush()

    audit = AuditLog(
        user_id=current_user.id,
        action="ATTENDANCE_MANUAL_OVERRIDE",
        entity_type="AttendanceRecord",
        entity_id=record.id,
        details=f"Instructor {current_user.email} changed attendance for student {student.id}: {details_msg}"
    )
    db.add(audit)
    db.commit()
    db.refresh(record)

    profile = student.student_profile
    out = AttendanceOut(
        id=record.id,
        session_id=record.session_id,
        student_id=record.student_id,
        student_name=student.full_name,
        student_id_number=profile.student_id_number if profile else "N/A",
        device_id=record.device_id,
        status=record.status,
        verification_method=record.verification_method,
        rssi=record.rssi,
        recorded_at=record.recorded_at,
        manual_override=record.manual_override,
        override_reason=record.override_reason
    )

    await manager.broadcast_to_session(session.id, {
        "event": "ATTENDANCE_OVERRIDE",
        "record": {
            "id": out.id,
            "session_id": out.session_id,
            "student_id": out.student_id,
            "student_name": out.student_name,
            "student_id_number": out.student_id_number,
            "status": out.status.value,
            "verification_method": out.verification_method.value,
            "rssi": out.rssi,
            "recorded_at": out.recorded_at.isoformat(),
            "manual_override": True,
            "override_reason": out.override_reason
        }
    })

    return out


@router.get("/student/history", response_model=List[StudentAttendanceHistoryItem])
def get_student_history(
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    records = db.query(AttendanceRecord).filter(
        AttendanceRecord.student_id == current_user.id
    ).order_by(AttendanceRecord.recorded_at.desc()).all()

    history = []
    for r in records:
        s = r.session
        c = s.course if s else None
        history.append(StudentAttendanceHistoryItem(
            record_id=r.id,
            session_id=r.session_id,
            session_title=s.title if s else "Session",
            course_id=c.id if c else 0,
            course_code=c.code if c else "N/A",
            course_title=c.title if c else "N/A",
            recorded_at=r.recorded_at,
            status=r.status,
            verification_method=r.verification_method,
            rssi=r.rssi,
            manual_override=r.manual_override,
            override_reason=r.override_reason
        ))
    return history


@router.get("/student/percentages", response_model=StudentReportOut)
def get_student_percentages(
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    profile = db.query(StudentProfile).filter(StudentProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student profile not found")

    enrollments = db.query(CourseEnrollment).filter(
        CourseEnrollment.student_profile_id == profile.id,
        CourseEnrollment.is_active == True
    ).all()

    total_all_sessions = 0
    total_attended_all = 0
    course_stats = []

    for e in enrollments:
        course = e.course
        # Total sessions conducted for this course (exclude unstarted future drafts)
        sessions = db.query(AttendanceSession).filter(
            AttendanceSession.course_id == course.id,
            or_(
                AttendanceSession.is_active == True,
                AttendanceSession.is_closed == True,
                AttendanceSession.start_time.isnot(None)
            )
        ).all()
        session_ids = [s.id for s in sessions]
        total_course_sessions = len(session_ids)

        attended_count = 0
        excused_count = 0
        if session_ids:
            records = db.query(AttendanceRecord).filter(
                AttendanceRecord.session_id.in_(session_ids),
                AttendanceRecord.student_id == current_user.id
            ).all()
            for rec in records:
                if rec.status in (AttendanceStatus.PRESENT, AttendanceStatus.LATE):
                    attended_count += 1
                elif rec.status == AttendanceStatus.EXCUSED:
                    excused_count += 1

        effective_attended = attended_count + excused_count
        pct = (effective_attended / total_course_sessions * 100.0) if total_course_sessions > 0 else 0.0

        total_all_sessions += total_course_sessions
        total_attended_all += effective_attended

        course_stats.append(CourseAttendancePercentage(
            course_id=course.id,
            course_code=course.code,
            course_title=course.title,
            total_sessions=total_course_sessions,
            attended_sessions=attended_count,
            excused_sessions=excused_count,
            attendance_percentage=round(pct, 2)
        ))

    overall_pct = (total_attended_all / total_all_sessions * 100.0) if total_all_sessions > 0 else 0.0

    # Also include history items
    records_all = db.query(AttendanceRecord).filter(
        AttendanceRecord.student_id == current_user.id
    ).order_by(AttendanceRecord.recorded_at.desc()).all()

    history = []
    for r in records_all:
        s = r.session
        c = s.course if s else None
        history.append(StudentAttendanceHistoryItem(
            record_id=r.id,
            session_id=r.session_id,
            session_title=s.title if s else "Session",
            course_id=c.id if c else 0,
            course_code=c.code if c else "N/A",
            course_title=c.title if c else "N/A",
            recorded_at=r.recorded_at,
            status=r.status,
            verification_method=r.verification_method,
            rssi=r.rssi,
            manual_override=r.manual_override,
            override_reason=r.override_reason
        ))

    return StudentReportOut(
        student_id=current_user.id,
        student_name=current_user.full_name,
        student_id_number=profile.student_id_number,
        overall_percentage=round(overall_pct, 2),
        course_percentages=course_stats,
        history=history
    )


@router.get("/session/{session_id}/export-csv")
def export_session_csv(
    session_id: int,
    current_user: User = Depends(get_current_organiser),
    db: Session = Depends(get_db)
):
    session = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    records = db.query(AttendanceRecord).filter(
        AttendanceRecord.session_id == session_id
    ).order_by(AttendanceRecord.recorded_at.asc()).all()

    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

    # Header
    writer.writerow([
        "Record ID",
        "Student ID Number",
        "Student Name",
        "Student Email",
        "Attendance Status",
        "Verification Method",
        "RSSI (dBm)",
        "Recorded At (UTC)",
        "Manual Override",
        "Override Reason"
    ])

    for r in records:
        student = r.student
        profile = student.student_profile if student else None
        writer.writerow([
            r.id,
            sanitize_csv_cell(profile.student_id_number if profile else "N/A"),
            sanitize_csv_cell(student.full_name if student else "N/A"),
            sanitize_csv_cell(student.email if student else "N/A"),
            r.status.value,
            r.verification_method.value,
            r.rssi if r.rssi is not None else "N/A",
            r.recorded_at.isoformat() if r.recorded_at else "N/A",
            "Yes" if r.manual_override else "No",
            sanitize_csv_cell(r.override_reason or "")
        ])

    csv_data = output.getvalue()
    safe_title = "".join(c for c in session.title if c.isalnum() or c in ("-", "_")).rstrip()
    filename = f"attendance_session_{session.id}_{safe_title}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
