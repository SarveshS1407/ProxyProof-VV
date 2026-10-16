from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole, StudentProfile
from app.models.device import Device, DeviceChangeRequest, DeviceStatus, RequestStatus
from app.models.audit import AuditLog
from app.schemas.device import (
    DeviceRegister, DeviceOut, DeviceChangeRequestCreate,
    DeviceChangeRequestOut, DeviceChangeReview
)
from app.core.deps import get_current_user, get_current_student, get_current_admin

router = APIRouter(prefix="/devices", tags=["Device Management"])


@router.post("/register", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
def register_device(
    device_in: DeviceRegister,
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    profile = db.query(StudentProfile).filter(StudentProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student profile not found for this account"
        )

    # Check if this student already has an APPROVED active device
    approved_device = db.query(Device).filter(
        Device.student_profile_id == profile.id,
        Device.status == DeviceStatus.APPROVED
    ).first()

    if approved_device:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have an approved device bound to this account. Submit a Device Change Request to replace it."
        )

    # Check if this physical hardware identifier is registered by another student
    other_device = db.query(Device).filter(
        Device.device_identifier == device_in.device_identifier.strip(),
        Device.status == DeviceStatus.APPROVED,
        Device.student_profile_id != profile.id
    ).first()
    if other_device:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This device hardware is already registered to another active student account."
        )

    # Initial registration: auto-approve first device to streamline onboarding
    now = datetime.now(timezone.utc)
    new_device = Device(
        student_profile_id=profile.id,
        device_identifier=device_in.device_identifier.strip(),
        public_key=device_in.public_key.strip(),
        device_model=device_in.device_model,
        os_version=device_in.os_version,
        status=DeviceStatus.APPROVED,
        approved_at=now,
    )
    db.add(new_device)
    db.flush()

    audit = AuditLog(
        user_id=current_user.id,
        action="DEVICE_REGISTERED",
        entity_type="Device",
        entity_id=new_device.id,
        details=f"Device {new_device.device_identifier} registered and approved for student {profile.student_id_number}"
    )
    db.add(audit)
    db.commit()
    db.refresh(new_device)

    return new_device


@router.get("/status", response_model=List[DeviceOut])
def get_device_status(
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    profile = db.query(StudentProfile).filter(StudentProfile.user_id == current_user.id).first()
    if not profile:
        return []
    devices = db.query(Device).filter(Device.student_profile_id == profile.id).all()
    return devices


@router.post("/request-change", response_model=DeviceChangeRequestOut, status_code=status.HTTP_201_CREATED)
def request_device_change(
    req_in: DeviceChangeRequestCreate,
    current_user: User = Depends(get_current_student),
    db: Session = Depends(get_db)
):
    profile = db.query(StudentProfile).filter(StudentProfile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Student profile not found")

    # Check for pending requests
    pending = db.query(DeviceChangeRequest).filter(
        DeviceChangeRequest.student_profile_id == profile.id,
        DeviceChangeRequest.status == RequestStatus.PENDING
    ).first()
    if pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have a pending device change request awaiting administrator review"
        )

    current_dev = db.query(Device).filter(
        Device.student_profile_id == profile.id,
        Device.status == DeviceStatus.APPROVED
    ).first()

    change_req = DeviceChangeRequest(
        student_profile_id=profile.id,
        current_device_id=current_dev.id if current_dev else None,
        new_device_identifier=req_in.new_device_identifier.strip(),
        new_public_key=req_in.new_public_key.strip(),
        new_device_model=req_in.new_device_model,
        new_os_version=req_in.new_os_version,
        reason=req_in.reason.strip(),
        status=RequestStatus.PENDING,
    )
    db.add(change_req)
    db.flush()

    audit = AuditLog(
        user_id=current_user.id,
        action="DEVICE_CHANGE_REQUESTED",
        entity_type="DeviceChangeRequest",
        entity_id=change_req.id,
        details=f"Device change requested: {req_in.reason}"
    )
    db.add(audit)
    db.commit()
    db.refresh(change_req)

    return change_req


@router.get("/requests", response_model=List[DeviceChangeRequestOut])
def list_device_change_requests(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    requests = db.query(DeviceChangeRequest).order_by(DeviceChangeRequest.created_at.desc()).all()
    return requests


@router.post("/requests/{request_id}/review", response_model=DeviceChangeRequestOut)
def review_device_change_request(
    request_id: int,
    review_in: DeviceChangeReview,
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    req = db.query(DeviceChangeRequest).filter(DeviceChangeRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if req.status != RequestStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Request is already {req.status.value}")

    now = datetime.now(timezone.utc)
    req.reviewed_at = now
    req.reviewed_by_id = current_user.id
    req.admin_notes = review_in.admin_notes

    if review_in.approved:
        req.status = RequestStatus.APPROVED
        # Revoke old device if present
        if req.current_device_id:
            old_device = db.query(Device).filter(Device.id == req.current_device_id).first()
            if old_device:
                old_device.status = DeviceStatus.REVOKED

        # Create and approve new device
        new_device = Device(
            student_profile_id=req.student_profile_id,
            device_identifier=req.new_device_identifier,
            public_key=req.new_public_key,
            device_model=req.new_device_model,
            os_version=req.new_os_version,
            status=DeviceStatus.APPROVED,
            approved_at=now,
            approved_by_id=current_user.id
        )
        db.add(new_device)
        audit_action = "DEVICE_CHANGE_APPROVED"
    else:
        req.status = RequestStatus.REJECTED
        audit_action = "DEVICE_CHANGE_REJECTED"

    audit = AuditLog(
        user_id=current_user.id,
        action=audit_action,
        entity_type="DeviceChangeRequest",
        entity_id=req.id,
        details=f"Admin {current_user.email} reviewed request {req.id}: {req.status.value}. Notes: {review_in.admin_notes}"
    )
    db.add(audit)
    db.commit()
    db.refresh(req)

    return req
