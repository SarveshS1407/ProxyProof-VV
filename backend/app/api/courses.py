from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole, StudentProfile
from app.models.course import Course, CourseEnrollment
from app.models.audit import AuditLog
from app.schemas.course import CourseCreate, CourseOut, CourseEnrollRequest
from app.core.deps import get_current_user, get_current_organiser

router = APIRouter(prefix="/courses", tags=["Courses"])


@router.post("/", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(
    course_in: CourseCreate,
    current_user: User = Depends(get_current_organiser),
    db: Session = Depends(get_db)
):
    existing = db.query(Course).filter(Course.code == course_in.code.upper().strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Course with code {course_in.code} already exists"
        )

    course = Course(
        code=course_in.code.upper().strip(),
        title=course_in.title.strip(),
        description=course_in.description,
        organiser_id=current_user.id
    )
    db.add(course)
    db.flush()

    audit = AuditLog(
        user_id=current_user.id,
        action="COURSE_CREATED",
        entity_type="Course",
        entity_id=course.id,
        details=f"Course {course.code} created by {current_user.email}"
    )
    db.add(audit)
    db.commit()
    db.refresh(course)

    return CourseOut(
        id=course.id,
        code=course.code,
        title=course.title,
        description=course.description,
        organiser_id=course.organiser_id,
        created_at=course.created_at,
        enrolled_count=0
    )


@router.get("/", response_model=List[CourseOut])
def list_courses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Course)
    if current_user.role == UserRole.ORGANISER:
        query = query.filter(Course.organiser_id == current_user.id)
    elif current_user.role == UserRole.STUDENT:
        # Show all courses or courses the student is enrolled in
        pass

    courses = query.order_by(Course.created_at.desc()).all()
    results = []
    for c in courses:
        count = db.query(CourseEnrollment).filter(
            CourseEnrollment.course_id == c.id,
            CourseEnrollment.is_active == True
        ).count()
        results.append(CourseOut(
            id=c.id,
            code=c.code,
            title=c.title,
            description=c.description,
            organiser_id=c.organiser_id,
            created_at=c.created_at,
            enrolled_count=count
        ))
    return results


@router.get("/{course_id}", response_model=CourseOut)
def get_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    c = db.query(Course).filter(Course.id == course_id).first()
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    count = db.query(CourseEnrollment).filter(
        CourseEnrollment.course_id == c.id,
        CourseEnrollment.is_active == True
    ).count()

    return CourseOut(
        id=c.id,
        code=c.code,
        title=c.title,
        description=c.description,
        organiser_id=c.organiser_id,
        created_at=c.created_at,
        enrolled_count=count
    )


@router.post("/{course_id}/enroll", status_code=status.HTTP_200_OK)
def enroll_student(
    course_id: int,
    req: CourseEnrollRequest,
    current_user: User = Depends(get_current_organiser),
    db: Session = Depends(get_db)
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    profile = db.query(StudentProfile).filter(
        StudentProfile.student_id_number == req.student_id_number.strip()
    ).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Student profile with ID '{req.student_id_number}' not found"
        )

    existing = db.query(CourseEnrollment).filter(
        CourseEnrollment.course_id == course_id,
        CourseEnrollment.student_profile_id == profile.id
    ).first()

    if existing:
        if not existing.is_active:
            existing.is_active = True
            db.commit()
            return {"message": "Student re-enrolled successfully"}
        return {"message": "Student is already enrolled in this course"}

    enrollment = CourseEnrollment(
        course_id=course_id,
        student_profile_id=profile.id,
        is_active=True
    )
    db.add(enrollment)
    db.commit()

    return {"message": f"Student {profile.student_id_number} successfully enrolled in {course.code}"}


@router.get("/{course_id}/students")
def list_enrolled_students(
    course_id: int,
    current_user: User = Depends(get_current_organiser),
    db: Session = Depends(get_db)
):
    enrollments = db.query(CourseEnrollment).filter(
        CourseEnrollment.course_id == course_id,
        CourseEnrollment.is_active == True
    ).all()

    students = []
    for e in enrollments:
        p = e.student_profile
        u = p.user
        students.append({
            "student_id": u.id,
            "student_id_number": p.student_id_number,
            "full_name": u.full_name,
            "email": u.email,
            "department": p.department,
            "batch": p.batch,
            "enrolled_at": e.enrolled_at
        })
    return students
