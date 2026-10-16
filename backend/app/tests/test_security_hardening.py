import time
import pytest
from app.models.user import User, UserRole, StudentProfile
from app.models.course import Course, CourseEnrollment
from app.models.session import AttendanceSession
from app.models.device import Device, DeviceStatus
from app.models.attendance import AttendanceRecord, AttendanceStatus
from app.core.security import hash_password, create_access_token
from app.core.crypto import generate_ed25519_keypair, sign_payload_ed25519
from app.core.ble_token import compute_token, get_window_index
from app.core.rate_limit import rate_limiter


@pytest.fixture(autouse=True)
def reset_limiter():
    """Resets rate limiter state before each test."""
    rate_limiter.reset()
    yield
    rate_limiter.reset()


def test_security_response_headers(client):
    """AC-SEC-01: Verifies that standard security headers are set on all responses."""
    res = client.get("/health")
    assert res.status_code == 200
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("X-XSS-Protection") == "1; mode=block"
    assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


def test_rate_limiting_login_throttling(client):
    """AC-SEC-02: Verifies that rapid repeated login attempts trigger HTTP 429 Too Many Requests."""
    rate_limiter.reset()
    # Settings allow 10 login requests per window
    for _ in range(10):
        res = client.post("/api/v1/auth/login", json={
            "email": "nonexistent@university.edu",
            "password": "WrongPassword123!"
        })
        assert res.status_code in (401, 400)

    # 11th request should be throttled
    throttled_res = client.post("/api/v1/auth/login", json={
        "email": "nonexistent@university.edu",
        "password": "WrongPassword123!"
    })
    assert throttled_res.status_code == 429
    assert "Rate limit exceeded" in throttled_res.json()["detail"]
    assert "Retry-After" in throttled_res.headers

    # Resetting restores access
    rate_limiter.reset()
    res_after_reset = client.post("/api/v1/auth/login", json={
        "email": "nonexistent@university.edu",
        "password": "WrongPassword123!"
    })
    assert res_after_reset.status_code != 429


def test_cross_organiser_privilege_escalation_blocked(client, db_session, organiser_user, organiser_headers):
    """
    AC-SEC-03: An organiser must NOT be able to start, stop, enroll students into,
    or view rosters for courses and sessions owned by another organiser.
    """
    # Create second organiser (Attacker Organiser)
    hacker_org = User(
        email="hacker_org@university.edu",
        hashed_password=hash_password("HackerPass123!"),
        full_name="Malicious Organiser",
        role=UserRole.ORGANISER,
        is_active=True
    )
    db_session.add(hacker_org)
    db_session.commit()
    hacker_token = create_access_token(hacker_org.id)
    hacker_headers = {"Authorization": f"Bearer {hacker_token}"}

    # Organiser 1 creates Course and Session
    c1 = Course(
        code="CS801",
        title="Advanced Cryptography",
        description="Owned by legitimate instructor",
        organiser_id=organiser_user.id
    )
    db_session.add(c1)
    db_session.commit()

    s1 = AttendanceSession(
        course_id=c1.id,
        organiser_id=organiser_user.id,
        title="Lecture 1 - Diffie-Hellman",
        location="Room 101",
        duration_minutes=30,
        is_active=False,
        is_closed=False
    )
    db_session.add(s1)
    db_session.commit()

    # 1. Hacker tries to start Organiser 1's session -> 403 Forbidden
    res_start = client.post(f"/api/v1/sessions/{s1.id}/start", headers=hacker_headers)
    assert res_start.status_code == 403
    assert "not authorized to start" in res_start.json()["detail"].lower()

    # Legitimate owner starts the session -> 200 OK
    res_legit_start = client.post(f"/api/v1/sessions/{s1.id}/start", headers=organiser_headers)
    assert res_legit_start.status_code == 200

    # 2. Hacker tries to stop Organiser 1's session -> 403 Forbidden
    res_stop = client.post(f"/api/v1/sessions/{s1.id}/stop", headers=hacker_headers)
    assert res_stop.status_code == 403
    assert "not authorized to stop" in res_stop.json()["detail"].lower()

    # 3. Hacker tries to enroll a student in Organiser 1's course -> 403 Forbidden
    res_enroll = client.post(
        f"/api/v1/courses/{c1.id}/enroll",
        json={"student_id_number": "CS-2024-001"},
        headers=hacker_headers
    )
    assert res_enroll.status_code == 403
    assert "not authorized to enroll" in res_enroll.json()["detail"].lower()

    # 4. Hacker tries to view enrolled students list for Organiser 1's course -> 403 Forbidden
    res_students = client.get(f"/api/v1/courses/{c1.id}/students", headers=hacker_headers)
    assert res_students.status_code == 403
    assert "not authorized to view" in res_students.json()["detail"].lower()

    # 5. Hacker tries to get session attendance roster -> 403 Forbidden
    res_roster = client.get(f"/api/v1/attendance/session/{s1.id}", headers=hacker_headers)
    assert res_roster.status_code == 403

    # 6. Hacker tries to export CSV for Organiser 1's session -> 403 Forbidden
    res_csv = client.get(f"/api/v1/attendance/session/{s1.id}/export-csv", headers=hacker_headers)
    assert res_csv.status_code == 403

    # 7. Hacker tries to get current rotating token -> 403 Forbidden
    res_token = client.get(f"/api/v1/sessions/{s1.id}/current-token", headers=hacker_headers)
    assert res_token.status_code == 403


