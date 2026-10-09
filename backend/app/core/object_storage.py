"""Local server storage for the AI Concept module.

Files are written to disk under the backend uploads directory. The router keeps
the same ``put_object`` / ``get_object`` API it used with Emergent Object
Storage — only the implementation swapped to a local filesystem, so no route
changes are needed.

Layout on disk:
    <UPLOAD_DIR>/concepts/uploads/<user_id>/<uuid>.<ext>
    <UPLOAD_DIR>/concepts/<concept_id>/render-<uuid>.png

The public ``path`` we hand back to the router (and persist in the DB) is a
POSIX-style relative path — safe to compose into ``/api/concepts/media/<path>``.
"""
import logging
import mimetypes
from pathlib import Path

logger = logging.getLogger(__name__)

APP_NAME = "sitera"

# Backend uploads root (same dir the existing uploads router uses).
_BASE = Path(__file__).resolve().parent.parent.parent / "uploads"
_BASE.mkdir(parents=True, exist_ok=True)


def init_storage():
    """No-op — kept for API parity with the previous object-storage client."""
    _BASE.mkdir(parents=True, exist_ok=True)
    return True


def _resolve(path: str) -> Path:
    """Resolve a stored path into an absolute file location, guarding against
    directory traversal.
    """
    rel = Path(path.lstrip("/")).as_posix()
    target = (_BASE / rel).resolve()
    if not str(target).startswith(str(_BASE.resolve())):
        raise ValueError("Invalid storage path")
    return target


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Write bytes to disk. Returns {'path', 'size'}. Content type is ignored
    for storage but preserved by ``get_object`` via mimetype guessing.
    """
    target = _resolve(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {"path": path, "size": target.stat().st_size}


def get_object(path: str) -> tuple[bytes, str]:
    """Read bytes back from disk. Returns (bytes, guessed_content_type)."""
    target = _resolve(path)
    if not target.exists():
        raise FileNotFoundError(path)
    ctype, _ = mimetypes.guess_type(str(target))
    return target.read_bytes(), ctype or "application/octet-stream"
