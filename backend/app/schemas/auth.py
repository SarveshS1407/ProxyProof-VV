from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict

from app.models.user import UserRole


class StudentProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id_number: str
    department: Optional[str] = None
    batch: Optional[str] = None


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2)
    role: UserRole = UserRole.STUDENT
    student_id_number: Optional[str] = None
    department: Optional[str] = None
    batch: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    student_profile: Optional[StudentProfileOut] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
