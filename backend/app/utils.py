import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def safe_filename(filename: str) -> str:
    name = Path(filename or "video").name
    cleaned = _SAFE_FILENAME_RE.sub("_", name).strip("._")
    return cleaned or "video"


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def as_float(value: Any) -> float:
    return float(value) if value is not None else 0.0