def test_unenrolled_student_cannot_fetch_session_token(client, db_session, organiser_user, organiser_headers):
    """AC-SEC-04: A student cannot fetch rotating tokens for a course they are not enrolled in."""
    # Create course and session
    c = Course(code="BIO101", title="Genetics", organiser_id=organiser_user.id)
    db_session.add(c)
    db_session.commit()

    s = AttendanceSession(
        course_id=c.id,
        organiser_id=organiser_user.id,
        title="Lab 1",
        duration_minutes=30,
        is_active=False
    )
    db_session.add(s)
    db_session.commit()

    # Start session
    client.post(f"/api/v1/sessions/{s.id}/start", headers=organiser_headers)

    # Create unenrolled student
    unenrolled_student = User(
        email="unenrolled@university.edu",
        hashed_password=hash_password("Pass123!"),
        full_name="Unenrolled Student",
        role=UserRole.STUDENT,
        is_active=True
    )
    db_session.add(unenrolled_student)
    db_session.flush()
    profile = StudentProfile(user_id=unenrolled_student.id, student_id_number="BIO-999")
    db_session.add(profile)
    db_session.commit()

    token = create_access_token(unenrolled_student.id)
    student_headers = {"Authorization": f"Bearer {token}"}

    # Attempt to fetch token without enrollment -> 403 Forbidden
    res = client.get(f"/api/v1/sessions/{s.id}/current-token", headers=student_headers)
    assert res.status_code == 403
    assert "not enrolled" in res.json()["detail"].lower()


def test_nonce_replay_attack_rejected(client, db_session, student_fixture, organiser_headers):
    """AC-SEC-05: Submitting an already consumed nonce must be rejected as a replay attack."""
    student_user = student_fixture["user"]
    profile = student_fixture["profile"]
    device = student_fixture["device"]
    priv_hex = student_fixture["private_key_hex"]
    pub_hex = student_fixture["public_key_hex"]

    # Create active session
    c = Course(code="SEC201", title="Security", organiser_id=1)
    db_session.add(c)
    db_session.commit()

    enrollment = CourseEnrollment(course_id=c.id, student_profile_id=profile.id, is_active=True)
    db_session.add(enrollment)
    db_session.commit()

    session_obj = AttendanceSession(
        course_id=c.id,
        organiser_id=1,
        title="Session Replay Test",
        duration_minutes=30,
        is_active=True,
        is_closed=False
    )
    db_session.add(session_obj)
    db_session.commit()

    now_ts = int(time.time())
    w = get_window_index(now_ts, session_obj.token_rotation_seconds)
    token_val = compute_token(session_obj.session_secret, session_obj.id, w)
    test_nonce = "replay-nonce-xyz-12345"
    rssi = -70

    msg = f"{student_user.id}:{session_obj.id}:{token_val}:{now_ts}:{test_nonce}:{rssi}"
    sig = sign_payload_ed25519(priv_hex, msg)

    token = create_access_token(student_user.id)
    headers = {"Authorization": f"Bearer {token}"}

    # First submission succeeds
    res1 = client.post("/api/v1/attendance/submit", json={
        "session_id": session_obj.id,
        "token": token_val,
        "rssi": rssi,
        "timestamp": now_ts,
        "nonce": test_nonce,
        "device_identifier": device.device_identifier,
        "signature": sig
    }, headers=headers)
    assert res1.status_code == 201

    # Second submission with the SAME nonce to a different session
    session_obj_2 = AttendanceSession(
        course_id=c.id,
        organiser_id=1,
        title="Session Replay Test 2",
        duration_minutes=30,
        is_active=True,
        is_closed=False
    )
    db_session.add(session_obj_2)
    db_session.commit()

    token_val_2 = compute_token(session_obj_2.session_secret, session_obj_2.id, w)
    msg_2 = f"{student_user.id}:{session_obj_2.id}:{token_val_2}:{now_ts}:{test_nonce}:{rssi}"
    sig_2 = sign_payload_ed25519(priv_hex, msg_2)

    res2 = client.post("/api/v1/attendance/submit", json={
        "session_id": session_obj_2.id,
        "token": token_val_2,
        "rssi": rssi,
        "timestamp": now_ts,
        "nonce": test_nonce,
        "device_identifier": device.device_identifier,
        "signature": sig_2
    }, headers=headers)
    assert res2.status_code == 400
    assert "Nonce has already been consumed" in res2.json()["detail"]


