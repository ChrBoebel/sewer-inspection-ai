from typing import Any, Dict, Iterable, List, Optional


def group_detections_into_events(
    detections: Iterable[Dict[str, Any]],
    max_gap_seconds: float = 2.0,
) -> List[Dict[str, Any]]:
    sorted_detections = sorted(
        detections,
        key=lambda item: (item["class_name"], item["timestamp_seconds"]),
    )
    events: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None

    for detection in sorted_detections:
        starts_new = (
            current is None
            or current["class_name"] != detection["class_name"]
            or detection["timestamp_seconds"] - current["_last_time"] > max_gap_seconds
        )
        if starts_new:
            if current is not None:
                events.append(_finalize_event(current))
            current = {
                "class_name": detection["class_name"],
                "detections": [detection],
                "_last_time": detection["timestamp_seconds"],
            }
        else:
            current["detections"].append(detection)
            current["_last_time"] = detection["timestamp_seconds"]

    if current is not None:
        events.append(_finalize_event(current))
    return events


def _finalize_event(group: Dict[str, Any]) -> Dict[str, Any]:
    detections = group["detections"]
    best_detection = max(detections, key=lambda item: item["confidence"])
    meter_values = [item.get("meter") for item in detections if item.get("meter") is not None]
    timestamps = [item["timestamp_seconds"] for item in detections]
    return {
        "class_name": group["class_name"],
        "confidence": best_detection["confidence"],
        "bbox": best_detection["bbox"],
        "start_time_seconds": min(timestamps),
        "end_time_seconds": max(timestamps),
        "meter_start": min(meter_values) if meter_values else None,
        "meter_end": max(meter_values) if meter_values else None,
        "detection_count": len(detections),
        "detections": detections,
    }
