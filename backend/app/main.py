from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, status, Request, Depends, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.rate_limit import RateLimitMiddleware

from app.config import settings
from app.database import engine, Base, SessionLocal, get_db
from app.models.user import User, StudentProfile, UserRole
from app.models.course import Course, CourseEnrollment
from app.models.device import Device, DeviceStatus
from app.models.session import AttendanceSession
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
    """
    Seeds default development demo accounts or administrative bootstrap.
    In production, demo accounts are strictly disabled unless explicitly enabled.
    """
    # Safe production administrative bootstrap (optional via env variables)
    if settings.INITIAL_ADMIN_EMAIL and settings.INITIAL_ADMIN_PASSWORD:
        existing_admin = db.query(User).filter(User.email == settings.INITIAL_ADMIN_EMAIL).first()
        if not existing_admin:
            new_admin = User(
                email=settings.INITIAL_ADMIN_EMAIL,
                hashed_password=hash_password(settings.INITIAL_ADMIN_PASSWORD),
                full_name="Production Administrator",
                role=UserRole.ADMIN,
                is_active=True,
            )
            db.add(new_admin)
            db.commit()
            logger.info(f"Bootstrapped initial production admin account: {settings.INITIAL_ADMIN_EMAIL}")

    if not settings.SEED_DEMO_DATA:
        logger.info("SEED_DEMO_DATA is False. Skipping demo accounts.")
        return

    # 1. Admin Demo
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

    # 2. Organiser / Professor Demo
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

    # 3. Student Demo
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
    # Startup: create tables only if configured (e.g. dev mode)
    if settings.AUTO_CREATE_TABLES:
        logger.info("Auto-creating database tables (development mode)...")
        Base.metadata.create_all(bind=engine)
    else:
        logger.info("Schema management deferred to Alembic migrations ('alembic upgrade head').")
    
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
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# Generic Exception Handler (Suppresses Internal Diagnostic Leaks in Production)
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error processing {request.method} {request.url.path}: {exc}", exc_info=True)
    if settings.ENVIRONMENT == "production":
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "An internal server error occurred. Please contact the system administrator."}
        )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": str(exc)}
    )

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# Rate Limiting Middleware
app.add_middleware(RateLimitMiddleware)


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
def health_check(db: Session = Depends(get_db)):
    """Verifies actual database connectivity and returns system operational status."""
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"status": "degraded", "database": "disconnected", "error": "Database connectivity check failed"}
        )

    return {
        "status": "healthy",
        "service": "ProxyProof Backend API",
        "version": "1.0.0",
        "database": db_status,
        "environment": settings.ENVIRONMENT,
        "ble_service_uuid": settings.BLE_SERVICE_UUID,
        "token_rotation_seconds": settings.BLE_TOKEN_ROTATION_SECONDS,
        "min_rssi": settings.DEFAULT_MIN_RSSI
    }


# Live WebSocket Endpoint for Attendance Sessions with Strict Auth & RBAC
@app.websocket("/api/v1/ws/sessions/{session_id}")
async def session_websocket_endpoint(
    websocket: WebSocket,
    session_id: int,
    token: str = Query(None)
):
    # 1. Require Authentication Token
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication token required")
        return

    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or expired authentication token")
        return

    user_email = payload.get("sub")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == user_email).first()
        if not user or not user.is_active:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="User account inactive or not found")
            return

        session = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
        if not session:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Session not found")
            return

        # 2. Enforce Role & Session Authorization
        authorized = False
        if user.role == UserRole.ADMIN:
            authorized = True
        elif user.role == UserRole.ORGANISER:
            authorized = (session.organiser_id == user.id)
        elif user.role == UserRole.STUDENT and user.student_profile:
            enrollment = db.query(CourseEnrollment).filter(
                CourseEnrollment.course_id == session.course_id,
                CourseEnrollment.student_profile_id == user.student_profile.id,
                CourseEnrollment.is_active == True
            ).first()
            authorized = (enrollment is not None)

        if not authorized:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized session observation")
            return
    finally:
        db.close()

    # 3. Connection Permitted
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
