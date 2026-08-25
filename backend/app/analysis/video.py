import subprocess
from pathlib import Path
from typing import Dict, Generator, Optional, Tuple

import cv2
import numpy as np


def probe_video(path: Path) -> Dict[str, Optional[float]]:
    capture = cv2.VideoCapture(str(path))
    try:
        if not capture.isOpened():
            return {
                "duration_seconds": None,
                "fps": None,
                "width": None,
                "height": None,
            }

        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
        frame_count = float(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0)
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        duration = frame_count / fps if fps > 0 and frame_count > 0 else None
        return {
            "duration_seconds": duration,
            "fps": fps or None,
            "width": float(width) if width else None,
            "height": float(height) if height else None,
        }
    finally:
        capture.release()


def sampled_frames(
    path: Path,
    sample_fps: float,
    max_frames: int,
    frame_stride: int = 0,
) -> Generator[Tuple[int, float, np.ndarray], None, None]:
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise ValueError(f"Could not open video: {path}")

    try:
        fps = float(capture.get(cv2.CAP_PROP_FPS) or sample_fps or 1.0)
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        interval = (
            max(int(frame_stride), 1)
            if frame_stride > 0
            else max(int(round(fps / max(sample_fps, 0.1))), 1)
        )
        if frame_stride > 0:
            frame_index = 0
            sampled = 0
            while max_frames <= 0 or sampled < max_frames:
                ok, frame = capture.read()
                if not ok:
                    break
                if frame_index % interval == 0:
                    timestamp = frame_index / fps if fps > 0 else 0.0
                    yield frame_index, timestamp, frame
                    sampled += 1
                frame_index += 1
            return

        if frame_count > 0:
            candidate_indices = list(range(0, frame_count, interval))
            if not candidate_indices:
                return
            if max_frames > 0 and len(candidate_indices) > max_frames:
                positions = np.linspace(
                    0,
                    len(candidate_indices) - 1,
                    max_frames,
                    dtype=int,
                )
                target_indices = [candidate_indices[int(position)] for position in positions]
            else:
                target_indices = candidate_indices

            previous_index = -1
            for frame_index in target_indices:
                if frame_index <= previous_index:
                    continue
                capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
                ok, frame = capture.read()
                if not ok:
                    continue
                timestamp = frame_index / fps if fps > 0 else 0.0
                yield frame_index, timestamp, frame
                previous_index = frame_index
            return

        frame_index = 0
        sampled = 0

        while max_frames <= 0 or sampled < max_frames:
            ok, frame = capture.read()
            if not ok:
                break
            if frame_index % interval == 0:
                timestamp = frame_index / fps if fps > 0 else sampled / max(sample_fps, 0.1)
                yield frame_index, timestamp, frame
                sampled += 1
            frame_index += 1
    finally:
        capture.release()


def create_browser_preview(source_path: Path, target_path: Path) -> Optional[Path]:
    """Create an H.264 MP4 preview for browser playback."""
    if source_path.suffix.lower() == ".mp4":
        return None

    target_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source_path),
        "-map",
        "0:v:0",
        "-an",
        "-vf",
        "scale='min(960,iw)':-2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(target_path),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True)
    except (OSError, subprocess.CalledProcessError):
        target_path.unlink(missing_ok=True)
        return None
    return target_path if target_path.exists() else None
