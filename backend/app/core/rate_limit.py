from collections import defaultdict
import time
from typing import Dict, List, Tuple
from fastapi import Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from app.config import settings


class InMemoryRateLimiter:
    """
    Sliding-window in-memory rate limiter with configurable limits per endpoint group.
    Provides immediate throttling and prevents credential brute-forcing and replay floods.
    """

    def __init__(self):
        # Key: (client_ip, category) -> list of request timestamps
        self._history: Dict[Tuple[str, str], List[float]] = defaultdict(list)
        self.enabled: bool = True

    def reset(self):
        """Clears all recorded rate limit history (useful in test suites)."""
        self._history.clear()

    def set_enabled(self, enabled: bool):
        self.enabled = enabled

    def check_rate_limit(self, client_ip: str, path: str, method: str) -> Tuple[bool, int]:
        """
        Evaluates whether a request from client_ip to path is permitted.
        Returns (is_allowed, retry_after_seconds).
        """
        if not self.enabled or method.upper() == "OPTIONS":
            return True, 0

        now = time.time()
        category = None
        max_requests = 100
        window = 60

        # Classify high-risk target endpoints
        if path.endswith("/auth/login"):
            category = "auth_login"
            max_requests = getattr(settings, "RATE_LIMIT_LOGIN_MAX_REQUESTS", 10)
            window = getattr(settings, "RATE_LIMIT_WINDOW_SECONDS", 60)
        elif path.endswith("/auth/register"):
            category = "auth_register"
            max_requests = getattr(settings, "RATE_LIMIT_REGISTER_MAX_REQUESTS", 10)
            window = getattr(settings, "RATE_LIMIT_WINDOW_SECONDS", 60)
        elif path.endswith("/attendance/submit") and method.upper() == "POST":
            category = "attendance_submit"
            max_requests = getattr(settings, "RATE_LIMIT_SUBMIT_MAX_REQUESTS", 30)
            window = getattr(settings, "RATE_LIMIT_WINDOW_SECONDS", 60)
        elif path.endswith("/devices/register") and method.upper() == "POST":
            category = "devices_register"
            max_requests = 10
            window = 60

        if not category:
            return True, 0

        key = (client_ip, category)
        cutoff = now - window

        # Filter out expired timestamps
        active_timestamps = [ts for ts in self._history[key] if ts > cutoff]
        self._history[key] = active_timestamps

        if len(active_timestamps) >= max_requests:
            oldest = active_timestamps[0]
            retry_after = max(1, int(window - (now - oldest)))
            return False, retry_after

        self._history[key].append(now)
        return True, 0


rate_limiter = InMemoryRateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Extract client IP, respecting trusted proxy header if present
        client_ip = request.client.host if request.client else "127.0.0.1"
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()

        is_allowed, retry_after = rate_limiter.check_rate_limit(
            client_ip=client_ip,
            path=request.url.path,
            method=request.method
        )

        if not is_allowed:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": "Too many requests. Rate limit exceeded. Please wait before retrying."
                },
                headers={"Retry-After": str(retry_after)}
            )

        return await call_next(request)
