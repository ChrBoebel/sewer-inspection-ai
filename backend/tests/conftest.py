import os
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("APP_QUEUE_MODE", "sync")
    monkeypatch.setenv("APP_ANALYSIS_MAX_FRAMES", "8")
    monkeypatch.setenv("APP_ANALYSIS_SAMPLE_FPS", "2")
    from app.main import create_app

    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture()
def sample_video(tmp_path: Path) -> Path:
    path = tmp_path / "sample.mp4"
    writer = cv2.VideoWriter(
        str(path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        5.0,
        (160, 120),
    )
    for index in range(15):
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        frame[:] = (24 + index * 3, 34, 42)
        cv2.rectangle(frame, (20 + index, 35), (85 + index, 64), (80, 180, 220), -1)
        writer.write(frame)
    writer.release()
    return path


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    _ = config
    skip_smoke = pytest.mark.skip(reason="Set RUN_TRAIN_SMOKE=1 to run Ultralytics smoke train")
    skip_external = pytest.mark.skip(reason="Set RUN_EXTERNAL_MODEL=1 to run ISWDS ONNX smoke")
    for item in items:
        if "train_smoke" in item.keywords and os.getenv("RUN_TRAIN_SMOKE") != "1":
            item.add_marker(skip_smoke)
        if "external_model" in item.keywords and os.getenv("RUN_EXTERNAL_MODEL") != "1":
            item.add_marker(skip_external)
