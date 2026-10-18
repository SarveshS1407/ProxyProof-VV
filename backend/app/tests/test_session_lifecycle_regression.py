import pytest
from app.models.user import User, UserRole
from app.core.security import hash_password, create_access_token


def test_session_creation_list_and_start_lifecycle(client, organiser_headers, enrolled_course_fixture):
    """
    Regression Test:
    Verifies that an organiser can create a session, that the created session appears
    in the session list with its real backend ID, and that the organiser can start the
    session using that exact persistent ID.
    """
    course_id = enrolled_course_fixture.id

    # 1. Create a session
    create_res = client.post("/api/v1/sessions/", headers=organiser_headers, json={
        "course_id": course_id,
        "title": "Lecture 12: Distributed Networks",
        "location": "Auditorium A",
        "duration_minutes": 60,
        "token_rotation_seconds": 10,
        "min_rssi": -85
    })
    assert create_res.status_code == 201, f"Expected 201 Created, got {create_res.status_code}: {create_res.text}"
    session_data = create_res.json()
    assert "id" in session_data
    session_id = session_data["id"]
    assert isinstance(session_id, int)
    assert session_data["title"] == "Lecture 12: Distributed Networks"
    assert session_data["is_active"] is False
    assert session_data["is_closed"] is False

    # 2. Verify the session appears in the session list with the exact same ID
    list_res = client.get("/api/v1/sessions/", headers=organiser_headers)
    assert list_res.status_code == 200
    sessions_list = list_res.json()
    matched = [s for s in sessions_list if s["id"] == session_id]
    assert len(matched) == 1, f"Expected session {session_id} in sessions list, found: {sessions_list}"
    assert matched[0]["title"] == "Lecture 12: Distributed Networks"

    # 3. Start the session using that exact persistent session ID
    start_res = client.post(f"/api/v1/sessions/{session_id}/start", headers=organiser_headers)
    assert start_res.status_code == 200, f"Expected 200 OK from start, got {start_res.status_code}: {start_res.text}"
    start_data = start_res.json()
    assert start_data["message"] == "Session started successfully"
    assert start_data["session_id"] == session_id
    assert "token_info" in start_data
    assert "token_value" in start_data["token_info"]
    assert len(start_data["token_info"]["token_value"]) > 0

    # 4. Verify session detail shows active state
    detail_res = client.get(f"/api/v1/sessions/{session_id}", headers=organiser_headers)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["id"] == session_id
    assert detail["is_active"] is True
    assert detail["start_time"] is not None
    assert detail["end_time"] is not None

    # 5. Idempotent start on active session
    restart_res = client.post(f"/api/v1/sessions/{session_id}/start", headers=organiser_headers)
    assert restart_res.status_code == 200
    assert restart_res.json()["message"] == "Session is already active"


def test_start_session_non_existent_id_returns_404(client, organiser_headers):
    """
    Verifies that attempting to start a non-existent session ID cleanly returns HTTP 404
    with detail 'Session not found'.
    """
    non_existent_id = 999999
    res = client.post(f"/api/v1/sessions/{non_existent_id}/start", headers=organiser_headers)
    assert res.status_code == 404
    assert res.json()["detail"] == "Session not found"


def test_unauthorized_organiser_cannot_start_session(client, db_session, enrolled_course_fixture, organiser_headers):
    """
    Verifies that an organiser cannot start another organiser's session.
    """
    course_id = enrolled_course_fixture.id

    # Create session as primary organiser
    create_res = client.post("/api/v1/sessions/", headers=organiser_headers, json={
        "course_id": course_id,
        "title": "Private Research Seminar",
        "location": "Lab 4",
        "duration_minutes": 30
    })
    assert create_res.status_code == 201
    session_id = create_res.json()["id"]

    # Create a secondary organiser
    other_user = User(
        email="other_prof@university.edu",
        hashed_password=hash_password("OtherProfPass123!"),
        full_name="Prof. Other",
        role=UserRole.ORGANISER,
        is_active=True
    )
    db_session.add(other_user)
    db_session.commit()
    db_session.refresh(other_user)

    other_token = create_access_token(other_user.id)
    other_headers = {"Authorization": f"Bearer {other_token}"}

    # Attempt to start primary organiser's session
    forbidden_res = client.post(f"/api/v1/sessions/{session_id}/start", headers=other_headers)
    assert forbidden_res.status_code == 403
    assert "not authorized" in forbidden_res.json()["detail"]


