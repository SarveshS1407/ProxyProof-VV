from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

from app.models.device import DeviceStatus, RequestStatus


class DeviceRegister(BaseModel):
    device_identifier: str = Field(..., min_length=4, max_length=128)
    public_key: str = Field(..., min_length=16)
    device_model: Optional[str] = None
    os_version: Optional[str] = None


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_profile_id: int
    device_identifier: str
    public_key: str
    device_model: Optional[str] = None
    os_version: Optional[str] = None
    status: DeviceStatus
    created_at: datetime
    approved_at: Optional[datetime] = None


class DeviceChangeRequestCreate(BaseModel):
    new_device_identifier: str = Field(..., min_length=4, max_length=128)
    new_public_key: str = Field(..., min_length=16)
    new_device_model: Optional[str] = None
    new_os_version: Optional[str] = None
    reason: str = Field(..., min_length=5)


class DeviceChangeRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_profile_id: int
    current_device_id: Optional[int] = None
    new_device_identifier: str
    new_public_key: str
    new_device_model: Optional[str] = None
    new_os_version: Optional[str] = None
    reason: str
    status: RequestStatus
    admin_notes: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by_id: Optional[int] = None


class DeviceChangeReview(BaseModel):
    approved: bool
    admin_notes: Optional[str] = None
