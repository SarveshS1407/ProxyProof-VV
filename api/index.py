import sys
from pathlib import Path

# Add backend directory to sys.path so 'app' imports resolve cleanly
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app

# Export app for Vercel Serverless Function ASGI handler
__all__ = ["app"]
