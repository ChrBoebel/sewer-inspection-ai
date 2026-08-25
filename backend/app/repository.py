import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from app.utils import now_iso


def _parse_iso_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _is_due(due_at: str, now: str) -> bool:
    try:
        return _parse_iso_datetime(due_at) <= _parse_iso_datetime(now)
    except ValueError:
        return False


class Repository:
    def __init__(self, db_path: Path):
        self.db_path = db_path

    def _connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def initialize(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS videos (
                    id TEXT PRIMARY KEY,
                    original_filename TEXT NOT NULL,
                    stored_filename TEXT NOT NULL,
                    preview_filename TEXT,
                    content_type TEXT,
                    path TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    duration_seconds REAL,
                    fps REAL,
                    width INTEGER,
                    height INTEGER,
                    meter_start REAL,
                    meter_end REAL,
                    route_name TEXT,
                    pipe_diameter TEXT,
                    pipe_material TEXT,
                    inspection_date TEXT,
                    location_latitude REAL,
                    location_longitude REAL,
                    location_label TEXT,
                    location_address TEXT,
                    location_source TEXT,
                    location_status TEXT NOT NULL DEFAULT 'missing',
                    location_confidence REAL,
                    location_raw_text TEXT,
                    location_updated_at TEXT,
                    overlay_raw_text TEXT,
                    overlay_confidence REAL,
                    overlay_street TEXT,
                    overlay_city TEXT,
                    overlay_dn TEXT,
                    overlay_material TEXT,
                    overlay_distance_m REAL,
                    overlay_direction TEXT,
                    overlay_inspection_date TEXT,
                    overlay_inspection_time TEXT,
                    overlay_upstream_id TEXT,
                    overlay_downstream_id TEXT,
                    overlay_clock_position TEXT,
                    overlay_tilt_percent REAL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS jobs (
                    id TEXT PRIMARY KEY,
                    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
                    model_id TEXT NOT NULL DEFAULT 'placeholder',
                    status TEXT NOT NULL,
                    progress INTEGER NOT NULL,
                    message TEXT,
                    error TEXT,
                    rq_job_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT
                );

                CREATE TABLE IF NOT EXISTS events (
                    id TEXT PRIMARY KEY,
                    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
                    class_name TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    bbox_json TEXT NOT NULL,
                    start_time_seconds REAL NOT NULL,
                    end_time_seconds REAL NOT NULL,
                    meter_start REAL,
                    meter_end REAL,
                    detection_count INTEGER NOT NULL,
                    review_status TEXT NOT NULL,
                    review_note TEXT,
                    reminder_due_at TEXT,
                    reminder_created_at TEXT,
                    reminder_resolved_at TEXT,
                    overlay_raw_text TEXT,
                    overlay_confidence REAL,
                    overlay_street TEXT,
                    overlay_city TEXT,
                    overlay_dn TEXT,
                    overlay_material TEXT,
                    overlay_distance_m REAL,
                    overlay_direction TEXT,
                    overlay_inspection_date TEXT,
                    overlay_inspection_time TEXT,
                    overlay_upstream_id TEXT,
                    overlay_downstream_id TEXT,
                    overlay_clock_position TEXT,
                    overlay_tilt_percent REAL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS detections (
                    id TEXT PRIMARY KEY,
                    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
                    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
                    frame_index INTEGER NOT NULL,
                    timestamp_seconds REAL NOT NULL,
                    meter REAL,
                    class_name TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    bbox_json TEXT NOT NULL,
                    mask_path TEXT,
                    source_model TEXT NOT NULL DEFAULT 'unknown'
                );

                CREATE TABLE IF NOT EXISTS reviews (
                    id TEXT PRIMARY KEY,
                    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
                    status TEXT NOT NULL,
                    note TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS reports (
                    id TEXT PRIMARY KEY,
                    video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
                    path TEXT NOT NULL,
                    generated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS geocode_cache (
                    query TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_jobs_video_id ON jobs(video_id);
                CREATE INDEX IF NOT EXISTS idx_events_video_id ON events(video_id);
                CREATE INDEX IF NOT EXISTS idx_detections_video_id ON detections(video_id);
                """
            )
            self._ensure_column(
                conn,
                table_name="jobs",
                column_name="model_id",
                definition="TEXT NOT NULL DEFAULT 'placeholder'",
            )
            self._ensure_column(
                conn,
                table_name="videos",
                column_name="preview_filename",
                definition="TEXT",
            )
            self._ensure_column(
                conn,
                table_name="detections",
                column_name="source_model",
                definition="TEXT NOT NULL DEFAULT 'unknown'",
            )
            for column_name, definition in {
                "route_name": "TEXT",
                "pipe_diameter": "TEXT",
                "pipe_material": "TEXT",
                "inspection_date": "TEXT",
                "location_latitude": "REAL",
                "location_longitude": "REAL",
                "location_label": "TEXT",
                "location_address": "TEXT",
                "location_source": "TEXT",
                "location_status": "TEXT NOT NULL DEFAULT 'missing'",
                "location_confidence": "REAL",
                "location_raw_text": "TEXT",
                "location_updated_at": "TEXT",
                "overlay_raw_text": "TEXT",
                "overlay_confidence": "REAL",
                "overlay_street": "TEXT",
                "overlay_city": "TEXT",
                "overlay_dn": "TEXT",
                "overlay_material": "TEXT",
                "overlay_distance_m": "REAL",
                "overlay_direction": "TEXT",
                "overlay_inspection_date": "TEXT",
                "overlay_inspection_time": "TEXT",
                "overlay_upstream_id": "TEXT",
                "overlay_downstream_id": "TEXT",
                "overlay_clock_position": "TEXT",
                "overlay_tilt_percent": "REAL",
            }.items():
                self._ensure_column(
                    conn,
                    table_name="videos",
                    column_name=column_name,
                    definition=definition,
                )
            for column_name, definition in {
                "overlay_raw_text": "TEXT",
                "overlay_confidence": "REAL",
                "overlay_street": "TEXT",
                "overlay_city": "TEXT",
                "overlay_dn": "TEXT",
                "overlay_material": "TEXT",
                "overlay_distance_m": "REAL",
                "overlay_direction": "TEXT",
                "overlay_inspection_date": "TEXT",
                "overlay_inspection_time": "TEXT",
                "overlay_upstream_id": "TEXT",
                "overlay_downstream_id": "TEXT",
                "overlay_clock_position": "TEXT",
                "overlay_tilt_percent": "REAL",
                "reminder_due_at": "TEXT",
                "reminder_created_at": "TEXT",
                "reminder_resolved_at": "TEXT",
            }.items():
                self._ensure_column(
                    conn,
                    table_name="events",
                    column_name=column_name,
                    definition=definition,
                )

    def create_video(
        self,
        original_filename: str,
        stored_filename: str,
        preview_filename: Optional[str],
        content_type: Optional[str],
        path: Path,
        size_bytes: int,
        metadata: Dict[str, Optional[float]],
        meter_start: Optional[float],
        meter_end: Optional[float],
        route_name: Optional[str] = None,
        pipe_diameter: Optional[str] = None,
        pipe_material: Optional[str] = None,
        inspection_date: Optional[str] = None,
        location: Optional[Dict[str, Any]] = None,
        overlay: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        video_id = str(uuid.uuid4())
        created_at = now_iso()
        location = location or {}
        overlay = overlay or {}
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO videos (
                    id, original_filename, stored_filename, preview_filename, content_type, path,
                    size_bytes, duration_seconds, fps, width, height, meter_start, meter_end,
                    route_name, pipe_diameter, pipe_material, inspection_date,
                    location_latitude, location_longitude, location_label, location_address,
                    location_source, location_status, location_confidence, location_raw_text,
                    location_updated_at, overlay_raw_text, overlay_confidence, overlay_street,
                    overlay_city, overlay_dn, overlay_material, overlay_distance_m,
                    overlay_direction, overlay_inspection_date, overlay_inspection_time,
                    overlay_upstream_id, overlay_downstream_id, overlay_clock_position,
                    overlay_tilt_percent,
                    created_at
                )
                VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
                """,
                (
                    video_id,
                    original_filename,
                    stored_filename,
                    preview_filename,
                    content_type,
                    str(path),
                    size_bytes,
                    metadata.get("duration_seconds"),
                    metadata.get("fps"),
                    metadata.get("width"),
                    metadata.get("height"),
                    meter_start,
                    meter_end,
                    route_name,
                    pipe_diameter,
                    pipe_material,
                    inspection_date,
                    location.get("latitude"),
                    location.get("longitude"),
                    location.get("label"),
                    location.get("address"),
                    location.get("source"),
                    location.get("status", "missing"),
                    location.get("confidence"),
                    location.get("raw_text"),
                    location.get("updated_at"),
                    overlay.get("raw_text"),
                    overlay.get("confidence"),
                    overlay.get("street"),
                    overlay.get("city"),
                    overlay.get("dn"),
                    overlay.get("material"),
                    overlay.get("distance_m"),
                    overlay.get("direction"),
                    overlay.get("inspection_date"),
                    overlay.get("inspection_time"),
                    overlay.get("upstream_id"),
                    overlay.get("downstream_id"),
                    overlay.get("clock_position"),
                    overlay.get("tilt_percent"),
                    created_at,
                ),
            )
        video = self.get_video(video_id)
        if video is None:
            raise RuntimeError("Video insert failed")
        return video

    def update_video_metadata(self, video_id: str, metadata: Dict[str, Optional[float]]) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE videos
                SET duration_seconds = ?, fps = ?, width = ?, height = ?
                WHERE id = ?
                """,
                (
                    metadata.get("duration_seconds"),
                    metadata.get("fps"),
                    metadata.get("width"),
                    metadata.get("height"),
                    video_id,
                ),
            )

    def list_videos(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM videos ORDER BY created_at DESC").fetchall()
        return [dict(row) for row in rows]

    def get_video(self, video_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
        return dict(row) if row else None

    def update_video_location(
        self,
        video_id: str,
        location: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        now = now_iso()
        with self._connect() as conn:
            result = conn.execute(
                """
                UPDATE videos
                SET location_latitude = ?,
                    location_longitude = ?,
                    location_label = ?,
                    location_address = ?,
                    location_source = ?,
                    location_status = ?,
                    location_confidence = ?,
                    location_raw_text = ?,
                    location_updated_at = ?
                WHERE id = ?
                """,
                (
                    location.get("latitude"),
                    location.get("longitude"),
                    location.get("label"),
                    location.get("address"),
                    location.get("source"),
                    location.get("status", "missing"),
                    location.get("confidence"),
                    location.get("raw_text"),
                    now,
                    video_id,
                ),
            )
            if result.rowcount == 0:
                return None
        return self.get_video(video_id)

    def get_geocode_cache(self, query: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json FROM geocode_cache WHERE query = ?",
                (query,),
            ).fetchone()
        if row is None:
            return None
        return json.loads(row["payload_json"])

    def set_geocode_cache(self, query: str, payload: Dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO geocode_cache (query, payload_json, created_at)
                VALUES (?, ?, ?)
                ON CONFLICT(query) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    created_at = excluded.created_at
                """,
                (query, json.dumps(payload), now_iso()),
            )

    def create_job(
        self,
        video_id: str,
        model_id: str = "placeholder",
    ) -> Dict[str, Any]:
        job_id = str(uuid.uuid4())
        created_at = now_iso()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO jobs (
                    id, video_id, model_id, status, progress, message, error, rq_job_id,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    video_id,
                    model_id,
                    "queued",
                    0,
                    "Job queued",
                    None,
                    None,
                    created_at,
                    created_at,
                ),
            )
        job = self.get_job(job_id)
        if job is None:
            raise RuntimeError("Job insert failed")
        return job

    @staticmethod
    def _ensure_column(
        conn: sqlite3.Connection,
        table_name: str,
        column_name: str,
        definition: str,
    ) -> None:
        columns = {
            row["name"]
            for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        }
        if column_name not in columns:
            conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")

    def update_job(self, job_id: str, **fields: Any) -> None:
        allowed = {
            "status",
            "progress",
            "message",
            "error",
            "rq_job_id",
            "started_at",
            "completed_at",
        }
        updates = {key: value for key, value in fields.items() if key in allowed}
        updates["updated_at"] = now_iso()
        if not updates:
            return
        assignments = ", ".join(f"{key} = ?" for key in updates)
        values = list(updates.values()) + [job_id]
        with self._connect() as conn:
            conn.execute(f"UPDATE jobs SET {assignments} WHERE id = ?", values)

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None

    def get_latest_job_for_video(self, video_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM jobs
                WHERE video_id = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (video_id,),
            ).fetchone()
        return dict(row) if row else None

    def list_active_jobs(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM jobs
                WHERE status IN ('queued', 'running')
                ORDER BY created_at DESC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def replace_analysis_results(
        self,
        video_id: str,
        events: Iterable[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        now = now_iso()
        created_events: List[Dict[str, Any]] = []
        with self._connect() as conn:
            conn.execute("DELETE FROM reports WHERE video_id = ?", (video_id,))
            conn.execute("DELETE FROM detections WHERE video_id = ?", (video_id,))
            conn.execute("DELETE FROM events WHERE video_id = ?", (video_id,))
            for event in events:
                event_id = str(uuid.uuid4())
                overlay = event.get("overlay") or {}
                conn.execute(
                    """
                    INSERT INTO events (
                        id, video_id, class_name, confidence, bbox_json,
                        start_time_seconds, end_time_seconds, meter_start, meter_end,
                        detection_count, review_status, review_note,
                        overlay_raw_text, overlay_confidence, overlay_street, overlay_city,
                        overlay_dn, overlay_material, overlay_distance_m, overlay_direction,
                        overlay_inspection_date, overlay_inspection_time, overlay_upstream_id,
                        overlay_downstream_id, overlay_clock_position, overlay_tilt_percent,
                        created_at, updated_at
                    )
                    VALUES (
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?, ?, ?, ?
                    )
                    """,
                    (
                        event_id,
                        video_id,
                        event["class_name"],
                        event["confidence"],
                        json.dumps(event["bbox"]),
                        event["start_time_seconds"],
                        event["end_time_seconds"],
                        event.get("meter_start"),
                        event.get("meter_end"),
                        event["detection_count"],
                        "pending",
                        None,
                        overlay.get("raw_text"),
                        overlay.get("confidence"),
                        overlay.get("street"),
                        overlay.get("city"),
                        overlay.get("dn"),
                        overlay.get("material"),
                        overlay.get("distance_m"),
                        overlay.get("direction"),
                        overlay.get("inspection_date"),
                        overlay.get("inspection_time"),
                        overlay.get("upstream_id"),
                        overlay.get("downstream_id"),
                        overlay.get("clock_position"),
                        overlay.get("tilt_percent"),
                        now,
                        now,
                    ),
                )
                for detection in event["detections"]:
                    conn.execute(
                        """
                        INSERT INTO detections (
                            id, event_id, video_id, frame_index, timestamp_seconds, meter,
                            class_name, confidence, bbox_json, mask_path, source_model
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            str(uuid.uuid4()),
                            event_id,
                            video_id,
                            detection["frame_index"],
                            detection["timestamp_seconds"],
                            detection.get("meter"),
                            detection["class_name"],
                            detection["confidence"],
                            json.dumps(detection["bbox"]),
                            detection.get("mask_path"),
                            detection.get("source_model", "unknown"),
                        ),
                    )
                created_events.append({"id": event_id})
        return self.list_events(video_id)

    def list_events(self, video_id: str) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT
                    events.*,
                    (
                        SELECT detections.frame_index
                        FROM detections
                        WHERE detections.event_id = events.id
                        ORDER BY detections.confidence DESC, detections.timestamp_seconds ASC
                        LIMIT 1
                    ) AS snapshot_frame_index
                FROM events
                WHERE events.video_id = ?
                ORDER BY events.start_time_seconds ASC
                """,
                (video_id,),
            ).fetchall()
        events = [self._event_from_row(row) for row in rows]
        self._attach_snapshot_detections(events)
        return events

    def get_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                    events.*,
                    (
                        SELECT detections.frame_index
                        FROM detections
                        WHERE detections.event_id = events.id
                        ORDER BY detections.confidence DESC, detections.timestamp_seconds ASC
                        LIMIT 1
                    ) AS snapshot_frame_index
                FROM events
                WHERE events.id = ?
                """,
                (event_id,),
            ).fetchone()
        if row is None:
            return None
        event = self._event_from_row(row)
        self._attach_snapshot_detections([event])
        return event

    def update_event_review(
        self,
        event_id: str,
        status: str,
        note: Optional[str],
        class_name: Optional[str] = None,
        confidence: Optional[float] = None,
        reminder_due_at: Optional[str] = None,
        resolve_reminder: bool = False,
    ) -> Optional[Dict[str, Any]]:
        allowed_statuses = {"pending", "accepted", "edited", "rejected"}
        if status not in allowed_statuses:
            raise ValueError("Invalid review status")
        current = self.get_event(event_id)
        if current is None:
            return None
        next_class = class_name or current["class_name"]
        next_confidence = confidence if confidence is not None else current["confidence"]
        now = now_iso()
        next_reminder_due_at = current.get("reminder_due_at")
        next_reminder_created_at = current.get("reminder_created_at")
        next_reminder_resolved_at = current.get("reminder_resolved_at")
        if reminder_due_at is not None:
            next_reminder_due_at = reminder_due_at
            next_reminder_created_at = now
            next_reminder_resolved_at = None
        elif (
            resolve_reminder
            and current.get("reminder_due_at")
            and current.get("reminder_resolved_at") is None
            and _is_due(current["reminder_due_at"], now)
        ):
            next_reminder_resolved_at = now
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE events
                SET review_status = ?, review_note = ?, class_name = ?,
                    confidence = ?, reminder_due_at = ?, reminder_created_at = ?,
                    reminder_resolved_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    status,
                    note,
                    next_class,
                    next_confidence,
                    next_reminder_due_at,
                    next_reminder_created_at,
                    next_reminder_resolved_at,
                    now,
                    event_id,
                ),
            )
            conn.execute(
                """
                INSERT INTO reviews (id, event_id, status, note, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (str(uuid.uuid4()), event_id, status, note, now),
            )
        return self.get_event(event_id)

    def upsert_report(self, video_id: str, path: Path, generated_at: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM reports WHERE video_id = ?", (video_id,))
            conn.execute(
                "INSERT INTO reports (id, video_id, path, generated_at) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), video_id, str(path), generated_at),
            )

    def get_report_row(self, video_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM reports WHERE video_id = ? ORDER BY generated_at DESC LIMIT 1",
                (video_id,),
            ).fetchone()
        return dict(row) if row else None

    def _attach_snapshot_detections(self, events: List[Dict[str, Any]]) -> None:
        frame_keys = {
            (event["video_id"], event["snapshot_frame_index"])
            for event in events
            if event.get("snapshot_frame_index") is not None
        }
        if not frame_keys:
            for event in events:
                event["snapshot_detections"] = []
            return

        detections_by_frame: Dict[tuple[str, int], List[Dict[str, Any]]] = {
            (video_id, int(frame_index)): [] for video_id, frame_index in frame_keys
        }
        with self._connect() as conn:
            for video_id, frame_index in frame_keys:
                rows = conn.execute(
                    """
                    SELECT *
                    FROM detections
                    WHERE video_id = ? AND frame_index = ?
                    ORDER BY source_model ASC, confidence DESC, class_name ASC
                    """,
                    (video_id, frame_index),
                ).fetchall()
                detections_by_frame[(video_id, int(frame_index))] = [
                    self._detection_from_row(row) for row in rows
                ]

        for event in events:
            frame_index = event.get("snapshot_frame_index")
            event["snapshot_detections"] = (
                detections_by_frame.get((event["video_id"], int(frame_index)), [])
                if frame_index is not None
                else []
            )

    @staticmethod
    def _detection_from_row(row: sqlite3.Row) -> Dict[str, Any]:
        detection = dict(row)
        detection["bbox"] = json.loads(detection.pop("bbox_json"))
        return detection

    @staticmethod
    def _event_from_row(row: sqlite3.Row) -> Dict[str, Any]:
        event = dict(row)
        event["bbox"] = json.loads(event.pop("bbox_json"))
        event["overlay"] = {
            "raw_text": event.get("overlay_raw_text"),
            "confidence": event.get("overlay_confidence"),
            "street": event.get("overlay_street"),
            "city": event.get("overlay_city"),
            "dn": event.get("overlay_dn"),
            "material": event.get("overlay_material"),
            "distance_m": event.get("overlay_distance_m"),
            "direction": event.get("overlay_direction"),
            "inspection_date": event.get("overlay_inspection_date"),
            "inspection_time": event.get("overlay_inspection_time"),
            "upstream_id": event.get("overlay_upstream_id"),
            "downstream_id": event.get("overlay_downstream_id"),
            "clock_position": event.get("overlay_clock_position"),
            "tilt_percent": event.get("overlay_tilt_percent"),
        }
        frame_index = event.get("snapshot_frame_index")
        event["snapshot_url"] = (
            f"/files/frames/{event['video_id']}/{int(frame_index):08d}.jpg?event={event['id']}"
            if frame_index is not None
            else None
        )
        event["snapshot_detections"] = []
        return event
