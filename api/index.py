import sys
from pathlib import Path

# Add root and backend directories to sys.path so 'app' and root modules resolve cleanly
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"

for directory in (str(backend_dir), str(root_dir)):
    if directory not in sys.path:
        sys.path.insert(0, directory)

from app.main import app as fastapi_app

async def app(scope, receive, send):
    if scope["type"] == "http":
        headers = dict(scope.get("headers", []))
        matched_path = headers.get(b"x-matched-path")
        if matched_path:
            original_path = matched_path.decode("utf-8")
            if scope.get("path") in ("/api/index.py", "/index.html") or scope.get("path", "").endswith(".py"):
                scope["path"] = original_path
                scope["raw_path"] = original_path.encode("utf-8")
    await fastapi_app(scope, receive, send)

# Export app for Vercel Serverless Function ASGI handler
__all__ = ["app"]
