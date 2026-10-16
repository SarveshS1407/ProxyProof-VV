from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.models.user import User, StudentProfile, UserRole
from app.models.course import Course, CourseEnrollment
from app.models.device import Device, DeviceStatus
from app.core.security import hash_password, decode_access_token
from app.core.websocket import manager
from app.core.crypto import generate_ed25519_keypair

# Routers
from app.api.auth import router as auth_router
from app.api.devices import router as devices_router
from app.api.courses import router as courses_router
from app.api.sessions import router as sessions_router
from app.api.attendance import router as attendance_router
from app.api.admin import router as admin_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("proxyproof")


def seed_initial_data(db: Session):
    """Seeds default demo accounts if not already present."""
    # 1. Admin
    admin = db.query(User).filter(User.email == "admin@proxyproof.edu").first()
    if not admin:
        admin = User(
            email="admin@proxyproof.edu",
            hashed_password=hash_password("AdminPass123!"),
            full_name="System Administrator",
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(admin)
        db.flush()
        logger.info("Seeded default admin: admin@proxyproof.edu")

    # 2. Organiser / Professor
    organiser = db.query(User).filter(User.email == "prof@university.edu").first()
    if not organiser:
        organiser = User(
            email="prof@university.edu",
            hashed_password=hash_password("ProfPass123!"),
            full_name="Prof. Alan Turing",
            role=UserRole.ORGANISER,
            is_active=True,
        )
        db.add(organiser)
        db.flush()
        logger.info("Seeded default organiser: prof@university.edu")

    # 3. Student
    student = db.query(User).filter(User.email == "student@university.edu").first()
    if not student:
        student = User(
            email="student@university.edu",
            hashed_password=hash_password("StudentPass123!"),
            full_name="Alice Smith",
            role=UserRole.STUDENT,
            is_active=True,
        )
        db.add(student)
        db.flush()

        profile = StudentProfile(
            user_id=student.id,
            student_id_number="CS-2024-001",
            department="Computer Science",
            batch="2024-2028",
        )
        db.add(profile)
        db.flush()

        # Seed sample approved device with valid Ed25519 keypair for testing
        priv_hex, pub_hex = generate_ed25519_keypair()
        device = Device(
            student_profile_id=profile.id,
            device_identifier="pixel8-alice-demo-id",
            public_key=pub_hex,
            device_model="Google Pixel 8",
            os_version="Android 14",
            status=DeviceStatus.APPROVED,
        )
        db.add(device)
        logger.info(f"Seeded default student: student@university.edu (Key: {pub_hex[:12]}...)")

    # 4. Sample Course & Enrollment
    course = db.query(Course).filter(Course.code == "CS301").first()
    if not course and organiser and student:
        course = Course(
            code="CS301",
            title="Distributed Systems & Networks",
            description="Fundamental principles of distributed consensus, fault-tolerance, and wireless sensor networking.",
            organiser_id=organiser.id,
        )
        db.add(course)
        db.flush()

        # Enroll Alice
        profile = student.student_profile
        enrollment = CourseEnrollment(
            course_id=course.id,
            student_profile_id=profile.id,
            is_active=True,
        )
        db.add(enrollment)
        logger.info("Seeded default course CS301 and enrolled Alice")

    db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()
    
    yield
    # Shutdown
    logger.info("Shutting down ProxyProof application...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Mobile-First Bluetooth Low Energy Attendance System with Anti-Proxy Replay Protection and Cryptographic Verification",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API v1 Routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(devices_router, prefix="/api/v1")
app.include_router(courses_router, prefix="/api/v1")
app.include_router(sessions_router, prefix="/api/v1")
app.include_router(attendance_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
@app.get("/api/v1/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": "ProxyProof Backend API",
        "version": "1.0.0",
        "database": "connected",
        "ble_service_uuid": settings.BLE_SERVICE_UUID,
        "token_rotation_seconds": settings.BLE_TOKEN_ROTATION_SECONDS,
        "min_rssi": settings.DEFAULT_MIN_RSSI
    }


# Live WebSocket Endpoint for Attendance Sessions
@app.websocket("/api/v1/ws/sessions/{session_id}")
async def session_websocket_endpoint(
    websocket: WebSocket,
    session_id: int,
    token: str = Query(None)
):
    # Authenticate via query param token or allow open observation for registered dashboard
    authenticated_user_id = None
    if token:
        payload = decode_access_token(token)
        if payload:
            authenticated_user_id = payload.get("sub")

    await manager.connect(session_id, websocket)
    try:
        # Send initial confirmation message
        await websocket.send_json({
            "event": "WS_CONNECTED",
            "session_id": session_id,
            "message": "Connected to ProxyProof live attendance stream"
        })
        while True:
            # Keep-alive loop and listen for client events (e.g. ping)
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)
    except Exception as e:
        logger.warning(f"WebSocket connection error: {e}")
        manager.disconnect(session_id, websocket)
