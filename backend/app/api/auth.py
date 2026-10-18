from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, StudentProfile, UserRole
from app.models.audit import AuditLog
from app.schemas.auth import UserRegister, UserLogin, UserOut, Token, UserProfileUpdate
from app.core.security import hash_password, verify_password, create_access_token
from app.core.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    # Check if email is already taken
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists"
        )

    # Disallow public administrator self-registration
    if user_in.role == UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public administrator self-registration is disabled. Administrator accounts must be created by an existing administrator."
        )

    # Validate student requirements
    if user_in.role == UserRole.STUDENT:
        if not user_in.student_id_number or not user_in.student_id_number.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student ID number is required for student registration"
            )
        existing_profile = db.query(StudentProfile).filter(
            StudentProfile.student_id_number == user_in.student_id_number.strip()
        ).first()
        if existing_profile:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This Student ID number is already registered"
            )

    new_user = User(
        email=user_in.email.lower().strip(),
        hashed_password=hash_password(user_in.password),
        full_name=user_in.full_name.strip(),
        role=user_in.role,
        is_active=True,
    )
    db.add(new_user)
    db.flush()

    if user_in.role == UserRole.STUDENT:
        profile = StudentProfile(
            user_id=new_user.id,
            student_id_number=user_in.student_id_number.strip(),
            department=user_in.department,
            batch=user_in.batch,
        )
        db.add(profile)

    audit = AuditLog(
        user_id=new_user.id,
        action="USER_REGISTERED",
        entity_type="User",
        entity_id=new_user.id,
        details=f"User registered with role {user_in.role.value}"
    )
    db.add(audit)
    db.commit()
    db.refresh(new_user)

    return new_user


@router.post("/login", response_model=Token)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email.lower().strip()).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been suspended or deactivated"
        )

    access_token = create_access_token(subject=user.id)

    audit = AuditLog(
        user_id=user.id,
        action="USER_LOGIN",
        entity_type="User",
        entity_id=user.id,
        details="User logged in successfully"
    )
    db.add(audit)
    db.commit()

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user
    )


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/profile", response_model=UserOut)
def update_profile(
    profile_in: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    details_changes = []

    # Password update
    if profile_in.new_password:
        if not profile_in.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is required to set a new password"
            )
        if not verify_password(profile_in.current_password, current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )
        current_user.hashed_password = hash_password(profile_in.new_password)
        details_changes.append("password changed")

    # Name update
    if profile_in.full_name and profile_in.full_name.strip():
        current_user.full_name = profile_in.full_name.strip()
        details_changes.append("name updated")

    # Student Profile update (department / batch)
    if current_user.student_profile:
        if profile_in.department is not None:
            current_user.student_profile.department = profile_in.department.strip()
            details_changes.append("department updated")
        if profile_in.batch is not None:
            current_user.student_profile.batch = profile_in.batch.strip()
            details_changes.append("batch updated")

    if details_changes:
        audit = AuditLog(
            user_id=current_user.id,
            action="USER_PROFILE_UPDATED",
            entity_type="User",
            entity_id=current_user.id,
            details=f"User {current_user.email} updated profile: {', '.join(details_changes)}"
        )
        db.add(audit)
        db.commit()
        db.refresh(current_user)

    return current_user

