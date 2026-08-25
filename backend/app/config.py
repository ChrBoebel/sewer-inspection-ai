import os
from dataclasses import dataclass
from pathlib import Path
from typing import List


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    app_name: str
    data_dir: Path
    db_path: Path
    uploads_dir: Path
    frames_dir: Path
    masks_dir: Path
    reports_dir: Path
    models_dir: Path
    redis_url: str
    queue_name: str
    queue_mode: str
    public_base_url: str
    allowed_origins: List[str]
    analysis_sample_fps: float
    analysis_max_frames: int
    analysis_frame_stride: int
    job_timeout_seconds: int
    result_ttl_seconds: int
    geocoder_url: str
    geocoder_user_agent: str
    geocoder_timeout_seconds: float
    location_ocr_max_frames: int

    @classmethod
    def from_env(cls) -> "Settings":
        root = project_root()
        data_dir = Path(os.getenv("APP_DATA_DIR", root / "data")).resolve()
        origins = os.getenv(
            "APP_ALLOWED_ORIGINS",
            ",".join(
                [
                    "http://localhost:3000",
                    "http://127.0.0.1:3000",
                    "http://localhost:13137",
                    "http://127.0.0.1:13137",
                ]
            ),
        )
        return cls(
            app_name="Sewer Inspection AI",
            data_dir=data_dir,
            db_path=Path(os.getenv("APP_DB_PATH", data_dir / "inspection.sqlite3")).resolve(),
            uploads_dir=Path(os.getenv("APP_UPLOADS_DIR", data_dir / "uploads")).resolve(),
            frames_dir=Path(os.getenv("APP_FRAMES_DIR", data_dir / "frames")).resolve(),
            masks_dir=Path(os.getenv("APP_MASKS_DIR", data_dir / "masks")).resolve(),
            reports_dir=Path(os.getenv("APP_REPORTS_DIR", data_dir / "reports")).resolve(),
            models_dir=Path(os.getenv("APP_MODELS_DIR", data_dir / "models")).resolve(),
            redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
            queue_name=os.getenv("APP_QUEUE_NAME", "analysis"),
            queue_mode=os.getenv("APP_QUEUE_MODE", "rq").lower(),
            public_base_url=os.getenv("APP_PUBLIC_BASE_URL", "http://localhost:8000"),
            allowed_origins=[origin.strip() for origin in origins.split(",") if origin.strip()],
            analysis_sample_fps=float(os.getenv("APP_ANALYSIS_SAMPLE_FPS", "1.0")),
            analysis_max_frames=int(os.getenv("APP_ANALYSIS_MAX_FRAMES", "30")),
            analysis_frame_stride=int(os.getenv("APP_ANALYSIS_FRAME_STRIDE", "0")),
            job_timeout_seconds=int(os.getenv("APP_JOB_TIMEOUT_SECONDS", "900")),
            result_ttl_seconds=int(os.getenv("APP_RESULT_TTL_SECONDS", "86400")),
            geocoder_url=os.getenv("APP_GEOCODER_URL", "https://nominatim.openstreetmap.org/search"),
            geocoder_user_agent=os.getenv("APP_GEOCODER_USER_AGENT", "sewer-inspection-ai/0.1"),
            geocoder_timeout_seconds=float(os.getenv("APP_GEOCODER_TIMEOUT_SECONDS", "4.0")),
            location_ocr_max_frames=int(os.getenv("APP_LOCATION_OCR_MAX_FRAMES", "6")),
        )


def get_settings() -> Settings:
    return Settings.from_env()


def ensure_data_dirs(settings: Settings) -> None:
    for directory in (
        settings.data_dir,
        settings.uploads_dir,
        settings.frames_dir,
        settings.masks_dir,
        settings.reports_dir,
        settings.models_dir,
    ):
        directory.mkdir(parents=True, exist_ok=True)
