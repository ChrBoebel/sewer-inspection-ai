import re
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.config import Settings
from app.repository import Repository

COORD_RE = re.compile(
    r"(?P<lat>[+-]?(?:[0-8]?\d(?:[.,]\d+)?|90(?:[.,]0+)?))\s*[,;/ ]\s*"
    r"(?P<lon>[+-]?(?:1[0-7]\d(?:[.,]\d+)?|[0-9]?\d(?:[.,]\d+)?|180(?:[.,]0+)?))"
)


def normalize_location(location: Dict[str, Any]) -> Dict[str, Any]:
    latitude = location.get("latitude")
    longitude = location.get("longitude")
    status = location.get("status") or (
        "confirmed" if latitude is not None and longitude is not None else "missing"
    )
    if status not in {"missing", "suggested", "confirmed"}:
        raise ValueError("Invalid location status")
    if (latitude is None) != (longitude is None):
        raise ValueError("Latitude and longitude must be provided together")
    if status in {"suggested", "confirmed"} and (latitude is None or longitude is None):
        raise ValueError("Suggested or confirmed locations require latitude and longitude")
    if latitude is not None and not -90 <= float(latitude) <= 90:
        raise ValueError("Latitude must be between -90 and 90")
    if longitude is not None and not -180 <= float(longitude) <= 180:
        raise ValueError("Longitude must be between -180 and 180")

    return {
        "latitude": float(latitude) if latitude is not None else None,
        "longitude": float(longitude) if longitude is not None else None,
        "label": _clean_text(location.get("label")),
        "address": _clean_text(location.get("address")),
        "source": _clean_text(location.get("source")) or None,
        "status": status,
        "confidence": _optional_float(location.get("confidence")),
        "raw_text": _clean_text(location.get("raw_text"), max_len=4000),
    }


def location_from_upload(
    label: Optional[str],
    address: Optional[str],
    latitude: Optional[float],
    longitude: Optional[float],
) -> Dict[str, Any]:
    has_coordinates = latitude is not None and longitude is not None
    return normalize_location(
        {
            "latitude": latitude,
            "longitude": longitude,
            "label": label,
            "address": address,
            "source": "manual" if label or address or has_coordinates else None,
            "status": "confirmed" if has_coordinates else "missing",
            "confidence": 1.0 if has_coordinates else None,
        }
    )


def suggest_video_location(
    video: Dict[str, Any],
    settings: Settings,
    repo: Repository,
    query: Optional[str] = None,
) -> Dict[str, Any]:
    video_path = Path(video["path"])
    raw_text, ocr_available = extract_ocr_text(video_path, settings.location_ocr_max_frames)
    raw_candidates = [query, video.get("location_address"), video.get("location_label"), raw_text]
    coord = _first_coordinate(" ".join(candidate for candidate in raw_candidates if candidate))
    if coord is not None:
        latitude, longitude = coord
        return normalize_location(
            {
                "latitude": latitude,
                "longitude": longitude,
                "label": _clean_text(query) or video.get("location_label") or _video_label(video),
                "address": video.get("location_address"),
                "source": "ocr" if raw_text else "manual",
                "status": "suggested",
                "confidence": 0.82 if raw_text else 0.72,
                "raw_text": raw_text,
            }
        )

    geocode_query = _best_query(video, query, raw_text)
    if geocode_query:
        geocoded = geocode(geocode_query, settings, repo)
        if geocoded is not None:
            return normalize_location(
                {
                    "latitude": geocoded["latitude"],
                    "longitude": geocoded["longitude"],
                    "label": video.get("location_label") or geocoded.get("label") or geocode_query,
                    "address": geocoded.get("address") or geocode_query,
                    "source": "ocr" if raw_text else "geocoder",
                    "status": "suggested",
                    "confidence": 0.64 if ocr_available else 0.55,
                    "raw_text": raw_text,
                }
            )

    return normalize_location(
        {
            "label": video.get("location_label") or _video_label(video),
            "address": video.get("location_address"),
            "source": "ocr" if ocr_available else None,
            "status": "missing",
            "confidence": 0.0,
            "raw_text": raw_text,
        }
    )


