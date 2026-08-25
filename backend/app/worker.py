import os
import sys

from redis import Redis
from rq import Queue, SimpleWorker, Worker

from app.analysis.model_registry import DEFAULT_MODEL_ID
from app.analysis.pipeline import run_pipeline
from app.config import ensure_data_dirs, get_settings
from app.reporting import build_report
from app.repository import Repository
from app.utils import now_iso


def run_analysis_job(job_id: str) -> str:
    settings = get_settings()
    ensure_data_dirs(settings)
    repo = Repository(settings.db_path)
    repo.initialize()

    job = repo.get_job(job_id)
    if job is None:
        raise ValueError(f"Job not found: {job_id}")
    video = repo.get_video(job["video_id"])
    if video is None:
        repo.update_job(
            job_id,
            status="failed",
            progress=100,
            message="Video missing",
            error="Video not found",
            completed_at=now_iso(),
        )
        raise ValueError(f"Video not found: {job['video_id']}")

    repo.update_job(
        job_id,
        status="running",
        progress=3,
        message="Analysis worker started",
        error=None,
        started_at=now_iso(),
    )
    try:
        run_pipeline(
            repo=repo,
            settings=settings,
            video=video,
            job_id=job_id,
            model_id=job.get("model_id") or DEFAULT_MODEL_ID,
        )
        build_report(repo=repo, settings=settings, video_id=video["id"])
        repo.update_job(
            job_id,
            status="completed",
            progress=100,
            message="Analysis completed",
            completed_at=now_iso(),
        )
        return job_id
    except Exception as exc:
        repo.update_job(
            job_id,
            status="failed",
            progress=100,
            message="Analysis failed",
            error=str(exc),
            completed_at=now_iso(),
        )
        raise


def main() -> None:
    settings = get_settings()
    ensure_data_dirs(settings)
    repo = Repository(settings.db_path)
    repo.initialize()
    redis_conn = Redis.from_url(settings.redis_url)
    worker_class = SimpleWorker if _use_simple_worker() else Worker
    worker = worker_class(
        [Queue(settings.queue_name, connection=redis_conn)],
        connection=redis_conn,
    )
    worker.work()


def _use_simple_worker() -> bool:
    configured = os.getenv("APP_WORKER_CLASS", "").strip().lower()
    if configured in {"simple", "inline"}:
        return True
    if configured in {"fork", "worker", "default"}:
        return False
    return sys.platform == "darwin"


if __name__ == "__main__":
    main()
