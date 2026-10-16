import sys
from pathlib import Path

# Add root and backend directories to sys.path so 'app' and root modules resolve cleanly
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"

for directory in (str(backend_dir), str(root_dir)):
    if directory not in sys.path:
        sys.path.insert(0, directory)

from app.main import app

# Export app for Vercel Serverless Function ASGI handler
__all__ = ["app"]
