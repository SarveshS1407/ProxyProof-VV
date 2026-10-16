import time
import pytest
from app.core.ble_packet import (
    encode_ble_advertisement_payload,
    decode_ble_advertisement_payload,
    PROTOCOL_VERSION,
    SERVICE_DATA_PAYLOAD_LENGTH,
    PROXYPROOF_SERVICE_UUID_16,
    PROXYPROOF_SERVICE_UUID_128,
)
from app.core.ble_token import (
    compute_token,
    get_window_index,
    get_session_short_id,
    verify_session_token,
)
from app.models.session import AttendanceSession
from app.models.course import Course, CourseEnrollment
from app.models.attendance import AttendanceRecord
from app.core.crypto import sign_payload_ed25519
from app.core.security import create_access_token


def test_ble_packet_serialization_round_trip():
    """AC-BLE-01: Verifies that 21-byte binary packet encodes and decodes losslessly."""
    version = PROTOCOL_VERSION
    session_short_id = "a1b2c3d4e5f60718"
    window_index = 172900000
    token = "9f8e7d6c5b4a3928"

    encoded = encode_ble_advertisement_payload(
        version=version,
        session_short_id_hex=session_short_id,
        window_index=window_index,
        token_hex=token
    )

    # 1. Size constraint check: Exactly 21 bytes
    assert len(encoded) == SERVICE_DATA_PAYLOAD_LENGTH
    assert len(encoded) == 21

    # 2. Total legacy BLE advertisement frame check
    # Flags (3B) + 16-bit Service UUID (4B) + Service Data AD (2B header + 21B payload = 23B)
    total_frame_size = 3 + 4 + (2 + len(encoded))
    assert total_frame_size == 30
    assert total_frame_size <= 31  # Maximum legacy BLE advertising PDU size

    # 3. Decode packet
    decoded = decode_ble_advertisement_payload(encoded)
    assert decoded is not None
    assert decoded["version"] == version
    assert decoded["session_short_id"] == session_short_id
    assert decoded["window_index"] == window_index
    assert decoded["token"] == token


def test_corrupted_and_truncated_packet_rejection():
    """Verifies that truncated or wrong-version BLE packets are safely rejected."""
    # 1. Truncated packet (< 21 bytes)
    truncated = b"\x01\xa1\xb2\xc3"
    assert decode_ble_advertisement_payload(truncated) is None

    # 2. Wrong version byte
    invalid_version_packet = encode_ble_advertisement_payload(
        version=0x99,  # Unsupported version
        session_short_id_hex="a1b2c3d4e5f60718",
        window_index=100,
        token_hex="9f8e7d6c5b4a3928"
    )
    assert decode_ble_advertisement_payload(invalid_version_packet) is None

    # 3. Empty buffer
    assert decode_ble_advertisement_payload(b"") is None


def test_clock_skew_and_window_tolerance():
    """AC-BLE-02: Verifies that server accepts W_0, W_-1, and W_+1, but strictly rejects W_-2 and W_+2."""
    now = time.time()
    interval = 10
    current_w = get_window_index(now, interval)
    secret = "test_super_secret_session_key_12345"

    session = AttendanceSession(
        id=42,
        course_id=1,
        organiser_id=1,
        title="BLE Skew Test",
        duration_minutes=30,
        is_active=True,
        is_closed=False,
        session_secret=secret,
        token_rotation_seconds=interval
    )

    # 1. Current window W_0 -> Valid
    token_w0 = compute_token(secret, session.id, current_w)
    valid, _, w = verify_session_token(session, token_w0, now)
    assert valid is True
    assert w == current_w

    # 2. Previous window W_-1 (Grace period) -> Valid
    token_w_minus_1 = compute_token(secret, session.id, current_w - 1)
    valid, _, w = verify_session_token(session, token_w_minus_1, now)
    assert valid is True
    assert w == current_w - 1

    # 3. Next window W_+1 (Client clock slightly ahead) -> Valid
    token_w_plus_1 = compute_token(secret, session.id, current_w + 1)
    valid, _, w = verify_session_token(session, token_w_plus_1, now)
    assert valid is True
    assert w == current_w + 1

    # 4. Stale window W_-2 (Expired) -> Strictly Rejected
    token_w_minus_2 = compute_token(secret, session.id, current_w - 2)
    valid, reason, _ = verify_session_token(session, token_w_minus_2, now)
    assert valid is False
    assert "Invalid or expired" in reason

    # 5. Far future window W_+2 -> Strictly Rejected
    token_w_plus_2 = compute_token(secret, session.id, current_w + 2)
    valid, reason, _ = verify_session_token(session, token_w_plus_2, now)
    assert valid is False
    assert "Invalid or expired" in reason


