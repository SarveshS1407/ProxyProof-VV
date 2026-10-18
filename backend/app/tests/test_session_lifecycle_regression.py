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
