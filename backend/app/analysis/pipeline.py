import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2

from app import overlay as overlay_service
from app.analysis.detectors import DamageDetector
from app.analysis.event_engine import group_detections_into_events
from app.analysis.model_registry import DEFAULT_MODEL_ID, build_detector, get_model_spec
from app.analysis.video import probe_video, sampled_frames
from app.config import Settings
from app.repository import Repository


def run_pipeline(
    repo: Repository,
    settings: Settings,
    video: Dict[str, Any],
    job_id: str,
    detector: Optional[DamageDetector] = None,
    model_id: str = DEFAULT_MODEL_ID,
) -> List[Dict[str, Any]]:
    if detector is None:
        spec = get_model_spec(model_id)
        repo.update_job(
            job_id,
            progress=4,
            message=f"Loading detector: {spec.label if spec else model_id}",
        )
        detector = build_detector(model_id, settings)
    video_path = Path(video["path"])
    metadata = probe_video(video_path)
    repo.update_video_metadata(video["id"], metadata)
    video.update(metadata)
    repo.update_job(job_id, progress=8, message="Video metadata loaded")

    frame_dir = settings.frames_dir / video["id"]
    if frame_dir.exists():
        shutil.rmtree(frame_dir)
    frame_dir.mkdir(parents=True, exist_ok=True)

    detections: List[Dict[str, Any]] = []
    processed_frames = 0
    target_frames = _target_frame_count(video, settings)
    for frame_index, timestamp, frame in sampled_frames(
        video_path,
        sample_fps=settings.analysis_sample_fps,
        max_frames=settings.analysis_max_frames,
        frame_stride=settings.analysis_frame_stride,
    ):
        frame_path = frame_dir / f"{frame_index:08d}.jpg"
        cv2.imwrite(str(frame_path), frame)
        meter = _meter_for_timestamp(video, timestamp)
        context = {
            "video_id": video["id"],
            "frame_index": frame_index,
            "timestamp_seconds": timestamp,
            "meter": meter,
        }
        for prediction in detector.predict_frame(frame, context):
            detections.append(
                {
                    "video_id": video["id"],
                    "frame_index": frame_index,
                    "timestamp_seconds": timestamp,
                    "meter": meter,
                    "class_name": prediction.class_name,
                    "confidence": prediction.confidence,
                    "bbox": prediction.bbox,
                    "mask_path": None,
                    "source_model": prediction.source_model,
                }
            )
        processed_frames += 1
        progress = 10 + int((processed_frames / max(target_frames, processed_frames, 1)) * 75)
        repo.update_job(
            job_id,
            progress=min(progress, 85),
            message=f"Analyzed {processed_frames} sampled frames",
        )

    if processed_frames == 0:
        raise ValueError("No frames could be sampled from the uploaded video")

    repo.update_job(job_id, progress=90, message="Grouping detections into events")
    events = group_detections_into_events(detections)
    _attach_event_overlay_metadata(events, frame_dir)
    saved_events = repo.replace_analysis_results(video["id"], events)
    repo.update_job(job_id, progress=95, message=f"Stored {len(saved_events)} events")
    return saved_events


def _attach_event_overlay_metadata(events: List[Dict[str, Any]], frame_dir: Path) -> None:
    for event in events:
        detections = event.get("detections") or []
        if not detections:
            continue
        best_detection = max(detections, key=lambda item: item.get("confidence", 0.0))
        frame_index = best_detection.get("frame_index")
        if frame_index is None:
            continue
        frame_path = frame_dir / f"{int(frame_index):08d}.jpg"
        frame = cv2.imread(str(frame_path))
        overlay = overlay_service.extract_overlay_metadata_from_frame(frame)
        event["overlay"] = overlay
        distance = overlay.get("distance_m")
        if distance is not None:
            event["meter_start"] = distance
            event["meter_end"] = distance


def _meter_for_timestamp(video: Dict[str, Any], timestamp_seconds: float) -> Optional[float]:
    meter_start = video.get("meter_start")
    meter_end = video.get("meter_end")
    duration = video.get("duration_seconds")
    if meter_start is None or meter_end is None or not duration or duration <= 0:
        return None
    ratio = max(0.0, min(1.0, timestamp_seconds / duration))
    return float(meter_start) + (float(meter_end) - float(meter_start)) * ratio


def _target_frame_count(video: Dict[str, Any], settings: Settings) -> int:
    if settings.analysis_max_frames > 0:
        return settings.analysis_max_frames
    if settings.analysis_frame_stride > 0:
        duration = float(video.get("duration_seconds") or 0.0)
        fps = float(video.get("fps") or 0.0)
        estimated_frames = int((duration * fps) / settings.analysis_frame_stride)
        return max(estimated_frames, 1)
    return 1
