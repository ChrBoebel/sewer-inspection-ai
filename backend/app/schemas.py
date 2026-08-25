from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class VideoLocationRead(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    label: Optional[str] = None
    address: Optional[str] = None
    source: Optional[str] = None
    status: str = "missing"
    confidence: Optional[float] = None
    raw_text: Optional[str] = None
    updated_at: Optional[str] = None


class VideoLocationUpdate(BaseModel):
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    label: Optional[str] = None
    address: Optional[str] = None
    source: Optional[str] = "manual"
    status: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    raw_text: Optional[str] = None


class VideoLocationSuggestRequest(BaseModel):
    query: Optional[str] = None


class VideoOverlayRead(BaseModel):
    raw_text: Optional[str] = None
    confidence: Optional[float] = None
    street: Optional[str] = None
    city: Optional[str] = None
    dn: Optional[str] = None
    material: Optional[str] = None
    distance_m: Optional[float] = None
    direction: Optional[str] = None
    inspection_date: Optional[str] = None
    inspection_time: Optional[str] = None
    upstream_id: Optional[str] = None
    downstream_id: Optional[str] = None
    clock_position: Optional[str] = None
    tilt_percent: Optional[float] = None


class VideoRead(BaseModel):
    id: str
    original_filename: str
    stored_filename: str
    preview_filename: Optional[str] = None
    content_type: Optional[str] = None
    size_bytes: int
    duration_seconds: Optional[float] = None
    fps: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    meter_start: Optional[float] = None
    meter_end: Optional[float] = None
    route_name: Optional[str] = None
    pipe_diameter: Optional[str] = None
    pipe_material: Optional[str] = None
    inspection_date: Optional[str] = None
    created_at: str
    video_url: str
    location: VideoLocationRead = Field(default_factory=VideoLocationRead)
    overlay: VideoOverlayRead = Field(default_factory=VideoOverlayRead)


class JobRead(BaseModel):
    id: str
    video_id: str
    model_id: str
    status: str
    progress: int = Field(ge=0, le=100)
    message: Optional[str] = None
    error: Optional[str] = None
    rq_job_id: Optional[str] = None
    created_at: str
    updated_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class DetectionRead(BaseModel):
    id: str
    event_id: Optional[str] = None
    video_id: str
    frame_index: int
    timestamp_seconds: float
    meter: Optional[float] = None
    class_name: str
    confidence: float
    bbox: List[float]
    mask_path: Optional[str] = None
    source_model: str = "unknown"


class EventRead(BaseModel):
    id: str
    video_id: str
    class_name: str
    confidence: float
    bbox: List[float]
    snapshot_url: Optional[str] = None
    snapshot_frame_index: Optional[int] = None
    snapshot_detections: List[DetectionRead] = Field(default_factory=list)
    start_time_seconds: float
    end_time_seconds: float
    meter_start: Optional[float] = None
    meter_end: Optional[float] = None
    detection_count: int
    review_status: str
    review_note: Optional[str] = None
    reminder_due_at: Optional[str] = None
    reminder_created_at: Optional[str] = None
    reminder_resolved_at: Optional[str] = None
    overlay: VideoOverlayRead = Field(default_factory=VideoOverlayRead)
    created_at: str
    updated_at: str


class ReviewUpdate(BaseModel):
    status: str
    note: Optional[str] = None
    class_name: Optional[str] = None
    confidence: Optional[float] = None
    reminder_due_at: Optional[str] = None
    resolve_reminder: bool = False


class AnalyzeRequest(BaseModel):
    model_id: Optional[str] = None


class ModelRead(BaseModel):
    id: str
    label: str
    architecture: str
    source: str
    source_url: str
    license: str
    description: str
    cached: bool
    lazy_download: bool
    filename: Optional[str] = None
    classes: List[str]


class ReportRead(BaseModel):
    video: VideoRead
    summary: Dict[str, Any]
    events: List[EventRead]
    generated_at: str
    report_path: str
