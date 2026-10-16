from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class CourseCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=32)
    title: str = Field(..., min_length=3, max_length=255)
    description: Optional[str] = None


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    title: str
    description: Optional[str] = None
    organiser_id: int
    created_at: datetime
    enrolled_count: int = 0


class CourseEnrollRequest(BaseModel):
    student_id_number: str
