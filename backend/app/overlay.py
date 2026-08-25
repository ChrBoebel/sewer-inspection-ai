import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

from app.location import extract_ocr_text, extract_ocr_text_from_frame

MATERIALS = {
    "polyvinylchlorid": "Polyvinylchlorid",
    "pvc": "PVC",
    "beton": "Beton",
    "steinzeug": "Steinzeug",
    "grauguss": "Grauguss",
    "duktilguss": "Duktilguss",
    "gfk": "GFK",
    "pp": "PP",
}


def extract_overlay_metadata(path: Path, max_frames: int) -> Dict[str, Any]:
    raw_text, ocr_available = extract_ocr_text(path, max_frames)
    return overlay_metadata_from_text(raw_text, ocr_available)


def extract_overlay_metadata_from_frame(frame: Any) -> Dict[str, Any]:
    raw_text, ocr_available = extract_ocr_text_from_frame(frame)
    return overlay_metadata_from_text(raw_text, ocr_available)


def overlay_metadata_from_text(raw_text: str, ocr_available: bool) -> Dict[str, Any]:
    parsed = parse_overlay_text(raw_text)
    filled = sum(1 for value in parsed.values() if value not in (None, ""))
    confidence = (
        min(0.95, 0.35 + filled * 0.08)
        if raw_text
        else (0.0 if ocr_available else None)
    )
    return {
        "raw_text": raw_text or None,
        "confidence": confidence,
        **parsed,
    }


def parse_overlay_text(raw_text: str) -> Dict[str, Any]:
    text = _clean(raw_text) or ""
    lines = [_clean(line) for line in raw_text.splitlines()]
    lines = [line for line in lines if line]

    return {
        "street": _street(lines, text),
        "city": _city(lines, text),
        "dn": _dn(text),
        "material": _material(text),
        "distance_m": _distance(text),
        "direction": _direction(lines),
        "inspection_date": _date(text),
        "inspection_time": _time(text),
        "upstream_id": _first_label_value(lines, ("von s", "von")),
        "downstream_id": _first_label_value(lines, ("nach s", "nach")),
        "clock_position": _clock_position(text),
        "tilt_percent": _tilt(text),
    }


STREET_SUFFIX_PATTERN = (
    r"[A-ZÄÖÜa-zäöüß][A-ZÄÖÜa-zäöüß.-]*"
    r"(?:weg|str\.?|straße|strasse|platz|gasse|allee|ring)"
)


def _configured_cities() -> list[str]:
    """Ortsnamen, an denen sich der Overlay-Parser orientiert.

    Inspektionskameras blenden den Ort typischerweise direkt über dem
    Straßennamen ein — ein Treffer verankert also die Zeile darunter als
    Straße. Welche Orte das sind, hängt vom Netzbetreiber ab und kommt
    deshalb aus ``APP_OVERLAY_CITIES`` (kommagetrennt), nicht aus dem Code.
    Ohne Konfiguration greifen nur die ortsunabhängigen Muster.
    """
    raw = os.getenv("APP_OVERLAY_CITIES", "")
    return [part.strip() for part in raw.split(",") if part.strip()]


def _city_token(city: str) -> str:
    """Erstes Wort eines Ortsnamens — robust gegen OCR-Fehler im Rest."""
    return city.split()[0].lower()


def _street(lines: list[str], text: str) -> Optional[str]:
    labelled = _first_label_value(lines, ("straße", "strasse"))
    if labelled:
        return labelled
    tokens = [_city_token(city) for city in _configured_cities()]
    for index, line in enumerate(lines):
        if any(token in line.lower() for token in tokens) and index + 1 < len(lines):
            candidate = lines[index + 1]
            if not re.fullmatch(r"\d{6,}", candidate):
                return candidate
    id_street_match = re.search(
        rf"\b\d{{6,}}\s+({STREET_SUFFIX_PATTERN})\b",
        text,
        flags=re.IGNORECASE,
    )
    if id_street_match:
        return _title_like(id_street_match.group(1))
    for token in tokens:
        city_street_match = re.search(
            rf"{re.escape(token)}.{{0,120}}?\b({STREET_SUFFIX_PATTERN})\b",
            text,
            flags=re.IGNORECASE,
        )
        if city_street_match:
            return _title_like(city_street_match.group(1))
    return None


def _city(lines: list[str], text: str) -> Optional[str]:
    _ = text
    for city in _configured_cities():
        token = _city_token(city)
        if any(token in line.lower() for line in lines):
            return city
    return None


def _dn(text: str) -> Optional[str]:
    match = re.search(
        r"(?:\bDN\s*|\bNennw(?:eite)?\.?\s*:?\s*)([0-9]{2,4})\b",
        text,
        flags=re.IGNORECASE,
    )
    return f"DN {match.group(1)}" if match else None


def _material(text: str) -> Optional[str]:
    lowered = text.lower()
    if re.search(r"polyvinyl|polyvihyl|polyviny", lowered):
        return "Polyvinylchlorid"
    for token, label in MATERIALS.items():
        if len(token) <= 3 and re.search(rf"(?<![a-z]){re.escape(token)}(?![a-z])", lowered):
            return label
        if len(token) > 3 and token in lowered:
            return label
    if "teinzeug" in lowered:
        return "Steinzeug"
    return None


def _distance(text: str) -> Optional[float]:
    matches = re.findall(
        r"(?<!\d)(\d{1,4}[,.]\d{1,2})\s*(?:m\b|[\"“”]|(?=\s*:?\d{2}:\d{2}))",
        text,
        flags=re.IGNORECASE,
    )
    if not matches:
        return None
    try:
        return float(matches[-1].replace(",", "."))
    except ValueError:
        return None


def _direction(lines: list[str]) -> Optional[str]:
    labelled = _first_label_value(
        lines,
        ("richtung", "fließrichtung", "fliessrichtung", "flr", "fir"),
    )
    if labelled:
        return labelled
    for line in lines:
        if "flr" in line.lower():
            return line
    return None


def _date(text: str) -> Optional[str]:
    matches = re.findall(r"\b(\d{1,2}[.\-]\d{1,2}[.\-]\d{2,4})\b", text)
    return matches[-1] if matches else None


def _time(text: str) -> Optional[str]:
    matches = re.findall(r"\b([0-2]?\d:[0-5]\d(?::[0-5]\d)?)\b", text)
    for value in matches:
        try:
            if int(value.split(":", 1)[0]) >= 3:
                return value
        except ValueError:
            continue
    return matches[-1] if matches else None


def _clock_position(text: str) -> Optional[str]:
    if re.search(r"\b12\b.*\b3\b.*\b6\b.*\b9\b", text):
        return "Uhrbild erkannt"
    return None


def _tilt(text: str) -> Optional[float]:
    match = re.search(r"(?:Neigung\s*:?\s*)?([+-]?\d{1,2}[,.]\d)\s*%", text, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", "."))
    except ValueError:
        return None


def _first_label_value(lines: list[str], labels: tuple[str, ...]) -> Optional[str]:
    for line in lines:
        lowered = line.lower()
        for label in labels:
            if lowered.startswith(label):
                value = re.sub(r"^[^:]*:?", "", line).strip(" -")
                return value or None
    return None


def _clean(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = " ".join(str(value).split())
    return text if text else None


def _title_like(value: str) -> str:
    if value.isupper() or value.islower():
        return value.title()
    return value.rstrip(".")