def extract_ocr_text(path: Path, max_frames: int) -> Tuple[str, bool]:
    if not shutil.which("tesseract"):
        return "", False
    try:
        import cv2
    except Exception:
        return "", False

    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        return "", True
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    indices = _sample_indices(frame_count, max_frames)
    texts: List[str] = []
    try:
        for index in indices:
            capture.set(cv2.CAP_PROP_POS_FRAMES, index)
            ok, frame = capture.read()
            if not ok or frame is None:
                continue
            text, _ = extract_ocr_text_from_frame(frame)
            if text:
                texts.append(text)
    finally:
        capture.release()

    return _clean_text("\n".join(texts), max_len=4000) or "", True


def extract_ocr_text_from_frame(frame: Any) -> Tuple[str, bool]:
    if not shutil.which("tesseract"):
        return "", False
    try:
        import cv2
        import pytesseract
        from PIL import Image
    except Exception:
        return "", False

    if frame is None:
        return "", True
    height, width = frame.shape[:2]
    bands = [
        frame[0 : max(1, int(height * 0.24)), 0:width],
        frame[max(0, int(height * 0.76)) : height, 0:width],
    ]
    texts: List[str] = []
    for band in bands:
        gray = cv2.cvtColor(band, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, None, fx=1.8, fy=1.8, interpolation=cv2.INTER_CUBIC)
        _, threshold = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        text = pytesseract.image_to_string(Image.fromarray(threshold), config="--psm 6")
        if text.strip():
            texts.append(text.strip())
    return _clean_text("\n".join(texts), max_len=4000) or "", True


def geocode(query: str, settings: Settings, repo: Repository) -> Optional[Dict[str, Any]]:
    query = _clean_text(query)
    if not query:
        return None
    cache_key = f"osm:v1:{query.lower()}"
    cached = repo.get_geocode_cache(cache_key)
    if cached is not None:
        return cached or None

    try:
        response = httpx.get(
            settings.geocoder_url,
            params={
                "q": query,
                "format": "jsonv2",
                "limit": "1",
                "addressdetails": "1",
                "countrycodes": "de",
            },
            headers={"User-Agent": settings.geocoder_user_agent},
            timeout=settings.geocoder_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        repo.set_geocode_cache(cache_key, {})
        return None

    if not isinstance(payload, list) or not payload:
        repo.set_geocode_cache(cache_key, {})
        return None
    first = payload[0]
    try:
        result = {
            "latitude": float(first["lat"]),
            "longitude": float(first["lon"]),
            "label": first.get("name"),
            "address": first.get("display_name"),
        }
    except (KeyError, TypeError, ValueError):
        repo.set_geocode_cache(cache_key, {})
        return None
    repo.set_geocode_cache(cache_key, result)
    return result


def _best_query(video: Dict[str, Any], query: Optional[str], raw_text: str) -> str:
    for candidate in (query, video.get("location_address"), video.get("location_label")):
        cleaned = _clean_text(candidate)
        if cleaned:
            return f"{cleaned}, Deutschland"
    for line in raw_text.splitlines():
        cleaned = _clean_text(line)
        is_metadata_line = cleaned.lower().startswith(("dn ", "frame", "meter"))
        if cleaned and len(cleaned) >= 4 and not is_metadata_line:
            return f"{cleaned}, Deutschland"
    label = _video_label(video)
    return f"{label}, Deutschland" if label else ""


def _video_label(video: Dict[str, Any]) -> str:
    original = str(video.get("original_filename") or "")
    return Path(original).stem.replace("_", " ").replace("-", " ").strip()


def _sample_indices(frame_count: int, max_frames: int) -> List[int]:
    max_frames = max(1, max_frames)
    if frame_count <= 1:
        return [0]
    return list(range(min(max_frames, frame_count)))


def _first_coordinate(text: str) -> Optional[Tuple[float, float]]:
    for match in COORD_RE.finditer(text):
        latitude = float(match.group("lat").replace(",", "."))
        longitude = float(match.group("lon").replace(",", "."))
        if -90 <= latitude <= 90 and -180 <= longitude <= 180:
            return latitude, longitude
    return None


def _clean_text(value: Any, max_len: int = 500) -> Optional[str]:
    if value is None:
        return None
    text = " ".join(str(value).split())
    return text[:max_len] if text else None


def _optional_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    return float(value)
