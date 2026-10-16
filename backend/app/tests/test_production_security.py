import pytest
from unittest.mock import patch
from pydantic import ValidationError
from fastapi.testclient import TestClient

from app.config import Settings, DEFAULT_DEV_SECRET
from app.main import app, seed_initial_data
from app.models.user import User, UserRole
from app.models.course import Course, CourseEnrollment
from app.models.session import AttendanceSession
from app.core.security import create_access_token


def test_production_settings_rejects_default_secret_key():
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            ENVIRONMENT="production",
            DEBUG=False,
            DATABASE_URL="postgresql://user:pass@ep-pooler.us-east-1.aws.neon.tech/db?sslmode=require",
            SECRET_KEY=DEFAULT_DEV_SECRET
        )
    assert "SECRET_KEY must be explicitly provided" in str(exc_info.value)


def test_production_settings_rejects_debug_true():
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            ENVIRONMENT="production",
            DEBUG=True,
            DATABASE_URL="postgresql://user:pass@ep-pooler.us-east-1.aws.neon.tech/db?sslmode=require",
            SECRET_KEY="a" * 64
        )
    assert "DEBUG must be set to False in production" in str(exc_info.value)


def test_production_settings_rejects_sqlite_database():
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            ENVIRONMENT="production",
            DEBUG=False,
            DATABASE_URL="sqlite:///./proxyproof.db",
            SECRET_KEY="a" * 64
        )
    assert "DATABASE_URL must point to a persistent PostgreSQL database" in str(exc_info.value)


def test_production_settings_accepts_valid_production_config():
    s = Settings(
        ENVIRONMENT="production",
        DEBUG=False,
        DATABASE_URL="postgresql://user:pass@ep-pooler.us-east-1.aws.neon.tech/db?sslmode=require",
        SECRET_KEY="b" * 64
    )
    assert s.ENVIRONMENT == "production"
    assert s.DEBUG is False
    assert s.SEED_DEMO_DATA is False
    assert s.AUTO_CREATE_TABLES is False


def test_health_check_verifies_real_database_connectivity(client: TestClient):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"
    assert "version" in data


def test_demo_seeding_disabled_in_production(db_session):
    # Simulate production settings where SEED_DEMO_DATA is False
    with patch("app.main.settings.SEED_DEMO_DATA", False):
        # Clear demo user if present in test DB
        demo_admin = db_session.query(User).filter(User.email == "demo_unseeded@proxyproof.edu").first()
        assert demo_admin is None
        seed_initial_data(db_session)
        # Should NOT seed demo accounts
        check = db_session.query(User).filter(User.email == "demo_unseeded@proxyproof.edu").first()
        assert check is None


def test_websocket_rejects_unauthenticated_connection(client: TestClient):
    # Missing token query parameter must be closed with WS 1008 policy violation
    with pytest.raises(Exception):
        with client.websocket_connect("/api/v1/ws/sessions/1") as ws:
            pass


def test_websocket_rejects_invalid_token(client: TestClient):
    with pytest.raises(Exception):
        with client.websocket_connect("/api/v1/ws/sessions/1?token=invalid.jwt.token") as ws:
            pass


def test_websocket_rejects_unauthorized_organiser(client: TestClient, db_session):
    # Create organiser A and organiser B
    org_a = User(email="org_a@uni.edu", hashed_password="pw", full_name="Org A", role=UserRole.ORGANISER, is_active=True)
    org_b = User(email="org_b@uni.edu", hashed_password="pw", full_name="Org B", role=UserRole.ORGANISER, is_active=True)
    db_session.add_all([org_a, org_b])
    db_session.commit()

    course = Course(code="SEC101", title="Security", organiser_id=org_a.id)
    db_session.add(course)
    db_session.commit()

    session = AttendanceSession(course_id=course.id, organiser_id=org_a.id, title="Lecture 1", is_active=True)
    db_session.add(session)
    db_session.commit()

    # Generate token for Org B who does NOT own this session
    token_b = create_access_token(org_b.email)

    # Attempting to connect to Org A's session with Org B's token must be rejected
    with pytest.raises(Exception):
        with client.websocket_connect(f"/api/v1/ws/sessions/{session.id}?token={token_b}") as ws:
            pass
