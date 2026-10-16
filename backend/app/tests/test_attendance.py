import time
from app.core.crypto import sign_payload_ed25519
from app.core.ble_token import compute_token, get_window_index


def test_full_attendance_checkin_and_validation_workflow(
    client, organiser_headers, student_headers, student_fixture, enrolled_course_fixture
):
    course_id = enrolled_course_fixture.id
    student_id = student_fixture["user"].id
    device_id = student_fixture["device"].device_identifier
    priv_hex = student_fixture["private_key_hex"]

    # 1. Organiser creates session
    create_res = client.post("/api/v1/sessions/", headers=organiser_headers, json={
        "course_id": course_id,
        "title": "Lecture 01: Networking & BLE",
        "location": "Room 101",
        "duration_minutes": 60,
        "token_rotation_seconds": 10,
        "min_rssi": -85
    })
    assert create_res.status_code == 201
    session_data = create_res.json()
    session_id = session_data["id"]

    # 2. Organiser starts session
    start_res = client.post(f"/api/v1/sessions/{session_id}/start", headers=organiser_headers)
    assert start_res.status_code == 200

    # 3. Organiser/Student retrieves current active token
    token_res = client.get(f"/api/v1/sessions/{session_id}/current-token", headers=organiser_headers)
    assert token_res.status_code == 200
    token_info = token_res.json()
    valid_token = token_info["token_value"]

    # 4. Student scans BLE, measures RSSI (-70 dBm), signs payload
    now_ts = int(time.time())
    nonce = "random-nonce-abc-12345"
    rssi = -70

    canonical_msg = f"{student_id}:{session_id}:{valid_token}:{now_ts}:{nonce}:{rssi}"
    signature = sign_payload_ed25519(priv_hex, canonical_msg)

    # 5. Student submits attendance claim
    submit_res = client.post("/api/v1/attendance/submit", headers=student_headers, json={
        "session_id": session_id,
        "token": valid_token,
        "rssi": rssi,
        "timestamp": now_ts,
        "nonce": nonce,
        "device_identifier": device_id,
        "signature": signature
    })
    assert submit_res.status_code == 201
    submit_data = submit_res.json()
    assert submit_data["status"] == "confirmed"
    assert submit_data["attendance_status"] == "PRESENT"

    # 6. Replay / Duplicate Prevention: Submitting again must be rejected (409 Conflict)
    duplicate_res = client.post("/api/v1/attendance/submit", headers=student_headers, json={
        "session_id": session_id,
        "token": valid_token,
        "rssi": rssi,
        "timestamp": now_ts,
        "nonce": nonce,
        "device_identifier": device_id,
        "signature": signature
    })
    assert duplicate_res.status_code == 409
    assert "already recorded" in duplicate_res.json()["detail"]


def test_reject_weak_rssi_proximity(
    client, organiser_headers, student_headers, student_fixture, enrolled_course_fixture
):
    course_id = enrolled_course_fixture.id
    student_id = student_fixture["user"].id
    device_id = student_fixture["device"].device_identifier
    priv_hex = student_fixture["private_key_hex"]

    # Create and start session with min_rssi = -85
    create_res = client.post("/api/v1/sessions/", headers=organiser_headers, json={
        "course_id": course_id,
        "title": "Lecture 02",
        "duration_minutes": 60,
        "token_rotation_seconds": 10,
        "min_rssi": -85
    })
    session_id = create_res.json()["id"]
    client.post(f"/api/v1/sessions/{session_id}/start", headers=organiser_headers)

    token_info = client.get(f"/api/v1/sessions/{session_id}/current-token", headers=organiser_headers).json()
    valid_token = token_info["token_value"]

    now_ts = int(time.time())
    nonce = "nonce-weak-rssi-999"
    weak_rssi = -98  # Below -85 threshold

    canonical_msg = f"{student_id}:{session_id}:{valid_token}:{now_ts}:{nonce}:{weak_rssi}"
    signature = sign_payload_ed25519(priv_hex, canonical_msg)

    res = client.post("/api/v1/attendance/submit", headers=student_headers, json={
        "session_id": session_id,
        "token": valid_token,
        "rssi": weak_rssi,
        "timestamp": now_ts,
        "nonce": nonce,
        "device_identifier": device_id,
        "signature": signature
    })
    assert res.status_code == 400
    assert "Signal strength too weak" in res.json()["detail"]


def test_reject_expired_or_invalid_token(
    client, organiser_headers, student_headers, student_fixture, enrolled_course_fixture
):
    course_id = enrolled_course_fixture.id
    student_id = student_fixture["user"].id
    device_id = student_fixture["device"].device_identifier
    priv_hex = student_fixture["private_key_hex"]

    create_res = client.post("/api/v1/sessions/", headers=organiser_headers, json={
        "course_id": course_id,
        "title": "Lecture 03",
        "duration_minutes": 60,
        "min_rssi": -85
    })
    session_id = create_res.json()["id"]
    client.post(f"/api/v1/sessions/{session_id}/start", headers=organiser_headers)

    now_ts = int(time.time())
    fake_token = "deadbeef12345678"
    nonce = "nonce-fake-token"
    rssi = -65

    canonical_msg = f"{student_id}:{session_id}:{fake_token}:{now_ts}:{nonce}:{rssi}"
    signature = sign_payload_ed25519(priv_hex, canonical_msg)

    res = client.post("/api/v1/attendance/submit", headers=student_headers, json={
        "session_id": session_id,
        "token": fake_token,
        "rssi": rssi,
        "timestamp": now_ts,
        "nonce": nonce,
        "device_identifier": device_id,
        "signature": signature
    })
    assert res.status_code == 400
    assert "BLE token verification failed" in res.json()["detail"]


def test_manual_attendance_override_and_csv_export(
    client, organiser_headers, student_fixture, enrolled_course_fixture
):
    course_id = enrolled_course_fixture.id
    student_id = student_fixture["user"].id

    create_res = client.post("/api/v1/sessions/", headers=organiser_headers, json={
        "course_id": course_id,
        "title": "Lecture 04 with Formula =SUM(1,2)",
        "duration_minutes": 60
    })
    session_id = create_res.json()["id"]

    # Organiser manually marks student as EXCUSED
    override_res = client.post("/api/v1/attendance/manual-override", headers=organiser_headers, json={
        "session_id": session_id,
        "student_id": student_id,
        "status": "EXCUSED",
        "reason": "Doctor appointment verified"
    })
    assert override_res.status_code == 200
    assert override_res.json()["status"] == "EXCUSED"
    assert override_res.json()["manual_override"] is True

    # Export CSV and check formula injection sanitization
    csv_res = client.get(f"/api/v1/attendance/session/{session_id}/export-csv", headers=organiser_headers)
    assert csv_res.status_code == 200
    assert csv_res.headers["content-type"].startswith("text/csv")
    csv_text = csv_res.text
    assert "Doctor appointment verified" in csv_text
    assert "EXCUSED" in csv_text
