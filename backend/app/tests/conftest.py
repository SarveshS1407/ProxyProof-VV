import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.user import User, StudentProfile, UserRole
from app.models.device import Device, DeviceStatus
from app.models.course import Course, CourseEnrollment
from app.core.security import hash_password, create_access_token
from app.core.crypto import generate_ed25519_keypair

# In-memory SQLite database for isolated test execution
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def admin_user(db_session):
    admin = User(
        email="test_admin@proxyproof.edu",
        hashed_password=hash_password("AdminPass123!"),
        full_name="Test Admin",
        role=UserRole.ADMIN,
        is_active=True,
    )
    db_session.add(admin)
    db_session.commit()
    db_session.refresh(admin)
    return admin


@pytest.fixture
def admin_headers(admin_user):
    token = create_access_token(admin_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def organiser_user(db_session):
    organiser = User(
        email="test_organiser@proxyproof.edu",
        hashed_password=hash_password("ProfPass123!"),
        full_name="Prof. Test Organiser",
        role=UserRole.ORGANISER,
        is_active=True,
    )
    db_session.add(organiser)
    db_session.commit()
    db_session.refresh(organiser)
    return organiser


@pytest.fixture
def organiser_headers(organiser_user):
    token = create_access_token(organiser_user.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def student_fixture(db_session):
    priv_hex, pub_hex = generate_ed25519_keypair()
    student = User(
        email="test_student@proxyproof.edu",
        hashed_password=hash_password("StudentPass123!"),
        full_name="Alice In Wonderland",
        role=UserRole.STUDENT,
        is_active=True,
    )
    db_session.add(student)
    db_session.flush()

    profile = StudentProfile(
        user_id=student.id,
        student_id_number="STU-TEST-001",
        department="Computer Science",
        batch="2024",
    )
    db_session.add(profile)
    db_session.flush()

    device = Device(
        student_profile_id=profile.id,
        device_identifier="device-uuid-test-1234",
        public_key=pub_hex,
        device_model="Test Phone",
        os_version="Android 14",
        status=DeviceStatus.APPROVED,
    )
    db_session.add(device)
    db_session.commit()
    db_session.refresh(student)

    return {
        "user": student,
        "profile": profile,
        "device": device,
        "private_key_hex": priv_hex,
        "public_key_hex": pub_hex,
    }


@pytest.fixture
def student_headers(student_fixture):
    token = create_access_token(student_fixture["user"].id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def enrolled_course_fixture(db_session, organiser_user, student_fixture):
    course = Course(
        code="CS500",
        title="Advanced Distributed Protocols",
        description="Course testing distributed systems.",
        organiser_id=organiser_user.id,
    )
    db_session.add(course)
    db_session.flush()

    enrollment = CourseEnrollment(
        course_id=course.id,
        student_profile_id=student_fixture["profile"].id,
        is_active=True,
    )
    db_session.add(enrollment)
    db_session.commit()
    db_session.refresh(course)
    return course
