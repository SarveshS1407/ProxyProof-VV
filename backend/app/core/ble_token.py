import hashlib
import hmac
import secrets
import time
from datetime import datetime, timezone
from typing import Tuple, Dict, Any

from app.models.session import AttendanceSession


def compute_token(session_secret: str, session_id: int, window_index: int) -> str:
    """
    Computes an unpredictable 16-hex-character (8 bytes) token
    using HMAC-SHA256 for a given session and rotation window.
    """
    data = f"{session_id}:{window_index}".encode("utf-8")
    key = session_secret.encode("utf-8")
    h = hmac.new(key, data, hashlib.sha256)
    return h.hexdigest()[:16]


def get_window_index(timestamp: float, rotation_interval: int) -> int:
    return int(timestamp // rotation_interval)


def get_session_short_id(session_id: int) -> str:
    """Returns 16-hex character short hash for BLE packet compactness."""
    return hashlib.sha256(f"session:{session_id}".encode("utf-8")).hexdigest()[:16]


def get_current_token_info(session: AttendanceSession) -> Dict[str, Any]:
    now = time.time()
    interval = session.token_rotation_seconds or 10
    window_idx = get_window_index(now, interval)
    token_val = compute_token(session.session_secret, session.id, window_idx)
    seconds_remaining = int(interval - (now % interval))
    valid_until = datetime.fromtimestamp((window_idx + 1) * interval, tz=timezone.utc)

    return {
        "session_id": session.id,
        "session_short_id": get_session_short_id(session.id),
        "token_value": token_val,
        "window_index": window_idx,
        "seconds_remaining": max(1, seconds_remaining),
        "valid_until": valid_until,
    }


def verify_session_token(
    session: AttendanceSession,
    submitted_token: str,
    client_timestamp: float,
    max_skew_seconds: int = 60
) -> Tuple[bool, str, int]:
    """
    Validates a submitted rotating token against the session secret.
    Allows for current window W_0, previous window W_-1 (grace period),
    and next window W_+1 (minor clock lead).
    """
    if not session.is_active or session.is_closed:
        return False, "Attendance session is not active or has been closed", -1

    now = time.time()
    
    # Check timestamp freshness / skew
    if abs(now - client_timestamp) > max_skew_seconds:
        return False, f"Client timestamp skew ({int(abs(now - client_timestamp))}s) exceeds allowable threshold ({max_skew_seconds}s)", -1

    interval = session.token_rotation_seconds or 10
    current_window = get_window_index(now, interval)

    # Check current window, previous window (grace period), and next window
    candidate_windows = [current_window, current_window - 1, current_window + 1]

    for w in candidate_windows:
        expected_token = compute_token(session.session_secret, session.id, w)
        if secrets.compare_digest(expected_token.lower(), submitted_token.strip().lower()):
            return True, "Token successfully validated", w

    return False, "Invalid or expired session token", -1
