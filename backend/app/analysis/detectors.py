from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol, Set, Tuple

import cv2
import numpy as np


@dataclass(frozen=True)
class DetectionResult:
    class_name: str
    confidence: float
    bbox: List[float]
    mask: Optional[Any] = None
    source_model: str = "unknown"


class DamageDetector(Protocol):
    def predict_frame(self, frame: np.ndarray, context: Dict[str, Any]) -> List[DetectionResult]:
        """Return frame-level damage detections."""


class PlaceholderDetector:
    """Deterministic detector used until a real YOLO checkpoint exists."""

    classes = (
        "crack",
        "joint_fault",
        "deposit",
        "roots",
        "connection_defect",
        "obstruction_or_other",
    )

    def predict_frame(self, frame: np.ndarray, context: Dict[str, Any]) -> List[DetectionResult]:
        height, width = frame.shape[:2]
        frame_index = int(context.get("frame_index", 0))
        if height <= 0 or width <= 0:
            return []

        box_width = max(24, int(width * 0.24))
        box_height = max(18, int(height * 0.20))
        x_seed = (frame_index // 3) % 5
        y_seed = (frame_index // 5) % 4
        x1 = min(width - box_width, int(width * (0.18 + x_seed * 0.07)))
        y1 = min(height - box_height, int(height * (0.22 + y_seed * 0.08)))
        x2 = x1 + box_width
        y2 = y1 + box_height
        class_name = self.classes[(frame_index // 15) % len(self.classes)]
        confidence = round(0.68 + ((frame_index % 7) * 0.035), 3)

        return [
            DetectionResult(
                class_name=class_name,
                confidence=min(confidence, 0.92),
                bbox=[float(x1), float(y1), float(x2), float(y2)],
                mask=None,
                source_model="placeholder",
            )
        ]


ISWDS_CLASS_NAMES = (
    "cracks_breaks_collapses",
    "intruding_sealing_material",
    "roots",
    "displaced_joint",
    "pipe_surface_damage",
    "infiltration",
    "attached_deposits",
    "settled_deposits",
)


@dataclass(frozen=True)
class LetterboxMeta:
    scale: float
    pad_x: float
    pad_y: float
    input_width: int
    input_height: int


class OnnxYoloDetector:
    """ONNX adapter for ISWDS YOLO exports."""

    def __init__(
        self,
        model_path: Path,
        confidence_threshold: float = 0.25,
        iou_threshold: float = 0.45,
        session: Optional[Any] = None,
        source_model: str = "iswds-yolo",
    ):
        if session is None and not model_path.exists():
            raise FileNotFoundError(f"ONNX checkpoint not found: {model_path}")
        if session is None:
            import onnxruntime as ort

            session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        self.session = session
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold
        self.source_model = source_model
        self.input_name = self.session.get_inputs()[0].name
        shape = self.session.get_inputs()[0].shape
        self.input_size = _input_size_from_shape(shape)

    def predict_frame(self, frame: np.ndarray, context: Dict[str, Any]) -> List[DetectionResult]:
        _ = context
        tensor, meta = _letterbox(frame, self.input_size)
        outputs = self.session.run(None, {self.input_name: tensor})
        return self._postprocess(outputs[0], meta, frame.shape[:2])

    def _postprocess(
        self,
        output: np.ndarray,
        meta: LetterboxMeta,
        frame_shape: Tuple[int, int],
    ) -> List[DetectionResult]:
        predictions = np.asarray(output)
        if predictions.ndim == 3:
            predictions = predictions[0]
        attribute_counts = {4 + len(ISWDS_CLASS_NAMES), 5 + len(ISWDS_CLASS_NAMES)}
        if predictions.shape[0] <= 32 and predictions.shape[1] not in attribute_counts:
            predictions = predictions.T

        if predictions.shape[1] < min(attribute_counts):
            return []

        boxes_xywh = predictions[:, :4]
        class_scores = predictions[:, 4 : 4 + len(ISWDS_CLASS_NAMES)]
        if predictions.shape[1] >= 5 + len(ISWDS_CLASS_NAMES):
            objectness = predictions[:, 4:5]
            class_scores = predictions[:, 5 : 5 + len(ISWDS_CLASS_NAMES)] * objectness

        class_ids = np.argmax(class_scores, axis=1)
        scores = class_scores[np.arange(class_scores.shape[0]), class_ids]
        keep_mask = scores >= self.confidence_threshold
        if not np.any(keep_mask):
            return []

        kept_boxes = boxes_xywh[keep_mask]
        kept_scores = scores[keep_mask]
        kept_classes = class_ids[keep_mask]
        xyxy_boxes = [
            _scale_yolo_box_to_frame(box, meta, frame_shape) for box in kept_boxes
        ]
        nms_boxes = [
            [box[0], box[1], max(0.0, box[2] - box[0]), max(0.0, box[3] - box[1])]
            for box in xyxy_boxes
        ]
        indices = cv2.dnn.NMSBoxes(
            nms_boxes,
            kept_scores.astype(float).tolist(),
            self.confidence_threshold,
            self.iou_threshold,
        )
        if len(indices) == 0:
            return []

        detections: List[DetectionResult] = []
        for index in np.asarray(indices).reshape(-1):
            class_index = int(kept_classes[index])
            detections.append(
                DetectionResult(
                    class_name=ISWDS_CLASS_NAMES[class_index],
                    confidence=float(kept_scores[index]),
                    bbox=[float(value) for value in xyxy_boxes[index]],
                    mask=None,
                    source_model=self.source_model,
                )
            )
        return detections


class OnnxRtDetrDetector:
    """ONNX adapter for ISWDS RT-DETR exports."""

    def __init__(
        self,
        model_path: Path,
        confidence_threshold: float = 0.25,
        session: Optional[Any] = None,
        source_model: str = "iswds-rtdetr",
    ):
        if session is None and not model_path.exists():
            raise FileNotFoundError(f"ONNX checkpoint not found: {model_path}")
        if session is None:
            import onnxruntime as ort

            session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        self.session = session
        self.confidence_threshold = confidence_threshold
        self.source_model = source_model
        self.input_names = [input_meta.name for input_meta in self.session.get_inputs()]
        self.image_input_name = self.input_names[0]
        self.size_input_name = "orig_target_sizes"
        shape = self.session.get_inputs()[0].shape
        self.input_size = _input_size_from_shape(shape)

    def predict_frame(self, frame: np.ndarray, context: Dict[str, Any]) -> List[DetectionResult]:
        _ = context
        height, width = frame.shape[:2]
        tensor = _resize_square(frame, self.input_size)
        feeds = {self.image_input_name: tensor}
        if self.size_input_name in self.input_names:
            feeds[self.size_input_name] = np.array([[height, width]], dtype=np.int64)
        outputs = self.session.run(None, feeds)
        return self._postprocess(outputs, frame.shape[:2])

    def _postprocess(
        self,
        outputs: List[np.ndarray],
        frame_shape: Tuple[int, int],
    ) -> List[DetectionResult]:
        if len(outputs) < 3:
            return []
        labels = np.asarray(outputs[0])[0]
        boxes = np.asarray(outputs[1])[0]
        scores = np.asarray(outputs[2])[0]
        detections: List[DetectionResult] = []
        for label, box, score in zip(labels, boxes, scores):
            confidence = float(score)
            if confidence < self.confidence_threshold:
                continue
            class_index = int(label)
            if class_index < 0 or class_index >= len(ISWDS_CLASS_NAMES):
                continue
            detections.append(
                DetectionResult(
                    class_name=ISWDS_CLASS_NAMES[class_index],
                    confidence=confidence,
                    bbox=[float(value) for value in _clip_box(box, frame_shape)],
                    mask=None,
                    source_model=self.source_model,
                )
            )
        return detections


class YoloDetector:
    """Adapter for a future Ultralytics `best.pt` checkpoint."""

    def __init__(
        self,
        model_path: Path,
        confidence_threshold: float = 0.25,
        image_size: int = 640,
        source_model: Optional[str] = None,
    ):
        if not model_path.exists():
            raise FileNotFoundError(f"YOLO checkpoint not found: {model_path}")
        from ultralytics import YOLO

        self.model = YOLO(str(model_path))
        self.confidence_threshold = confidence_threshold
        self.image_size = image_size
        self.source_model = source_model or model_path.stem

    def predict_frame(self, frame: np.ndarray, context: Dict[str, Any]) -> List[DetectionResult]:
        _ = context
        results = self.model.predict(source=frame, imgsz=self.image_size, verbose=False)
        if not results:
            return []

        result = results[0]
        names = getattr(result, "names", {}) or {}
        boxes = getattr(result, "boxes", None)
        if boxes is None:
            return []

        detections: List[DetectionResult] = []
        for box in boxes:
            confidence = float(box.conf.item())
            if confidence < self.confidence_threshold:
                continue
            class_index = int(box.cls.item())
            class_name = str(names.get(class_index, class_index))
            xyxy = [float(value) for value in box.xyxy[0].tolist()]
            detections.append(
                DetectionResult(
                    class_name=class_name,
                    confidence=confidence,
                    bbox=xyxy,
                    mask=None,
                    source_model=self.source_model,
                )
            )
        return detections


class RoutedEnsembleDetector:
    """Combine detectors and keep only the classes assigned to each route."""

    def __init__(
        self,
        routes: List[Tuple[DamageDetector, Set[str]]],
        iou_threshold: float = 0.45,
        parallel: bool = True,
        max_workers: Optional[int] = None,
    ):
        self.routes = routes
        self.iou_threshold = iou_threshold
        self.parallel = parallel
        self.max_workers = max_workers or max(1, len(routes))

    def predict_frame(self, frame: np.ndarray, context: Dict[str, Any]) -> List[DetectionResult]:
        detections: List[DetectionResult] = []
        if self.parallel and len(self.routes) > 1:
            with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                futures = [
                    executor.submit(
                        _predict_route,
                        detector,
                        allowed_classes,
                        frame,
                        dict(context),
                    )
                    for detector, allowed_classes in self.routes
                ]
                for future in futures:
                    detections.extend(future.result())
            return _nms_detections_by_class(detections, self.iou_threshold)

        for detector, allowed_classes in self.routes:
            detections.extend(_predict_route(detector, allowed_classes, frame, context))
        return _nms_detections_by_class(detections, self.iou_threshold)


def _predict_route(
    detector: DamageDetector,
    allowed_classes: Set[str],
    frame: np.ndarray,
    context: Dict[str, Any],
) -> List[DetectionResult]:
    return [
        detection
        for detection in detector.predict_frame(frame, context)
        if detection.class_name in allowed_classes
    ]


def _input_size_from_shape(shape: List[Any]) -> int:
    height = shape[2] if len(shape) >= 4 else 640
    if isinstance(height, int) and height > 0:
        return height
    return 640


def _letterbox(frame: np.ndarray, input_size: int) -> Tuple[np.ndarray, LetterboxMeta]:
    height, width = frame.shape[:2]
    scale = min(input_size / width, input_size / height)
    resized_width = int(round(width * scale))
    resized_height = int(round(height * scale))
    resized = cv2.resize(frame, (resized_width, resized_height), interpolation=cv2.INTER_LINEAR)
    canvas = np.full((input_size, input_size, 3), 114, dtype=np.uint8)
    pad_x = (input_size - resized_width) / 2
    pad_y = (input_size - resized_height) / 2
    x_offset = int(round(pad_x))
    y_offset = int(round(pad_y))
    canvas[y_offset : y_offset + resized_height, x_offset : x_offset + resized_width] = resized
    tensor = _frame_to_tensor(canvas)
    return tensor, LetterboxMeta(
        scale=scale,
        pad_x=float(x_offset),
        pad_y=float(y_offset),
        input_width=input_size,
        input_height=input_size,
    )


def _resize_square(frame: np.ndarray, input_size: int) -> np.ndarray:
    resized = cv2.resize(frame, (input_size, input_size), interpolation=cv2.INTER_LINEAR)
    return _frame_to_tensor(resized)


def _frame_to_tensor(frame: np.ndarray) -> np.ndarray:
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    tensor = rgb.transpose(2, 0, 1).astype(np.float32) / 255.0
    return np.expand_dims(tensor, axis=0)


def _scale_yolo_box_to_frame(
    box_xywh: np.ndarray,
    meta: LetterboxMeta,
    frame_shape: Tuple[int, int],
) -> List[float]:
    center_x, center_y, box_width, box_height = [float(value) for value in box_xywh]
    x1 = (center_x - box_width / 2 - meta.pad_x) / meta.scale
    y1 = (center_y - box_height / 2 - meta.pad_y) / meta.scale
    x2 = (center_x + box_width / 2 - meta.pad_x) / meta.scale
    y2 = (center_y + box_height / 2 - meta.pad_y) / meta.scale
    return _clip_box([x1, y1, x2, y2], frame_shape)


def _clip_box(box: Any, frame_shape: Tuple[int, int]) -> List[float]:
    height, width = frame_shape
    x1, y1, x2, y2 = [float(value) for value in box]
    return [
        max(0.0, min(float(width), x1)),
        max(0.0, min(float(height), y1)),
        max(0.0, min(float(width), x2)),
        max(0.0, min(float(height), y2)),
    ]


def _nms_detections_by_class(
    detections: List[DetectionResult],
    iou_threshold: float,
) -> List[DetectionResult]:
    kept: List[DetectionResult] = []
    for class_name in sorted({detection.class_name for detection in detections}):
        class_kept: List[DetectionResult] = []
        class_detections = sorted(
            [detection for detection in detections if detection.class_name == class_name],
            key=lambda detection: detection.confidence,
            reverse=True,
        )
        for detection in class_detections:
            if all(
                _box_iou(detection.bbox, existing.bbox) < iou_threshold
                for existing in class_kept
            ):
                class_kept.append(detection)
        kept.extend(class_kept)
    return sorted(kept, key=lambda detection: detection.confidence, reverse=True)


def _box_iou(first: List[float], second: List[float]) -> float:
    first_x1, first_y1, first_x2, first_y2 = first
    second_x1, second_y1, second_x2, second_y2 = second
    inter_x1 = max(first_x1, second_x1)
    inter_y1 = max(first_y1, second_y1)
    inter_x2 = min(first_x2, second_x2)
    inter_y2 = min(first_y2, second_y2)
    inter_area = max(0.0, inter_x2 - inter_x1) * max(0.0, inter_y2 - inter_y1)
    first_area = max(0.0, first_x2 - first_x1) * max(0.0, first_y2 - first_y1)
    second_area = max(0.0, second_x2 - second_x1) * max(0.0, second_y2 - second_y1)
    union = first_area + second_area - inter_area
    return inter_area / union if union > 0.0 else 0.0