def test_end_to_end_ble_advertisement_decode_and_checkin(client, db_session, student_fixture, organiser_user, organiser_headers):
    """
    AC-BLE-03: Full end-to-end physical BLE flow:
    1. Organiser starts session on backend.
    2. Organiser broadcasts encoded 21-byte BLE advertising frame.
    3. Student device scans, captures advertisement, decodes token & window from raw bytes.
    4. Student device measures RSSI (-72 dBm).
    5. Student device digitally signs the canonical payload using bound private key.
    6. Student submits claim to backend -> 201 Created confirmation.
    """
    student_user = student_fixture["user"]
    profile = student_fixture["profile"]
    device = student_fixture["device"]
    priv_hex = student_fixture["private_key_hex"]

    # 1. Organiser creates course and session
    course = Course(code="CS500", title="BLE Wireless Systems", organiser_id=organiser_user.id)
    db_session.add(course)
    db_session.commit()

    enrollment = CourseEnrollment(course_id=course.id, student_profile_id=profile.id, is_active=True)
    db_session.add(enrollment)
    db_session.commit()

    s = AttendanceSession(
        course_id=course.id,
        organiser_id=organiser_user.id,
        title="BLE Lab Experiment",
        duration_minutes=30,
        is_active=False,
        is_closed=False
    )
    db_session.add(s)
    db_session.commit()

    # Organiser starts session
    res_start = client.post(f"/api/v1/sessions/{s.id}/start", headers=organiser_headers)
    assert res_start.status_code == 200
    token_info = res_start.json()["token_info"]

    # 2. Organiser encodes BLE advertisement packet from token_info
    raw_ble_packet = encode_ble_advertisement_payload(
        version=PROTOCOL_VERSION,
        session_short_id_hex=token_info["session_short_id"],
        window_index=token_info["window_index"],
        token_hex=token_info["token_value"]
    )
    assert len(raw_ble_packet) == 21

    # 3. Student device receives over BLE radio and decodes packet
    decoded_ad = decode_ble_advertisement_payload(raw_ble_packet)
    assert decoded_ad is not None
    assert decoded_ad["token"] == token_info["token_value"]
    assert decoded_ad["window_index"] == token_info["window_index"]

    # 4. Student measures signal strength
    measured_rssi = -72  # Strong indoor classroom signal

    # 5. Student signs payload with hardware device private key
    now_ts = int(time.time())
    nonce = f"ble-radio-test-{now_ts}"
    canonical_payload = f"{student_user.id}:{s.id}:{decoded_ad['token']}:{now_ts}:{nonce}:{measured_rssi}"
    signature = sign_payload_ed25519(priv_hex, canonical_payload)

    # 6. Student submits claim
    token = create_access_token(student_user.id)
    student_headers = {"Authorization": f"Bearer {token}"}

    res_submit = client.post("/api/v1/attendance/submit", json={
        "session_id": s.id,
        "token": decoded_ad["token"],
        "rssi": measured_rssi,
        "timestamp": now_ts,
        "nonce": nonce,
        "device_identifier": device.device_identifier,
        "signature": signature
    }, headers=student_headers)

    assert res_submit.status_code == 201
    claim_resp = res_submit.json()
    assert claim_resp["status"] == "confirmed"
    assert claim_resp["attendance_status"] == "PRESENT"
    assert claim_resp["verification_method"] == "BLE"
    assert claim_resp["rssi"] == measured_rssi