def test_delete_session_lifecycle_and_authorization(client, db_session, enrolled_course_fixture, organiser_headers):
    """
    Verifies that an organiser can delete their own session,
    that another organiser cannot delete it, and that non-existent returns 404.
    """
    course_id = enrolled_course_fixture.id

    # Create session
    create_res = client.post("/api/v1/sessions/", headers=organiser_headers, json={
        "course_id": course_id,
        "title": "Session to be deleted",
        "location": "Room 101",
        "duration_minutes": 45
    })
    assert create_res.status_code == 201
    session_id = create_res.json()["id"]

    # Other organiser
    other_user = User(
        email="delete_checker@university.edu",
        hashed_password=hash_password("Pass123!"),
        full_name="Prof. Delete Checker",
        role=UserRole.ORGANISER,
        is_active=True
    )
    db_session.add(other_user)
    db_session.commit()
    db_session.refresh(other_user)
    other_headers = {"Authorization": f"Bearer {create_access_token(other_user.id)}"}

    # Unauthorized delete attempt -> 403
    forbidden_del = client.delete(f"/api/v1/sessions/{session_id}", headers=other_headers)
    assert forbidden_del.status_code == 403

    # Authorized delete -> 200
    del_res = client.delete(f"/api/v1/sessions/{session_id}", headers=organiser_headers)
    assert del_res.status_code == 200
    assert "deleted successfully" in del_res.json()["message"]

    # Subsequent GET -> 404
    get_res = client.get(f"/api/v1/sessions/{session_id}", headers=organiser_headers)
    assert get_res.status_code == 404

    # Subsequent DELETE on deleted session -> 404
    del_again = client.delete(f"/api/v1/sessions/{session_id}", headers=organiser_headers)
    assert del_again.status_code == 404


def test_delete_course_lifecycle_and_authorization(client, db_session, organiser_headers):
    """
    Verifies that an organiser can create and delete their course,
    and unauthorized deletion is rejected with 403.
    """
    # Create course
    create_res = client.post("/api/v1/courses/", headers=organiser_headers, json={
        "code": "CS-DEL-99",
        "title": "Temporary Deletable Course",
        "description": "Will be deleted"
    })
    assert create_res.status_code == 201
    course_id = create_res.json()["id"]

    # Other organiser
    other_user = User(
        email="course_checker@university.edu",
        hashed_password=hash_password("Pass123!"),
        full_name="Prof. Course Checker",
        role=UserRole.ORGANISER,
        is_active=True
    )
    db_session.add(other_user)
    db_session.commit()
    other_headers = {"Authorization": f"Bearer {create_access_token(other_user.id)}"}

    # Unauthorized delete -> 403
    forbidden_del = client.delete(f"/api/v1/courses/{course_id}", headers=other_headers)
    assert forbidden_del.status_code == 403

    # Authorized delete -> 200
    del_res = client.delete(f"/api/v1/courses/{course_id}", headers=organiser_headers)
    assert del_res.status_code == 200
    assert "deleted successfully" in del_res.json()["message"]


def test_dynamic_session_expiration_in_list_sessions(client, db_session, enrolled_course_fixture, organiser_headers):
    """
    Verifies that list_sessions dynamically detects when an active session has passed
    its end_time and updates is_active=False, is_closed=True.
    """
    from datetime import datetime, timezone, timedelta
    from app.models.session import AttendanceSession

    course_id = enrolled_course_fixture.id
    past_start = datetime.now(timezone.utc) - timedelta(minutes=70)
    past_end = datetime.now(timezone.utc) - timedelta(minutes=10)

    # Manually insert session that was active but is now expired
    session = AttendanceSession(
        course_id=course_id,
        organiser_id=enrolled_course_fixture.organiser_id,
        title="Expired Test Session",
        location="Room 5",
        start_time=past_start,
        end_time=past_end,
        is_active=True,
        is_closed=False
    )
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    sess_id = session.id

    # Call list_sessions
    list_res = client.get("/api/v1/sessions/", headers=organiser_headers)
    assert list_res.status_code == 200
    sessions = list_res.json()
    matched = [s for s in sessions if s["id"] == sess_id]
    assert len(matched) == 1
    assert matched[0]["is_active"] is False
    assert matched[0]["is_closed"] is True

    # Check database state directly
    db_session.expire_all()
    reloaded = db_session.query(AttendanceSession).filter_by(id=sess_id).first()
    assert reloaded.is_active is False
    assert reloaded.is_closed is True


def test_admin_self_registration_is_forbidden(client):
    """
    Verifies that public self-registration with role='admin' returns HTTP 403 Forbidden.
    """
    res = client.post("/api/v1/auth/register", json={
        "email": "hacker_admin@university.edu",
        "password": "Password123!",
        "full_name": "Hacker Admin",
        "role": "admin"
    })
    assert res.status_code == 403
    assert "Public administrator self-registration is disabled" in res.json()["detail"]

