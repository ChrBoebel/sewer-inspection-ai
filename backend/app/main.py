import asyncio
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from fastapi import Body, Depends, FastAPI, File, Form, HTTPException, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from redis.exceptions import RedisError

from app import location as location_service
from app import overlay as overlay_service
from app.analysis.model_registry import (
    DEFAULT_MODEL_ID,
    get_public_model_spec,
    list_model_specs,
    model_payload,
)
from app.analysis.video import create_browser_preview, probe_video
from app.config import Settings, ensure_data_dirs, get_settings
from app.queue import enqueue_analysis_job
from app.reporting import build_report
from app.repository import Repository
from app.schemas import (
    AnalyzeRequest,
    EventRead,
    JobRead,
    ModelRead,
    ReportRead,
    ReviewUpdate,
    VideoLocationSuggestRequest,
    VideoLocationUpdate,
    VideoRead,
)
from app.utils import safe_filename


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    ensure_data_dirs(settings)
    repo = Repository(settings.db_path)
    repo.initialize()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    ensure_data_dirs(settings)
    api = FastAPI(title=settings.app_name, lifespan=lifespan)
    api.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    api.mount("/files/uploads", StaticFiles(directory=str(settings.uploads_dir)), name="uploads")
    api.mount("/files/frames", StaticFiles(directory=str(settings.frames_dir)), name="frames")
    api.mount("/files/reports", StaticFiles(directory=str(settings.reports_dir)), name="reports")

    @api.get("/api/health")
    def health() -> Dict[str, str]:
        return {"status": "ok"}

    @api.get("/api/models", response_model=List[ModelRead])
    def list_models(app_settings: Settings = Depends(get_app_settings)) -> List[Dict[str, Any]]:
        return [model_payload(app_settings, spec) for spec in list_model_specs()]

    @api.post("/api/videos/upload", response_model=VideoRead, status_code=201)
    async def upload_video(
        file: UploadFile = File(...),
        meter_start: Optional[float] = Form(None),
        meter_end: Optional[float] = Form(None),
        route_name: Optional[str] = Form(None),
        pipe_diameter: Optional[str] = Form(None),
        pipe_material: Optional[str] = Form(None),
        inspection_date: Optional[str] = Form(None),
        location_label: Optional[str] = Form(None),
        location_address: Optional[str] = Form(None),
        location_latitude: Optional[float] = Form(None),
        location_longitude: Optional[float] = Form(None),
        repo: Repository = Depends(get_repo),
        app_settings: Settings = Depends(get_app_settings),
    ) -> Dict[str, Any]:
        original_name = safe_filename(file.filename or "video.mp4")
        stored_name = f"{uuid.uuid4()}_{original_name}"
        target_path = app_settings.uploads_dir / stored_name
        size = 0
        with target_path.open("wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                output.write(chunk)
        await file.close()

        if size == 0:
            target_path.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Uploaded video is empty")

        metadata = probe_video(target_path)
        preview_filename = None
        preview_path = create_browser_preview(
            source_path=target_path,
            target_path=app_settings.uploads_dir / f"{target_path.stem}_preview.mp4",
        )
        if preview_path is not None:
            preview_filename = preview_path.name
        video = repo.create_video(
            original_filename=original_name,
            stored_filename=stored_name,
            preview_filename=preview_filename,
            content_type=file.content_type,
            path=target_path,
            size_bytes=size,
            metadata=metadata,
            meter_start=meter_start,
            meter_end=meter_end,
            route_name=clean_optional(route_name),
            pipe_diameter=clean_optional(pipe_diameter),
            pipe_material=clean_optional(pipe_material),
            inspection_date=clean_optional(inspection_date),
            location=location_service.location_from_upload(
                label=location_label,
                address=location_address,
                latitude=location_latitude,
                longitude=location_longitude,
            ),
            overlay=overlay_service.extract_overlay_metadata(
                target_path,
                app_settings.location_ocr_max_frames,
            ),
        )
        return video_payload(video)

    @api.get("/api/videos", response_model=List[VideoRead])
    def list_videos(repo: Repository = Depends(get_repo)) -> List[Dict[str, Any]]:
        return [video_payload(video) for video in repo.list_videos()]

    @api.get("/api/videos/{video_id}", response_model=VideoRead)
    def get_video(video_id: str, repo: Repository = Depends(get_repo)) -> Dict[str, Any]:
        video = repo.get_video(video_id)
        if video is None:
            raise HTTPException(status_code=404, detail="Video not found")
        return video_payload(video)

    @api.patch("/api/videos/{video_id}/location", response_model=VideoRead)
    def update_video_location(
        video_id: str,
        location: VideoLocationUpdate,
        repo: Repository = Depends(get_repo),
    ) -> Dict[str, Any]:
        if repo.get_video(video_id) is None:
            raise HTTPException(status_code=404, detail="Video not found")
        try:
            normalized = location_service.normalize_location(location.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        video = repo.update_video_location(video_id, normalized)
        if video is None:
            raise HTTPException(status_code=404, detail="Video not found")
        return video_payload(video)

    @api.post("/api/videos/{video_id}/location/suggest", response_model=VideoRead)
    def suggest_video_location(
        video_id: str,
        request: Optional[VideoLocationSuggestRequest] = Body(default=None),
        repo: Repository = Depends(get_repo),
        app_settings: Settings = Depends(get_app_settings),
    ) -> Dict[str, Any]:
        video = repo.get_video(video_id)
        if video is None:
            raise HTTPException(status_code=404, detail="Video not found")
        suggestion = location_service.suggest_video_location(
            video=video,
            settings=app_settings,
            repo=repo,
            query=request.query if request else None,
        )
        updated = repo.update_video_location(video_id, suggestion)
        if updated is None:
            raise HTTPException(status_code=404, detail="Video not found")
        return video_payload(updated)

    @api.post("/api/videos/{video_id}/analyze", response_model=JobRead, status_code=202)
    def analyze_video(
        video_id: str,
        request: Optional[AnalyzeRequest] = Body(default=None),
        repo: Repository = Depends(get_repo),
    ) -> Dict[str, Any]:
        if repo.get_video(video_id) is None:
            raise HTTPException(status_code=404, detail="Video not found")
        model_id = request.model_id if request and request.model_id else DEFAULT_MODEL_ID
        if get_public_model_spec(model_id) is None:
            raise HTTPException(status_code=400, detail=f"Unknown model_id: {model_id}")
        job = repo.create_job(video_id, model_id=model_id)
        try:
            rq_job_id = enqueue_analysis_job(job["id"])
            repo.update_job(job["id"], rq_job_id=rq_job_id)
        except RedisError as exc:
            repo.update_job(
                job["id"],
                status="failed",
                progress=100,
                message="Queue unavailable",
                error=str(exc),
            )
            raise HTTPException(status_code=503, detail="Redis queue unavailable") from exc
        except Exception:
            raise
        latest = repo.get_job(job["id"])
        if latest is None:
            raise HTTPException(status_code=500, detail="Job disappeared")
        return latest

    @api.get("/api/videos/{video_id}/jobs/latest", response_model=Optional[JobRead])
    def get_latest_video_job(
        video_id: str,
        repo: Repository = Depends(get_repo),
    ) -> Optional[Dict[str, Any]]:
        if repo.get_video(video_id) is None:
            raise HTTPException(status_code=404, detail="Video not found")
        return repo.get_latest_job_for_video(video_id)

    @api.get("/api/jobs/active", response_model=List[JobRead])
    def list_active_jobs(repo: Repository = Depends(get_repo)) -> List[Dict[str, Any]]:
        return [
            job
            for job in repo.list_active_jobs()
            if get_public_model_spec(job.get("model_id", "")) is not None
        ]

    @api.get("/api/jobs/{job_id}", response_model=JobRead)
    def get_job(job_id: str, repo: Repository = Depends(get_repo)) -> Dict[str, Any]:
        job = repo.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return job

    @api.websocket("/api/jobs/{job_id}/stream")
    async def stream_job(websocket: WebSocket, job_id: str) -> None:
        await websocket.accept()
        repo = get_repo()
        app_settings = get_settings()
        max_ticks = max(600, int(app_settings.job_timeout_seconds / 0.25) + 10)
        for _ in range(max_ticks):
            job = repo.get_job(job_id)
            if job is None:
                await websocket.send_json({"status": "missing", "error": "Job not found"})
                await websocket.close(code=1008)
                return
            await websocket.send_json(job)
            if job["status"] in {"completed", "failed"}:
                await websocket.close()
                return
            await asyncio.sleep(0.25)
        await websocket.close(code=1001)

    @api.get("/api/videos/{video_id}/events", response_model=List[EventRead])
    def list_events(video_id: str, repo: Repository = Depends(get_repo)) -> List[Dict[str, Any]]:
        if repo.get_video(video_id) is None:
            raise HTTPException(status_code=404, detail="Video not found")
        return repo.list_events(video_id)

    @api.patch("/api/events/{event_id}/review", response_model=EventRead)
    def review_event(
        event_id: str,
        review: ReviewUpdate,
        repo: Repository = Depends(get_repo),
    ) -> Dict[str, Any]:
        try:
            event = repo.update_event_review(
                event_id=event_id,
                status=review.status,
                note=review.note,
                class_name=review.class_name,
                confidence=review.confidence,
                reminder_due_at=review.reminder_due_at,
                resolve_reminder=review.resolve_reminder,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if event is None:
            raise HTTPException(status_code=404, detail="Event not found")
        return event

    @api.get("/api/videos/{video_id}/report", response_model=ReportRead)
    def get_report(
        video_id: str,
        repo: Repository = Depends(get_repo),
        app_settings: Settings = Depends(get_app_settings),
    ) -> Dict[str, Any]:
        if repo.get_video(video_id) is None:
            raise HTTPException(status_code=404, detail="Video not found")
        return build_report(repo, app_settings, video_id)

    return api


def get_app_settings() -> Settings:
    return get_settings()


def get_repo() -> Repository:
    settings = get_settings()
    repo = Repository(settings.db_path)
    repo.initialize()
    return repo


def video_payload(video: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(video)
    playback_filename = video.get("preview_filename") or video["stored_filename"]
    payload["video_url"] = f"/files/uploads/{playback_filename}"
    payload["overlay"] = overlay_payload(video)
    payload["location"] = {
        "latitude": video.get("location_latitude"),
        "longitude": video.get("location_longitude"),
        "label": video.get("location_label"),
        "address": video.get("location_address"),
        "source": video.get("location_source"),
        "status": video.get("location_status") or "missing",
        "confidence": video.get("location_confidence"),
        "raw_text": video.get("location_raw_text"),
        "updated_at": video.get("location_updated_at"),
    }
    return payload


def overlay_payload(video: Dict[str, Any]) -> Dict[str, Any]:
    return {
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
    }


def clean_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = " ".join(value.split())
    return cleaned or None


app = create_app()
