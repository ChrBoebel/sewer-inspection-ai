import threading
from pathlib import Path

import numpy as np
import pytest
from app.analysis.detectors import (
    DetectionResult,
    OnnxRtDetrDetector,
    OnnxYoloDetector,
    PlaceholderDetector,
    RoutedEnsembleDetector,
    YoloDetector,
)
from app.analysis.event_engine import group_detections_into_events
from app.analysis.model_registry import (
    DEFAULT_MODEL_ID,
    HYBRID_MODEL_ID,
    PLACEHOLDER_MODEL_ID,
    ensure_model_file,
    get_model_spec,
    list_model_specs,
    model_payload,
)
from app.analysis.video import sampled_frames
from app.config import Settings


@pytest.fixture()
def settings_for_models(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Settings:
    monkeypatch.setenv("APP_DATA_DIR", str(tmp_path / "data"))
    return Settings.from_env()


def test_placeholder_detector_is_deterministic() -> None:
    detector = PlaceholderDetector()
    frame = np.zeros((120, 160, 3), dtype=np.uint8)
    context = {"frame_index": 4}
    first = detector.predict_frame(frame, context)
    second = detector.predict_frame(frame, context)
    assert first == second
    assert first[0].class_name == "crack"
    assert first[0].confidence > 0.65
    assert len(first[0].bbox) == 4


def test_yolo_detector_requires_checkpoint(tmp_path) -> None:
    with pytest.raises(FileNotFoundError):
        YoloDetector(tmp_path / "missing-best.pt")


def test_model_registry_reports_cache_status(settings_for_models: Settings) -> None:
    specs = list_model_specs()
    assert [spec.id for spec in specs] == [PLACEHOLDER_MODEL_ID, HYBRID_MODEL_ID]
    assert DEFAULT_MODEL_ID == PLACEHOLDER_MODEL_ID
    sewer_spec = get_model_spec("sewer-yolo26m")
    assert sewer_spec is not None
    sewer_payload = model_payload(settings_for_models, sewer_spec)
    # Gewichte werden mit diesem Repo nicht ausgeliefert — siehe DATA.md.
    assert sewer_payload["cached"] is False
    assert sewer_payload["lazy_download"] is False
    assert "roots" in sewer_payload["classes"]

    hybrid_spec = get_model_spec(HYBRID_MODEL_ID)
    assert hybrid_spec is not None
    hybrid_payload = model_payload(settings_for_models, hybrid_spec)
    assert hybrid_payload["cached"] is False
    assert hybrid_payload["lazy_download"] is False
    assert "connection_defect" in hybrid_payload["classes"]

    spec = get_model_spec("iswds-yolov8n")
    assert spec is not None
    payload = model_payload(settings_for_models, spec)
    assert payload["lazy_download"] is True
    assert payload["cached"] is False
    assert "cracks_breaks_collapses" in payload["classes"]


def test_ensure_model_file_uses_existing_cache(tmp_path, settings_for_models: Settings) -> None:
    spec = get_model_spec("iswds-yolov8n")
    assert spec is not None
    cached = tmp_path / "data" / "models" / "iswds" / spec.filename
    cached.parent.mkdir(parents=True)
    cached.write_bytes(b"fake-onnx")
    assert ensure_model_file(settings_for_models, spec) == cached


def test_ensure_model_file_reports_missing_local_checkpoint(
    settings_for_models: Settings,
) -> None:
    spec = get_model_spec("sewer-yolo26m")
    assert spec is not None
    with pytest.raises(FileNotFoundError):
        ensure_model_file(settings_for_models, spec)


def test_routed_ensemble_filters_routes_and_removes_duplicate_boxes() -> None:
    frame = np.zeros((120, 160, 3), dtype=np.uint8)
    detector = RoutedEnsembleDetector(
        routes=[
            (FakeDetector("roots", [10, 10, 50, 50], 0.8), {"roots"}),
            (FakeDetector("deposit", [12, 12, 52, 52], 0.9), {"deposit"}),
            (FakeDetector("roots", [11, 11, 51, 51], 0.7), {"deposit"}),
        ],
    )

    detections = detector.predict_frame(frame, {"frame_index": 0})

    assert [detection.class_name for detection in detections] == ["deposit", "roots"]


def test_routed_ensemble_runs_routes_in_parallel() -> None:
    frame = np.zeros((120, 160, 3), dtype=np.uint8)
    barrier = threading.Barrier(2, timeout=1.0)
    detector = RoutedEnsembleDetector(
        routes=[
            (BlockingFakeDetector("roots", barrier), {"roots"}),
            (BlockingFakeDetector("deposit", barrier), {"deposit"}),
        ],
    )

    detections = detector.predict_frame(frame, {"frame_index": 0})

    assert [detection.class_name for detection in detections] == ["deposit", "roots"]


def test_onnx_yolo_postprocess_maps_boxes_to_frame() -> None:
    session = FakeYoloSession()
    detector = OnnxYoloDetector(
        model_path=Path("unused.onnx"),
        confidence_threshold=0.25,
        session=session,
    )
    frame = np.zeros((640, 640, 3), dtype=np.uint8)
    detections = detector.predict_frame(frame, {"frame_index": 0})
    assert len(detections) == 1
    assert detections[0].class_name == "roots"
    assert detections[0].confidence == pytest.approx(0.91)
    assert detections[0].bbox == pytest.approx([270.0, 295.0, 370.0, 345.0])


def test_onnx_rtdetr_postprocess_clips_boxes() -> None:
    detector = OnnxRtDetrDetector(
        model_path=Path("unused.onnx"),
        confidence_threshold=0.25,
        session=FakeRtDetrSession(),
    )
    frame = np.zeros((120, 160, 3), dtype=np.uint8)
    detections = detector.predict_frame(frame, {"frame_index": 0})
    assert len(detections) == 1
    assert detections[0].class_name == "displaced_joint"
    assert detections[0].bbox == pytest.approx([0.0, 20.0, 160.0, 120.0])


def test_event_engine_groups_by_class_and_gap() -> None:
    detections = [
        {
            "frame_index": 0,
            "timestamp_seconds": 0.0,
            "meter": 0.0,
            "class_name": "crack",
            "confidence": 0.7,
            "bbox": [1, 2, 3, 4],
        },
        {
            "frame_index": 5,
            "timestamp_seconds": 1.0,
            "meter": 1.0,
            "class_name": "crack",
            "confidence": 0.8,
            "bbox": [2, 3, 4, 5],
        },
        {
            "frame_index": 20,
            "timestamp_seconds": 8.0,
            "meter": 8.0,
            "class_name": "crack",
            "confidence": 0.75,
            "bbox": [3, 4, 5, 6],
        },
    ]

    events = group_detections_into_events(detections, max_gap_seconds=2.0)
    assert len(events) == 2
    assert events[0]["detection_count"] == 2
    assert events[0]["confidence"] == 0.8
    assert events[1]["start_time_seconds"] == 8.0


def test_sampled_frames_cover_full_video(sample_video: Path) -> None:
    frames = list(sampled_frames(sample_video, sample_fps=5.0, max_frames=3))
    assert len(frames) == 3
    timestamps = [timestamp for _, timestamp, _ in frames]
    assert timestamps[0] == pytest.approx(0.0)
    assert timestamps[-1] > 1.5


def test_sampled_frames_can_use_exact_frame_stride(sample_video: Path) -> None:
    frames = list(
        sampled_frames(
            sample_video,
            sample_fps=1.0,
            max_frames=3,
            frame_stride=5,
        )
    )
    assert [frame_index for frame_index, _, _ in frames] == [0, 5, 10]


class FakeInput:
    name = "images"
    shape = [1, 3, 640, 640]


class FakeYoloSession:
    def get_inputs(self):
        return [FakeInput()]

    def run(self, output_names, feeds):
        _ = output_names, feeds
        output = np.zeros((1, 12, 1), dtype=np.float32)
        output[0, 0:4, 0] = [320.0, 320.0, 100.0, 50.0]
        output[0, 4 + 2, 0] = 0.91
        return [output]


class FakeRtDetrSession:
    def get_inputs(self):
        return [FakeInput(), FakeRtDetrSizeInput()]

    def run(self, output_names, feeds):
        _ = output_names
        assert "orig_target_sizes" in feeds
        labels = np.array([[3]], dtype=np.int64)
        boxes = np.array([[[-10.0, 20.0, 210.0, 140.0]]], dtype=np.float32)
        scores = np.array([[0.82]], dtype=np.float32)
        return [labels, boxes, scores]


class FakeRtDetrSizeInput:
    name = "orig_target_sizes"
    shape = [1, 2]


class FakeDetector:
    def __init__(self, class_name: str, bbox: list, confidence: float):
        self.class_name = class_name
        self.bbox = bbox
        self.confidence = confidence

    def predict_frame(self, frame, context):
        _ = frame, context
        return [
            DetectionResult(
                class_name=self.class_name,
                confidence=self.confidence,
                bbox=self.bbox,
            )
        ]


class BlockingFakeDetector:
    def __init__(self, class_name: str, barrier: threading.Barrier):
        self.class_name = class_name
        self.barrier = barrier

    def predict_frame(self, frame, context):
        _ = frame, context
        self.barrier.wait()
        return [
            DetectionResult(
                class_name=self.class_name,
                confidence=0.8,
                bbox=[10, 10, 50, 50],
            )
        ]
