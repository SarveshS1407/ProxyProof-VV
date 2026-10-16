from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class SessionCreate(BaseModel):
    course_id: int
    title: str = Field(..., min_length=2, max_length=255)
    location: Optional[str] = "Main Hall"
    duration_minutes: int = Field(default=60, ge=1, le=480)
    token_rotation_seconds: int = Field(default=10, ge=5, le=60)
    min_rssi: int = Field(default=-85, ge=-110, le=-30)


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    course_title: Optional[str] = None
    course_code: Optional[str] = None
    organiser_id: int
    title: str
    location: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    duration_minutes: int
    is_active: bool
    is_closed: bool
    token_rotation_seconds: int
    min_rssi: int
    created_at: datetime
    attendance_count: int = 0
    enrolled_count: int = 0


class SessionTokenOut(BaseModel):
    session_id: int
    token_value: str
    window_index: int
    seconds_remaining: int
    valid_until: datetime
    session_short_id: str
    ble_service_uuid: str


class SessionStatusOut(BaseModel):
    session_id: int
    is_active: bool
    is_closed: bool
    duration_minutes: int
    elapsed_seconds: int
    remaining_seconds: int
    attendance_count: int
    enrolled_count: int
