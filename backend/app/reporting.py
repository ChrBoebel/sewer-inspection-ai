import json
from typing import Any, Dict, List

from app.config import Settings
from app.repository import Repository
from app.utils import now_iso


def build_report(repo: Repository, settings: Settings, video_id: str) -> Dict[str, Any]:
    video = repo.get_video(video_id)
    if video is None:
        raise ValueError("Video not found")

    events = repo.list_events(video_id)
    generated_at = now_iso()
    report_path = settings.reports_dir / f"{video_id}.json"
    payload = {
        "video": _video_payload(video),
        "summary": _summary(events),
        "events": events,
        "generated_at": generated_at,
        "report_path": str(report_path),
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    repo.upsert_report(video_id, report_path, generated_at)
    return payload


def _summary(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    accepted = sum(1 for event in events if event["review_status"] == "accepted")
    rejected = sum(1 for event in events if event["review_status"] == "rejected")
    edited = sum(1 for event in events if event["review_status"] == "edited")
    pending = sum(1 for event in events if event["review_status"] == "pending")
    classes: Dict[str, int] = {}
    for event in events:
        classes[event["class_name"]] = classes.get(event["class_name"], 0) + 1
    return {
        "event_count": len(events),
        "accepted": accepted,
        "edited": edited,
        "rejected": rejected,
        "pending": pending,
        "classes": classes,
    }


def _video_payload(video: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": video["id"],
        "original_filename": video["original_filename"],
        "stored_filename": video["stored_filename"],
        "preview_filename": video.get("preview_filename"),
        "content_type": video["content_type"],
        "size_bytes": video["size_bytes"],
        "duration_seconds": video["duration_seconds"],
        "fps": video["fps"],
        "width": video["width"],
        "height": video["height"],
        "meter_start": video["meter_start"],
        "meter_end": video["meter_end"],
        "route_name": video.get("route_name"),
        "pipe_diameter": video.get("pipe_diameter"),
        "pipe_material": video.get("pipe_material"),
        "inspection_date": video.get("inspection_date"),
        "created_at": video["created_at"],
        "video_url": f"/files/uploads/{video.get('preview_filename') or video['stored_filename']}",
        "location": {
            "latitude": video.get("location_latitude"),
            "longitude": video.get("location_longitude"),
            "label": video.get("location_label"),
            "address": video.get("location_address"),
            "source": video.get("location_source"),
            "status": video.get("location_status") or "missing",
            "confidence": video.get("location_confidence"),
            "raw_text": video.get("location_raw_text"),
            "updated_at": video.get("location_updated_at"),
        },
        "overlay": {
            "raw_text": video.get("overlay_raw_text"),
            "confidence": video.get("overlay_confidence"),
            "street": video.get("overlay_street"),
            "city": video.get("overlay_city"),
            "dn": video.get("overlay_dn"),
            "material": video.get("overlay_material"),
            "distance_m": video.get("overlay_distance_m"),
            "direction": video.get("overlay_direction"),
            "inspection_date": video.get("overlay_inspection_date"),
            "inspection_time": video.get("overlay_inspection_time"),
            "upstream_id": video.get("overlay_upstream_id"),
            "downstream_id": video.get("overlay_downstream_id"),
            "clock_position": video.get("overlay_clock_position"),
            "tilt_percent": video.get("overlay_tilt_percent"),
        },
    }