def test_revoked_device_cannot_check_in(client, db_session, student_fixture, admin_headers):
    """AC-SEC-06: A device revoked by administrator must immediately be barred from checking in."""
    student_user = student_fixture["user"]
    profile = student_fixture["profile"]
    device = student_fixture["device"]
    priv_hex = student_fixture["private_key_hex"]
    pub_hex = student_fixture["public_key_hex"]

    # Admin revokes the device
    res_revoke = client.post(f"/api/v1/admin/devices/{device.id}/revoke", headers=admin_headers)
    assert res_revoke.status_code == 200
    assert res_revoke.json()["status"] == "REVOKED"

    # Create active session
    c = Course(code="REV101", title="Device Revoke Test", organiser_id=1)
    db_session.add(c)
    db_session.commit()
    enrollment = CourseEnrollment(course_id=c.id, student_profile_id=profile.id, is_active=True)
    db_session.add(enrollment)

    s = AttendanceSession(
        course_id=c.id,
        organiser_id=1,
        title="Revoked Device Session",
        duration_minutes=30,
        is_active=True,
        is_closed=False
    )
    db_session.add(s)
    db_session.commit()

    now_ts = int(time.time())
    w = get_window_index(now_ts, s.token_rotation_seconds)
    token_val = compute_token(s.session_secret, s.id, w)
    nonce = f"revoked-test-{now_ts}"
    rssi = -70
    msg = f"{student_user.id}:{s.id}:{token_val}:{now_ts}:{nonce}:{rssi}"
    sig = sign_payload_ed25519(priv_hex, msg)

    token = create_access_token(student_user.id)
    headers = {"Authorization": f"Bearer {token}"}

    # Student attempts check-in -> 403 Forbidden (No approved device registered)
    res_submit = client.post("/api/v1/attendance/submit", json={
        "session_id": s.id,
        "token": token_val,
        "rssi": rssi,
        "timestamp": now_ts,
        "nonce": nonce,
        "device_identifier": device.device_identifier,
        "signature": sig
    }, headers=headers)
    assert res_submit.status_code == 403
    assert "No approved device registered" in res_submit.json()["detail"]


def test_csv_formula_injection_defense(client, db_session, organiser_user, organiser_headers):
    """
    AC-SEC-07: CSV export must neutralize formula injection characters
    (=, +, -, @, \\t, \\r, |, %) by prepending a single quote.
    """
    course = Course(code="CSV999", title="CSV Security", organiser_id=organiser_user.id)
    db_session.add(course)
    db_session.commit()

    session_obj = AttendanceSession(
        course_id=course.id,
        organiser_id=organiser_user.id,
        title="Formula Injection Demo",
        duration_minutes=30,
        is_active=True
    )
    db_session.add(session_obj)
    db_session.commit()

    # Create students with formula injection payloads in their profile / name
    hacker1 = User(
        email="formula1@university.edu",
        hashed_password=hash_password("Pass123!"),
        full_name="=cmd|'/C calc'!A0",
        role=UserRole.STUDENT,
        is_active=True
    )
    hacker2 = User(
        email="+malicious@university.edu",
        hashed_password=hash_password("Pass123!"),
        full_name="@SUM(1+1)*cmd",
        role=UserRole.STUDENT,
        is_active=True
    )
    db_session.add_all([hacker1, hacker2])
    db_session.flush()

    p1 = StudentProfile(user_id=hacker1.id, student_id_number="-MALICIOUS-01")
    p2 = StudentProfile(user_id=hacker2.id, student_id_number="|PIPE-EXPLOIT")
    db_session.add_all([p1, p2])
    db_session.commit()

    # Add attendance records with injection payloads in reason
    r1 = AttendanceRecord(
        session_id=session_obj.id,
        student_id=hacker1.id,
        status=AttendanceStatus.PRESENT,
        override_reason="=1+1",
        manual_override=True
    )
    r2 = AttendanceRecord(
        session_id=session_obj.id,
        student_id=hacker2.id,
        status=AttendanceStatus.PRESENT,
        override_reason="%EXCEL_VULN%",
        manual_override=True
    )
    db_session.add_all([r1, r2])
    db_session.commit()

    # Export CSV
    res_csv = client.get(f"/api/v1/attendance/session/{session_obj.id}/export-csv", headers=organiser_headers)
    assert res_csv.status_code == 200
    csv_text = res_csv.text

    # Verify formula injection characters are escaped with leading single quote
    assert "'=cmd|'/C calc'!A0" in csv_text
    assert "'@SUM(1+1)*cmd" in csv_text
    assert "'-MALICIOUS-01" in csv_text
    assert "'|PIPE-EXPLOIT" in csv_text
    assert "'+malicious@university.edu" in csv_text
    assert "'=1+1" in csv_text
    assert "'%EXCEL_VULN%" in csv_text
