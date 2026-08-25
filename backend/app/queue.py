from typing import Optional

from redis import Redis
from rq import Queue

from app.config import get_settings


def enqueue_analysis_job(job_id: str) -> Optional[str]:
    settings = get_settings()
    if settings.queue_mode == "sync":
        from app.worker import run_analysis_job

        run_analysis_job(job_id)
        return "sync"

    redis_conn = Redis.from_url(settings.redis_url)
    redis_conn.ping()
    queue = Queue(settings.queue_name, connection=redis_conn)
    rq_job = queue.enqueue(
        "app.worker.run_analysis_job",
        job_id,
        job_timeout=settings.job_timeout_seconds,
        result_ttl=settings.result_ttl_seconds,
        failure_ttl=settings.result_ttl_seconds,
    )
    return rq_job.id
