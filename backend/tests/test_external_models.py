from pathlib import Path

import numpy as np
import pytest
from app.analysis.detectors import OnnxRtDetrDetector, OnnxYoloDetector
from app.analysis.model_registry import ensure_model_file, get_model_spec
from app.config import Settings


@pytest.mark.external_model
def test_iswds_yolo_and_rtdetr_cpu_smoke(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    pytest.importorskip("huggingface_hub")
    pytest.importorskip("onnxruntime")
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path / "data"))
    settings = Settings.from_env()
    frame = np.zeros((120, 160, 3), dtype=np.uint8)

    yolo_spec = get_model_spec("iswds-yolov8n")
    assert yolo_spec is not None
    yolo_path = ensure_model_file(settings, yolo_spec)
    yolo_detector = OnnxYoloDetector(yolo_path, confidence_threshold=0.0)
    assert isinstance(yolo_detector.predict_frame(frame, {"frame_index": 0}), list)

    rtdetr_spec = get_model_spec("iswds-rtdetr-v2")
    assert rtdetr_spec is not None
    rtdetr_path = ensure_model_file(settings, rtdetr_spec)
    rtdetr_detector = OnnxRtDetrDetector(rtdetr_path, confidence_threshold=0.0)
    assert isinstance(rtdetr_detector.predict_frame(frame, {"frame_index": 0}), list)
